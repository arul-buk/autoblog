/**
 * Step: AI Visibility Tracking (GEO)
 * Checks tracked keywords for AI Overview presence and brand mentions.
 */

import { trackAiVisibility } from '../geo-tracker.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export async function geoTrackingStep(state, config, options) {
  if (!config.geoTracking?.enabled) {
    return state;
  }

  try {
    // Gather keywords from context — all primary keywords from tracked posts
    const keywords = [];

    if (state.context?.posts) {
      for (const post of Object.values(state.context.posts)) {
        if (post.primaryKeyword) {
          keywords.push(post.primaryKeyword);
        }
      }
    }

    // Also include current primary keyword if available
    if (state.keywordData?.primaryKeyword?.keyword) {
      const current = state.keywordData.primaryKeyword.keyword;
      if (!keywords.includes(current)) {
        keywords.push(current);
      }
    }

    if (keywords.length === 0) {
      log('GEO tracking: skipped (no keywords to track)');
      return state;
    }

    // Cap to avoid excessive API calls
    const maxKeywords = config.geoTracking?.maxKeywords || 20;
    const trackedKeywords = keywords.slice(0, maxKeywords);

    log(`Tracking AI visibility for ${trackedKeywords.length} keyword(s)...`);
    const { keywordResults, summary } = await trackAiVisibility(config, trackedKeywords);

    log(`GEO summary: ${summary.keywordsWithAiOverview}/${summary.totalKeywords} keywords have AI Overview`);
    if (summary.brandMentionRate > 0) {
      log(`  Brand mention rate in AI Overviews: ${(summary.brandMentionRate * 100).toFixed(1)}%`);
    }
    if (summary.topCoCitations.length > 0) {
      log(`  Top co-citations: ${summary.topCoCitations.slice(0, 5).join(', ')}`);
    }

    return {
      ...state,
      geoMetrics: { keywordResults, summary, trackedAt: new Date().toISOString() },
    };
  } catch (err) {
    log(`Warning: GEO tracking failed: ${err.message}`);
    return state;
  }
}
