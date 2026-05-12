/**
 * Step: Topical Authority Sequencing (Gap 4)
 * Resolves the next topic from the topical map and overrides the schedule.
 */

import { resolveNextTopic } from '../topical-authority.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export async function topicalAuthorityStep(state, config, _options) {
  if (!config.topicalMap?.enabled) {
    return state;
  }

  const pillars = config.topicalMap?.pillars;
  if (!pillars || pillars.length === 0) {
    log('Topical authority: no pillars configured — skipping');
    return state;
  }

  if (!state.context) {
    log('Topical authority: no context loaded — skipping');
    return state;
  }

  const next = resolveNextTopic(config.topicalMap, state.context);

  if (!next) {
    log('Topical authority: all topics written — no override');
    return state;
  }

  const label = next.isPillar ? 'pillar' : 'cluster';
  log(`Topical authority: selected ${label} "${next.topic}" (pillar: ${next.pillarSlug})`);

  if (next.internalLinks.length > 0) {
    log(`  Internal links: ${next.internalLinks.join(', ')}`);
  }

  // Override schedule with topical authority topic
  const scheduleResult = {
    ...(state.scheduleResult || {}),
    topicOverride: next.topic,
  };

  const linkedSlugs = next.internalLinks || [];

  return { ...state, scheduleResult, linkedSlugs };
}
