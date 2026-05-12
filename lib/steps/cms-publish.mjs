/**
 * cms-publish.mjs — CMS publishing step wrapper.
 */

import { publishToCms } from '../publisher.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/**
 * Publish the generated post to a CMS platform.
 *
 * @param {object} state - Pipeline state
 * @param {object} config - Autoblog config
 * @param {object} options - { dryRun, apiKey, additionalSlugs }
 * @returns {Promise<object>} Updated state with publishResult
 */
export async function cmsPublishStep(state, config, options) {
  const { dryRun } = options;

  if (!config.publish?.cms || dryRun) {
    return state;
  }

  log(`Publishing to ${config.publish.cms}...`);

  const pipelineResult = {
    status: 'success',
    slug: state.slug,
    content: state.content,
    metadata: state.metadata,
    translations: state.translations,
    translationErrors: state.translationErrors,
    imagePath: state.imagePath,
    validation: state.validation,
    scheduleMode: state.scheduleMode,
    keywordData: state.keywordData,
  };

  try {
    const publishResult = await publishToCms(pipelineResult, config);
    log(`  Published: ${publishResult?.url || publishResult?.id || 'OK'}`);
    return { ...state, publishResult };
  } catch (err) {
    log(`  Warning: CMS publish failed (${err.message}). Post saved locally.`);
    return state;
  }
}
