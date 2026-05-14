/**
 * Step: SERP Feature Targeting
 * Detects SERP features for the primary keyword and generates
 * writing guidance to optimize for snippets, PAA, AI overviews, etc.
 */

import { detectSerpFeatures, buildSerpFeatureGuidance } from '../serp-features.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export async function serpFeaturesStep(state, config, options) {
  if (!config.serpFeatures?.enabled) {
    return state;
  }

  const primaryKeyword = state.keywordData?.primaryKeyword?.keyword;
  if (!primaryKeyword) {
    log('SERP features: skipped (no primary keyword)');
    return state;
  }

  try {
    log(`Detecting SERP features for "${primaryKeyword}"...`);
    const { features, snippetContent } = await detectSerpFeatures(primaryKeyword, config);

    // Track DataForSEO cost estimate (SERP API call)
    if (options.costTracker) {
      options.costTracker.addDataforseo('serpFeatures', 0.02);
    }

    if (features.length === 0) {
      log('SERP features: none detected');
      return { ...state, serpFeatures: { features: [], guidance: '' } };
    }

    const guidance = buildSerpFeatureGuidance(features);
    log(`SERP features detected: ${features.join(', ')}`);

    return {
      ...state,
      serpFeatures: { features, snippetContent, guidance },
    };
  } catch (err) {
    log(`Warning: SERP feature detection failed: ${err.message}`);
    return state;
  }
}
