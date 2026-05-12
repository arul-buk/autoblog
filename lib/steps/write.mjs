/**
 * Step: Write
 * Generates the blog post content using Gemini.
 */

import { writePost, titleToSlug, validateFrontmatter } from '../writer.mjs';
import { buildLocalWriterGuidance } from '../local-content.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export async function writeStep(state, config, options) {
  const { selectedTopic, scheduleResult = {}, keywordData, linkedSlugs = [], styleGuide, existingMeta: existingPostMeta = [] } = state;
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  const additionalSlugs = options.additionalSlugs || [];

  const existingSlugs = existingPostMeta.map((m) => m.slug);

  // Build combined writer notes from calendar + local guidance
  const localGuidance = buildLocalWriterGuidance(selectedTopic, config);
  const combinedWriterNotes = [scheduleResult.writerNotes, localGuidance].filter(Boolean).join('\n\n');

  log('Writing blog post...');
  const { slug, content, metadata } = await writePost(
    apiKey, config, selectedTopic,
    existingSlugs,
    { keywordData, writerNotes: combinedWriterNotes || null, linkedSlugs, styleGuide }
  );

  log(`  Generated: ${slug}.md (${content.length} chars)`);
  log(`  Author: ${metadata.author}`);

  if (options.dryRun) {
    log('\n--- DRY RUN: Post preview ---');
    console.log(content.slice(0, 500) + '\n...');
    log('--- End preview ---\n');
  }

  return { ...state, slug, content, metadata };
}
