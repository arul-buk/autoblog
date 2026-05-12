/**
 * competitor-analysis.test.mjs
 * Tests for competitive gap analysis (pure function tests only).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { identifyContentGaps, prioritizeGaps } from '../lib/competitor-analysis.mjs';

describe('identifyContentGaps', () => {
  it('finds keywords only competitors rank for', () => {
    const competitorKws = [
      { keyword: 'renovation cost calculator', volume: 1200, difficulty: 30, domain: 'competitor.com' },
      { keyword: 'home build budget', volume: 800, difficulty: 20, domain: 'competitor.com' },
      { keyword: 'shared keyword', volume: 500, difficulty: 25, domain: 'competitor.com' },
    ];
    const ownKws = [
      { keyword: 'shared keyword', volume: 500, difficulty: 25 },
      { keyword: 'our unique keyword', volume: 300, difficulty: 15 },
    ];
    const gaps = identifyContentGaps(competitorKws, ownKws);
    assert.equal(gaps.length, 2);
    assert.ok(gaps.find((g) => g.keyword === 'renovation cost calculator'));
    assert.ok(gaps.find((g) => g.keyword === 'home build budget'));
    assert.ok(!gaps.find((g) => g.keyword === 'shared keyword'));
  });

  it('returns empty array when no gaps exist', () => {
    const competitorKws = [
      { keyword: 'shared', volume: 100, difficulty: 10, domain: 'c.com' },
    ];
    const ownKws = [
      { keyword: 'shared', volume: 100, difficulty: 10 },
    ];
    const gaps = identifyContentGaps(competitorKws, ownKws);
    assert.equal(gaps.length, 0);
  });

  it('handles empty inputs', () => {
    assert.deepEqual(identifyContentGaps([], []), []);
    assert.deepEqual(identifyContentGaps([], [{ keyword: 'a' }]), []);
  });
});

describe('prioritizeGaps', () => {
  it('sorts by volume * (1/difficulty)', () => {
    const gaps = [
      { keyword: 'low-priority', volume: 100, difficulty: 50 },
      { keyword: 'high-priority', volume: 1000, difficulty: 10 },
      { keyword: 'medium', volume: 500, difficulty: 25 },
    ];
    const config = { competitors: { maxGaps: 20, minVolume: 0 } };
    const sorted = prioritizeGaps(gaps, config);
    assert.equal(sorted[0].keyword, 'high-priority');
  });

  it('caps at maxGaps', () => {
    const gaps = Array.from({ length: 50 }, (_, i) => ({
      keyword: `kw-${i}`, volume: 100, difficulty: 10,
    }));
    const config = { competitors: { maxGaps: 5, minVolume: 0 } };
    const sorted = prioritizeGaps(gaps, config);
    assert.equal(sorted.length, 5);
  });

  it('filters by minVolume', () => {
    const gaps = [
      { keyword: 'high-vol', volume: 500, difficulty: 10 },
      { keyword: 'low-vol', volume: 50, difficulty: 10 },
    ];
    const config = { competitors: { maxGaps: 20, minVolume: 100 } };
    const sorted = prioritizeGaps(gaps, config);
    assert.equal(sorted.length, 1);
    assert.equal(sorted[0].keyword, 'high-vol');
  });

  it('handles difficulty of 0 gracefully', () => {
    const gaps = [{ keyword: 'easy', volume: 100, difficulty: 0 }];
    const config = { competitors: { maxGaps: 20, minVolume: 0 } };
    const sorted = prioritizeGaps(gaps, config);
    assert.equal(sorted.length, 1);
  });
});
