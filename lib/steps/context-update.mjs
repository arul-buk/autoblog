/**
 * context-update.mjs — Context/performance feedback loop step wrapper.
 */

import { updateContext, fetchAnalyticsPerformance } from '../context.mjs';
import { getGscPerformance } from '../gsc.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/**
 * Update pipeline context with current run results and performance data.
 * This is a side-effect-only step — state is returned unchanged.
 *
 * @param {object} state - Pipeline state
 * @param {object} config - Autoblog config
 * @param {object} options - { dryRun, apiKey, additionalSlugs }
 * @returns {Promise<object>} State unchanged
 */
export async function contextUpdateStep(state, config, options) {
  const { dryRun } = options;

  if (!config.context?.enabled || dryRun) {
    return state;
  }

  try {
    let performanceData = {};
    const allMeta = state.existingMeta || [];
    const slugs = allMeta.map((m) => m.slug).slice(0, 50);

    // Fetch GSC performance for existing posts
    if (config.gsc?.enabled || process.env.GSC_SERVICE_ACCOUNT_JSON) {
      try {
        const gscPerf = await getGscPerformance(config, slugs);
        for (const [slug, perf] of gscPerf) {
          performanceData[slug] = { ...performanceData[slug], ...perf };
        }
      } catch (err) {
        log(`  Warning: GSC performance fetch failed (${err.message})`);
      }
    }

    // Fetch GA4 performance
    if (config.analytics?.enabled || process.env.GA4_SERVICE_ACCOUNT_JSON) {
      try {
        const gaPerf = await fetchAnalyticsPerformance(config, slugs);
        for (const [slug, perf] of gaPerf) {
          performanceData[slug] = { ...performanceData[slug], ...perf };
        }
      } catch (err) {
        log(`  Warning: GA4 performance fetch failed (${err.message})`);
      }
    }

    // Build pipelineResult from state
    const pipelineResult = {
      status: 'success',
      slug: state.slug,
      content: state.content,
      metadata: state.metadata,
      keywordData: state.keywordData,
      translations: state.translations,
      translationErrors: state.translationErrors,
      imagePath: state.imagePath,
      validation: state.validation,
      scheduleMode: state.scheduleMode,
    };

    updateContext(config, pipelineResult, performanceData);
    log('  Context updated');
  } catch (err) {
    log(`  Warning: Context update failed (${err.message})`);
  }

  return state;
}
