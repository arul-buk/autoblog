/**
 * repurposer.mjs
 * Gap 8: Content Repurposing
 * Converts blog posts into multiple distribution formats
 * (Twitter threads, LinkedIn posts, newsletter snippets) via Gemini.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry } from './retry.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/**
 * Format-specific prompt builders.
 */
const FORMAT_PROMPTS = {
  'twitter-thread': (title, body) =>
    `Convert this blog post into a Twitter/X thread of 5-8 tweets. First tweet is the hook. Use line breaks between tweets. Mark each tweet with [1/N]. No hashtags in the thread, add 2-3 at the end. Blog title: ${title}\n\nBlog content:\n${body}`,

  'linkedin-post': (title, body) =>
    `Convert this blog post into a LinkedIn post (150-300 words). Start with a strong hook line. Use short paragraphs. End with a question to drive engagement. Professional but conversational tone. Blog title: ${title}\n\nBlog content:\n${body}`,

  'newsletter-snippet': (title, body) =>
    `Create a 100-150 word email newsletter snippet for this blog post. Include: 1-line hook, 2-3 sentence summary, a 'Read more →' CTA line. Blog title: ${title}\n\nBlog content:\n${body}`,
};

/**
 * Strip frontmatter (everything between --- delimiters) from markdown content.
 *
 * @param {string} content - Full markdown with frontmatter
 * @returns {string} - Body only
 */
export function extractBody(content) {
  if (!content) return '';
  const match = content.match(/^---[\s\S]*?---\s*/);
  if (match) {
    return content.slice(match[0].length).trim();
  }
  return content.trim();
}

/**
 * Repurpose a blog post into multiple distribution formats.
 *
 * @param {string} apiKey - Gemini API key
 * @param {object} config - Autoblog config
 * @param {string} content - Full blog post markdown (with frontmatter)
 * @param {object} metadata - Post metadata { title, slug }
 * @returns {Promise<Map<string, string>>} - Map of format → generated content
 */
export async function repurposeContent(apiKey, config, content, metadata) {
  const formats = config.repurpose?.formats || [];
  if (formats.length === 0) {
    return new Map();
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: config.models?.text || 'gemini-2.0-flash',
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  });

  const body = extractBody(content);
  const title = metadata?.title || 'Untitled';
  const results = new Map();

  for (const format of formats) {
    const promptBuilder = FORMAT_PROMPTS[format];
    if (!promptBuilder) {
      log(`  Skipping unknown repurpose format: ${format}`);
      continue;
    }

    try {
      const prompt = promptBuilder(title, body);
      const result = await withRetry(
        () => model.generateContent(prompt),
        { maxAttempts: 2, baseDelayMs: 2000, label: `repurpose-${format}` }
      );

      const text = result.response.text().trim();
      results.set(format, text);
      log(`  Generated ${format} (${text.length} chars)`);
    } catch (err) {
      log(`  Warning: Failed to generate ${format}: ${err.message}`);
    }
  }

  return results;
}
