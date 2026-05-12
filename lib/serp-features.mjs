/**
 * serp-features.mjs
 * Gap 5: SERP Feature Targeting
 * Detects SERP features for a keyword and generates writing guidance
 * to optimize content for featured snippets, PAA, AI overviews, etc.
 */

import { dataforseoRequest } from './dataforseo-client.mjs';
import { withRetry } from './retry.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/**
 * Map DataForSEO SERP item types to our canonical feature names.
 */
const FEATURE_TYPE_MAP = {
  'featured_snippet': 'featured_snippet',
  'people_also_ask': 'people_also_ask',
  'knowledge_graph': 'knowledge_panel',
  'local_pack': 'local_pack',
  'video': 'video',
  'top_stories': 'news',
  'ai_overview': 'ai_overview',
  'shopping': 'shopping',
};

/**
 * Detect which SERP features are present for a given keyword.
 *
 * @param {string} keyword - Target keyword to check
 * @param {object} config - Autoblog config (needs DataForSEO credentials + seo.location/language)
 * @returns {Promise<{ features: string[], snippetContent: string|null }>}
 */
export async function detectSerpFeatures(keyword, config) {
  const location = config.seo?.location || 2840;
  const language = config.seo?.language || 'en';

  const data = await withRetry(
    () => dataforseoRequest('/serp/google/organic/live/advanced', [{
      keyword,
      location_code: location,
      language_code: language,
      device: 'desktop',
      os: 'windows',
    }], config),
    { maxAttempts: 2, baseDelayMs: 3000, label: 'serp-features' }
  );

  const items = data?.tasks?.[0]?.result?.[0]?.items || [];
  const features = [];
  let snippetContent = null;

  for (const item of items) {
    const type = item.type;
    if (type === 'organic') continue;

    const mapped = FEATURE_TYPE_MAP[type];
    if (mapped && !features.includes(mapped)) {
      features.push(mapped);
    }

    // Capture featured snippet content if available
    if (type === 'featured_snippet' && item.description) {
      snippetContent = item.description;
    }
  }

  return { features, snippetContent };
}

/**
 * Writing guidance keyed by SERP feature type.
 */
const FEATURE_GUIDANCE = {
  featured_snippet:
    'Include a 40-60 word paragraph or 4-6 item bulleted list that directly answers the primary question. Place it immediately after the first relevant H2.',
  people_also_ask:
    'Include 3-5 question-based H3 headings with concise 2-sentence direct answers immediately below each.',
  ai_overview:
    'Structure each section with a self-contained, citable paragraph (2-3 sentences with evidence). AI search engines extract these as standalone answers.',
  knowledge_panel:
    'Include clear entity definitions near the top of the article. Specify factual attributes (dates, numbers, names) in structured format.',
  video:
    'Reference video content where relevant. Consider embedding video suggestions.',
  local_pack:
    'Include specific location names, addresses, and local business references where applicable.',
  news:
    'Include timely references and recent dates. Structure content for recency signals.',
  shopping:
    'Include product names, pricing context, and comparison elements where relevant.',
};

/**
 * Build a combined writing-guidance string from detected SERP features.
 *
 * @param {string[]} features - Array of canonical feature names
 * @returns {string} - Combined guidance (empty string if no features)
 */
export function buildSerpFeatureGuidance(features) {
  if (!features || features.length === 0) return '';

  const lines = features
    .map((f) => FEATURE_GUIDANCE[f])
    .filter(Boolean);

  return lines.join('\n\n');
}
