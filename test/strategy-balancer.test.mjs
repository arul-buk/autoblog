import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeBalancingDirective } from '../lib/strategy-balancer.mjs';

const baseStrategy = {
  intentMix: { informational: 40, commercial: 30, transactional: 20, navigational: 10 },
  formatMix: { 'how-to-guide': 30, comparison: 30, listicle: 20, 'news-analysis': 20 },
  categoryWeights: { 'Remote Work': 1.5, Competitor: 1.0 },
  balanceTolerance: 10,
  minPostsBeforeBalancing: 3,
};

describe('computeBalancingDirective', () => {
  it('returns inactive when no strategy', () => {
    const d = computeBalancingDirective(null, { totalTrackedPosts: 20 });
    assert.equal(d.active, false);
  });

  it('returns inactive when below minPostsBeforeBalancing', () => {
    const d = computeBalancingDirective(baseStrategy, { totalTrackedPosts: 2, intentDistribution: {}, formatDistribution: {}, categoryDistribution: {} });
    assert.equal(d.active, false);
  });

  it('returns inactive when all gaps within tolerance', () => {
    const d = computeBalancingDirective(baseStrategy, {
      totalTrackedPosts: 10,
      intentDistribution: { informational: 45, commercial: 25, transactional: 20, navigational: 10 },
      formatDistribution: { 'how-to-guide': 35, comparison: 25, listicle: 20, 'news-analysis': 20 },
      categoryDistribution: { 'Remote Work': 60, Competitor: 40 },
    });
    assert.equal(d.active, false);
  });

  it('detects intent gap and recommends preferred intent', () => {
    const d = computeBalancingDirective(baseStrategy, {
      totalTrackedPosts: 10,
      intentDistribution: { informational: 80, commercial: 10, transactional: 5, navigational: 5 },
      formatDistribution: { 'how-to-guide': 30, comparison: 30, listicle: 20, 'news-analysis': 20 },
      categoryDistribution: { 'Remote Work': 60, Competitor: 40 },
    });
    assert.equal(d.active, true);
    assert.equal(d.preferredIntent, 'commercial');
    assert.ok(d.balancingGuidance.includes('commercial'));
  });

  it('detects format gap and recommends preferred format', () => {
    const d = computeBalancingDirective(baseStrategy, {
      totalTrackedPosts: 10,
      intentDistribution: { informational: 40, commercial: 30, transactional: 20, navigational: 10 },
      formatDistribution: { 'how-to-guide': 80, comparison: 0, listicle: 10, 'news-analysis': 10 },
      categoryDistribution: { 'Remote Work': 60, Competitor: 40 },
    });
    assert.equal(d.active, true);
    assert.equal(d.preferredFormat, 'comparison');
  });

  it('detects category gap with weight-normalized targets', () => {
    const d = computeBalancingDirective(baseStrategy, {
      totalTrackedPosts: 10,
      intentDistribution: { informational: 40, commercial: 30, transactional: 20, navigational: 10 },
      formatDistribution: { 'how-to-guide': 30, comparison: 30, listicle: 20, 'news-analysis': 20 },
      categoryDistribution: { 'Remote Work': 20, Competitor: 80 },
    });
    // Remote Work has weight 1.5, Competitor 1.0 → targets: RW=60%, C=40%
    // Actual: RW=20%, C=80% → RW gap = +40, C gap = -40
    assert.equal(d.active, true);
    assert.equal(d.preferredCategory, 'Remote Work');
  });

  it('handles missing actual distribution keys gracefully', () => {
    const d = computeBalancingDirective(baseStrategy, {
      totalTrackedPosts: 5,
      intentDistribution: { informational: 100 },
      formatDistribution: { 'how-to-guide': 100 },
      categoryDistribution: { 'Remote Work': 100 },
    });
    assert.equal(d.active, true);
    assert.equal(d.preferredIntent, 'commercial');
    assert.equal(d.gaps.intent.commercial, 30);
  });

  it('includes gap map in output', () => {
    const d = computeBalancingDirective(baseStrategy, {
      totalTrackedPosts: 10,
      intentDistribution: { informational: 100 },
      formatDistribution: { 'how-to-guide': 100 },
      categoryDistribution: {},
    });
    assert.ok('intent' in d.gaps);
    assert.ok('format' in d.gaps);
    assert.ok('category' in d.gaps);
    assert.equal(typeof d.gaps.intent.commercial, 'number');
  });
});
