/**
 * writer.mjs
 * Generates a complete blog post with frontmatter via Gemini.
 * All product context, authors, and output format come from config.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry } from './retry.mjs';

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
  const shuffled = pool.slice().sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 3);
}

/**
 * Build the writer prompt from config.
 */
function buildWriterPrompt({ topic, slug, author, today, relatedPosts, config, keywordData, writerNotes }) {
  const { product, output } = config;
  const relatedList = relatedPosts.length
    ? relatedPosts.map((s) => `"${s}"`).join(', ')
    : '(none available)';

  // Build features section
  const featuresBlock = (product.features || [])
    .map((f) => `- ${f}`)
    .join('\n');

  // Build CTA markers section
  const ctaMarkersBlock = (output.ctaMarkers || []).length > 0
    ? `\nCTA PLACEMENT MARKERS — Insert these HTML comment markers between sections:\n${output.ctaMarkers.map((m, i) => `- <!-- ${m} --> (marker ${i + 1})`).join('\n')}\n\nRules:\n- Each marker goes on its own line BETWEEN two sections\n- Never place markers inside a <section> tag\n- Never place two markers next to each other\n- All ${output.ctaMarkers.length} markers are required`
    : '';

  // Build keyword guidance from DataForSEO data
  let keywordBlock = '';
  if (keywordData && !keywordData.skip) {
    const primary = keywordData.primaryKeyword;
    const secondaries = keywordData.secondaryKeywords || [];
    const questions = keywordData.questions || [];
    const competitors = keywordData.competitorAngles || [];

    keywordBlock = `\nSEO KEYWORD DATA (from search volume analysis — use these to guide content):
Primary keyword: "${primary.keyword}" (${primary.volume} monthly searches, difficulty ${primary.difficulty}/100)
Secondary keywords to weave in naturally:
${secondaries.map((k) => `- "${k.keyword}" (${k.volume}/mo)`).join('\n')}

${questions.length > 0 ? `Real questions people search for (use in FAQ section):\n${questions.map((q) => `- ${q}`).join('\n')}\n` : ''}
${competitors.length > 0 ? `Top competing articles (cover what they miss):\n${competitors.map((c) => `- "${c.title}"`).join('\n')}\n` : ''}`;
  }

  // Build frontmatter schema
  const requiredFields = output.frontmatterSchema?.required || ['title', 'date', 'excerpt', 'coverImage', 'author', 'category', 'tags', 'seoKeywords'];
  const optionalFields = output.frontmatterSchema?.optional || [];

  // Build body format instruction
  const formatInstruction = output.bodyFormat === 'markdown'
    ? 'Use MARKDOWN formatting (## headings, **bold**, - bullets).'
    : output.bodyFormat === 'mdx'
      ? 'Use MDX formatting (## headings, **bold**, JSX components allowed).'
      : 'Use HTML tags — NOT markdown. Wrap in <article class="blog-content"> with <section>, <h2>, <p>, <ul>/<li> elements.';

  return `You are a senior content writer for ${product.name} (${product.url}), ${product.description}.

Write a COMPLETE blog post markdown file for the following topic. The output must be a single, self-contained markdown document with YAML frontmatter followed by the body.

TOPIC: ${topic.title}
TOPIC SUMMARY: ${topic.summary}
CATEGORY: ${topic.category}
SLUG: ${slug}
AUTHOR: ${author.name}
AUTHOR ROLE: ${author.role || ''}
AUTHOR IMAGE: ${author.image || ''}
TODAY'S DATE: ${today}
RELATED POST SLUGS AVAILABLE: ${relatedList}
${keywordBlock}
---

OUTPUT FORMAT — produce YAML frontmatter with these fields:
Required: ${requiredFields.join(', ')}
Optional: ${optionalFields.join(', ')}

Use this frontmatter template:
\`\`\`
---
title: "<compelling SEO title, max 70 chars>"
date: "${today}"
lastModified: "${today}"
excerpt: "<2-sentence meta description, 140-160 chars>"
coverImage: "/images/blog/${slug}.png"
coverImageAlt: "<descriptive alt text>"
author: "${author.name}"
authorRole: "${author.role || ''}"
authorImage: "${author.image || ''}"
category: "${topic.category}"
tags:
  - <tag1>
  - <tag2>
  - <tag3>
  - <tag4>
  - <tag5>
readingTime: "<X min read>"
featured: false
relatedPosts:
${relatedPosts.map((s) => `  - ${s}`).join('\n') || '  - (none)'}
seoKeywords:
  - <keyword1>
  - <keyword2>
  - <keyword3>
  - <keyword4>
  - <keyword5>
  - <keyword6>
ctaType: <awareness|comparison|how_to>
schema:
  type: "BlogPosting"
  headline: "<same as title>"
  description: "<same as excerpt>"
  wordCount: <approximate word count>
  keywords: "<comma-separated primary keywords>"
qa:
  - question: "<real question people search for>"
    answer: "<complete 2-3 sentence answer, self-contained>"
  - question: "<question 2>"
    answer: "<answer 2>"
  - question: "<question 3>"
    answer: "<answer 3>"
  - question: "<question 4>"
    answer: "<answer 4>"
  - question: "<question 5>"
    answer: "<answer 5>"
midArticleCTA:
  title: "<short CTA headline>"
  description: "<one sentence value proposition>"
  primaryText: "${product.cta?.text || 'Get Started Free'}"
---
\`\`\`

BODY FORMAT:
${formatInstruction}

PRODUCT CONTEXT — weave these points naturally where relevant:

${product.name} — ${product.description}

Key features:
${featuresBlock || '(no features specified in config)'}

${product.cta ? `CTA: ${product.cta.text} → ${product.cta.url}` : ''}

TONE: ${product.tone || 'Helpful and educational, not salesy.'}
${ctaMarkersBlock}
${writerNotes ? `\nADDITIONAL GUIDANCE:\n${writerNotes}` : ''}

WRITING GUIDELINES:
- Total body length: ${output.wordCount?.min || 1000}-${output.wordCount?.max || 1500} words
- 5-7 sections with clear headings
- Include product mentions in at least 3 sections with specific feature relevance
- Cross-link to related posts where relevant
- Write for the target audience — plain language, empathetic tone
- Back up claims with statistics or research where relevant

═══ GEO / AEO / SCHEMA COMPLIANCE (MANDATORY) ═══

These rules ensure the post ranks in traditional search AND gets cited by AI search engines (Google AI Overviews, ChatGPT, Perplexity, Bing Copilot).

1. TL;DR SECTION (REQUIRED)
   - FIRST section of the body, immediately after frontmatter
   - 2-3 sentences maximum, written as a standalone answer
   - Must be self-contained — an AI should be able to quote this block as a complete answer
   - Bold the single most important takeaway
   - ${output.bodyFormat === 'html' ? 'Wrap in <section class="tldr-section"><p><strong>TL;DR:</strong> ...text...</p></section>' : 'Start with **TL;DR:** on its own line'}

2. KEY TAKEAWAYS SECTION (REQUIRED)
   - Place immediately after TL;DR, before the main content sections
   - 4-6 bullet points, each one a complete, citable statement
   - Each bullet should answer one specific question a reader might have
   - ${output.bodyFormat === 'html' ? 'Wrap in <section class="key-takeaways"><h2>Key Takeaways</h2><ul><li>...</li></ul></section>' : 'Use ## Key Takeaways heading with bullet list'}

3. DIRECT-ANSWER PARAGRAPHS (passage-level citability)
   - Start each section with a 1-2 sentence direct answer BEFORE elaborating
   - These opening sentences must be self-contained — quotable on their own
   - Pattern: [Direct answer] → [Evidence/data] → [Nuance/context]
   - Example: "YouTube Restricted Mode fails to block 27% of violent content. A 2025 Stanford study tested 5,000 flagged videos and found..."
   - NEVER start a section with vague setup ("In today's world...", "When it comes to...")

4. QUESTION-BASED HEADINGS (AEO)
   - At least 3 of your section headings MUST be phrased as questions
   - Use natural "What/How/Why/Can/Should/Is" question formats
   - Match real search queries — use DataForSEO questions if provided
   - Example headings: "How Does YouTube Restricted Mode Actually Work?", "Can Kids Bypass Parental Controls?", "What Should Parents Do Instead?"
   - The first paragraph after each question heading must DIRECTLY answer the question

5. FAQ SECTION (REQUIRED — for FAQ schema and AI extraction)
   - Use the qa frontmatter data to write a dedicated FAQ section near the end
   - Each Q must be a real question people search for (use DataForSEO questions when available)
   - Each A must be a complete, self-contained answer in 2-3 sentences
   - ${output.bodyFormat === 'html' ? 'Format as: <section class="faq-section"><h2>Frequently Asked Questions</h2> then <h3>Question?</h3><p>Answer.</p> for each pair' : 'Format as: ## Frequently Asked Questions then ### Question? followed by answer paragraph'}
   - Answers must NOT reference other parts of the article ("as mentioned above")

6. ENTITY DEFINITIONS
   - When introducing a product, regulation, or technical concept for the first time, give a clear 1-sentence definition
   - Pattern: "[Entity] is [definition]. [Context/relevance]."
   - Example: "COPPA is the Children's Online Privacy Protection Act, a US federal law requiring parental consent before collecting data from children under 13. It directly affects how YouTube handles kids' accounts."

7. STATISTICAL CLAIMS
   - Every statistic must include its source inline: "[Stat] according to [Source] ([Year])"
   - Never use vague attribution ("studies show", "experts say", "research indicates")
   - If no real source exists, frame as product data or omit the claim
   - AI search engines penalize unattributed statistics

8. SCHEMA-READY FRONTMATTER
   - The qa field must contain 4-6 real Q&A pairs (these power FAQ schema)
   - Each answer must be a complete sentence, not a fragment
   - The excerpt must answer the article's core question in 1-2 sentences
   - The title must include the primary keyword naturally

Return ONLY the raw file (frontmatter + body). No extra commentary, no wrapping code fences.`;
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
  const { keywordData, writerNotes, linkedSlugs } = options;

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: config.models.text });

  const slug = titleToSlug(topic.title);
  const author = selectAuthor(topic.category, config);
  const today = todayIso();
  const relatedPosts = pickRelatedPosts(existingSlugs, slug, linkedSlugs);

  const prompt = buildWriterPrompt({
    topic, slug, author, today, relatedPosts, config, keywordData, writerNotes,
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

  validateFrontmatter(content, config);

  const metadata = {
    slug,
    author: author.name,
    authorRole: author.role,
    authorImage: author.image,
    date: today,
    category: topic.category,
    title: extractFrontmatterField(content, 'title') || topic.title,
    excerpt: extractFrontmatterField(content, 'excerpt') || topic.summary,
    coverImage: `/images/blog/${slug}.png`,
    seoKeywords: extractFrontmatterField(content, 'seoKeywords'),
  };

  return { slug, content, metadata };
}
