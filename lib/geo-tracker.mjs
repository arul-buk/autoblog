/**
 * geo-tracker.mjs
 * AI Visibility Tracking (GEO — Generative Engine Optimization)
 *
 * Tracks:
 * - Whether keywords trigger AI Overviews
 * - Whether YOUR brand is mentioned in those overviews
 * - Whether COMPETITOR brands are mentioned (co-citation monitoring)
 * - Per-query citation presence for specific monitored queries
 * - Co-cited domains across all AI answers
 */

import { dataforseoRequest } from './dataforseo-client.mjs';
import { withRetry } from './retry.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/**
 * Track AI visibility across a set of keywords.
 * For each keyword, fetches the live SERP and checks for AI overview presence,
 * own brand mentions, competitor brand mentions, and co-cited domains.
 *
 * @param {object} config - Autoblog config
 * @param {string[]} keywords - Keywords to check
 * @returns {Promise<{ keywordResults: object[], summary: object }>}
 */
export async function trackAiVisibility(config, keywords) {
  const location = config.seo?.location || 2840;
  const language = config.seo?.language || 'en';
  const ownBrands = config.geoTracking?.brandNames || config.product?.brandNames || [];
  const competitorBrands = config.geoTracking?.competitorBrands || [];
  const allBrands = [...ownBrands, ...competitorBrands];

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
          // Collect text from AI overview for brand mention checks
          aiOverviewText += (item.description || item.text || '') + ' ';
          if (item.items) {
            for (const sub of item.items) {
              // Collect text from sub-items too
              if (sub.description || sub.text) {
                aiOverviewText += (sub.description || sub.text) + ' ';
              }
              if (sub.domain && !coCitations.includes(sub.domain)) {
                coCitations.push(sub.domain);
              }
            }
          }
        }
      }

      aiOverviewText = aiOverviewText.trim();

      // Check own brand mentions
      const ownBrandCheck = checkBrandMentions(aiOverviewText, ownBrands);

      // Check competitor brand mentions
      const competitorCheck = checkBrandMentions(aiOverviewText, competitorBrands);

      keywordResults.push({
        keyword,
        hasAiOverview,
        // Own brand
        brandMentioned: ownBrandCheck.mentioned,
        mentionedBrands: ownBrandCheck.brands,
        // Competitors in AI answers
        competitorsMentioned: competitorCheck.mentioned,
        mentionedCompetitors: competitorCheck.brands,
        // Co-cited domains
        coCitations,
        // Source text length (for debugging)
        aiOverviewLength: aiOverviewText.length,
      });
    } catch (err) {
      log(`  Warning: GEO check failed for "${keyword}": ${err.message}`);
      keywordResults.push({
        keyword,
        hasAiOverview: false,
        brandMentioned: false,
        mentionedBrands: [],
        competitorsMentioned: false,
        mentionedCompetitors: [],
        coCitations: [],
        aiOverviewLength: 0,
        error: err.message,
      });
    }
  }

  const summary = computeGeoMetrics(keywordResults, competitorBrands);

  return { keywordResults, summary };
}

/**
 * Check if any brand name appears in the given text (case-insensitive).
 *
 * @param {string} text - Text to search
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
 * @param {string[]} [competitorBrands=[]] - Competitor brand names for breakdown
 * @returns {object} Summary with own brand, competitor, and co-citation metrics
 */
export function computeGeoMetrics(results, competitorBrands = []) {
  const totalKeywords = results.length;
  const keywordsWithAiOverview = results.filter((r) => r.hasAiOverview).length;
  const keywordsWithBrandMention = results.filter((r) => r.brandMentioned).length;
  const brandMentionRate = keywordsWithAiOverview > 0
    ? keywordsWithBrandMention / keywordsWithAiOverview
    : 0;

  // Competitor presence breakdown
  const competitorPresence = {};
  for (const brand of competitorBrands) {
    const count = results.filter((r) =>
      r.mentionedCompetitors?.some((c) => c.toLowerCase() === brand.toLowerCase())
    ).length;
    if (count > 0) {
      competitorPresence[brand] = {
        mentionCount: count,
        mentionRate: keywordsWithAiOverview > 0 ? count / keywordsWithAiOverview : 0,
      };
    }
  }

  // Keywords where competitors appear but we don't
  const competitorOnlyKeywords = results.filter((r) =>
    r.hasAiOverview && !r.brandMentioned && r.competitorsMentioned
  ).map((r) => ({
    keyword: r.keyword,
    competitors: r.mentionedCompetitors,
  }));

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

  return {
    totalKeywords,
    keywordsWithAiOverview,
    brandMentionRate,
    topCoCitations,
    // Competitor intelligence
    competitorPresence,
    competitorOnlyKeywords,
    // Per-query detail available in keywordResults
  };
}
