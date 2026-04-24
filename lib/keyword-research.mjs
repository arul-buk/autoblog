/**
 * keyword-research.mjs
 * DataForSEO keyword enrichment for selected topics.
 * Provides real search volume, difficulty, related keywords, SERP competitors,
 * and PAA questions to inform the writer.
 *
 * Uses DataForSEO REST API directly (basic auth via fetch).
 * No SDK dependency required.
 */

import { withRetry } from './retry.mjs';

const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';

/**
 * Make an authenticated request to DataForSEO.
 */
async function dataforseoRequest(endpoint, body, config) {
  const login = config.seo.apiLogin || process.env.DATAFORSEO_LOGIN;
  const password = config.seo.apiPassword || process.env.DATAFORSEO_PASSWORD;
  const auth = Buffer.from(`${login}:${password}`).toString('base64');

  const response = await fetch(`${DATAFORSEO_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`DataForSEO ${endpoint} returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status_code !== 20000) {
    throw new Error(`DataForSEO error: ${data.status_message || 'Unknown error'}`);
  }

  return data;
}

/**
 * Extract seed keywords from topic title and summary.
 * Simple extraction — splits on common delimiters and takes meaningful phrases.
 */
function extractSeedKeywords(topic) {
  const text = `${topic.title} ${topic.summary}`;
  // Remove common stop words and extract 3-5 keyword phrases
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .filter((w) => !['this', 'that', 'with', 'from', 'have', 'been', 'will', 'your', 'their', 'about', 'these', 'those', 'more', 'what', 'when', 'where', 'which', 'while', 'also', 'into'].includes(w));

  // Build 2-3 word phrases from consecutive words
  const phrases = [];
  const titleWords = topic.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);

  // Use title as primary keyword phrase (truncated to 4 words)
  if (titleWords.length > 0) {
    phrases.push(titleWords.slice(0, 4).join(' '));
  }

  // Add unique individual significant words
  const seen = new Set(phrases.flatMap(p => p.split(' ')));
  for (const word of words) {
    if (!seen.has(word) && word.length > 4) {
      seen.add(word);
      if (phrases.length < 5) phrases.push(word);
    }
  }

  return phrases.slice(0, 5);
}

/**
 * Perform keyword research for a selected topic using DataForSEO.
 *
 * @param {object} config - Full autoblog config
 * @param {object} topic - Selected topic { title, summary, category }
 * @param {object} [options]
 * @param {string[]} [options.seedKeywords] - Pre-set keywords from calendar (skips extraction)
 * @returns {Promise<object>} - KeywordResearch result
 */
