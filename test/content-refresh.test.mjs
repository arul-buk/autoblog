/**
 * content-refresh.test.mjs
 * Tests for content refresh scheduler.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeRefreshQueue,
  matchRefreshRule,
  computeRefreshPriority,
} from '../lib/content-refresh.mjs';

const baseConfig = {
  contentRefresh: {
    enabled: true,
    rules: [
      { category: '*', maxAgeDays: 365 },
      { category: 'regulatory', maxAgeDays: 30 },
      { category: 'statistics', maxAgeDays: 180 },
    ],
    maxQueueSize: 10,
    prioritizeByTraffic: true,
  },
};

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

describe('matchRefreshRule', () => {
  it('matches exact category over wildcard', () => {
    const post = { category: 'regulatory' };
    const rule = matchRefreshRule(post, baseConfig.contentRefresh.rules);
    assert.equal(rule.category, 'regulatory');
    assert.equal(rule.maxAgeDays, 30);
  });

  it('falls back to wildcard when no exact match', () => {
    const post = { category: 'general-tips' };
    const rule = matchRefreshRule(post, baseConfig.contentRefresh.rules);
    assert.equal(rule.category, '*');
    assert.equal(rule.maxAgeDays, 365);
  });

  it('returns null when no rules match and no wildcard', () => {
    const post = { category: 'something' };
    const rule = matchRefreshRule(post, [{ category: 'specific', maxAgeDays: 30 }]);
    assert.equal(rule, null);
  });
});

describe('computeRefreshPriority', () => {
  it('returns higher priority for posts further past due', () => {
    const post1 = { date: daysAgo(400), performance: { clicks: 10 } };
    const post2 = { date: daysAgo(370), performance: { clicks: 10 } };
    const rule = { maxAgeDays: 365 };
    const config = { contentRefresh: { prioritizeByTraffic: true } };

    const p1 = computeRefreshPriority(post1, rule, config);
    const p2 = computeRefreshPriority(post2, rule, config);
    assert.ok(p1 > p2);
  });

  it('returns higher priority for high-traffic stale posts', () => {
    const highTraffic = { date: daysAgo(400), performance: { clicks: 500 } };
    const lowTraffic = { date: daysAgo(400), performance: { clicks: 5 } };
    const rule = { maxAgeDays: 365 };
    const config = { contentRefresh: { prioritizeByTraffic: true } };

    const ph = computeRefreshPriority(highTraffic, rule, config);
    const pl = computeRefreshPriority(lowTraffic, rule, config);
    assert.ok(ph > pl);
  });

  it('ignores traffic when prioritizeByTraffic is false', () => {
    const highTraffic = { date: daysAgo(400), performance: { clicks: 500 } };
    const lowTraffic = { date: daysAgo(400), performance: { clicks: 5 } };
    const rule = { maxAgeDays: 365 };
    const config = { contentRefresh: { prioritizeByTraffic: false } };

    const ph = computeRefreshPriority(highTraffic, rule, config);
    const pl = computeRefreshPriority(lowTraffic, rule, config);
    assert.equal(ph, pl);
  });
});

describe('computeRefreshQueue', () => {
  it('flags posts older than maxAgeDays', () => {
    const context = {
      posts: [
        { slug: 'old-post', title: 'Old Post', date: daysAgo(400), category: 'general', performance: { clicks: 100 } },
        { slug: 'fresh-post', title: 'Fresh Post', date: daysAgo(30), category: 'general', performance: { clicks: 50 } },
      ],
    };
    const queue = computeRefreshQueue(context, baseConfig);
    assert.equal(queue.length, 1);
    assert.equal(queue[0].slug, 'old-post');
  });

  it('respects category-specific rules', () => {
    const context = {
      posts: [
        { slug: 'reg-post', title: 'Regulation Update', date: daysAgo(35), category: 'regulatory', performance: { clicks: 200 } },
        { slug: 'gen-post', title: 'General Guide', date: daysAgo(35), category: 'general', performance: { clicks: 200 } },
      ],
    };
    const queue = computeRefreshQueue(context, baseConfig);
    // regulatory maxAgeDays=30, so 35 days is past due
    // general maxAgeDays=365, so 35 days is fresh
    assert.equal(queue.length, 1);
    assert.equal(queue[0].slug, 'reg-post');
  });

  it('excludes recently refreshed posts', () => {
    const context = {
      posts: [
        {
          slug: 'refreshed-post', title: 'Refreshed', date: daysAgo(400), category: 'general',
          performance: { clicks: 100 },
          refreshMetadata: { lastRefreshed: daysAgo(5) },
        },
      ],
    };
    const queue = computeRefreshQueue(context, baseConfig);
    assert.equal(queue.length, 0);
  });

  it('returns empty queue for empty context', () => {
    const queue = computeRefreshQueue({ posts: [] }, baseConfig);
    assert.equal(queue.length, 0);
  });

  it('respects maxQueueSize', () => {
    const posts = Array.from({ length: 20 }, (_, i) => ({
      slug: `post-${i}`, title: `Post ${i}`, date: daysAgo(400 + i), category: 'general',
      performance: { clicks: 100 - i },
    }));
    const context = { posts };
    const queue = computeRefreshQueue(context, baseConfig);
    assert.ok(queue.length <= baseConfig.contentRefresh.maxQueueSize);
  });

  it('sorts by priority descending', () => {
    const context = {
      posts: [
        { slug: 'low-traffic', title: 'Low', date: daysAgo(400), category: 'general', performance: { clicks: 5 } },
        { slug: 'high-traffic', title: 'High', date: daysAgo(400), category: 'general', performance: { clicks: 500 } },
      ],
    };
    const queue = computeRefreshQueue(context, baseConfig);
    assert.equal(queue[0].slug, 'high-traffic');
  });
});
