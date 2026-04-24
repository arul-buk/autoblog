/**
 * deduper.mjs
 * Semantic deduplication of blog topics against existing posts.
 * Uses Gemini to detect topical overlap even when titles differ.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry } from './retry.mjs';
import { buildDedupePrompt } from './prompts.mjs';
import { titleToSlug } from './writer.mjs';

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

  const dedupePrompt = buildDedupePrompt({
    productName: config.product.name,
    existingPostsList,
    candidateList,
    existingPostCount: existingPostMeta.length,
  });

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
    if (!match) {
      console.log('  Warning: Could not parse dedupe response. Treating all candidates as unique.');
      dedupeAnalysis = [];
    } else {
      try {
        dedupeAnalysis = JSON.parse(match[0]);
      } catch {
        console.log('  Warning: Could not parse dedupe JSON. Treating all candidates as unique.');
        dedupeAnalysis = [];
      }
    }
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

