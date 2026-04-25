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
