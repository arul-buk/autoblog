/**
 * Step: AI Visibility Tracking (GEO)
 * Checks tracked keywords for AI Overview presence, own brand mentions,
 * competitor brand mentions, and per-query citation monitoring.
 *
 * Keywords come from three sources (merged, deduped):
 * 1. config.geoTracking.monitorQueries — manually specified queries
 * 2. Context posts — primaryKeyword from each tracked post
 * 3. GSC top queries — highest-impression queries (if GSC data available)
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
    const keywordSet = new Set();

    // Source 1: Manually specified monitor queries (highest priority)
    const monitorQueries = config.geoTracking?.monitorQueries || [];
    for (const q of monitorQueries) {
      keywordSet.add(q);
    }

    // Source 2: Primary keywords from context posts
    if (state.context?.posts) {
      for (const post of state.context.posts) {
        if (post.primaryKeyword) {
          keywordSet.add(post.primaryKeyword);
        }
      }
    }

    // Source 3: GSC top queries (if available from gscInsights)
    if (state.gscInsights?.quickWins) {
      for (const qw of state.gscInsights.quickWins.slice(0, 10)) {
        keywordSet.add(qw.query);
      }
    }

    // Also include current primary keyword if available
    if (state.keywordData?.primaryKeyword?.keyword) {
      keywordSet.add(state.keywordData.primaryKeyword.keyword);
    }

    const keywords = [...keywordSet];

    if (keywords.length === 0) {
      log('GEO tracking: skipped (no keywords to track)');
      return state;
    }

    // Cap to avoid excessive API calls
    const maxKeywords = config.geoTracking?.maxKeywords || 20;
    const trackedKeywords = keywords.slice(0, maxKeywords);

    log(`Tracking AI visibility for ${trackedKeywords.length} keyword(s)...`);
    if (monitorQueries.length > 0) {
      log(`  Monitor queries: ${monitorQueries.length} from config`);
    }

    const { keywordResults, summary } = await trackAiVisibility(config, trackedKeywords);

    // Log summary
    log(`GEO summary: ${summary.keywordsWithAiOverview}/${summary.totalKeywords} keywords have AI Overview`);
    if (summary.brandMentionRate > 0) {
      log(`  Brand mention rate: ${(summary.brandMentionRate * 100).toFixed(1)}%`);
    }

    // Log competitor presence
    const competitorBrands = Object.keys(summary.competitorPresence || {});
    if (competitorBrands.length > 0) {
      log('  Competitor presence in AI answers:');
      for (const brand of competitorBrands) {
        const cp = summary.competitorPresence[brand];
        log(`    ${brand}: ${cp.mentionCount} queries (${(cp.mentionRate * 100).toFixed(0)}%)`);
      }
    }

    // Log keywords where competitors appear but we don't
    if (summary.competitorOnlyKeywords?.length > 0) {
      log(`  Competitor-only keywords (they appear, we don't):`);
      for (const ck of summary.competitorOnlyKeywords.slice(0, 5)) {
        log(`    "${ck.keyword}" → ${ck.competitors.join(', ')}`);
      }
    }

    // Log co-citations
    if (summary.topCoCitations.length > 0) {
      log(`  Top co-cited domains: ${summary.topCoCitations.slice(0, 5).map((c) => `${c.domain} (${c.count})`).join(', ')}`);
    }

    // Track cost
    if (options.costTracker) {
      options.costTracker.addDataforseo('geoTracking', trackedKeywords.length * 0.02);
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
