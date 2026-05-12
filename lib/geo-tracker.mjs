/**
 * geo-tracker.mjs
 * Gap 7: AI Visibility Tracking (GEO — Generative Engine Optimization)
 * Tracks whether keywords trigger AI Overviews and whether the brand
 * is mentioned in those overviews.
 */

import { dataforseoRequest } from './dataforseo-client.mjs';
import { withRetry } from './retry.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/**
 * Track AI visibility across a set of keywords.
 * For each keyword, fetches the live SERP and checks for AI overview presence.
 *
 * @param {object} config - Autoblog config (needs seo.*, geoTracking.brandNames)
 * @param {string[]} keywords - Keywords to check
 * @returns {Promise<{ keywordResults: object[], summary: object }>}
 */
export async function trackAiVisibility(config, keywords) {
  const location = config.seo?.location || 2840;
  const language = config.seo?.language || 'en';
  const brandNames = config.geoTracking?.brandNames || config.product?.brandNames || [];

  const keywordResults = [];

  for (const keyword of keywords) {
    try {
      const data = await withRetry(
        () => dataforseoRequest('/serp/google/organic/live/advanced', [{
          keyword,
          location_code: location,
          language_code: language,
          device: 'desktop',
          os: 'windows',
          calculate_rectangles: true,
        }], config),
        { maxAttempts: 2, baseDelayMs: 3000, label: `geo-${keyword}` }
      );

      const items = data?.tasks?.[0]?.result?.[0]?.items || [];

      let hasAiOverview = false;
      let aiOverviewText = '';
      const coCitations = [];

      for (const item of items) {
        if (item.type === 'ai_overview') {
          hasAiOverview = true;
          aiOverviewText = item.description || item.text || '';
          // Collect co-cited domains from AI overview items
          if (item.items) {
            for (const sub of item.items) {
              if (sub.domain && !coCitations.includes(sub.domain)) {
                coCitations.push(sub.domain);
              }
            }
          }
        }
      }

      const brandCheck = checkBrandMentions(aiOverviewText, brandNames);

      keywordResults.push({
        keyword,
        hasAiOverview,
        brandMentioned: brandCheck.mentioned,
        mentionedBrands: brandCheck.brands,
        coCitations,
      });
    } catch (err) {
      log(`  Warning: GEO check failed for "${keyword}": ${err.message}`);
      keywordResults.push({
        keyword,
        hasAiOverview: false,
        brandMentioned: false,
        mentionedBrands: [],
        coCitations: [],
        error: err.message,
      });
    }
  }

  const summary = computeGeoMetrics(keywordResults);

  return { keywordResults, summary };
}

/**
 * Check if any brand name appears in the given text (case-insensitive).
 *
 * @param {string} text - Text to search (e.g. AI overview content)
 * @param {string[]} brandNames - Brand names to check for
 * @returns {{ mentioned: boolean, brands: string[] }}
 */
export function checkBrandMentions(text, brandNames) {
  if (!text || !brandNames || brandNames.length === 0) {
    return { mentioned: false, brands: [] };
  }

  const lower = text.toLowerCase();
  const found = brandNames.filter((name) => lower.includes(name.toLowerCase()));

  return { mentioned: found.length > 0, brands: found };
}

/**
 * Aggregate GEO tracking results into summary metrics.
 *
 * @param {object[]} results - Array of keyword result objects
 * @returns {{ totalKeywords: number, keywordsWithAiOverview: number, brandMentionRate: number, topCoCitations: string[] }}
 */
export function computeGeoMetrics(results) {
  const totalKeywords = results.length;
  const keywordsWithAiOverview = results.filter((r) => r.hasAiOverview).length;
  const keywordsWithBrandMention = results.filter((r) => r.brandMentioned).length;
  const brandMentionRate = keywordsWithAiOverview > 0
    ? keywordsWithBrandMention / keywordsWithAiOverview
    : 0;

  // Aggregate co-citations across all keywords, count frequency
  const citationCounts = new Map();
  for (const r of results) {
    for (const domain of r.coCitations || []) {
      citationCounts.set(domain, (citationCounts.get(domain) || 0) + 1);
    }
  }
  const topCoCitations = Array.from(citationCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, count]) => ({ domain, count }));

  return { totalKeywords, keywordsWithAiOverview, brandMentionRate, topCoCitations };
}
