/**
 * Step: Schedule Check
 * Resolves the content calendar to determine topic mode, overrides, and constraints.
 */

import { resolveSchedule } from '../scheduler.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export async function scheduleStep(state, config, _options) {
  if (!config.steps.calendar) {
    return state;
  }

  log('Checking content calendar...');
  const scheduleResult = await resolveSchedule(config);
  log(`  Mode: ${scheduleResult.mode}`);

  return { ...state, scheduleResult };
}
