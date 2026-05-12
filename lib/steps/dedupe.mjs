/**
 * Step: Dedupe
 * Semantic deduplication of candidate topics against existing posts.
 * Saves unused topics to backlog for future runs.
 *
 * If all candidates are rejected, falls back to trending research
 * rather than stopping the pipeline.
 */

import { deduplicateTopics } from '../deduper.mjs';
import { researchTopics } from '../topics.mjs';
import { isTimeSensitive, saveToBacklog, removeFromBacklog } from '../context.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export async function dedupeStep(state, config, options) {
  const { scheduleResult = {}, candidateTopics = [], localTopic, contextInsights, balancingDirective, existingMeta: existingPostMeta = [] } = state;
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;

  let selectedTopic = null;
  let updatedCandidates = candidateTopics;

  if (scheduleResult.skipDedupe) {
    selectedTopic = candidateTopics[0];
    log('Skipping dedupe (calendar priority: high)');
  } else if (config.steps.dedupe) {
    log('Checking for duplicates (semantic analysis)...');
    selectedTopic = await deduplicateTopics(apiKey, config, candidateTopics, existingPostMeta);

    // Fallback: if selected topic was rejected (local topic or topical authority),
    // try trending research as a fallback
    if (!selectedTopic && (localTopic || scheduleResult.topicOverride) && config.steps.research) {
      log('  Topic override was deduped — falling back to trending research...');
      updatedCandidates = await researchTopics(apiKey, config, {
        categoryConstraint: scheduleResult.categoryConstraint,
        contextInsights,
        balancingDirective,
      });
      if (updatedCandidates && updatedCandidates.length > 0) {
        selectedTopic = await deduplicateTopics(apiKey, config, updatedCandidates, existingPostMeta);
      }
    }

    if (!selectedTopic) {
      log('All candidate topics already covered.');
      return { ...state, status: 'all_duplicates' };
    }
  } else {
    selectedTopic = candidateTopics[0];
  }

  if (!selectedTopic) {
    return { ...state, status: 'no_topics' };
  }

  log(`Selected topic: "${selectedTopic.title}"`);
  log(`  Category: ${selectedTopic.category}`);

  // Save unused topics to backlog (if context enabled and not dryRun)
  if (config.context?.enabled && updatedCandidates.length > 1 && !options.dryRun) {
    const unused = updatedCandidates.filter((t) => t.title !== selectedTopic.title);
    saveToBacklog(config, unused, selectedTopic.title);
    const saved = unused.filter((t) => !isTimeSensitive(t)).length;
    if (saved > 0) {
      log(`  Backlog: saved ${saved} unused topic(s) for future runs`);
    }
    removeFromBacklog(config, selectedTopic.title);
  }

  return { ...state, selectedTopic };
}
