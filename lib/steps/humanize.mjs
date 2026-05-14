/**
 * Step: Humanize
 * Removes AI writing patterns and fixes reading time.
 */

import { humanizePost } from '../humanizer.mjs';
import { validateFrontmatter } from '../writer.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/**
 * Calculate and replace readingTime in frontmatter based on actual word count.
 * Replaces any LLM-fabricated value with an accurate calculation (~200 wpm).
 */
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

export async function humanizeStep(state, config, options) {
  let { content } = state;
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;

  if (config.steps.humanize) {
    log('Humanizing content (removing AI writing patterns)...');
    const preHumanized = content;
    content = await humanizePost(apiKey, config, content, state.styleGuide || null);
    log(`  Humanized: ${content.length} chars`);

    // Track cost estimate based on content length
    if (options.costTracker) {
      const inputEstimate = Math.round(preHumanized.length / 4) + 500;
      const outputEstimate = Math.round(content.length / 4);
      options.costTracker.addGemini('humanize', { promptTokenCount: inputEstimate, candidatesTokenCount: outputEstimate, totalTokenCount: inputEstimate + outputEstimate }, config.models?.text || 'gemini-3-flash-preview');
    }

    // Guard: if humanizer corrupted frontmatter, fall back to pre-humanized content
    try {
      validateFrontmatter(content, config);
    } catch {
      log('  Warning: Humanizer corrupted frontmatter — reverting to pre-humanized content');
      content = preHumanized;
    }
  }

  // Fix readingTime — calculate from actual word count, not LLM guess
  content = fixReadingTime(content);

  return { ...state, content };
}
