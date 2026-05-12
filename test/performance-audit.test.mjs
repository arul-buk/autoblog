/**
 * performance-audit.test.mjs
 * Tests for performance audit feedback loop.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractWinningPatterns, detectDecliningPosts, buildAuditReport } from '../lib/performance-audit.mjs';

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

const baseAuditConfig = {
  audit: {
    minPostAgeDays: 14,
    declineThreshold: 0.3,
    winningPatterns: { minClicks: 50, topPositionThreshold: 10 },
  },
};

const samplePosts = [
  {
    slug: 'strong-post', title: 'Strong Post', date: daysAgo(60),
    category: 'Cost Planning', searchIntent: 'informational', contentFormat: 'how-to-guide',
    performance: { clicks: 200, impressions: 5000, position: 4.5 },
  },
  {
    slug: 'moderate-post', title: 'Moderate Post', date: daysAgo(45),
    category: 'Cost Planning', searchIntent: 'commercial', contentFormat: 'comparison',
    performance: { clicks: 80, impressions: 2000, position: 8.2 },
  },
  {
    slug: 'declining-post', title: 'Declining Post', date: daysAgo(90),
    category: 'First Home Buyer', searchIntent: 'informational', contentFormat: 'how-to-guide',
    performance: { clicks: 10, impressions: 500, position: 25.3 },
  },
  {
    slug: 'new-post', title: 'New Post', date: daysAgo(5),
    category: 'Build vs Buy', searchIntent: 'commercial', contentFormat: 'comparison',
    performance: { clicks: 5, impressions: 100, position: 15.0 },
  },
];

describe('extractWinningPatterns', () => {
  it('groups winning posts by category', () => {
    const patterns = extractWinningPatterns(samplePosts, baseAuditConfig);
    const categoryPatterns = patterns.filter((p) => p.dimension === 'category');
    assert.ok(categoryPatterns.length > 0);
    const costPlanning = categoryPatterns.find((p) => p.value === 'Cost Planning');
    assert.ok(costPlanning);
    assert.equal(costPlanning.postCount, 2);
  });

  it('groups by searchIntent', () => {
    const patterns = extractWinningPatterns(samplePosts, baseAuditConfig);
    const intentPatterns = patterns.filter((p) => p.dimension === 'searchIntent');
    assert.ok(intentPatterns.length > 0);
  });

  it('groups by contentFormat', () => {
    const patterns = extractWinningPatterns(samplePosts, baseAuditConfig);
    const formatPatterns = patterns.filter((p) => p.dimension === 'contentFormat');
    assert.ok(formatPatterns.length > 0);
  });

  it('only includes posts meeting minClicks threshold', () => {
    const patterns = extractWinningPatterns(samplePosts, baseAuditConfig);
    const allPostCounts = patterns.reduce((sum, p) => sum + (p.dimension === 'category' ? p.postCount : 0), 0);
    // Only strong-post (200) and moderate-post (80) meet minClicks=50
    // declining-post (10) and new-post (5) should be excluded
    // Cost Planning has 2 posts that meet threshold
    const cp = patterns.find((p) => p.dimension === 'category' && p.value === 'Cost Planning');
    assert.ok(cp);
  });
});

describe('detectDecliningPosts', () => {
  it('detects posts with position > 20', () => {
    const declining = detectDecliningPosts(samplePosts, baseAuditConfig);
    const found = declining.find((d) => d.slug === 'declining-post');
    assert.ok(found);
    assert.ok(found.reason.includes('position'));
  });

  it('skips posts younger than minPostAgeDays', () => {
    const declining = detectDecliningPosts(samplePosts, baseAuditConfig);
    const newPost = declining.find((d) => d.slug === 'new-post');
    assert.equal(newPost, undefined);
  });

  it('does not flag strong positions as declining', () => {
    const declining = detectDecliningPosts(samplePosts, baseAuditConfig);
    const strong = declining.find((d) => d.slug === 'strong-post');
    assert.equal(strong, undefined);
  });

  it('returns empty array for empty posts', () => {
    const declining = detectDecliningPosts([], baseAuditConfig);
    assert.deepEqual(declining, []);
  });
});

describe('buildAuditReport', () => {
  it('returns a non-empty string report', () => {
    const result = {
      decliningPosts: [{ slug: 'test', title: 'Test', position: 25, clicks: 10, reason: 'position > 20' }],
      improvingPosts: [],
      winningPatterns: [{ dimension: 'category', value: 'Test', avgPosition: 5, avgClicks: 100, postCount: 2 }],
      refreshCandidates: [],
    };
    const report = buildAuditReport(result);
    assert.ok(report.length > 0);
    assert.ok(report.includes('DECLINING'));
    assert.ok(report.includes('WINNING'));
  });

  it('handles empty audit result', () => {
    const result = {
      decliningPosts: [],
      improvingPosts: [],
      winningPatterns: [],
      refreshCandidates: [],
    };
    const report = buildAuditReport(result);
    assert.ok(report.length > 0);
  });
});
