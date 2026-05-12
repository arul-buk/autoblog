/**
 * competitor-analysis.mjs
 * Gap 6: Competitive Gap Analysis
 * Discovers keywords competitors rank for but own domain does not,
 * then prioritizes them as content opportunities.
 */

import { dataforseoRequest } from './dataforseo-client.mjs';
import { withRetry } from './retry.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/**
 * Extract the root domain from a URL string.
 * "https://www.example.com/path" → "example.com"
 */
function extractDomain(url) {
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
}

/**
 * Fetch ranked keywords for a single domain via DataForSEO.
 *
 * @param {string} domain - Target domain
 * @param {object} config - Autoblog config
 * @returns {Promise<object[]>} - Array of { keyword, volume, difficulty, position }
 */
async function fetchRankedKeywords(domain, config) {
  const location = config.seo?.location || 2840;
  const language = config.seo?.language || 'en';

  const data = await withRetry(
    () => dataforseoRequest('/dataforseo_labs/google/ranked_keywords/live', [{
      target: domain,
      location_code: location,
      language_code: language,
      limit: 100,
    }], config),
    { maxAttempts: 2, baseDelayMs: 3000, label: `ranked-keywords-${domain}` }
  );

  const items = data?.tasks?.[0]?.result?.[0]?.items || [];
  return items.map((item) => ({
    keyword: item.keyword_data?.keyword,
    volume: item.keyword_data?.keyword_info?.search_volume ?? 0,
    difficulty: item.keyword_data?.keyword_info?.keyword_difficulty ?? 0,
    position: item.ranked_serp_element?.serp_item?.rank_absolute ?? null,
  })).filter((k) => k.keyword);
}

/**
 * Analyze competitors to find keyword gaps.
 *
 * @param {object} config - Autoblog config (needs competitors.domains, product.url, seo.*)
 * @param {object} context - Pipeline context (may contain cached data)
 * @returns {Promise<{ ownKeywords: object[], competitorKeywords: Map<string, object[]>, gaps: object[] }>}
 */
export async function analyzeCompetitors(config, context) {
  const ownDomain = extractDomain(config.product?.url || '');
  const competitorDomains = config.competitors?.domains || [];

  if (!ownDomain) {
    throw new Error('product.url is required for competitor analysis');
  }
  if (competitorDomains.length === 0) {
    throw new Error('competitors.domains must contain at least one domain');
  }

  log(`Fetching ranked keywords for own domain: ${ownDomain}`);
  const ownKeywords = await fetchRankedKeywords(ownDomain, config);
  log(`  Own domain has ${ownKeywords.length} ranked keywords`);

  const competitorKeywords = new Map();
  for (const domain of competitorDomains) {
    const cleanDomain = extractDomain(domain);
    log(`Fetching ranked keywords for competitor: ${cleanDomain}`);
    const keywords = await fetchRankedKeywords(cleanDomain, config);
    competitorKeywords.set(cleanDomain, keywords);
    log(`  ${cleanDomain} has ${keywords.length} ranked keywords`);
  }

  const gaps = identifyContentGaps(competitorKeywords, ownKeywords);
  const prioritized = prioritizeGaps(gaps, config);

  log(`Found ${gaps.length} keyword gaps, top ${prioritized.length} after prioritization`);

  return { ownKeywords, competitorKeywords, gaps: prioritized };
}

/**
 * Find keywords where competitors rank (position <= 20) but own domain does not.
 *
 * @param {object[]|Map<string, object[]>} competitorKeywords - Array of keyword objects (with optional domain) or Map of domain → keyword array
 * @param {object[]} ownKeywords - Own domain keyword array
 * @returns {object[]} - Array of { keyword, volume, difficulty, competitorCount, competitorDomains }
 */
export function identifyContentGaps(competitorKeywords, ownKeywords) {
  const ownSet = new Set(ownKeywords.map((k) => k.keyword.toLowerCase()));

  // Aggregate competitor keyword data
  const gapMap = new Map();

  // Support both Map<domain, keywords[]> and flat array inputs
  const entries = competitorKeywords instanceof Map
    ? competitorKeywords
    : new Map([['unknown', competitorKeywords]]);

  for (const [domain, keywords] of entries) {
    for (const kw of keywords) {
      if (!kw.keyword) continue;
      const lower = kw.keyword.toLowerCase();

      // Skip keywords own domain already ranks for
      if (ownSet.has(lower)) continue;

      // Only consider keywords where competitor ranks in top 20
      if (kw.position && kw.position > 20) continue;

      if (!gapMap.has(lower)) {
        gapMap.set(lower, {
          keyword: kw.keyword,
          volume: kw.volume || 0,
          difficulty: kw.difficulty || 0,
          competitorCount: 0,
          competitorDomains: [],
        });
      }

      const entry = gapMap.get(lower);
      entry.competitorCount += 1;
      const kwDomain = kw.domain || domain;
      if (!entry.competitorDomains.includes(kwDomain)) {
        entry.competitorDomains.push(kwDomain);
      }
      // Keep the highest volume figure
      if ((kw.volume || 0) > entry.volume) entry.volume = kw.volume;
    }
  }

  return Array.from(gapMap.values());
}

/**
 * Sort gaps by opportunity score and cap at maxGaps.
 *
 * @param {object[]} gaps - Raw gap array
 * @param {object} config - Autoblog config
 * @returns {object[]} - Sorted and capped array
 */
export function prioritizeGaps(gaps, config) {
  const maxGaps = config.competitors?.maxGaps || 20;
  const minVolume = config.competitors?.minVolume || 0;

  const filtered = gaps.filter((g) => (g.volume || 0) >= minVolume);

  const scored = filtered.map((g) => ({
    ...g,
    score: (g.volume || 0) * (1 / Math.max(g.difficulty || 0, 1)),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxGaps);
}
