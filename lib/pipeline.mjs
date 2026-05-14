/**
 * pipeline.mjs
 * Main pipeline orchestrator for the autoblog package.
 *
 * This module now delegates to the step runner (runner.mjs) which executes
 * discrete, composable steps. The runPipeline() and saveResults() exports
 * are preserved for backwards compatibility.
 *
 * Steps can be composed via:
 *   - DEFAULT_SEQUENCE (full pipeline, same as before)
 *   - NAMED_SEQUENCES (audit, refresh, research)
 *   - Custom --steps flag from CLI
 *
 * Each step is a thin wrapper in lib/steps/ that calls existing modules.
 */

import fs from 'fs';
import path from 'path';
import { DEFAULT_SEQUENCE } from './step-registry.mjs';
import { runSteps, stateToResult } from './runner.mjs';
import { sendFailureNotification } from './notifications.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/**
 * Run the full autoblog pipeline.
 *
 * @param {object} config - Validated autoblog config
 * @param {object} [options]
 * @param {boolean} [options.dryRun=false] - Preview without saving files
 * @param {string[]} [options.additionalSlugs=[]] - Extra slugs to treat as existing (for batch mode)
 * @param {string[]} [options.sequence] - Custom step sequence (defaults to DEFAULT_SEQUENCE)
 * @param {string} [options.runId] - Explicit run ID (for resume)
 * @param {string[]} [options.resumeCompletedSteps=[]] - Steps already completed (for resume)
 * @returns {Promise<object>} - Pipeline result
 */
export async function runPipeline(config, options = {}) {
  const { dryRun = false, additionalSlugs = [], sequence } = options;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }

  const stepSequence = sequence || DEFAULT_SEQUENCE;

  const finalState = await runSteps(stepSequence, config, {
    dryRun,
    additionalSlugs,
    apiKey,
    runId: options.runId,
    resumeCompletedSteps: options.resumeCompletedSteps || [],
  });

  // Handle early exits
  if (finalState.status === 'skipped_jitter') {
    return { status: 'skipped_jitter', slug: null };
  }
  if (finalState.status === 'all_duplicates') {
    return { status: 'all_duplicates', slug: null };
  }
  if (finalState.status === 'quality_rejected') {
    return { status: 'quality_rejected', slug: null };
  }
  if (!finalState.content && !finalState.selectedTopic) {
    return { status: 'no_topics', slug: null };
  }

  return stateToResult(finalState);
}

/**
 * Save pipeline results to disk.
 *
 * @param {object} result - Pipeline result from runPipeline()
 * @param {object} config - Full autoblog config
 */
export function saveResults(result, config) {
  if (result.status !== 'success') return;

  const postsDir = path.resolve(process.cwd(), config.output.postsDir);

  // Save English post
  const postPath = path.join(postsDir, `${result.slug}.md`);
  fs.mkdirSync(path.dirname(postPath), { recursive: true });
  fs.writeFileSync(postPath, result.content, 'utf-8');
  log(`Saved: ${config.output.postsDir}/${result.slug}.md`);

  // Save translations
  const translations = result.translations instanceof Map
    ? result.translations
    : new Map(Object.entries(result.translations || {}));

  for (const [lang, translated] of translations) {
    const langDir = path.join(postsDir, lang);
    fs.mkdirSync(langDir, { recursive: true });
    const langPath = path.join(langDir, `${result.slug}.md`);
    fs.writeFileSync(langPath, translated, 'utf-8');
    log(`Saved: ${config.output.postsDir}/${lang}/${result.slug}.md`);
  }
}
