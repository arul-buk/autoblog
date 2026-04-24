/**
 * humanizer.mjs
 * Removes AI writing patterns to make content sound naturally human-written.
 * Based on Wikipedia's "Signs of AI writing" guide.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry } from './retry.mjs';
import { buildHumanizationPrompt, buildHumanizationUserPrompt } from './prompts.mjs';

/**
 * Humanize blog post content by removing AI writing patterns.
 *
 * @param {string} apiKey - Gemini API key
 * @param {object} config - Full autoblog config
 * @param {string} content - Blog post content with frontmatter
 * @returns {Promise<string>} - Humanized content
 */
export async function humanizePost(apiKey, config, content, styleGuide = null) {
  const hasStyleGuide = styleGuide && (styleGuide.voice || styleGuide.referencePost);
  const temperature = hasStyleGuide ? 0.7 : 0.3;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: config.models.text,
    generationConfig: {
      temperature,
      maxOutputTokens: 8192,
    },
  });

  console.log(`  Humanizing blog post (removing AI patterns${hasStyleGuide ? ' + style matching' : ''})...`);

  const systemInstruction = buildHumanizationPrompt(styleGuide);
  const userPrompt = buildHumanizationUserPrompt(content);

  const result = await withRetry(
    () => model.generateContent([systemInstruction, '\n\n', userPrompt]),
    { ...config.retry, label: 'humanization' }
  );

  const humanized = result.response.text();

  let cleaned = humanized.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:mdx|markdown|md|html)?\s*/i, '').replace(/\s*```$/, '');
  }

  console.log(`  Humanization complete (${cleaned.length} chars)`);
  return cleaned;
}

