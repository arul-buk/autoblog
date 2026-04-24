/**
 * topics.mjs
 * Topic research via Gemini with Google Search grounding.
 * Searches news, social media, and regional sources for trending content.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry } from './retry.mjs';

/**
 * Expand {year} placeholders in search queries.
 */
function expandQuery(query) {
  return query.replace('{year}', new Date().getFullYear().toString());
}

/**
 * Build the research prompt from config-driven clusters and contexts.
 */
function buildResearchPrompt(expandedQueries, config, regionalContexts) {
  const today = new Date().toISOString().slice(0, 10);
  const recencyDays = config.topics?.recencyDays || 7;
  const sinceDate = new Date(Date.now() - recencyDays * 86400000).toISOString().slice(0, 10);
  const productName = config.product.name;
  const productDesc = config.product.description;

  const regionLines = (regionalContexts || [])
    .map((r) => `- ${r.region}: ${r.focus}`)
    .join('\n');

  const categoryNames = (config.topics?.clusters || []).map((c) => c.name).join(' | ');

  return `You are a content strategist for ${productName}, ${productDesc}.
Today is ${today}.

TASK: Search for the most recent and trending news, social media discussions, and developments relevant to ${productName}'s domain. Focus HEAVILY on content from the last ${recencyDays} days (since ${sinceDate}).

SEARCH THESE TOPICS:
${expandedQueries.map((q, i) => `${i + 1}. ${q}`).join('\n')}

ALSO SEARCH social media for relevant discussions:
- Twitter/X posts and threads about the topics above
- Reddit discussions in relevant subreddits
- News articles from the last ${recencyDays} days

${regionLines ? `ALSO SEARCH these regional perspectives:\n${regionLines}` : ''}

For each article idea, return a JSON array with objects in this format:
{
  "title": "Specific, compelling article title (under 70 chars, SEO-optimized)",
  "summary": "2-3 sentence summary of what the article covers and why it matters NOW",
  "category": "One of: ${categoryNames}",
  "relevanceScore": 0.0-1.0 (1.0 = breaking news this week, 0.5 = trending this month, 0.2 = evergreen),
  "region": "Country or region this is most relevant to, or 'Global'",
  "sources": ["source URLs or publication names found via search"],
  "searchIntent": "informational | commercial | navigational"
}

PRIORITIZE:
1. Breaking news from the last ${recencyDays} days (score 0.8-1.0)
2. Trending social media discussions happening RIGHT NOW (score 0.7-0.9)
3. Recent regulatory changes or enforcement actions (score 0.6-0.8)
4. Long-tail topics with high search intent that no one has written about yet (score 0.5-0.7)
5. Country-specific angles with high search potential (score 0.5-0.7)

AVOID:
- Generic "how to" topics (already well covered)
- Pure product reviews without a news hook
- Topics that haven't changed in the last 3 months

Return 10-15 topic ideas as a valid JSON array. No markdown code fences, no extra text.`;
}

/**
 * Parse topics from Gemini response text.
 */
function parseTopicsFromResponse(responseText) {
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) {
      throw new Error(`Could not parse topic JSON from Gemini response: ${cleaned.slice(0, 200)}`);
    }
    parsed = JSON.parse(match[0]);
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
  const { categoryConstraint } = options;

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
  const prompt = buildResearchPrompt(expandedQueries, config, regionalContexts);

  const result = await withRetry(
    () => model.generateContent(prompt),
    { ...config.retry, label: 'topic-research' }
  );

  const text = result.response.text();
  const topics = parseTopicsFromResponse(text);

  // Sort by relevance score descending
  topics.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Limit to maxCandidates
  const max = config.topics.maxCandidates || 15;
  return topics.slice(0, max);
}
