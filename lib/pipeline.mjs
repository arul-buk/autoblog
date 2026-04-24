/**
 * pipeline.mjs
 * Main pipeline orchestrator for the autoblog package.
 *
 * Runs up to 9 steps in sequence:
 * 1. Schedule Check — content calendar resolution
 * 2. Research — trending topic discovery
 * 3. Dedupe — semantic deduplication
 * 4. Keyword Research — DataForSEO enrichment
 * 5. Write — blog post generation
 * 6. Humanize — AI pattern removal
 * 7. Validate — quality checks
 * 8. Image — cover image generation
 * 9. Translate — multi-language
 *
 * Each step can be toggled via config.steps.
 * Returns structured results for the CLI to handle file saving.
 */

import fs from 'fs';
import path from 'path';
import { resolveSchedule } from './scheduler.mjs';
import { researchTopics } from './topics.mjs';
import { deduplicateTopics } from './deduper.mjs';
import { researchKeywords, getIntelligentSeeds } from './keyword-research.mjs';
import { writePost, titleToSlug } from './writer.mjs';
import { humanizePost } from './humanizer.mjs';
import { validatePost } from './validator.mjs';
import { findRelatedPosts, getExistingPostMeta } from './linker.mjs';
import { generateCoverImage } from './image-generator.mjs';
import { translatePost } from './translator.mjs';
import { resolveStyleGuide } from './style-guide.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/**
 * Count active steps for progress display.
 */
function countActiveSteps(config) {
  let count = 0;
  if (config.steps.calendar) count++;
  if (config.steps.research) count++;
  if (config.steps.dedupe) count++;
  if (config.steps.keywordResearch) count++;
  count++; // write is always active
  if (config.steps.humanize) count++;
  if (config.steps.validate) count++;
  if (config.steps.image) count++;
  if (config.steps.translate && config.translation?.enabled) count++;
  return count;
}

/**
 * Run the full autoblog pipeline.
 *
 * @param {object} config - Validated autoblog config
 * @param {object} [options]
 * @param {boolean} [options.dryRun=false] - Preview without saving files
 * @param {string[]} [options.additionalSlugs=[]] - Extra slugs to treat as existing (for batch mode)
 * @returns {Promise<object>} - Pipeline result
 */
