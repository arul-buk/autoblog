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
import { buildKeywordStrategyPrompt } from './prompts.mjs';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
 * Use Gemini to intelligently determine seed keywords based on topic,
 * existing blog content, and SEO constraints. Falls back to simple
 * title-word extraction if Gemini call fails.
 *
 * @param {string} apiKey - Gemini API key
 * @param {object} config - Full autoblog config
 * @param {object} topic - Selected topic { title, summary, category, sources, searchIntent }
 * @param {object[]} existingPostMeta - Array of { slug, title, keywords[] }
 * @returns {Promise<object>} - { seeds, questions, gapAnalysis, avoidKeywords, skip }
 */
export async function getIntelligentSeeds(apiKey, config, topic, existingPostMeta = []) {
  console.log('  Running intelligent keyword strategy (Gemini)...');

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: config.models.text,
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
    });

    const prompt = buildKeywordStrategyPrompt({ topic, existingPostMeta, config });

    const result = await withRetry(
      () => model.generateContent(prompt),
      { maxAttempts: 2, baseDelayMs: 2000, label: 'keyword-strategy' }
    );

    const text = result.response.text().trim();
    // Strip markdown fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned);

    const seeds = parsed.primarySeedKeywords || [];
    const questions = parsed.questionKeywords || [];
    const gapAnalysis = parsed.gapAnalysis || '';
    const avoidKeywords = parsed.avoidKeywords || [];

    if (seeds.length === 0) {
      console.log('  Gemini returned no seeds — falling back to title extraction');
      return { seeds: fallbackSeeds(topic), questions: [], gapAnalysis: '', avoidKeywords: [], skip: false };
    }

    console.log(`  Intelligent seeds: ${seeds.join(', ')}`);
    if (gapAnalysis) console.log(`  Gap analysis: ${gapAnalysis}`);
    if (avoidKeywords.length > 0) console.log(`  Avoiding: ${avoidKeywords.join(', ')}`);

    return { seeds, questions, gapAnalysis, avoidKeywords, skip: false };
  } catch (err) {
    console.log(`  Warning: Intelligent keyword strategy failed: ${err.message}`);
    console.log('  Falling back to simple title extraction');
    return { seeds: fallbackSeeds(topic), questions: [], gapAnalysis: '', avoidKeywords: [], skip: false };
  }
}

/**
 * Simple fallback: extract keywords from topic title.
 */
function fallbackSeeds(topic) {
  const titleWords = topic.title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const phrase = titleWords.slice(0, 4).join(' ');
  return phrase ? [phrase] : [topic.title.toLowerCase()];
}

/**
 * Perform keyword research for a selected topic using DataForSEO.
 *
 * @param {object} config - Full autoblog config
 * @param {object} topic - Selected topic { title, summary, category }
 * @param {object} [options]
 * @param {string[]} [options.seedKeywords] - Pre-set keywords from calendar (skips extraction)
 * @param {string} [options.apiKey] - Gemini API key for intelligent seed generation
 * @param {object[]} [options.existingPostMeta] - Existing post metadata for gap analysis
 * @returns {Promise<object>} - KeywordResearch result
 */
export async function researchKeywords(config, topic, options = {}) {
  let seeds;
  if (options.seedKeywords) {
    seeds = options.seedKeywords;
  } else if (options.apiKey) {
    const seedResult = await getIntelligentSeeds(options.apiKey, config, topic, options.existingPostMeta || []);
    seeds = seedResult.seeds;
  } else {
    seeds = fallbackSeeds(topic);
  }
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
