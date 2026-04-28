/**
 * writer.mjs
 * Generates a complete blog post with frontmatter via Gemini.
 * All product context, authors, and output format come from config.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry } from './retry.mjs';
import { buildWriterPrompt } from './prompts.mjs';

/**
 * Converts a topic title into a URL-safe slug (max 60 chars).
 */
export function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/-$/, '');
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Select the best author for a given topic category from the config roster.
 */
function selectAuthor(category, config) {
  const normalised = (category || '').trim().toLowerCase();

  for (const author of config.authors) {
    if (author.categories?.some((c) => normalised.includes(c.toLowerCase()))) {
      return author;
    }
  }

  // Find fallback author by name
  if (config.fallbackAuthor) {
    const fallback = config.authors.find((a) => a.name === config.fallbackAuthor);
    if (fallback) return fallback;
  }

  // Last resort: first author
  return config.authors[0];
}

/**
 * Pick related posts from existing slugs (random selection).
 */
function pickRelatedPosts(existingSlugs, currentSlug, linkedSlugs) {
  // Prefer linked slugs from internal linking module if available
  if (linkedSlugs && linkedSlugs.length > 0) {
    return linkedSlugs.slice(0, 3);
  }
  const pool = existingSlugs.filter((s) => s !== currentSlug);
  // Fisher-Yates shuffle
  const shuffled = pool.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 3);
}

/**
 * Validate that required frontmatter fields are present.
 */
function validateFrontmatter(content, config) {
  const required = config.output.frontmatterSchema?.required || [];
  const missing = required.filter((field) => {
    const pattern = new RegExp(`^${field}:`, 'm');
    return !pattern.test(content);
  });

  if (missing.length > 0) {
    throw new Error(`Generated post is missing required frontmatter fields: ${missing.join(', ')}`);
  }
}

/**
 * Normalize LLM-generated content to fix common output issues.
 * Runs after generation but before validation.
 */
