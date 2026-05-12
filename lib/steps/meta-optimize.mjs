/**
 * Step: Meta Optimization
 * CTR-optimized title and excerpt rewriting.
 */

import { optimizeMetaTags } from '../meta-optimizer.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export async function metaOptimizeStep(state, config, options) {
  if (!config.steps.metaOptimize) {
    return state;
  }

  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  const { content, keywordData } = state;

  log('Optimizing meta tags for CTR...');
  try {
    const optimizedContent = await optimizeMetaTags(apiKey, config, content, keywordData);
    log('  Title and excerpt optimized');
    return { ...state, content: optimizedContent };
  } catch (err) {
    log(`  Warning: Meta optimization failed (${err.message}). Using original title.`);
    return state;
  }
}
