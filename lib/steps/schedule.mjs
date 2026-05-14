/**
 * Step: Schedule Check
 * Resolves the content calendar to determine topic mode, overrides, and constraints.
 * Also implements cadence jitter — randomly skips runs to avoid a detectable
 * fixed publishing schedule.
 */

import { resolveSchedule } from '../scheduler.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export async function scheduleStep(state, config, _options) {
  // Cadence jitter: randomly skip this run based on skipProbability
  const skipProb = config.schedule?.skipProbability ?? 0;
  if (skipProb > 0 && Math.random() < skipProb) {
    log(`Cadence jitter: skipping this run (${(skipProb * 100).toFixed(0)}% skip probability)`);
    return { ...state, status: 'skipped_jitter' };
  }

  // Time jitter: random delay before proceeding (avoids fixed-time bot signal)
  const jitterMinutes = config.schedule?.jitterMinutes ?? 0;
  if (jitterMinutes > 0) {
    const delayMs = Math.floor(Math.random() * jitterMinutes * 60 * 1000);
    const delaySec = Math.round(delayMs / 1000);
    log(`Time jitter: waiting ${delaySec}s (~${Math.round(delaySec / 60)}min) before proceeding`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  if (!config.steps.calendar) {
    return state;
  }

  log('Checking content calendar...');
  const scheduleResult = await resolveSchedule(config);
  log(`  Mode: ${scheduleResult.mode}`);

  return { ...state, scheduleResult };
}
