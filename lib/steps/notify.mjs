/**
 * notify.mjs — Telegram notification step wrapper.
 */

import { sendNotifications } from '../notifications.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/**
 * Send Telegram notification about the pipeline result.
 * This is a side-effect-only step — state is returned unchanged.
 *
 * @param {object} state - Pipeline state
 * @param {object} config - Autoblog config
 * @param {object} options - { dryRun, apiKey, additionalSlugs }
 * @returns {Promise<object>} State unchanged
 */
export async function notifyStep(state, config, options) {
  const { dryRun } = options;

  if (!config.notifications?.telegram?.botToken || dryRun) {
    return state;
  }

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
    await sendNotifications(pipelineResult, config);
    log('  Telegram notification sent');
  } catch (err) {
    log(`  Warning: Telegram notification failed (${err.message})`);
  }

  return state;
}
