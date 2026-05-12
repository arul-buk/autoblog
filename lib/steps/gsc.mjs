/**
 * Step: GSC Mining
 * Mines Google Search Console for quick wins, orphan queries, and declining pages.
 */

import { mineGscTopics, shouldRunGsc, updateGscLastRun } from '../gsc.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export async function gscStep(state, config, options) {
  const gscSchedule = shouldRunGsc(config);
  if (!gscSchedule.shouldRun) {
    log(`Skipping GSC mining — ${gscSchedule.reason}`);
    return state;
  }

  log('Mining Google Search Console data...');
  log(`  Reason: ${gscSchedule.reason}`);

  try {
    const gscInsights = await mineGscTopics(config);
    log(`  Quick wins: ${gscInsights.quickWins.length}, Orphans: ${gscInsights.orphanQueries.length}, Declining: ${gscInsights.decliningPages.length}`);

    if (!options.dryRun) {
      updateGscLastRun(config);
    }

    return { ...state, gscInsights };
  } catch (err) {
    log(`  Warning: GSC mining failed (${err.message}). Continuing without GSC data.`);
    return state;
  }
}