export async function runPipeline(config, options = {}) {
  const { dryRun = false, additionalSlugs = [] } = options;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }

  const totalSteps = countActiveSteps(config);
  let currentStep = 0;

  const stepLabel = () => {
    currentStep++;
    return `Step ${currentStep}/${totalSteps}`;
  };

  log(`=== ${config.product.name} Auto-Publish Blog Pipeline ===`);
  if (dryRun) log('DRY RUN MODE - no files will be saved');

  // ── Resolve Style Guide ────────────────────────────────────────────
  const styleGuide = resolveStyleGuide(config);
  if (styleGuide.voice || styleGuide.referencePost) {
    log(`  Style guide active: ${styleGuide.voice ? 'voice rules' : ''}${styleGuide.voice && styleGuide.referencePost ? ' + ' : ''}${styleGuide.referencePost ? 'reference post' : ''}`);
  }

  // ── Step 1: Schedule Check ──────────────────────────────────────────
  let scheduleResult = { mode: 'trending', topicOverride: null, categoryConstraint: null, seedKeywords: null, writerNotes: null, skipDedupe: false };

  if (config.steps.calendar) {
    log(`${stepLabel()}: Checking content calendar...`);
    scheduleResult = await resolveSchedule(config);
    log(`  Mode: ${scheduleResult.mode}`);
  }

  // ── Step 2: Research ────────────────────────────────────────────────
  let candidateTopics = [];

  if (scheduleResult.topicOverride) {
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
    log(`  Using calendar topic: "${scheduleResult.topicOverride}"`);
  } else if (config.steps.research) {
    log(`${stepLabel()}: Researching trending topics...`);
    candidateTopics = await researchTopics(apiKey, config, {
      categoryConstraint: scheduleResult.categoryConstraint,
    });
    if (!candidateTopics || candidateTopics.length === 0) {
      log('No topics found. Exiting.');
      return { status: 'no_topics', slug: null };
    }
    log(`  Found ${candidateTopics.length} candidate topic(s)`);
  }

  // ── Hoist existing post metadata (used by dedupe + keyword strategy) ─
  const existingMeta = getExistingPostMeta(config);
  const allMeta = [
    ...existingMeta,
    ...additionalSlugs.map((s) => ({ slug: s, title: s, keywords: [] })),
  ];

  // ── Step 3: Dedupe ──────────────────────────────────────────────────
  let selectedTopic = null;

  if (scheduleResult.skipDedupe) {
    selectedTopic = candidateTopics[0];
    log(`  Skipping dedupe (calendar priority: high)`);
  } else if (config.steps.dedupe) {
    log(`${stepLabel()}: Checking for duplicates (semantic analysis)...`);

    selectedTopic = await deduplicateTopics(apiKey, config, candidateTopics, allMeta);

    if (!selectedTopic) {
      log('All candidate topics already covered. Exiting.');
      return { status: 'all_duplicates', slug: null };
    }
  } else {
    selectedTopic = candidateTopics[0];
  }

  log(`Selected topic: "${selectedTopic.title}"`);
  log(`  Category: ${selectedTopic.category}`);

  // ── Step 4: Keyword Research ────────────────────────────────────────
  let keywordData = null;

  if (config.steps.keywordResearch && config.seo?.enabled) {
    // Full keyword research: Gemini intelligent seeds → DataForSEO enrichment
    log(`${stepLabel()}: Keyword research (Gemini + DataForSEO)...`);
    keywordData = await researchKeywords(config, selectedTopic, {
      seedKeywords: scheduleResult.seedKeywords,
      apiKey,
      existingPostMeta: allMeta,
    });
  } else if (config.steps.keywordResearch && !scheduleResult.seedKeywords) {
    // No DataForSEO, but still get intelligent keyword suggestions from Gemini
    log(`${stepLabel()}: Keyword strategy (Gemini-only, no DataForSEO)...`);
    const seedResult = await getIntelligentSeeds(apiKey, config, selectedTopic, allMeta);
    if (seedResult && seedResult.seeds.length > 0) {
      keywordData = {
        primaryKeyword: { keyword: seedResult.seeds[0], volume: null, difficulty: null },
        secondaryKeywords: seedResult.seeds.slice(1).map((k) => ({ keyword: k, volume: null, difficulty: null })),
        questions: seedResult.questions || [],
        competitorAngles: [],
        skip: false,
      };
    }
  }

  // ── Internal Linking (pre-write) ────────────────────────────────────
  let linkedSlugs = [];
  const slug = titleToSlug(selectedTopic.title);

  if (config.steps.internalLinking) {
    const topicKeywords = keywordData?.secondaryKeywords?.map((k) => k.keyword) || [];
    const linkResult = findRelatedPosts(config, selectedTopic, slug, { topicKeywords });
    linkedSlugs = linkResult.linkedSlugs;
  }

  // ── Step 5: Write ───────────────────────────────────────────────────
  log(`${stepLabel()}: Writing blog post...`);
  const existingSlugs = allMeta.map((m) => m.slug);
  let { slug: postSlug, content, metadata } = await writePost(
    apiKey, config, selectedTopic,
    [...existingSlugs, ...additionalSlugs],
    { keywordData, writerNotes: scheduleResult.writerNotes, linkedSlugs, styleGuide }
  );
  log(`  Generated: ${postSlug}.md (${content.length} chars)`);
  log(`  Author: ${metadata.author}`);

  if (dryRun) {
    log('\n--- DRY RUN: Post preview ---');
    console.log(content.slice(0, 500) + '\n...');
    log('--- End preview ---\n');
  }

  // ── Step 6: Humanize ────────────────────────────────────────────────
  if (config.steps.humanize) {
    log(`${stepLabel()}: Humanizing content (removing AI writing patterns)...`);
    content = await humanizePost(apiKey, config, content, styleGuide);
    log(`  Humanized: ${content.length} chars`);
  }

  // ── Step 7: Validate ────────────────────────────────────────────────
  let validation = null;

  if (config.steps.validate) {
    log(`${stepLabel()}: Validating post quality...`);
    validation = validatePost(content, config, { existingSlugs });

    if (validation.errors.length > 0) {
      log(`  Errors: ${validation.errors.join('; ')}`);
    }
    if (validation.warnings.length > 0) {
      log(`  Warnings: ${validation.warnings.join('; ')}`);
    }
    if (validation.readability) {
      log(`  Readability: Grade ${validation.readability.gradeLevel} (${validation.wordCount} words)`);
    }
    if (validation.geoAeoScore !== undefined) {
      log(`  GEO/AEO score: ${validation.geoAeoScore}/100`);
    }
    if (validation.valid) {
      log('  ✓ Validation passed');
    }
  }

  // ── Step 8: Image ───────────────────────────────────────────────────
  let imagePath = null;

  if (config.steps.image) {
    log(`${stepLabel()}: Generating cover image...`);
    const imagesDir = path.resolve(process.cwd(), config.output.imagesDir);

    if (dryRun) {
      log('  Skipped (dry-run mode)');
      imagePath = path.join(imagesDir, `${postSlug}.png`);
    } else {
      try {
        imagePath = await generateCoverImage(apiKey, config, selectedTopic, postSlug, imagesDir);
        log(`  Saved: ${imagePath}`);
      } catch (err) {
        log(`  Warning: Image generation failed (${err.message}). Post will use placeholder.`);
      }
    }
  }

  // ── Step 9: Translate ───────────────────────────────────────────────
  let translations = new Map();
  let translationErrors = [];

  if (config.steps.translate && config.translation?.enabled) {
    log(`${stepLabel()}: Translating to ${config.translation.languages.length} languages...`);
    const result = await translatePost(apiKey, config, content, postSlug);
    translations = result.translations;
    translationErrors = result.errors;
    log(`  Translated to ${translations.size} language(s)`);
    if (translationErrors.length > 0) {
      log(`  Translation failures: ${translationErrors.map((e) => e.langCode).join(', ')}`);
    }
  }

  // ── Validate translations ───────────────────────────────────────────
  if (config.steps.validate && translations.size > 0) {
    const transValidation = validatePost(content, config, { translations });
    if (transValidation.warnings.length > 0) {
      log(`  Translation warnings: ${transValidation.warnings.join('; ')}`);
    }
  }

  return {
    status: 'success',
    slug: postSlug,
    content,
    metadata,
    translations,
    translationErrors,
    imagePath,
    validation,
    scheduleMode: scheduleResult.mode,
    keywordData,
  };
}

/**
 * Save pipeline results to disk.
 *
 * @param {object} result - Pipeline result from runPipeline()
 * @param {object} config - Full autoblog config
 */
export function saveResults(result, config) {
  if (result.status !== 'success') return;

  const postsDir = path.resolve(process.cwd(), config.output.postsDir);

  // Save English post
  const postPath = path.join(postsDir, `${result.slug}.md`);
  fs.mkdirSync(path.dirname(postPath), { recursive: true });
  fs.writeFileSync(postPath, result.content, 'utf-8');
  log(`Saved: ${config.output.postsDir}/${result.slug}.md`);

  // Save translations
  for (const [lang, translated] of result.translations) {
    const langDir = path.join(postsDir, lang);
    fs.mkdirSync(langDir, { recursive: true });
    const langPath = path.join(langDir, `${result.slug}.md`);
    fs.writeFileSync(langPath, translated, 'utf-8');
    log(`Saved: ${config.output.postsDir}/${lang}/${result.slug}.md`);
  }
}
