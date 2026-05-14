/**
 * Step: Content Refresh Scheduler (Gap 2)
 * Computes which posts need refreshing and attaches the queue to state.
 * When running in the default pipeline (not standalone refresh sequence),
 * the top refresh candidate becomes the topic override — the pipeline
 * rewrites the stale post instead of generating a new topic.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
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

  if (refreshQueue.length === 0) {
    return { ...state, refreshQueue };
  }

  // Log top 3 candidates
  for (const item of refreshQueue.slice(0, 3)) {
    log(`  - "${item.title}" (${item.reason}, priority ${item.priority.toFixed(1)})`);
  }

  // If contentRefresh.autoRefresh is true and we're in the default pipeline,
  // override the topic with the top refresh candidate
  if (config.contentRefresh.autoRefresh && refreshQueue.length > 0) {
    const top = refreshQueue[0];
    log(`  Auto-refresh: overriding topic with stale post "${top.title}"`);

    // Read the existing post content to provide context to the writer
    let existingContent = '';
    try {
      const postsDir = resolve(process.cwd(), config.output.postsDir);
      existingContent = readFileSync(resolve(postsDir, `${top.slug}.md`), 'utf-8');
    } catch {
      // Post file might not exist locally
    }

    const updatedSchedule = {
      ...state.scheduleResult,
      mode: 'refresh',
      topicOverride: top.title,
      writerNotes: `CONTENT REFRESH: This is an update of an existing post (slug: ${top.slug}). The post is ${top.daysSincePublish} days old (category: ${top.category}). Rewrite with current data, updated statistics, and fresh examples. Preserve the original URL slug and structure.${existingContent ? `\n\nORIGINAL POST FOR REFERENCE:\n${existingContent.slice(0, 3000)}` : ''}`,
      skipDedupe: true,
    };

    return { ...state, refreshQueue, scheduleResult: updatedSchedule };
  }

  return { ...state, refreshQueue };
}
