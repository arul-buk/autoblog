/**
 * gsc.mjs
 * Google Search Console integration for data-driven topic research.
 * Mines GSC data for quick wins, orphan queries, and declining pages.
 *
 * Optional — skipped when GSC credentials are not available.
 * Zero npm dependencies — uses native fetch + crypto.
 */

import { readFileSync, existsSync } from 'fs';
import { createSign } from 'crypto';
import { withRetry } from './retry.mjs';

const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GSC_API = 'https://www.googleapis.com/webmasters/v3';

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
async function getAccessToken(serviceAccount) {
  const jwt = createJwt(serviceAccount, GSC_SCOPE);
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!response.ok) {
    throw new Error(`GSC auth failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()).access_token;
}

/**
 * Load service account from file path or inline JSON.
 */
function loadServiceAccount() {
  const value = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!value) return null;

  try {
    if (existsSync(value)) {
      return JSON.parse(readFileSync(value, 'utf-8'));
    }
  } catch { /* not a file path */ }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Query GSC search analytics.
 */
async function querySearchAnalytics(accessToken, propertyUrl, options = {}) {
  const {
    startDate,
    endDate,
    dimensions = ['query'],
    rowLimit = 500,
  } = options;

  const response = await fetch(
    `${GSC_API}/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions,
        rowLimit,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`GSC query failed (${response.status}): ${await response.text()}`);
  }

  return (await response.json()).rows || [];
}

/**
 * Format a date as YYYY-MM-DD.
 */
function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Mine GSC data for topic research opportunities.
 *
 * @param {object} config - Full autoblog config
 * @returns {Promise<{ quickWins: object[], orphanQueries: object[], decliningPages: object[] }>}
 */
export async function mineGscTopics(config) {
  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    throw new Error('GSC_SERVICE_ACCOUNT_JSON not set or invalid');
  }

  const propertyUrl = config.gsc?.propertyUrl;
  if (!propertyUrl) {
    throw new Error('gsc.propertyUrl is required');
  }

  const lookbackDays = config.gsc?.lookbackDays || 90;
  const [minPos, maxPos] = config.gsc?.quickWinPositionRange || [4, 15];
  const minImpressions = config.gsc?.minImpressions || 50;

  const accessToken = await withRetry(
    () => getAccessToken(serviceAccount),
    { maxAttempts: 2, baseDelayMs: 2000, label: 'gsc-auth' }
  );

  const now = new Date();
  const endDate = formatDate(new Date(now.getTime() - 2 * 86400000)); // GSC data lags ~2 days
  const startDate = formatDate(new Date(now.getTime() - lookbackDays * 86400000));

  // Query 1: Keyword-level data for quick wins + orphan queries
  const queryRows = await withRetry(
    () => querySearchAnalytics(accessToken, propertyUrl, {
      startDate,
      endDate,
      dimensions: ['query'],
      rowLimit: 500,
    }),
    { maxAttempts: 2, baseDelayMs: 3000, label: 'gsc-queries' }
  );

  // Quick wins: queries ranking at positions 4-15 with decent impressions
  const quickWins = queryRows
    .filter((row) =>
      row.position >= minPos &&
      row.position <= maxPos &&
      row.impressions >= minImpressions
    )
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20)
    .map((row) => ({
      query: row.keys[0],
      position: Math.round(row.position * 10) / 10,
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: Math.round(row.ctr * 1000) / 10,
    }));

  // Orphan queries: high impressions but very low CTR (no dedicated page)
  const orphanQueries = queryRows
    .filter((row) =>
      row.impressions >= minImpressions * 2 &&
      row.ctr < 0.02 &&
      row.position > 10
    )
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 15)
    .map((row) => ({
      query: row.keys[0],
      position: Math.round(row.position * 10) / 10,
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: Math.round(row.ctr * 1000) / 10,
    }));

  // Query 2: Page-level data for declining pages
  let decliningPages = [];
  try {
    const midpoint = new Date(now.getTime() - 30 * 86400000);
    const recentStart = formatDate(midpoint);
    const priorStart = formatDate(new Date(midpoint.getTime() - 30 * 86400000));
    const priorEnd = formatDate(new Date(midpoint.getTime() - 1 * 86400000));

    const [recentPages, priorPages] = await Promise.all([
      querySearchAnalytics(accessToken, propertyUrl, {
        startDate: recentStart,
        endDate,
        dimensions: ['page'],
        rowLimit: 200,
      }),
      querySearchAnalytics(accessToken, propertyUrl, {
        startDate: priorStart,
        endDate: priorEnd,
        dimensions: ['page'],
        rowLimit: 200,
      }),
    ]);

    // Build prior period lookup
    const priorMap = new Map();
    for (const row of priorPages) {
      priorMap.set(row.keys[0], row);
    }

    // Find pages that lost >30% clicks
    for (const row of recentPages) {
      const prior = priorMap.get(row.keys[0]);
      if (!prior || prior.clicks < 5) continue;

      const dropPct = (prior.clicks - row.clicks) / prior.clicks;
      if (dropPct > 0.3) {
        decliningPages.push({
          page: row.keys[0],
          recentClicks: row.clicks,
          priorClicks: prior.clicks,
          dropPercent: Math.round(dropPct * 100),
          recentPosition: Math.round(row.position * 10) / 10,
        });
      }
    }

    decliningPages.sort((a, b) => b.priorClicks - a.priorClicks);
    decliningPages = decliningPages.slice(0, 10);
  } catch (err) {
    console.log(`  Warning: Declining pages check failed (${err.message})`);
  }

  return { quickWins, orphanQueries, decliningPages };
}

/**
 * Get GSC performance data for specific post slugs.
 * Used by context persistence (Road #3) to track post performance.
 *
 * @param {object} config - Full autoblog config
 * @param {string[]} slugs - Post slugs to check
 * @returns {Promise<Map<string, { clicks: number, impressions: number, position: number }>>}
 */
export async function getGscPerformance(config, slugs) {
  const results = new Map();

  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) return results;

  const propertyUrl = config.gsc?.propertyUrl;
  if (!propertyUrl) return results;

  const accessToken = await withRetry(
    () => getAccessToken(serviceAccount),
    { maxAttempts: 2, baseDelayMs: 2000, label: 'gsc-perf-auth' }
  );

  const now = new Date();
  const endDate = formatDate(new Date(now.getTime() - 2 * 86400000));
  const startDate = formatDate(new Date(now.getTime() - 30 * 86400000));

  const pageRows = await withRetry(
    () => querySearchAnalytics(accessToken, propertyUrl, {
      startDate,
      endDate,
      dimensions: ['page'],
      rowLimit: 500,
    }),
    { maxAttempts: 2, baseDelayMs: 3000, label: 'gsc-perf-query' }
  );

  for (const slug of slugs) {
    const row = pageRows.find((r) => r.keys[0]?.includes(slug));
    if (row) {
      results.set(slug, {
        clicks: row.clicks,
        impressions: row.impressions,
        position: Math.round(row.position * 10) / 10,
      });
    }
  }

  return results;
}
