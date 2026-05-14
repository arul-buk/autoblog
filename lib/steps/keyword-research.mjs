/**
 * Step: Keyword Research
 * Full DataForSEO enrichment or Gemini-only intelligent seeds.
 */

import { researchKeywords, getIntelligentSeeds } from '../keyword-research.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export async function keywordResearchStep(state, config, options) {
  const { selectedTopic, scheduleResult = {}, existingMeta: existingPostMeta = [], contextInsights, balancingDirective } = state;
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;

  // Skip if no topic was selected (e.g., all duplicates)
  if (!selectedTopic) {
    return state;
  }

  let keywordData = null;

  if (config.steps.keywordResearch && config.seo?.enabled) {
    // Full keyword research: Gemini intelligent seeds + DataForSEO enrichment
    log('Keyword research (Gemini + DataForSEO)...');
    keywordData = await researchKeywords(config, selectedTopic, {
      seedKeywords: scheduleResult.seedKeywords,
      apiKey,
      existingPostMeta,
      contextInsights,
      balancingDirective,
    });
  } else if (config.steps.keywordResearch && !scheduleResult.seedKeywords) {
    // No DataForSEO, but still get intelligent keyword suggestions from Gemini
    log('Keyword strategy (Gemini-only, no DataForSEO)...');
    const seedResult = await getIntelligentSeeds(apiKey, config, selectedTopic, existingPostMeta, contextInsights, balancingDirective);
    if (seedResult && seedResult.seeds.length > 0) {
      keywordData = {
        primaryKeyword: { keyword: seedResult.seeds[0], volume: null, difficulty: null },
        secondaryKeywords: seedResult.seeds.slice(1).map((k) => ({ keyword: k, volume: null, difficulty: null })),
        questions: seedResult.questions || [],
        competitorAngles: [],
        searchIntent: seedResult.searchIntent || 'informational',
        contentFormat: seedResult.contentFormat || null,
        skip: false,
      };
    }
  }

  // Track cost estimate for keyword research
  if (options.costTracker && keywordData) {
    options.costTracker.addGemini('keywordResearch', { promptTokenCount: 600, candidatesTokenCount: 400, totalTokenCount: 1000 }, config.models?.text || 'gemini-3-flash-preview');
  }

  return { ...state, keywordData };
}
