/**
 * cross-review.mjs — Cross-model quality review step wrapper.
 */

import { crossModelReview } from '../cross-reviewer.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function fixReadingTime(content) {
  const bodyMatch = content.match(/^---[\s\S]*?---\n([\s\S]*)$/);
  const body = bodyMatch ? bodyMatch[1] : content;
  const stripped = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = stripped.split(/\s+/).filter((w) => w.length > 0).length;
  const minutes = Math.max(1, Math.ceil(wordCount / 200));
  const readingTime = `${minutes} min read`;
  if (/^readingTime:/m.test(content)) {
    return content.replace(/^readingTime:.*$/m, `readingTime: "${readingTime}"`);
  }
  return content;
}

/**
 * Run cross-model quality review on generated content.
 *
 * @param {object} state - Pipeline state
 * @param {object} config - Autoblog config
 * @param {object} options - { dryRun, apiKey, additionalSlugs }
 * @returns {Promise<object>} Updated state
 */
export async function crossReviewStep(state, config, options) {
  const { apiKey } = options;

  if (!config.steps.crossModelReview) {
    return state;
  }

  log(`Cross-model quality review (${config.crossModel?.model || 'gemini-2.5-pro'})...`);

  try {
    const review = await crossModelReview(apiKey, config, state.content, state.keywordData);
    log(`  Quality score: ${review.score}/10`);

    // Track cost estimate for cross-model review (uses Pro model)
    if (options.costTracker) {
      const inputEstimate = Math.round(state.content.length / 4) + 500;
      options.costTracker.addGemini('crossModelReview', { promptTokenCount: inputEstimate, candidatesTokenCount: 500, totalTokenCount: inputEstimate + 500 }, config.crossModel?.model || 'gemini-2.5-pro');
      if (review.revisedContent) {
        const rewriteOutput = Math.round(review.revisedContent.length / 4);
        options.costTracker.addGemini('crossModelReview', { promptTokenCount: inputEstimate, candidatesTokenCount: rewriteOutput, totalTokenCount: inputEstimate + rewriteOutput }, config.models?.text || 'gemini-3-flash-preview');
      }
    }

    let { content } = state;

    if (review.score < (config.crossModel?.qualityThreshold || 7) && review.revisedContent) {
      log(`  Below threshold — using revised content`);
      content = review.revisedContent;
      content = fixReadingTime(content);
    }

    return { ...state, content, crossModelScore: review.score };
  } catch (err) {
    log(`  Warning: Cross-model review failed (${err.message}). Using original content.`);
    return state;
  }
}
