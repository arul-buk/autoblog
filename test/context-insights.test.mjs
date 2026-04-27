/**
 * context-insights.test.mjs
 * Tests for context feedback loop: computePostInsights, buildContextSummary,
 * buildKeywordAvoidList, and prompt builder integration.
 *
 * Run: npm test
 * Requires: Node.js 20+ (uses built-in node:test)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  computePostInsights,
  buildContextSummary,
  buildKeywordAvoidList,
} from '../lib/context.mjs';

import {
  buildResearchPrompt,
  buildKeywordStrategyPrompt,
} from '../lib/prompts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name) {
  return JSON.parse(readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8'));
}

// ─── computePostInsights ─────────────────────────────────────────────────

describe('computePostInsights', () => {
  it('returns empty insights for empty context', () => {
    const ctx = loadFixture('context-empty.json');
    const insights = computePostInsights(ctx);

    assert.equal(insights.hasPerformanceData, false);
    assert.deepEqual(insights.topCategories, []);
    assert.deepEqual(insights.decliningKeywords, []);
    assert.deepEqual(insights.underperformingCategories, []);
  });

  it('returns hasPerformanceData=false when all posts lack performance', () => {
    const ctx = {
      version: 1,
      posts: [
        { slug: 'a', title: 'A', date: '2026-01-01', category: 'X', primaryKeyword: 'kw', secondaryKeywords: [], performance: null },
        { slug: 'b', title: 'B', date: '2026-01-02', category: 'Y', primaryKeyword: 'kw2', secondaryKeywords: [], performance: null },
      ],
      topicHistory: [],
    };
    const insights = computePostInsights(ctx);
    assert.equal(insights.hasPerformanceData, false);
  });

  it('assigns correct trend based on position ranges', () => {
    const ctx = loadFixture('context-with-performance.json');
    const insights = computePostInsights(ctx);

    // position 5.2 → strong
    const remote = insights.posts.find((p) => p.slug === 'remote-team-productivity');
    assert.equal(remote.trend, 'strong');

    // position 18.3 → moderate
    const sprint = insights.posts.find((p) => p.slug === 'sprint-analytics-review');
    assert.equal(sprint.trend, 'moderate');

    // position 22.5 → weak
    const burnout = insights.posts.find((p) => p.slug === 'engineering-burnout-prevention');
    assert.equal(burnout.trend, 'weak');
  });

  it('excludes stale performance data (>60 days old)', () => {
    const ctx = loadFixture('context-with-performance.json');
    const insights = computePostInsights(ctx);

    // stale-old-post has lastChecked 2025-08-01, should be excluded from insights
    // platform-update-q1 has lastChecked 2025-12-01, also stale
    // These should NOT appear in decliningKeywords despite having poor positions
    const staleInDeclining = insights.decliningKeywords.find(
      (dk) => dk.slug === 'stale-old-post' || dk.slug === 'platform-update-q1'
    );
    assert.equal(staleInDeclining, undefined, 'Stale posts should be excluded from declining keywords');
  });

  it('computes top categories sorted by avg clicks', () => {
    const ctx = loadFixture('context-with-performance.json');
    const insights = computePostInsights(ctx);

    assert.ok(insights.topCategories.length > 0);
    assert.ok(insights.topCategories.length <= 3);

    // Competitor has highest avg clicks (jira=200, sprint=15 → avg 107.5)
    // Remote Work has (120 + 85) / 2 = 102.5
    // So Competitor should be first
    assert.equal(insights.topCategories[0].category, 'Competitor');

    // Verify shape
    const first = insights.topCategories[0];
    assert.ok('avgClicks' in first);
    assert.ok('avgPosition' in first);
    assert.ok('postCount' in first);
  });

  it('identifies declining keywords (position > 15, impressions > 50)', () => {
    const ctx = loadFixture('context-with-performance.json');
    const insights = computePostInsights(ctx);

    // sprint-analytics-review: position 18.3, impressions 890 → included
    const sprint = insights.decliningKeywords.find((dk) => dk.keyword === 'sprint analytics comparison');
    assert.ok(sprint, 'sprint analytics comparison should be a declining keyword');
    assert.equal(sprint.position, 18.3);

    // engineering-burnout-prevention: position 22.5, impressions 320 → included
    const burnout = insights.decliningKeywords.find((dk) => dk.keyword === 'developer burnout prevention');
    assert.ok(burnout, 'developer burnout prevention should be a declining keyword');

    // remote-team-productivity: position 5.2 → NOT declining
    const remote = insights.decliningKeywords.find((dk) => dk.keyword === 'remote team productivity');
    assert.equal(remote, undefined, 'Strong-position keywords should not be declining');
  });

  it('identifies underperforming categories', () => {
    const ctx = loadFixture('context-with-performance.json');
    const insights = computePostInsights(ctx);

    // Engineering Culture has avg clicks ~6.5, well below top category
    const engCulture = insights.underperformingCategories.find((c) => c.category === 'Engineering Culture');
    assert.ok(engCulture, 'Engineering Culture should be underperforming');
  });
});

// ─── buildContextSummary ─────────────────────────────────────────────────

describe('buildContextSummary', () => {
  it('returns empty string when hasPerformanceData is false', () => {
    const insights = { hasPerformanceData: false, posts: [], topCategories: [], decliningKeywords: [], underperformingCategories: [] };
    assert.equal(buildContextSummary(insights), '');
  });

  it('includes top categories and declining keywords when data exists', () => {
    const ctx = loadFixture('context-with-performance.json');
    const insights = computePostInsights(ctx);
    const summary = buildContextSummary(insights);

    assert.ok(summary.includes('CONTENT PERFORMANCE DATA'));
    assert.ok(summary.includes('Top-performing categories'));
    assert.ok(summary.includes('Declining keywords'));
  });

  it('stays under 800 chars (~200 tokens)', () => {
    const ctx = loadFixture('context-with-performance.json');
    const insights = computePostInsights(ctx);
    const summary = buildContextSummary(insights);

    assert.ok(summary.length < 800, `Summary is ${summary.length} chars, expected < 800`);
  });

  it('respects maxLines parameter', () => {
    const ctx = loadFixture('context-with-performance.json');
    const insights = computePostInsights(ctx);
    const summary = buildContextSummary(insights, { maxLines: 1 });

    // Count lines that start with '- "' (declining keyword lines)
    const keywordLines = summary.split('\n').filter((l) => l.startsWith('- "'));
    assert.ok(keywordLines.length <= 1, `Expected <=1 keyword lines, got ${keywordLines.length}`);
  });
});

// ─── buildKeywordAvoidList ───────────────────────────────────────────────

describe('buildKeywordAvoidList', () => {
  it('returns empty array when no performance data', () => {
    const insights = { hasPerformanceData: false, decliningKeywords: [] };
    const list = buildKeywordAvoidList(insights);
    assert.deepEqual(list, []);
  });

  it('returns correct shape for declining keywords', () => {
    const ctx = loadFixture('context-with-performance.json');
    const insights = computePostInsights(ctx);
    const list = buildKeywordAvoidList(insights);

    assert.ok(list.length > 0);
    const first = list[0];
    assert.ok('keyword' in first);
    assert.ok('slug' in first);
    assert.ok('reason' in first);
  });

  it('deduplicates keywords across posts', () => {
    const insights = {
      hasPerformanceData: true,
      decliningKeywords: [
        { keyword: 'same keyword', slug: 'post-1', position: 18, impressions: 100 },
        { keyword: 'same keyword', slug: 'post-2', position: 20, impressions: 80 },
        { keyword: 'different keyword', slug: 'post-3', position: 22, impressions: 60 },
      ],
    };
    const list = buildKeywordAvoidList(insights);

    const sameKeywordEntries = list.filter((l) => l.keyword === 'same keyword');
    assert.equal(sameKeywordEntries.length, 1, 'Duplicate keywords should be deduped');
    assert.equal(list.length, 2);
  });
});

// ─── Prompt builder smoke tests ──────────────────────────────────────────

describe('buildResearchPrompt', () => {
  const baseArgs = {
    expandedQueries: ['[Remote Work] async communication best practices'],
    config: {
      product: { name: 'TestProduct', description: 'A test product' },
      topics: { clusters: [{ name: 'Remote Work' }], recencyDays: 7 },
    },
    regionalContexts: [],
  };

  it('produces valid prompt without contextSummary (no regression)', () => {
    const prompt = buildResearchPrompt({ ...baseArgs, contextSummary: undefined });
    assert.ok(prompt.includes('AVOID:'));
    assert.ok(prompt.includes('TestProduct'));
    assert.ok(!prompt.includes('CONTENT PERFORMANCE DATA'));
  });

  it('injects context summary when provided', () => {
    const ctx = loadFixture('context-with-performance.json');
    const insights = computePostInsights(ctx);
    const contextSummary = buildContextSummary(insights);

    const prompt = buildResearchPrompt({ ...baseArgs, contextSummary });
    assert.ok(prompt.includes('CONTENT PERFORMANCE DATA'));
    assert.ok(prompt.includes('PRIORITIZE categories that perform well'));
    assert.ok(prompt.includes('AVOID:'));  // original section still present
  });
});

describe('buildKeywordStrategyPrompt', () => {
  const baseArgs = {
    topic: { title: 'Test Topic', summary: 'A test topic', category: 'Remote Work', searchIntent: 'informational' },
    existingPostMeta: [{ title: 'Old Post', slug: 'old-post', keywords: ['old keyword'] }],
    config: {
      product: { name: 'TestProduct', description: 'A test product' },
      seo: { maxDifficulty: 60, minSearchVolume: 100, location: 2840 },
    },
  };

  it('produces valid prompt without contextInsights (no regression)', () => {
    const prompt = buildKeywordStrategyPrompt({ ...baseArgs, contextInsights: undefined });
    assert.ok(prompt.includes('CONSTRAINTS:'));
    assert.ok(prompt.includes('EXISTING BLOG COVERAGE'));
    assert.ok(!prompt.includes('KEYWORD PERFORMANCE DATA'));
  });

  it('injects performance data when contextInsights has data', () => {
    const ctx = loadFixture('context-with-performance.json');
    const insights = computePostInsights(ctx);

    const prompt = buildKeywordStrategyPrompt({ ...baseArgs, contextInsights: insights });
    assert.ok(prompt.includes('KEYWORD PERFORMANCE DATA'));
    assert.ok(prompt.includes('cannibalize'));
    assert.ok(prompt.includes('CONSTRAINTS:'));  // original section still present
  });

  it('does NOT inject when hasPerformanceData is false', () => {
    const insights = { hasPerformanceData: false, decliningKeywords: [], topCategories: [] };
    const prompt = buildKeywordStrategyPrompt({ ...baseArgs, contextInsights: insights });
    assert.ok(!prompt.includes('KEYWORD PERFORMANCE DATA'));
  });
});