export function normalizeContent(content, config) {
  // 1. Quote bare numeric YAML tags (e.g. "- 2026" → '- "2026"')
  content = content.replace(
    /^(tags:\s*\n(?:\s+-\s*.+\n)*?)(\s+-\s+)(\d+)\s*$/gm,
    '$1$2"$3"'
  );
  // Simpler single-pass: find lines under tags: that are bare numbers
  const lines = content.split('\n');
  let inTags = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^tags:\s*$/.test(lines[i])) {
      inTags = true;
      continue;
    }
    if (inTags) {
      if (/^\s+-\s+/.test(lines[i])) {
        // Quote bare numbers
        lines[i] = lines[i].replace(/^(\s+-\s+)(\d+)\s*$/, '$1"$2"');
      } else {
        inTags = false;
      }
    }
  }
  content = lines.join('\n');

  // 2. Slugify category values if they contain spaces or uppercase
  const categoryMatch = content.match(/^category:\s*["']?(.+?)["']?\s*$/m);
  if (categoryMatch) {
    const raw = categoryMatch[1];
    if (/[A-Z\s&]/.test(raw)) {
      const slugified = raw
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
      content = content.replace(
        /^category:\s*["']?.+?["']?\s*$/m,
        `category: "${slugified}"`
      );
    }
  }

  // 3. Strip inline JSON-LD script blocks if embedSchema is 'frontmatter-only'
  if (config.steps?.embedSchema === 'frontmatter-only' || config.output?.stripInlineSchema) {
    content = content.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, '');
  }

  return content;
}

/**
 * When a custom frontmatterTemplate is configured but the LLM outputs default
 * field names (e.g. "excerpt" instead of "description"), remap them.
 * Only remaps if the target field is missing AND a known default field is present.
 */
export function applyFieldMappingFallback(content, config, today) {
  const required = config.output.frontmatterSchema?.required || [];

  // Common default→custom field mappings
  const FIELD_MAPS = {
    description: 'excerpt',       // custom "description" ← default "excerpt"
    lastUpdated: 'date',          // custom "lastUpdated" ← default "date"
  };

  for (const [target, source] of Object.entries(FIELD_MAPS)) {
    if (!required.includes(target)) continue;
    const hasTarget = new RegExp(`^${target}:`, 'm').test(content);
    const hasSource = new RegExp(`^${source}:`, 'm').test(content);
    if (!hasTarget && hasSource) {
      content = content.replace(
        new RegExp(`^${source}:`, 'm'),
        `${target}:`
      );
    }
  }

  // Add readTime if required but missing (calculate from word count)
  if (required.includes('readTime') && !/^readTime:/m.test(content)) {
    const bodyMatch = content.match(/^---[\s\S]*?---\n([\s\S]*)/);
    if (bodyMatch) {
      const words = bodyMatch[1].replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length;
      const minutes = Math.max(1, Math.ceil(words / 200));
      // Insert after lastUpdated or title
      const insertAfter = /^(lastUpdated|title):.*/m;
      const match = content.match(insertAfter);
      if (match) {
        content = content.replace(match[0], `${match[0]}\nreadTime: "${minutes} min"`);
      }
    }
  }

  // Remove lastModified if not in required/optional (it's a default field)
  const allFields = [
    ...(config.output.frontmatterSchema?.required || []),
    ...(config.output.frontmatterSchema?.optional || []),
  ];
  if (!allFields.includes('lastModified')) {
    content = content.replace(/^lastModified:.*\n/m, '');
  }

  return content;
}

/**
 * Extract a frontmatter scalar value.
 */
function extractFrontmatterField(content, field) {
  const match = content.match(new RegExp(`^${field}:\\s*["']?([^"'\\n]+)["']?`, 'm'));
  return match ? match[1].trim() : null;
}

/**
 * Generate a complete blog post using Gemini.
 *
 * @param {string} geminiApiKey
 * @param {object} config - Full autoblog config
 * @param {object} topic - Topic object { title, summary, category }
 * @param {string[]} existingSlugs - Existing post slugs for cross-linking
 * @param {object} [options]
 * @param {object} [options.keywordData] - DataForSEO keyword research results
 * @param {string} [options.writerNotes] - Extra guidance from scheduler
 * @param {string[]} [options.linkedSlugs] - Relevant slugs from internal linking module
 * @returns {Promise<{ slug: string, content: string, metadata: object }>}
 */
export async function writePost(geminiApiKey, config, topic, existingSlugs = [], options = {}) {
  const { keywordData, writerNotes, linkedSlugs, styleGuide } = options;

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: config.models.text });

  const slug = titleToSlug(topic.title);
  const author = selectAuthor(topic.category, config);
  const today = todayIso();
  const relatedPosts = pickRelatedPosts(existingSlugs, slug, linkedSlugs);

  const prompt = buildWriterPrompt({
    topic, slug, author, today, relatedPosts, config, keywordData, writerNotes, styleGuide,
  });

  const result = await withRetry(
    () => model.generateContent(prompt),
    { ...config.retry, label: 'write-post' }
  );

  let content = result.response.text().trim();

  // Strip wrapping code fences
  if (content.startsWith('```')) {
    content = content.replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  // Ensure frontmatter delimiters
  if (!content.startsWith('---')) {
    content = '---\n' + content;
  }

  // Fix relatedPosts: normalize "(none)" or "- (none)" to empty array
  content = content.replace(
    /^relatedPosts:\s*\n\s*-\s*\(none\)\s*$/m,
    'relatedPosts: []'
  );
  content = content.replace(
    /^relatedPosts:\s*\(none\)\s*$/m,
    'relatedPosts: []'
  );

  // Fix seoKeywords: normalize YAML array to comma-separated string
  const seoKwArrayMatch = content.match(/^seoKeywords:\s*\n((?:\s+-\s*.*\n?)+)/m);
  if (seoKwArrayMatch) {
    const keywords = seoKwArrayMatch[1]
      .split('\n')
      .map((line) => line.replace(/^\s*-\s*["']?/, '').replace(/["']?\s*$/, '').trim())
      .filter(Boolean);
    content = content.replace(seoKwArrayMatch[0], `seoKeywords: "${keywords.join(', ')}"\n`);
  }
  // Also handle inline JSON array format: seoKeywords: ["a", "b"]
  const seoKwInlineMatch = content.match(/^seoKeywords:\s*\[([^\]]+)\]/m);
  if (seoKwInlineMatch) {
    const keywords = seoKwInlineMatch[1]
      .match(/"([^"]+)"/g)?.map((k) => k.replace(/"/g, '')) || [];
    content = content.replace(seoKwInlineMatch[0], `seoKeywords: "${keywords.join(', ')}"`);
  }

  // Normalize LLM output (quote numeric tags, slugify categories, strip inline schema)
  content = normalizeContent(content, config);

  // If custom frontmatterTemplate was used but LLM generated default fields,
  // attempt field mapping as a fallback
  if (config.output.frontmatterTemplate) {
    content = applyFieldMappingFallback(content, config, today);
  }

  validateFrontmatter(content, config);

  const metadata = {
    slug,
    author: author.name,
    authorRole: author.role,
    authorImage: author.image,
    date: today,
    category: topic.category,
    title: extractFrontmatterField(content, 'title') || topic.title,
    excerpt: extractFrontmatterField(content, 'excerpt') || extractFrontmatterField(content, 'description') || topic.summary,
    coverImage: `/images/blog/${slug}.png`,
    seoKeywords: extractFrontmatterField(content, 'seoKeywords'),
  };

  return { slug, content, metadata };
}
