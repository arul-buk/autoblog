/**
 * deduper.mjs
 * Semantic deduplication of blog topics against existing posts.
 * Uses Gemini to detect topical overlap even when titles differ.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry } from './retry.mjs';

/**
 * Convert a title to a URL-safe slug (max 60 chars).
 */
function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/-$/, '');
}

/**
 * Run semantic deduplication of candidate topics against existing posts.
 *
 * @param {string} geminiApiKey
 * @param {object} config - Full autoblog config
 * @param {Array} candidateTopics - Array of topic objects from research step
 * @param {Array} existingPostMeta - Array of { slug, title, keywords } for existing posts
 * @returns {Promise<object|null>} - Selected unique topic, or null if all are duplicates
 */
export async function deduplicateTopics(geminiApiKey, config, candidateTopics, existingPostMeta) {
  const existingSlugs = existingPostMeta.map((m) => m.slug);

  // Build compact list of existing posts for Gemini
  const existingPostsList = existingPostMeta
    .map((m) => `- "${m.title}" [${m.slug}] keywords: ${m.keywords.join(', ')}`)
    .join('\n');

  const candidateList = candidateTopics
    .map((t, i) => `${i + 1}. "${t.title}" — ${t.summary}`)
    .join('\n');

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: config.models.text });

  const productName = config.product.name;

  const dedupePrompt = `You are a content deduplication expert for ${productName}'s blog.

EXISTING BLOG POSTS (${existingPostMeta.length} posts):
${existingPostsList}

CANDIDATE NEW TOPICS:
${candidateList}

TASK: For each candidate, determine if the TOPIC/SUBJECT MATTER is already covered by an existing post. Two posts are duplicates if they cover the SAME core subject even if the titles use completely different words.

Examples of duplicates:
- "Company X Fined $375M in Safety Lawsuit" and "Juries Slam Company X in Landmark Case" = SAME TOPIC
- "Brazil's New Social Media Law" and "Social Media Age Verification in Brazil" = SAME TOPIC

Examples of NOT duplicates:
- "YouTube Restricted Mode Fails" and "YouTube Shorts Addiction" = DIFFERENT TOPICS
- "Australia Under-16 Ban" and "UK Online Safety Act" = DIFFERENT TOPICS (different countries)

Return a JSON array with one object per candidate:
[
  { "index": 1, "title": "...", "isDuplicate": true/false, "reason": "short explanation", "matchedSlug": "slug-of-matching-post or null" }
]

Return ONLY the JSON array. No markdown fences.`;

  const result = await withRetry(
    () => model.generateContent(dedupePrompt),
    { ...config.retry, label: 'deduplication' }
  );

  let dedupeText = result.response.text().trim();
  if (dedupeText.startsWith('```')) {
    dedupeText = dedupeText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  let dedupeAnalysis;
  try {
    dedupeAnalysis = JSON.parse(dedupeText);
  } catch {
    const match = dedupeText.match(/\[[\s\S]*\]/);
    dedupeAnalysis = match ? JSON.parse(match[0]) : [];
  }

  // Find first non-duplicate topic
  for (const item of dedupeAnalysis) {
    const idx = (item.index || 0) - 1;
    if (idx < 0 || idx >= candidateTopics.length) continue;

    const topic = candidateTopics[idx];
    const slugCandidate = titleToSlug(topic.title);

    // Hard check: slug collision
    if (existingSlugs.includes(slugCandidate)) {
      console.log(`  Skipping "${topic.title}" — slug exists`);
      continue;
    }

    // Gemini semantic check
    if (item.isDuplicate) {
      console.log(
        `  Skipping "${topic.title}" — duplicate of "${item.matchedSlug || 'existing post'}" (${item.reason})`
      );
      continue;
    }

    console.log(`  ✓ Unique: "${topic.title}" (${item.reason})`);
    return topic;
  }

  // Fallback: try topics not in Gemini's analysis
  for (const topic of candidateTopics) {
    const inAnalysis = dedupeAnalysis.some((a) => a.title === topic.title);
    if (!inAnalysis) {
      const slugCandidate = titleToSlug(topic.title);
      if (!existingSlugs.includes(slugCandidate)) {
        console.log(`  ✓ Fallback pick: "${topic.title}"`);
        return topic;
      }
    }
  }

  return null;
}

export { titleToSlug };
