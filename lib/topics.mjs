/**
 * topics.mjs
 * Topic research via Gemini with Google Search grounding.
 * Searches news, social media, and regional sources for trending content.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry } from './retry.mjs';
import { buildResearchPrompt } from './prompts.mjs';
import { buildContextSummary } from './context.mjs';

/**
 * Expand {year} placeholders in search queries.
 */
function expandQuery(query) {
  return query.replace('{year}', new Date().getFullYear().toString());
}

/**
 * Parse topics from Gemini response text.
 */
export function parseTopicsFromResponse(responseText) {
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract JSON array from mixed text
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) {
      throw new Error(`Could not parse topic JSON from Gemini response: ${cleaned.slice(0, 200)}`);
    }
    let jsonStr = match[0];
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // Fix common LLM JSON issues: trailing commas, unescaped newlines in strings
      jsonStr = jsonStr
        .replace(/,\s*([}\]])/g, '$1')           // trailing commas
        .replace(/[\r\n]+\s*(?=")/g, ' ')         // newlines before quotes
        .replace(/(?<=:\s*"[^"]*)\n([^"]*")/g, ' $1'); // newlines inside string values
      parsed = JSON.parse(jsonStr);
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Expected a JSON array from Gemini topic research response');
  }

  return parsed
    .filter((item) => item && typeof item === 'object' && item.title && item.summary)
    .map((item) => ({
      title: String(item.title).trim(),
      summary: String(item.summary).trim(),
      category: String(item.category || '').trim(),
      relevanceScore: typeof item.relevanceScore === 'number' ? item.relevanceScore : 0.5,
      region: String(item.region || 'Global').trim(),
      sources: Array.isArray(item.sources) ? item.sources.map(String) : [],
      searchIntent: String(item.searchIntent || 'informational').trim(),
      contentFormat: item.contentFormat ? String(item.contentFormat).trim() : null,
    }));
}

/**
 * Research trending topics using Gemini with Google Search grounding.
 *
 * @param {string} geminiApiKey
 * @param {object} config - Full autoblog config
 * @param {object} [options]
 * @param {string} [options.categoryConstraint] - If set, only research this cluster
 * @returns {Promise<Array>}
 */
export async function researchTopics(geminiApiKey, config, options = {}) {
  const { categoryConstraint, contextInsights, balancingDirective } = options;

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({
    model: config.models.text,
    tools: [{ googleSearch: {} }],
  });

  // Filter clusters if category constraint from scheduler
  let clusters = config.topics.clusters;
  if (categoryConstraint) {
    const filtered = clusters.filter(
      (c) => c.name.toLowerCase() === categoryConstraint.toLowerCase()
    );
    if (filtered.length > 0) {
      clusters = filtered;
    } else {
      console.log(`  [topics] Category "${categoryConstraint}" not found, using all clusters`);
    }
  }

  // Build expanded queries
  const expandedQueries = clusters.flatMap((cluster) =>
    cluster.queries.map((q) => `[${cluster.name}] ${expandQuery(q)}`)
  );

  const regionalContexts = config.topics.regionalContexts || [];
  const contextSummary = contextInsights ? buildContextSummary(contextInsights) : '';
  const prompt = buildResearchPrompt({ expandedQueries, config, regionalContexts, contextSummary, balancingDirective });

  const topics = await withRetry(
    async () => {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      return parseTopicsFromResponse(text);
    },
    { ...config.retry, label: 'topic-research' }
  );

  // Sort by relevance score descending
  topics.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Limit to maxCandidates
  const max = config.topics.maxCandidates || 15;
  return topics.slice(0, max);
}
