/**
 * checkpoint.test.mjs
 * Tests for pipeline checkpoint save/load/clean functionality.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  generateRunId,
  resolveCheckpointDir,
  saveCheckpoint,
  loadCheckpoint,
  findLatestRun,
  cleanExpiredCheckpoints,
} from '../lib/checkpoint.mjs';

const TEST_DIR = join(tmpdir(), `autoblog-checkpoint-test-${Date.now()}`);

function makeConfig(overrides = {}) {
  return {
    checkpoint: {
      enabled: true,
      dir: TEST_DIR,
      maxAgeMs: 86400000,
      ...overrides,
    },
  };
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('generateRunId', () => {
  it('returns a string matching YYYYMMDD-HHmmss-xxxx pattern', () => {
    const id = generateRunId();
    assert.match(id, /^\d{8}-\d{6}-[a-f0-9]{4}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateRunId()));
    assert.equal(ids.size, 10);
  });
});

describe('resolveCheckpointDir', () => {
  it('resolves to config dir + runId', () => {
    const config = makeConfig();
    const dir = resolveCheckpointDir(config, 'test-run');
    assert.ok(dir.endsWith('test-run'));
    assert.ok(dir.includes(TEST_DIR));
  });
});

describe('saveCheckpoint / loadCheckpoint', () => {
  it('saves and loads state', () => {
    const dir = join(TEST_DIR, 'run1');
    const state = { foo: 'bar', count: 42, nested: { a: 1 } };

    saveCheckpoint(dir, 'research', state);
    const loaded = loadCheckpoint(dir, 'research');

    assert.deepEqual(loaded, state);
  });

  it('handles Map serialization', () => {
    const dir = join(TEST_DIR, 'run2');
    const state = { translations: new Map([['es', 'hola'], ['fr', 'bonjour']]) };

    saveCheckpoint(dir, 'translate', state);
    const loaded = loadCheckpoint(dir, 'translate');

    assert.ok(loaded.translations instanceof Map);
    assert.equal(loaded.translations.get('es'), 'hola');
    assert.equal(loaded.translations.get('fr'), 'bonjour');
  });

  it('returns null for missing checkpoint', () => {
    const dir = join(TEST_DIR, 'nonexistent');
    const loaded = loadCheckpoint(dir, 'research');
    assert.equal(loaded, null);
  });

  it('creates directories recursively', () => {
    const dir = join(TEST_DIR, 'deep', 'nested', 'run');
    saveCheckpoint(dir, 'step1', { data: true });
    assert.ok(existsSync(join(dir, 'step1.json')));
  });
});

describe('findLatestRun', () => {
  it('returns null when no checkpoints exist', () => {
    const config = makeConfig({ dir: join(TEST_DIR, 'empty') });
    const result = findLatestRun(config);
    assert.equal(result, null);
  });

  it('finds the most recent run', () => {
    const config = makeConfig();

    // Create two runs
    const run1Dir = join(TEST_DIR, '20260101-090000-aaaa');
    const run2Dir = join(TEST_DIR, '20260512-120000-bbbb');
    mkdirSync(run1Dir, { recursive: true });
    mkdirSync(run2Dir, { recursive: true });

    saveCheckpoint(run1Dir, 'research', { step: 1 });
    saveCheckpoint(run2Dir, 'research', { step: 2 });
    saveCheckpoint(run2Dir, 'dedupe', { step: 3 });

    const result = findLatestRun(config);
    assert.equal(result.runId, '20260512-120000-bbbb');
    assert.ok(result.completedSteps.includes('research'));
    assert.ok(result.completedSteps.includes('dedupe'));
  });

  it('ignores expired runs', () => {
    const config = makeConfig({ maxAgeMs: 1000 }); // 1 second

    // Old run (parsed from ID as 2020)
    const oldDir = join(TEST_DIR, '20200101-000000-cccc');
    mkdirSync(oldDir, { recursive: true });
    saveCheckpoint(oldDir, 'research', { old: true });

    const result = findLatestRun(config);
    assert.equal(result, null);
  });
});

describe('cleanExpiredCheckpoints', () => {
  it('removes expired checkpoint directories', () => {
    const config = makeConfig({ maxAgeMs: 1000 });

    const oldDir = join(TEST_DIR, '20200101-000000-dddd');
    mkdirSync(oldDir, { recursive: true });
    saveCheckpoint(oldDir, 'step1', { old: true });

    const removed = cleanExpiredCheckpoints(config);
    assert.equal(removed, 1);
    assert.ok(!existsSync(oldDir));
  });

  it('keeps fresh checkpoint directories', () => {
    const config = makeConfig({ maxAgeMs: 86400000 * 365 * 10 }); // 10 years

    const freshDir = join(TEST_DIR, '20260512-120000-eeee');
    mkdirSync(freshDir, { recursive: true });
    saveCheckpoint(freshDir, 'step1', { fresh: true });

    const removed = cleanExpiredCheckpoints(config);
    assert.equal(removed, 0);
    assert.ok(existsSync(freshDir));
  });

  it('returns 0 when directory does not exist', () => {
    const config = makeConfig({ dir: join(TEST_DIR, 'nope') });
    const removed = cleanExpiredCheckpoints(config);
    assert.equal(removed, 0);
  });
});
