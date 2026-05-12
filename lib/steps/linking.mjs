/**
 * Step: Internal Linking
 * Finds related posts for cross-linking in the upcoming article.
 */

import { findRelatedPosts } from '../linker.mjs';
import { titleToSlug } from '../writer.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export async function linkingStep(state, config, _options) {
  const { selectedTopic, keywordData } = state;

  if (!config.steps.internalLinking) {
    return state;
  }

  const slug = titleToSlug(selectedTopic.title);
  const topicKeywords = keywordData?.secondaryKeywords?.map((k) => k.keyword) || [];
  const linkResult = findRelatedPosts(config, selectedTopic, slug, { topicKeywords });
  const linkedSlugs = linkResult.linkedSlugs;

  log(`Internal linking: found ${linkedSlugs.length} related post(s)`);

  return { ...state, linkedSlugs, slug };
}