export async function researchKeywords(config, topic, options = {}) {
  const seeds = options.seedKeywords || extractSeedKeywords(topic);
  const location = config.seo.location || 2840;
  const language = config.seo.language || 'en';
  const maxDifficulty = config.seo.maxDifficulty || 60;
  const minVolume = config.seo.minSearchVolume || 100;
  const maxRelated = config.seo.maxRelatedKeywords || 10;

  console.log(`  Seed keywords: ${seeds.join(', ')}`);

  const result = {
    primaryKeyword: null,
    secondaryKeywords: [],
    competitorAngles: [],
    questions: [],
    skip: false,
  };

  // Step 1: Keyword overview — get volume + difficulty for seeds
  try {
    const overviewData = await withRetry(
      () => dataforseoRequest('/dataforseo_labs/google/keyword_overview/live', [{
        keywords: seeds,
        location_code: location,
        language_code: language,
      }], config),
      { maxAttempts: 2, baseDelayMs: 3000, label: 'keyword-overview' }
    );

    const items = overviewData?.tasks?.[0]?.result || [];
    const keywords = items
      .filter((item) => item.keyword_data?.keyword_info)
      .map((item) => ({
        keyword: item.keyword,
        volume: item.keyword_data.keyword_info.search_volume || 0,
        difficulty: item.keyword_data.keyword_info.keyword_difficulty || 0,
      }))
      .filter((k) => k.difficulty <= maxDifficulty)
      .sort((a, b) => b.volume - a.volume);

    if (keywords.length > 0) {
      result.primaryKeyword = keywords[0];
      console.log(`  Primary keyword: "${result.primaryKeyword.keyword}" (vol: ${result.primaryKeyword.volume}, diff: ${result.primaryKeyword.difficulty})`);
    }
  } catch (err) {
    console.log(`  Warning: Keyword overview failed: ${err.message}`);
  }

  // Step 2: Related keywords
  if (result.primaryKeyword) {
    try {
      const relatedData = await withRetry(
        () => dataforseoRequest('/dataforseo_labs/google/related_keywords/live', [{
          keyword: result.primaryKeyword.keyword,
          location_code: location,
          language_code: language,
          limit: maxRelated * 2,
        }], config),
        { maxAttempts: 2, baseDelayMs: 3000, label: 'related-keywords' }
      );

      const relatedItems = relatedData?.tasks?.[0]?.result?.[0]?.items || [];
      result.secondaryKeywords = relatedItems
        .filter((item) => {
          const info = item.keyword_data?.keyword_info;
          return info && (info.search_volume || 0) >= minVolume && (info.keyword_difficulty || 0) <= maxDifficulty;
        })
        .map((item) => ({
          keyword: item.keyword_data.keyword,
          volume: item.keyword_data.keyword_info.search_volume,
          difficulty: item.keyword_data.keyword_info.keyword_difficulty,
        }))
        .slice(0, maxRelated);

      console.log(`  Found ${result.secondaryKeywords.length} related keywords`);
    } catch (err) {
      console.log(`  Warning: Related keywords failed: ${err.message}`);
    }
  }

  // Step 3: SERP competitors
  if (result.primaryKeyword) {
    try {
      const serpData = await withRetry(
        () => dataforseoRequest('/dataforseo_labs/google/serp_competitors/live', [{
          keywords: [result.primaryKeyword.keyword],
          location_code: location,
          language_code: language,
        }], config),
        { maxAttempts: 2, baseDelayMs: 3000, label: 'serp-competitors' }
      );

      const serpItems = serpData?.tasks?.[0]?.result?.[0]?.items || [];
      result.competitorAngles = serpItems
        .slice(0, 5)
        .map((item) => ({
          url: item.domain,
          title: item.domain,
          headings: [],
        }));

      console.log(`  Found ${result.competitorAngles.length} SERP competitors`);
    } catch (err) {
      console.log(`  Warning: SERP competitors failed: ${err.message}`);
    }
  }

  // Step 4: Question keywords (for FAQ)
  if (result.primaryKeyword) {
    try {
      const suggestData = await withRetry(
        () => dataforseoRequest('/dataforseo_labs/google/keyword_suggestions/live', [{
          keyword: result.primaryKeyword.keyword,
          location_code: location,
          language_code: language,
          limit: 20,
          include_seed_keyword: false,
        }], config),
        { maxAttempts: 2, baseDelayMs: 3000, label: 'keyword-suggestions' }
      );

      const suggestItems = suggestData?.tasks?.[0]?.result?.[0]?.items || [];
      result.questions = suggestItems
        .map((item) => item.keyword_data?.keyword)
        .filter((kw) => kw && /^(how|what|why|when|where|can|do|does|is|are|should|will)\b/i.test(kw))
        .slice(0, 8);

      console.log(`  Found ${result.questions.length} question keywords`);
    } catch (err) {
      console.log(`  Warning: Question keywords failed: ${err.message}`);
    }
  }

  // If no primary keyword found after all attempts, don't skip — just proceed without data
  if (!result.primaryKeyword) {
    console.log('  No keyword data available — writer will use Gemini-only keyword selection');
    result.skip = true;
  }

  return result;
}
