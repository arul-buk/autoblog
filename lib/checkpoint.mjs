/**
 * checkpoint.mjs
 * Save and restore pipeline state between steps for resume support.
 * Enables step-level durability — if step N fails, resume from step N
 * without re-running steps 1 through N-1.
 *
 * Zero npm dependencies.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { randomBytes } from 'crypto';

/**
 * Generate a unique run ID: YYYYMMDD-HHmmss-xxxx
 */
export function generateRunId() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  const rand = randomBytes(2).toString('hex');
  return `${date}-${time}-${rand}`;
}

/**
 * Resolve the checkpoint directory for a given run.
 *
 * @param {object} config - Full autoblog config
 * @param {string} runId - Run identifier
 * @returns {string} Absolute path to checkpoint dir
 */
export function resolveCheckpointDir(config, runId) {
  const baseDir = config.checkpoint?.dir || '.autoblog-checkpoints';
  return resolve(process.cwd(), baseDir, runId);
}

/**
 * JSON replacer that handles Map → Array conversion.
 */
function jsonReplacer(key, value) {
  if (value instanceof Map) {
    return { __type: 'Map', entries: [...value.entries()] };
  }
  return value;
}

/**
 * JSON reviver that restores Map from serialized form.
 */
function jsonReviver(key, value) {
  if (value && typeof value === 'object' && value.__type === 'Map' && Array.isArray(value.entries)) {
    return new Map(value.entries);
  }
  return value;
}

/**
 * Save pipeline state after a completed step.
 *
 * @param {string} checkpointDir - Absolute path to checkpoint dir for this run
 * @param {string} stepName - Name of the completed step
 * @param {object} state - Current pipeline state
 */
export function saveCheckpoint(checkpointDir, stepName, state) {
  mkdirSync(checkpointDir, { recursive: true });
  const filePath = join(checkpointDir, `${stepName}.json`);
  writeFileSync(filePath, JSON.stringify(state, jsonReplacer, 2), 'utf-8');
}

/**
 * Load checkpoint state for a step.
 *
 * @param {string} checkpointDir - Absolute path to checkpoint dir
 * @param {string} stepName - Step name to load
 * @returns {object|null} Restored state or null if not found
 */
export function loadCheckpoint(checkpointDir, stepName) {
  const filePath = join(checkpointDir, `${stepName}.json`);
  if (!existsSync(filePath)) return null;

  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'), jsonReviver);
  } catch {
    return null;
  }
}

/**
 * Find the most recent non-expired checkpoint run.
 *
 * @param {object} config - Full autoblog config
 * @returns {{ runId: string, dir: string, lastStep: string }|null}
 */
export function findLatestRun(config) {
  const baseDir = resolve(process.cwd(), config.checkpoint?.dir || '.autoblog-checkpoints');
  if (!existsSync(baseDir)) return null;

  const maxAgeMs = config.checkpoint?.maxAgeMs || 86400000; // 24h default
  const now = Date.now();

  const runs = readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const runDir = join(baseDir, d.name);
      const steps = readdirSync(runDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''));

      // Parse timestamp from run ID (YYYYMMDD-HHmmss-xxxx)
      const match = d.name.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-/);
      let timestamp = 0;
      if (match) {
        timestamp = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`).getTime();
      }

      return { runId: d.name, dir: runDir, steps, timestamp };
    })
    .filter((r) => r.steps.length > 0 && (now - r.timestamp) < maxAgeMs)
    .sort((a, b) => b.timestamp - a.timestamp);

  if (runs.length === 0) return null;

  const latest = runs[0];
  return {
    runId: latest.runId,
    dir: latest.dir,
    lastStep: latest.steps[latest.steps.length - 1],
    completedSteps: latest.steps,
  };
}

/**
 * Remove expired checkpoint directories.
 *
 * @param {object} config - Full autoblog config
 * @returns {number} Number of directories removed
 */
export function cleanExpiredCheckpoints(config) {
  const baseDir = resolve(process.cwd(), config.checkpoint?.dir || '.autoblog-checkpoints');
  if (!existsSync(baseDir)) return 0;

  const maxAgeMs = config.checkpoint?.maxAgeMs || 86400000;
  const now = Date.now();
  let removed = 0;

  for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const match = entry.name.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-/);
    if (!match) continue;

    const timestamp = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`).getTime();
    if ((now - timestamp) >= maxAgeMs) {
      rmSync(join(baseDir, entry.name), { recursive: true, force: true });
      removed++;
    }
  }

  return removed;
}
