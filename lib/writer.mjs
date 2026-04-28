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
