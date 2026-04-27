/**
 * meta-optimizer.mjs
 * Optimizes blog post titles and excerpts for click-through rate.
 * Uses Gemini to generate variants and picks the highest-scoring one.
 *
 * Optional step — skipped when steps.metaOptimize is false.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry } from './retry.mjs';
import { buildMetaOptimizationPrompt } from './prompts.mjs';

/**
 * Extract a frontmatter field value.
 */
function extractField(content, field) {
  const match = content.match(new RegExp(`^${field}:\\s*["']?([^"'\\n]+)["']?`, 'm'));
  return match ? match[1].trim() : null;
}

/**
 * Replace a frontmatter field value.
 */
function replaceField(content, field, newValue) {
  const pattern = new RegExp(`^(${field}:\\s*)["']?[^"'\\n]+["']?`, 'm');
  if (pattern.test(content)) {
    return content.replace(pattern, `$1"${newValue.replace(/"/g, '\\"')}"`);
  }
  return content;
}

/**
 * Optimize meta tags (title + excerpt) for CTR using Gemini.
 *
 * @param {string} apiKey - Gemini API key
 * @param {object} config - Full autoblog config
 * @param {string} content - Generated post with frontmatter
 * @param {object|null} keywordData - Keyword research results
 * @returns {Promise<string>} - Content with optimized title and excerpt
 */
export async function optimizeMetaTags(apiKey, config, content, keywordData) {
  const currentTitle = extractField(content, 'title');
  const currentExcerpt = extractField(content, 'excerpt');
  const category = extractField(content, 'category');
  const primaryKeyword = keywordData?.primaryKeyword?.keyword || null;

  if (!currentTitle) return content;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: config.models.text,
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  });

  const prompt = buildMetaOptimizationPrompt({
    title: currentTitle,
    excerpt: currentExcerpt,
    primaryKeyword,
    category,
  });

  const result = await withRetry(
    () => model.generateContent(prompt),
    { maxAttempts: 2, baseDelayMs: 2000, label: 'meta-optimize' }
  );

  const text = result.response.text().trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return content;
    parsed = JSON.parse(match[0]);
  }

  // Pick best title variant
  const variants = parsed.titleVariants || [];
  if (variants.length === 0) return content;

  const best = variants.reduce((a, b) => (b.score > a.score ? b : a), variants[0]);

  let optimized = content;

  // Only replace if the optimized title scores higher than 7
  if (best.score >= 7 && best.title) {
    optimized = replaceField(optimized, 'title', best.title);
    // Also update schema headline to match
    const schemaHeadlinePattern = /^(\s+headline:\s*)["']?[^"'\n]+["']?/m;
    if (schemaHeadlinePattern.test(optimized)) {
      optimized = optimized.replace(schemaHeadlinePattern, `$1"${best.title.replace(/"/g, '\\"')}"`);
    }
    console.log(`  Title: "${currentTitle}" → "${best.title}" (score: ${best.score}/10)`);
  }

  // Optimize excerpt if provided
  const optimizedExcerpt = parsed.optimizedExcerpt;
  if (optimizedExcerpt && optimizedExcerpt.length >= 130 && optimizedExcerpt.length <= 165) {
    optimized = replaceField(optimized, 'excerpt', optimizedExcerpt);
    // Also update schema description to match
    const schemaDescPattern = /^(\s+description:\s*)["']?[^"'\n]+["']?/m;
    if (schemaDescPattern.test(optimized)) {
      optimized = optimized.replace(schemaDescPattern, `$1"${optimizedExcerpt.replace(/"/g, '\\"')}"`);
    }
  }

  return optimized;
}
