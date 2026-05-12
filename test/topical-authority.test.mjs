/**
 * topical-authority.test.mjs
 * Tests for topical authority sequencing.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveNextTopic, getPillarStatus } from '../lib/topical-authority.mjs';

const baseMap = {
  enabled: true,
  requirePillarFirst: true,
  pillars: [
    {
      topic: 'Home Construction Costs Australia',
      slug: 'home-construction-costs-australia',
      clusters: [
        'building cost per square metre',
        'renovation budget breakdown',
        'labour costs vs material costs',
      ],
    },
    {
      topic: 'First Home Buyer Guide',
      slug: 'first-home-buyer-guide',
      clusters: ['stamp duty exemption', 'first home owner grant'],
    },
  ],
};

describe('resolveNextTopic', () => {
  it('returns pillar topic when pillar missing and requirePillarFirst=true', () => {
    const context = { posts: [] };
    const result = resolveNextTopic(baseMap, context);
    assert.ok(result);
    assert.equal(result.isPillar, true);
    assert.equal(result.topic, 'Home Construction Costs Australia');
    assert.equal(result.pillarSlug, 'home-construction-costs-australia');
  });

  it('returns cluster topic after pillar exists', () => {
    const context = {
      posts: [
        { slug: 'home-construction-costs-australia', title: 'Home Construction Costs Australia' },
      ],
    };
    const result = resolveNextTopic(baseMap, context);
    assert.ok(result);
    assert.equal(result.isPillar, false);
    assert.ok(result.topic.length > 0);
    assert.equal(result.pillarSlug, 'home-construction-costs-australia');
  });

  it('returns null when all topics are written', () => {
    const context = {
      posts: [
        { slug: 'home-construction-costs-australia', title: 'Home Construction Costs Australia' },
        { slug: 'building-cost-per-square-metre', title: 'Building Cost Per Square Metre' },
        { slug: 'renovation-budget-breakdown', title: 'Renovation Budget Breakdown' },
        { slug: 'labour-costs-vs-material-costs', title: 'Labour Costs vs Material Costs' },
        { slug: 'first-home-buyer-guide', title: 'First Home Buyer Guide' },
        { slug: 'stamp-duty-exemption', title: 'Stamp Duty Exemption' },
        { slug: 'first-home-owner-grant', title: 'First Home Owner Grant' },
      ],
    };
    const result = resolveNextTopic(baseMap, context);
    assert.equal(result, null);
  });

  it('includes pillar and sibling slugs in internalLinks', () => {
    const context = {
      posts: [
        { slug: 'home-construction-costs-australia', title: 'Home Construction Costs Australia' },
        { slug: 'building-cost-per-square-metre', title: 'Building Cost Per Square Metre' },
      ],
    };
    const result = resolveNextTopic(baseMap, context);
    assert.ok(result);
    assert.ok(result.internalLinks.includes('home-construction-costs-australia'));
    assert.ok(result.internalLinks.includes('building-cost-per-square-metre'));
  });

  it('skips pillar requirement when requirePillarFirst=false', () => {
    const map = { ...baseMap, requirePillarFirst: false };
    const context = { posts: [] };
    const result = resolveNextTopic(map, context);
    assert.ok(result);
    // Could be pillar or cluster since requirement is off
  });

  it('handles empty pillars array', () => {
    const map = { ...baseMap, pillars: [] };
    const context = { posts: [] };
    const result = resolveNextTopic(map, context);
    assert.equal(result, null);
  });
});

describe('getPillarStatus', () => {
  it('reports correct status for each pillar', () => {
    const context = {
      posts: [
        { slug: 'home-construction-costs-australia', title: 'Home Construction Costs Australia' },
        { slug: 'building-cost-per-square-metre', title: 'Building Cost Per Square Metre' },
      ],
    };
    const status = getPillarStatus(baseMap, context);
    assert.equal(status.length, 2);

    const first = status.find((s) => s.pillarSlug === 'home-construction-costs-australia');
    assert.equal(first.exists, true);
    assert.equal(first.clustersTotal, 3);
    assert.equal(first.clustersWritten, 1);
    assert.equal(first.clustersRemaining, 2);
  });

  it('reports missing pillar', () => {
    const context = { posts: [] };
    const status = getPillarStatus(baseMap, context);
    const first = status[0];
    assert.equal(first.exists, false);
    assert.equal(first.clustersWritten, 0);
  });
});
