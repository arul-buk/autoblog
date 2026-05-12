/**
 * geo-tracker.test.mjs
 * Tests for AI visibility / GEO tracking (pure function tests).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { checkBrandMentions, computeGeoMetrics } from '../lib/geo-tracker.mjs';

describe('checkBrandMentions', () => {
  it('detects brand name in text (case-insensitive)', () => {
    const result = checkBrandMentions(
      'According to HomeBuildBudget, costs are rising in 2026.',
      ['HomeBuildBudget']
    );
    assert.equal(result.mentioned, true);
    assert.ok(result.brands.includes('HomeBuildBudget'));
  });

  it('detects multiple brands', () => {
    const result = checkBrandMentions(
      'Both HomeBuildBudget and BuildCalc offer cost tools.',
      ['HomeBuildBudget', 'BuildCalc', 'OtherBrand']
    );
    assert.equal(result.mentioned, true);
    assert.equal(result.brands.length, 2);
  });

  it('returns false when no brands found', () => {
    const result = checkBrandMentions('No brands here.', ['HomeBuildBudget']);
    assert.equal(result.mentioned, false);
    assert.equal(result.brands.length, 0);
  });

  it('handles empty inputs', () => {
    assert.equal(checkBrandMentions('', ['Brand']).mentioned, false);
    assert.equal(checkBrandMentions('text', []).mentioned, false);
  });
});

describe('computeGeoMetrics', () => {
  it('aggregates results correctly', () => {
    const results = [
      { keyword: 'kw1', hasAiOverview: true, brandMentioned: true, coCitations: ['competitor.com'] },
      { keyword: 'kw2', hasAiOverview: true, brandMentioned: false, coCitations: ['competitor.com', 'other.com'] },
      { keyword: 'kw3', hasAiOverview: false, brandMentioned: false, coCitations: [] },
    ];
    const metrics = computeGeoMetrics(results);

    assert.equal(metrics.totalKeywords, 3);
    assert.equal(metrics.keywordsWithAiOverview, 2);
    assert.ok(metrics.brandMentionRate > 0);
    assert.ok(metrics.brandMentionRate <= 1);
    assert.ok(metrics.topCoCitations.length > 0);
  });

  it('handles empty results', () => {
    const metrics = computeGeoMetrics([]);
    assert.equal(metrics.totalKeywords, 0);
    assert.equal(metrics.keywordsWithAiOverview, 0);
    assert.equal(metrics.brandMentionRate, 0);
  });

  it('ranks co-citations by frequency', () => {
    const results = [
      { keyword: 'a', hasAiOverview: true, brandMentioned: false, coCitations: ['site-a.com', 'site-b.com'] },
      { keyword: 'b', hasAiOverview: true, brandMentioned: false, coCitations: ['site-a.com'] },
    ];
    const metrics = computeGeoMetrics(results);
    assert.equal(metrics.topCoCitations[0].domain, 'site-a.com');
    assert.equal(metrics.topCoCitations[0].count, 2);
  });
});
