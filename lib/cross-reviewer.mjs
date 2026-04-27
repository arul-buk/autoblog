/**
 * cross-reviewer.mjs
 * Cross-model quality validation using a different Gemini model tier.
 * Sends the post to a review model for scoring and feedback.
 * If score is below threshold, rewrites incorporating suggestions.
 *
 * Optional step — skipped when steps.crossModelReview is false.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry } from './retry.mjs';
import { buildCrossReviewPrompt } from './prompts.mjs';

/**
 * Run cross-model quality review on a generated post.
 *
 * @param {string} apiKey - Gemini API key
 * @param {object} config - Full autoblog config
 * @param {string} content - Generated post (after humanization)
 * @param {object|null} keywordData - Keyword research results
 * @returns {Promise<{ score: number, revisedContent: string|null, feedback: object }>}
 */
export async function crossModelReview(apiKey, config, content, keywordData) {
  const reviewModel = config.crossModel?.model || 'gemini-2.5-pro';
  const threshold = config.crossModel?.qualityThreshold || 7;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: reviewModel,
    generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
  });

  const productName = config.product.name;
  const primaryKeyword = keywordData?.primaryKeyword?.keyword || null;
  const tone = config.product.tone || '';

  const prompt = buildCrossReviewPrompt({ content, productName, primaryKeyword, tone });

  const result = await withRetry(
    () => model.generateContent(prompt),
    { maxAttempts: 2, baseDelayMs: 3000, label: 'cross-review' }
  );

  const text = result.response.text().trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      return { score: 8, revisedContent: null, feedback: { error: 'Failed to parse review response' } };
    }
    parsed = JSON.parse(match[0]);
  }

  const score = parsed.overallScore || parsed.score || 8;
  const feedback = {
    factualIssues: parsed.factualIssues || [],
    keywordIssues: parsed.keywordIssues || [],
    toneIssues: parsed.toneIssues || [],
    suggestions: parsed.suggestions || [],
  };

  console.log(`  Review score: ${score}/10`);
  if (feedback.factualIssues.length > 0) {
    console.log(`  Factual issues: ${feedback.factualIssues.length}`);
  }
  if (feedback.suggestions.length > 0) {
    console.log(`  Suggestions: ${feedback.suggestions.slice(0, 3).join('; ')}`);
  }

  // If below threshold, request a rewrite with feedback
  let revisedContent = null;
  if (score < threshold && feedback.suggestions.length > 0) {
    console.log(`  Score ${score} below threshold ${threshold} — requesting rewrite...`);

    const rewriteModel = genAI.getGenerativeModel({
      model: config.models.text,
      generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
    });

    const rewritePrompt = `You are revising a blog post based on quality review feedback.

ORIGINAL POST:
${content}

REVIEW FEEDBACK (score: ${score}/10):
${feedback.factualIssues.length > 0 ? `Factual Issues:\n${feedback.factualIssues.map(i => `- ${i}`).join('\n')}\n` : ''}
${feedback.keywordIssues.length > 0 ? `Keyword Issues:\n${feedback.keywordIssues.map(i => `- ${i}`).join('\n')}\n` : ''}
${feedback.toneIssues.length > 0 ? `Tone Issues:\n${feedback.toneIssues.map(i => `- ${i}`).join('\n')}\n` : ''}
Suggestions:
${feedback.suggestions.map(s => `- ${s}`).join('\n')}

TASK: Revise the post to address the feedback above. Keep the same frontmatter structure, same slug, same author. Only improve the content quality based on the specific feedback.

Return the complete revised post (frontmatter + body). No extra commentary, no wrapping code fences.`;

    const rewriteResult = await withRetry(
      () => rewriteModel.generateContent(rewritePrompt),
      { maxAttempts: 2, baseDelayMs: 3000, label: 'cross-review-rewrite' }
    );

    revisedContent = rewriteResult.response.text().trim();

    // Strip wrapping code fences
    if (revisedContent.startsWith('```')) {
      revisedContent = revisedContent.replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```$/, '').trim();
    }

    // Ensure frontmatter delimiters
    if (!revisedContent.startsWith('---')) {
      revisedContent = '---\n' + revisedContent;
    }

    console.log(`  Rewrite complete (${revisedContent.length} chars)`);
  }

  return { score, revisedContent, feedback };
}
