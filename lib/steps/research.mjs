/**
 * Step: Research
 * Discovers trending topics via Gemini, backlog, calendar override, or local content.
 * Merges GSC insights as high-priority candidates.
 */

import { researchTopics } from '../topics.mjs';
import { isTimeSensitive, pullFromBacklog } from '../context.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export async function researchStep(state, config, options) {
  const { scheduleResult = {}, localTopic, gscInsights, contextInsights, balancingDirective } = state;
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;

  let candidateTopics = [];

  if (localTopic) {
    // Local content takes precedence — skip research
    candidateTopics = [localTopic];
    log(`Using local topic: "${localTopic.title}"`);
  } else if (scheduleResult.topicOverride) {
    // Calendar provides a specific topic — skip research
    candidateTopics = [{
      title: scheduleResult.topicOverride,
      summary: scheduleResult.writerNotes || scheduleResult.topicOverride,
      category: scheduleResult.categoryConstraint || config.topics.clusters[0]?.name || 'General',
      relevanceScore: 1.0,
      region: 'Global',
      sources: [],
      searchIntent: 'informational',
    }];
    log(`Using calendar topic: "${scheduleResult.topicOverride}"`);
  } else if (config.steps.research) {
    // Check backlog first (if context is enabled)
    let fromBacklog = false;
    if (config.context?.enabled) {
      const backlogTopics = pullFromBacklog(config);
      if (backlogTopics.length > 0) {
        candidateTopics = backlogTopics;
        fromBacklog = true;
        log(`Using ${backlogTopics.length} topic(s) from backlog`);
      }
    }

    if (!fromBacklog) {
      log('Researching trending topics...');
      candidateTopics = await researchTopics(apiKey, config, {
        categoryConstraint: scheduleResult.categoryConstraint,
        contextInsights,
        balancingDirective,
      });
      if (!candidateTopics || candidateTopics.length === 0) {
        log('No topics found.');
        return { ...state, candidateTopics: [] };
      }
      log(`  Found ${candidateTopics.length} candidate topic(s)`);

      // Track cost estimate (research uses Google Search grounding)
      if (options.costTracker && candidateTopics.length > 0) {
        const estimatedTokens = JSON.stringify(candidateTopics).length / 4;
        options.costTracker.addGemini('research', { promptTokenCount: 500, candidatesTokenCount: Math.round(estimatedTokens), totalTokenCount: Math.round(estimatedTokens + 500) }, config.models?.text || 'gemini-3-flash-preview', true);
      }

      // Separate time-sensitive topics (prioritize them)
      const timeSensitive = candidateTopics.filter(isTimeSensitive);
      const evergreen = candidateTopics.filter((t) => !isTimeSensitive(t));
      if (timeSensitive.length > 0) {
        log(`  Time-sensitive: ${timeSensitive.length}, Evergreen: ${evergreen.length}`);
        candidateTopics = [...timeSensitive, ...evergreen];
      }
    }
  }

  // Merge GSC insights as high-priority candidates
  if (gscInsights) {
    const gscTopics = [];
    for (const qw of gscInsights.quickWins.slice(0, 5)) {
      gscTopics.push({
        title: qw.query,
        summary: `Quick win keyword at position ${qw.position} with ${qw.impressions} impressions. Optimize existing content or create dedicated post.`,
        category: 'SEO Quick Win',
        relevanceScore: 0.95,
        region: 'Global',
        sources: ['Google Search Console'],
        searchIntent: 'informational',
        source: 'gsc',
      });
    }
    for (const oq of gscInsights.orphanQueries.slice(0, 3)) {
      gscTopics.push({
        title: oq.query,
        summary: `Orphan query with ${oq.impressions} impressions but only ${oq.ctr}% CTR. No dedicated page exists.`,
        category: 'Content Gap',
        relevanceScore: 0.9,
        region: 'Global',
        sources: ['Google Search Console'],
        searchIntent: 'informational',
        source: 'gsc',
      });
    }
    if (gscTopics.length > 0) {
      candidateTopics = [...gscTopics, ...candidateTopics];
      log(`  Added ${gscTopics.length} GSC-sourced candidates (prioritized)`);
    }
  }

  return { ...state, candidateTopics };
}
