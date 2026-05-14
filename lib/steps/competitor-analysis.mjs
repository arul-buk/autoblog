/**
 * Step: Competitive Gap Analysis
 * Discovers keywords competitors rank for but own domain does not,
 * then injects top gaps as candidate topics.
 */

import { analyzeCompetitors } from '../competitor-analysis.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export async function competitorAnalysisStep(state, config, options) {
  if (!config.competitors?.enabled || !config.competitors?.domains?.length) {
    return state;
  }

  try {
    const refreshDays = config.competitors?.refreshDays || 7;
    const cachedDate = state.context?.competitorGaps?.analysisDate;

    // Reuse cached data if still fresh
    if (cachedDate) {
      const ageMs = Date.now() - new Date(cachedDate).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays < refreshDays) {
        log(`Competitor analysis: using cached data (${Math.round(ageDays)}d old, refresh at ${refreshDays}d)`);
        const cachedGaps = state.context.competitorGaps.gaps || [];
        const gapTopics = gapsToTopics(cachedGaps);
        const candidateTopics = [...(state.candidateTopics || []), ...gapTopics];
        return {
          ...state,
          candidateTopics,
          competitorGaps: state.context.competitorGaps,
        };
      }
    }

    log('Running competitive gap analysis...');
    const { gaps } = await analyzeCompetitors(config, state.context || {});

    const analysisDate = new Date().toISOString();
    log(`Competitor gaps found: ${gaps.length}`);

    // Track DataForSEO cost estimate (competitor intersection API)
    if (options.costTracker) {
      const domainCount = config.competitors.domains.length;
      options.costTracker.addDataforseo('competitorAnalysis', 0.05 * domainCount);
    }

    // Inject top gaps as candidate topics
    const gapTopics = gapsToTopics(gaps);
    const candidateTopics = [...(state.candidateTopics || []), ...gapTopics];

    return {
      ...state,
      candidateTopics,
      competitorGaps: { gaps, analysisDate },
    };
  } catch (err) {
    log(`Warning: Competitor analysis failed: ${err.message}`);
    return state;
  }
}

/**
 * Convert gap objects into candidate topic objects.
 */
function gapsToTopics(gaps) {
  return gaps.slice(0, 10).map((g) => ({
    title: g.keyword,
    summary: `Competitor gap: ${g.competitorCount} competitor(s) rank for "${g.keyword}" (vol: ${g.volume}, diff: ${g.difficulty}). Domains: ${g.competitorDomains.join(', ')}`,
    category: 'Competitor Gap',
    relevanceScore: 0.85,
    region: 'Global',
    sources: g.competitorDomains,
    searchIntent: 'informational',
    source: 'competitor-analysis',
  }));
}
