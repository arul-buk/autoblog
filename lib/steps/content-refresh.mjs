/**
 * Step: Content Refresh Scheduler (Gap 2)
 * Computes which posts need refreshing and attaches the queue to state.
 */

import { computeRefreshQueue } from '../content-refresh.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export async function contentRefreshStep(state, config, _options) {
  if (!config.contentRefresh?.enabled) {
    return state;
  }

  if (!state.context?.posts?.length) {
    log('Content refresh: no posts in context — skipping');
    return state;
  }

  const refreshQueue = computeRefreshQueue(state.context, config);
  log(`Content refresh: ${refreshQueue.length} posts due for refresh`);

  // Log top 3 candidates
  for (const item of refreshQueue.slice(0, 3)) {
    log(`  - "${item.title}" (${item.reason}, priority ${item.priority.toFixed(1)})`);
  }

  return { ...state, refreshQueue };
}
