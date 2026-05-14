/**
 * validate.mjs — Post quality validation step wrapper.
 */

import { validatePost } from '../validator.mjs';
import { writePost } from '../writer.mjs';
import { humanizePost } from '../humanizer.mjs';

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
 * Validate post quality and retry generation if word count is critically low.
 *
 * @param {object} state - Pipeline state
 * @param {object} config - Autoblog config
 * @param {object} options - { dryRun, apiKey, additionalSlugs }
 * @returns {Promise<object>} Updated state with validation
 */
export async function validateStep(state, config, options) {
  const { apiKey } = options;

  if (!config.steps.validate) {
    return state;
  }

  log('Validating post quality...');

  const existingSlugs = state.existingSlugs || [];
  let validation = validatePost(state.content, config, { existingSlugs });

  if (validation.errors.length > 0) {
    log(`  Errors: ${validation.errors.join('; ')}`);
  }
  if (validation.warnings.length > 0) {
    log(`  Warnings: ${validation.warnings.join('; ')}`);
  }
  if (validation.readability) {
    log(`  Readability: Grade ${validation.readability.gradeLevel} (${validation.wordCount} words)`);
  }
  if (validation.geoAeoScore !== undefined) {
    log(`  GEO/AEO score: ${validation.geoAeoScore}/100`);
  }

  let { content, slug, metadata } = state;

  // Retry once if word count is critically low
  if (validation.wordCount < (config.output?.wordCount?.min || 1000) * 0.8) {
    log('  Word count too low — retrying generation...');
    const retryResult = await writePost(
      apiKey, config, state.selectedTopic,
      existingSlugs,
      { keywordData: state.keywordData, writerNotes: state.writerNotes, linkedSlugs: state.linkedSlugs, styleGuide: state.styleGuide }
    );
    content = retryResult.content;
    slug = retryResult.slug;
    metadata = retryResult.metadata;

    if (config.steps.humanize) {
      content = await humanizePost(apiKey, config, content, state.styleGuide);
    }
    content = fixReadingTime(content);
    validation = validatePost(content, config, { existingSlugs });
    log(`  Retry result: ${validation.wordCount} words`);
  }

  if (validation.valid) {
    log('  Validation passed');
  }

  // Quality gate: reject if cross-model review score exists and is below minimum
  const minScore = config.contentQuality?.minPublishScore || 0;
  if (minScore > 0 && state.crossModelScore && state.crossModelScore < minScore) {
    log(`  QUALITY GATE: Score ${state.crossModelScore}/10 below minimum ${minScore}. Post rejected.`);
    return { ...state, content: null, slug: null, metadata: null, validation, status: 'quality_rejected' };
  }

  // Quality gate: reject if GEO/AEO score is critically low
  if (minScore > 0 && validation.geoAeoScore !== undefined && validation.geoAeoScore < 30) {
    log(`  QUALITY GATE: GEO/AEO score ${validation.geoAeoScore}/100 critically low. Post rejected.`);
    return { ...state, content: null, slug: null, metadata: null, validation, status: 'quality_rejected' };
  }

  return { ...state, content, slug, metadata, validation };
}
