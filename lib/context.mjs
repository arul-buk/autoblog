/**
 * context.mjs
 * Persistent context across pipeline runs.
 * Tracks generated posts, keywords targeted, and optionally
 * performance data from GSC and GA4.
 *
 * Optional — skipped when context.enabled is false.
 * Zero npm dependencies.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createSign } from 'crypto';
import { withRetry } from './retry.mjs';

const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * Base64url encode.
 */
function base64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Create signed JWT for Google API auth.
 */
function createJwt(serviceAccount, scope) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const segments = [base64url(JSON.stringify(header)), base64url(JSON.stringify(payload))];
  const signInput = segments.join('.');
  const sign = createSign('RSA-SHA256');
  sign.update(signInput);
  const signature = sign.sign(serviceAccount.private_key);

  return `${signInput}.${base64url(signature)}`;
}

/**
 * Get access token from service account.
 */
async function getAccessToken(serviceAccount, scope) {
  const jwt = createJwt(serviceAccount, scope);
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!response.ok) {
    throw new Error(`GA4 auth failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()).access_token;
}

/**
 * Load service account from file path or inline JSON.
 */
function loadServiceAccount(envVar) {
  const value = process.env[envVar];
  if (!value) return null;

  try {
    const content = readFileSync(value, 'utf-8');
    return JSON.parse(content);
  } catch {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
}

/**
 * Load context from disk.
 *
 * @param {object} config - Full autoblog config
 * @returns {object|null} - Context object or null if not found
 */
export function loadContext(config) {
  const filePath = resolve(process.cwd(), config.context?.filePath || '.autoblog-context.json');

  if (!existsSync(filePath)) {
    return { version: 1, posts: [], topicHistory: [], lastRun: null };
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return { version: 1, posts: [], topicHistory: [], lastRun: null };
  }
}

/**
 * Update context with a new pipeline result.
 *
 * @param {object} config - Full autoblog config
 * @param {object} result - Pipeline result
 * @param {object} [performanceData] - Optional GSC/GA4 performance data
 */
export function updateContext(config, result, performanceData = {}) {
  const filePath = resolve(process.cwd(), config.context?.filePath || '.autoblog-context.json');
  const ctx = loadContext(config);

  if (result.status === 'success') {
    // Add new post entry
    const entry = {
      slug: result.slug,
      title: result.metadata?.title || result.slug,
      date: new Date().toISOString().slice(0, 10),
      category: result.metadata?.category || '',
      primaryKeyword: result.keywordData?.primaryKeyword?.keyword || null,
      secondaryKeywords: (result.keywordData?.secondaryKeywords || [])
        .slice(0, 5)
        .map((k) => k.keyword),
      searchIntent: result.keywordData?.searchIntent || 'informational',
      contentFormat: result.keywordData?.contentFormat || null,
      performance: null,
    };

    // Don't duplicate
    const existing = ctx.posts.findIndex((p) => p.slug === entry.slug);
    if (existing >= 0) {
      ctx.posts[existing] = { ...ctx.posts[existing], ...entry };
    } else {
      ctx.posts.push(entry);
    }

    // Update topic history
    if (result.metadata?.category && !ctx.topicHistory.includes(result.metadata.category)) {
      ctx.topicHistory.push(result.metadata.category);
    }
  }

  // Update performance data for existing posts
  if (performanceData) {
    for (const [slug, perf] of Object.entries(performanceData)) {
      const post = ctx.posts.find((p) => p.slug === slug);
      if (post) {
        post.performance = {
          lastChecked: new Date().toISOString().slice(0, 10),
          ...perf,
        };
        post.performance.trend = computeTrend(post);
      }
    }
  }

  ctx.lastRun = new Date().toISOString();

  // Keep only last 200 posts
  if (ctx.posts.length > 200) {
    ctx.posts = ctx.posts.slice(-200);
  }

  writeFileSync(filePath, JSON.stringify(ctx, null, 2), 'utf-8');
}

// ═══════════════════════════════════════════════════════════════════════════
// Context Insight Helpers — pure functions, no API calls
// ═══════════════════════════════════════════════════════════════════════════

const STALE_THRESHOLD_DAYS = 60;

/**
 * Determine trend label from performance data.
 */
function computeTrend(post) {
  const perf = post.performance;
  if (!perf) return 'unknown';

  const daysSincePublish = (Date.now() - new Date(post.date).getTime()) / 86400000;
  if (daysSincePublish < 14) return 'new';

  const pos = perf.position;
  if (pos == null) return 'unknown';
  if (pos < 10) return 'strong';
  if (pos <= 20) return 'moderate';
  return 'weak';
}

/**
 * Check if performance data is too old to be useful.
 */
function isStale(perf) {
  if (!perf?.lastChecked) return true;
  const daysSince = (Date.now() - new Date(perf.lastChecked).getTime()) / 86400000;
  return daysSince > STALE_THRESHOLD_DAYS;
}

/**
 * Compute actionable insights from context data.
 * Pure function — no API calls, no side effects.
 *
 * @param {object} context - Context object from loadContext()
 * @returns {object} Insights with topCategories, decliningKeywords, etc.
 */
export function computePostInsights(context) {
  const result = {
    posts: [],
    topCategories: [],
    decliningKeywords: [],
    underperformingCategories: [],
    hasPerformanceData: false,
  };

  if (!context?.posts?.length) return result;

  // Enrich posts with trend
  result.posts = context.posts.map((post) => ({
    ...post,
    trend: computeTrend(post),
  }));

  // Filter to posts with non-stale performance data
  const withPerf = result.posts.filter(
    (p) => p.performance && !isStale(p.performance)
  );

  if (withPerf.length === 0) return result;
  result.hasPerformanceData = true;

  // Group by category
  const categoryMap = new Map();
  for (const post of withPerf) {
    if (!post.category) continue;
    if (!categoryMap.has(post.category)) {
      categoryMap.set(post.category, { category: post.category, totalClicks: 0, totalPosition: 0, postCount: 0 });
    }
    const entry = categoryMap.get(post.category);
    entry.totalClicks += post.performance.clicks || 0;
    entry.totalPosition += post.performance.position || 0;
    entry.postCount++;
  }

  const categories = [...categoryMap.values()].map((c) => ({
    category: c.category,
    avgClicks: Math.round(c.totalClicks / c.postCount),
    avgPosition: Math.round((c.totalPosition / c.postCount) * 10) / 10,
    postCount: c.postCount,
  }));

  const sorted = [...categories].sort((a, b) => b.avgClicks - a.avgClicks);
  result.topCategories = sorted.slice(0, 3);
  result.underperformingCategories = [...categories]
    .sort((a, b) => a.avgClicks - b.avgClicks)
    .slice(0, 3)
    .filter((c) => c.avgClicks < (sorted[0]?.avgClicks || 1) * 0.3);

  // Declining keywords: position > 15 with decent impressions
  for (const post of withPerf) {
    if (
      post.primaryKeyword &&
      post.performance.position > 15 &&
      (post.performance.impressions || 0) > 50
    ) {
      result.decliningKeywords.push({
        keyword: post.primaryKeyword,
        slug: post.slug,
        position: post.performance.position,
        impressions: post.performance.impressions,
      });
    }
  }

  result.decliningKeywords.sort((a, b) => b.impressions - a.impressions);

  return result;
}

/**
 * Format insights into a concise text block for prompt injection.
 * Returns empty string when no performance data is available.
 *
 * @param {object} insights - Output from computePostInsights()
 * @param {object} [options]
 * @param {number} [options.maxLines=10] - Max declining keyword lines
 * @returns {string}
 */
export function buildContextSummary(insights, { maxLines = 10 } = {}) {
  if (!insights?.hasPerformanceData) return '';

  const lines = [];
  const totalPosts = insights.posts.filter((p) => p.performance).length;
  lines.push(`CONTENT PERFORMANCE DATA (from ${totalPosts} tracked posts):`);

  if (insights.topCategories.length > 0) {
    const topList = insights.topCategories
      .map((c) => `${c.category} (avg ${c.avgClicks} clicks, ${c.postCount} posts)`)
      .join(', ');
    lines.push(`Top-performing categories: ${topList}`);
  }

  if (insights.underperformingCategories.length > 0) {
    const bottomList = insights.underperformingCategories
      .map((c) => `${c.category} (avg ${c.avgClicks} clicks across ${c.postCount} posts)`)
      .join(', ');
    lines.push(`Underperforming categories: ${bottomList}`);
  }

  if (insights.decliningKeywords.length > 0) {
    lines.push('Declining keywords to AVOID cannibalizing:');
    for (const dk of insights.decliningKeywords.slice(0, maxLines)) {
      lines.push(`- "${dk.keyword}" (position ${dk.position}, ${dk.impressions} impressions, slug: ${dk.slug})`);
    }
  }

  return lines.join('\n');
}

/**
 * Extract keyword avoidance list from insights.
 *
 * @param {object} insights - Output from computePostInsights()
 * @returns {Array<{ keyword: string, slug: string, reason: string }>}
 */
export function buildKeywordAvoidList(insights) {
  if (!insights?.hasPerformanceData) return [];

  const seen = new Set();
  const result = [];

  for (const dk of insights.decliningKeywords) {
    if (seen.has(dk.keyword)) continue;
    seen.add(dk.keyword);
    result.push({
      keyword: dk.keyword,
      slug: dk.slug,
      reason: `position ${dk.position} with ${dk.impressions} impressions — declining`,
    });
  }

  return result;
}

/**
 * Compute the actual distribution of published content by intent, format, and category.
 * Used by the strategy balancer to compare against targets.
 *
 * @param {object} context - Context object from loadContext()
 * @returns {{ intentDistribution: object, formatDistribution: object, categoryDistribution: object, totalTrackedPosts: number }}
 */
export function computeStrategyDistribution(context) {
  const result = {
    intentDistribution: {},
    formatDistribution: {},
    categoryDistribution: {},
    totalTrackedPosts: 0,
  };

  if (!context?.posts?.length) return result;

  // Only count posts that have searchIntent (newer posts)
  const tracked = context.posts.filter((p) => p.searchIntent);
  result.totalTrackedPosts = tracked.length;
  if (tracked.length === 0) return result;

  // Count by intent
  const intentCounts = {};
  const formatCounts = {};
  const categoryCounts = {};

  for (const post of tracked) {
    const intent = post.searchIntent || 'informational';
    intentCounts[intent] = (intentCounts[intent] || 0) + 1;

    if (post.contentFormat) {
      formatCounts[post.contentFormat] = (formatCounts[post.contentFormat] || 0) + 1;
    }

    if (post.category) {
      categoryCounts[post.category] = (categoryCounts[post.category] || 0) + 1;
    }
  }

  // Normalize to percentages
  const total = tracked.length;
  for (const [key, count] of Object.entries(intentCounts)) {
    result.intentDistribution[key] = Math.round((count / total) * 100);
  }
  for (const [key, count] of Object.entries(formatCounts)) {
    result.formatDistribution[key] = Math.round((count / total) * 100);
  }
  for (const [key, count] of Object.entries(categoryCounts)) {
    result.categoryDistribution[key] = Math.round((count / total) * 100);
  }

  return result;
}

/**
 * Fetch GA4 analytics performance for blog post slugs.
 *
 * @param {object} config - Full autoblog config
 * @param {string[]} slugs - Post slugs to check
 * @returns {Promise<Map<string, { pageviews: number, engagement: number }>>}
 */
export async function fetchAnalyticsPerformance(config, slugs) {
  const results = new Map();

  const serviceAccount = loadServiceAccount('GA4_SERVICE_ACCOUNT_JSON');
  if (!serviceAccount) return results;

  const propertyId = config.analytics?.propertyId;
  if (!propertyId) return results;

  const accessToken = await withRetry(
    () => getAccessToken(serviceAccount, GA4_SCOPE),
    { maxAttempts: 2, baseDelayMs: 2000, label: 'ga4-auth' }
  );

  // Query GA4 for blog page metrics (last 30 days)
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'engagementRate' },
        ],
        dimensionFilter: {
          filter: {
            fieldName: 'pagePath',
            stringFilter: {
              matchType: 'CONTAINS',
              value: '/blog/',
            },
          },
        },
        limit: 500,
      }),
    }
  );

  if (!response.ok) {
    console.log(`  Warning: GA4 query failed (${response.status})`);
    return results;
  }

  const data = await response.json();
  const rows = data.rows || [];

  for (const slug of slugs) {
    const row = rows.find((r) =>
      r.dimensionValues?.[0]?.value?.includes(slug)
    );
    if (row) {
      results.set(slug, {
        pageviews: parseInt(row.metricValues?.[0]?.value || '0', 10),
        engagement: parseFloat(row.metricValues?.[1]?.value || '0'),
      });
    }
  }

  return results;
}
