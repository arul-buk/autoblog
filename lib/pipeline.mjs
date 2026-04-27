/**
 * pipeline.mjs
 * Main pipeline orchestrator for the autoblog package.
 *
 * Runs up to 15 steps in sequence:
 *  1. Schedule Check — content calendar resolution
 *  2. GSC Mining — Google Search Console topic research (optional)
 *  3. Research — trending topic discovery
 *  4. Dedupe — semantic deduplication
 *  5. Keyword Research — DataForSEO enrichment + intent classification
 *  6. Internal Linking — cross-post references
 *  7. Write — blog post generation
 *  8. Meta Optimization — CTR-optimized titles (optional)
 *  9. Humanize — AI pattern removal
 * 10. Cross-Model Review — quality validation (optional)
 * 11. Validate — quality checks
 * 12. Schema Embedding — JSON-LD markup (optional)
 * 13. Image — cover image generation
 * 14. Translate — multi-language
 * 15. Context Update — performance feedback loop (optional)
 * 16. CMS Publish — push to CMS platform (optional)
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
import { mineGscTopics, getGscPerformance, shouldRunGsc, updateGscLastRun } from './gsc.mjs';
import { optimizeMetaTags } from './meta-optimizer.mjs';
import { crossModelReview } from './cross-reviewer.mjs';
import { embedSchemaMarkup } from './schema-embedder.mjs';
import { loadContext, updateContext, fetchAnalyticsPerformance, computePostInsights, computeStrategyDistribution, isTimeSensitive, pullFromBacklog, saveToBacklog, removeFromBacklog } from './context.mjs';
import { computeBalancingDirective } from './strategy-balancer.mjs';
import { resolveLocalTopic, buildLocalWriterGuidance } from './local-content.mjs';
import { publishToCms } from './publisher.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/**
 * Calculate and replace readingTime in frontmatter based on actual word count.
 * Replaces any LLM-fabricated value with an accurate calculation (~200 wpm).
 */
function fixReadingTime(content) {
  const bodyMatch = content.match(/^---[\s\S]*?---\n([\s\S]*)$/);
  const body = bodyMatch ? bodyMatch[1] : content;
  const stripped = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = stripped.split(/\s+/).filter((w) => w.length > 0).length;
  const minutes = Math.max(1, Math.ceil(wordCount / 200));
  const readingTime = `${minutes} min read`;

  // Replace existing readingTime in frontmatter
  if (/^readingTime:/m.test(content)) {
    return content.replace(/^readingTime:.*$/m, `readingTime: "${readingTime}"`);
  }
  return content;
}

/**
 * Count active steps for progress display.
 */
function countActiveSteps(config) {
  let count = 0;
  if (config.steps.calendar) count++;
  if (config.gsc?.enabled || process.env.GSC_SERVICE_ACCOUNT_JSON) count++;
  if (config.steps.research) count++;
  if (config.steps.dedupe) count++;
  if (config.steps.keywordResearch) count++;
  count++; // write is always active
  if (config.steps.metaOptimize) count++;
  if (config.steps.humanize) count++;
  if (config.steps.crossModelReview) count++;
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

  // ── GSC Mining (optional, schedule-aware) ────────────────────────────
  let gscInsights = null;

  if (config.gsc?.enabled || process.env.GSC_SERVICE_ACCOUNT_JSON) {
    const gscSchedule = shouldRunGsc(config);
    if (gscSchedule.shouldRun) {
      log(`${stepLabel()}: Mining Google Search Console data...`);
      log(`  Reason: ${gscSchedule.reason}`);
      try {
        gscInsights = await mineGscTopics(config);
        log(`  Quick wins: ${gscInsights.quickWins.length}, Orphans: ${gscInsights.orphanQueries.length}, Declining: ${gscInsights.decliningPages.length}`);
        if (!dryRun) updateGscLastRun(config);
      } catch (err) {
        log(`  Warning: GSC mining failed (${err.message}). Continuing without GSC data.`);
      }
    } else {
      log(`${stepLabel()}: Skipping GSC mining — ${gscSchedule.reason}`);
    }
  }

  // ── Load context (if enabled) ──────────────────────────────────────
  let context = null;
  let contextInsights = null;
  if (config.context?.enabled) {
    context = loadContext(config);
    if (context?.posts?.length > 0) {
      log(`  Context loaded: ${context.posts.length} previous posts tracked`);
      contextInsights = computePostInsights(context);
      if (contextInsights.hasPerformanceData) {
        log(`  Performance data: ${contextInsights.topCategories.length} top categories, ${contextInsights.decliningKeywords.length} declining keywords`);
      }
    }
  }

  // ── Strategy Balancing (if content strategy is configured) ──────────
  let balancingDirective = null;
  if (config.contentStrategy && context?.posts?.length > 0) {
    const distribution = computeStrategyDistribution(context);
    balancingDirective = computeBalancingDirective(config.contentStrategy, distribution);
    if (balancingDirective.active) {
      log(`  Strategy: prefer ${balancingDirective.preferredIntent || 'any'}/${balancingDirective.preferredFormat || 'any'} content`);
    }
  }

  // ── Local Content (if enabled and due) ──────────────────────────────
  let localTopic = null;
  if (config.steps.localContent && config.contentStrategy?.localContent?.enabled) {
    localTopic = resolveLocalTopic(config, context);
    if (localTopic) {
      log(`  Local content: generating for ${localTopic.locationData.city}`);
    }
  }

  // ── Step: Research ──────────────────────────────────────────────────
  let candidateTopics = [];

  if (localTopic) {
    // Local content takes precedence — skip research
    candidateTopics = [localTopic];
    log(`  Using local topic: "${localTopic.title}"`);
  } else if (scheduleResult.topicOverride) {
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
    // Check backlog first (if context is enabled)
    let fromBacklog = false;
    if (config.context?.enabled) {
      const backlogTopics = pullFromBacklog(config);
      if (backlogTopics.length > 0) {
        candidateTopics = backlogTopics;
        fromBacklog = true;
        log(`${stepLabel()}: Using ${backlogTopics.length} topic(s) from backlog`);
      }
    }

    if (!fromBacklog) {
      log(`${stepLabel()}: Researching trending topics...`);
      candidateTopics = await researchTopics(apiKey, config, {
        categoryConstraint: scheduleResult.categoryConstraint,
        contextInsights,
        balancingDirective,
      });
      if (!candidateTopics || candidateTopics.length === 0) {
        log('No topics found. Exiting.');
        return { status: 'no_topics', slug: null };
      }
      log(`  Found ${candidateTopics.length} candidate topic(s)`);

      // Separate time-sensitive topics (prioritize them)
      const timeSensitive = candidateTopics.filter(isTimeSensitive);
      const evergreen = candidateTopics.filter((t) => !isTimeSensitive(t));
      if (timeSensitive.length > 0) {
        log(`  Time-sensitive: ${timeSensitive.length}, Evergreen: ${evergreen.length}`);
        candidateTopics = [...timeSensitive, ...evergreen];
      }
    }
  }

  // ── Merge GSC insights as high-priority candidates ─────────────────
  if (gscInsights) {
    const gscTopics = [];
    for (const qw of gscInsights.quickWins.slice(0, 5)) {
      gscTopics.push({
        title: qw.query,
        summary: `Quick win keyword at position ${qw.position} with ${qw.impressions} impressions. Optimize existing content or create dedicated post.`,
        category: 'SEO Quick Win',
        relevanceScore: 0.95,
        region: 'Global',
        sources: ['Google Search Console'],
        searchIntent: 'informational',
        source: 'gsc',
      });
    }
    for (const oq of gscInsights.orphanQueries.slice(0, 3)) {
      gscTopics.push({
        title: oq.query,
        summary: `Orphan query with ${oq.impressions} impressions but only ${oq.ctr}% CTR. No dedicated page exists.`,
        category: 'Content Gap',
        relevanceScore: 0.9,
        region: 'Global',
        sources: ['Google Search Console'],
        searchIntent: 'informational',
        source: 'gsc',
      });
    }
    if (gscTopics.length > 0) {
      candidateTopics = [...gscTopics, ...candidateTopics];
      log(`  Added ${gscTopics.length} GSC-sourced candidates (prioritized)`);
    }
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

    if (!selectedTopic && localTopic && config.steps.research) {
      // Local topic was deduped — fall back to trending research
      log('  Local topic deduped — falling back to trending research...');
      candidateTopics = await researchTopics(apiKey, config, {
        categoryConstraint: scheduleResult.categoryConstraint,
        contextInsights,
        balancingDirective,
      });
      if (candidateTopics && candidateTopics.length > 0) {
        selectedTopic = await deduplicateTopics(apiKey, config, candidateTopics, allMeta);
      }
    }

    if (!selectedTopic) {
      log('All candidate topics already covered. Exiting.');
      return { status: 'all_duplicates', slug: null };
    }
  } else {
    selectedTopic = candidateTopics[0];
  }

  log(`Selected topic: "${selectedTopic.title}"`);
  log(`  Category: ${selectedTopic.category}`);

  // Save unused topics to backlog (if context enabled)
  if (config.context?.enabled && candidateTopics.length > 1 && !dryRun) {
    const unused = candidateTopics.filter((t) => t.title !== selectedTopic.title);
    saveToBacklog(config, unused, selectedTopic.title);
    const saved = unused.filter((t) => !isTimeSensitive(t)).length;
    if (saved > 0) {
      log(`  Backlog: saved ${saved} unused topic(s) for future runs`);
    }
    // Remove selected topic from backlog if it came from there
    removeFromBacklog(config, selectedTopic.title);
  }

  // ── Step 4: Keyword Research ────────────────────────────────────────
  let keywordData = null;

  if (config.steps.keywordResearch && config.seo?.enabled) {
    // Full keyword research: Gemini intelligent seeds → DataForSEO enrichment
    log(`${stepLabel()}: Keyword research (Gemini + DataForSEO)...`);
    keywordData = await researchKeywords(config, selectedTopic, {
      seedKeywords: scheduleResult.seedKeywords,
      apiKey,
      existingPostMeta: allMeta,
      contextInsights,
      balancingDirective,
    });
  } else if (config.steps.keywordResearch && !scheduleResult.seedKeywords) {
    // No DataForSEO, but still get intelligent keyword suggestions from Gemini
    log(`${stepLabel()}: Keyword strategy (Gemini-only, no DataForSEO)...`);
    const seedResult = await getIntelligentSeeds(apiKey, config, selectedTopic, allMeta, contextInsights, balancingDirective);
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
  const localGuidance = buildLocalWriterGuidance(selectedTopic, config);
  const combinedWriterNotes = [scheduleResult.writerNotes, localGuidance].filter(Boolean).join('\n\n');
  let { slug: postSlug, content, metadata } = await writePost(
    apiKey, config, selectedTopic,
    existingSlugs,
    { keywordData, writerNotes: combinedWriterNotes || null, linkedSlugs, styleGuide }
  );
  log(`  Generated: ${postSlug}.md (${content.length} chars)`);
  log(`  Author: ${metadata.author}`);

  if (dryRun) {
    log('\n--- DRY RUN: Post preview ---');
    console.log(content.slice(0, 500) + '\n...');
    log('--- End preview ---\n');
  }

  // ── Meta Optimization (optional) ───────────────────────────────────
  if (config.steps.metaOptimize) {
    log(`${stepLabel()}: Optimizing meta tags for CTR...`);
    try {
      content = await optimizeMetaTags(apiKey, config, content, keywordData);
      log(`  Title and excerpt optimized`);
    } catch (err) {
      log(`  Warning: Meta optimization failed (${err.message}). Using original title.`);
    }
  }

  // ── Step: Humanize ────────────────────────────────────────────────
  if (config.steps.humanize) {
    log(`${stepLabel()}: Humanizing content (removing AI writing patterns)...`);
    content = await humanizePost(apiKey, config, content, styleGuide);
    log(`  Humanized: ${content.length} chars`);
  }

  // ── Fix readingTime — calculate from actual word count, not LLM guess ──
  content = fixReadingTime(content);

  // ── Cross-Model Review (optional) ──────────────────────────────────
  if (config.steps.crossModelReview) {
    log(`${stepLabel()}: Cross-model quality review (${config.crossModel?.model || 'gemini-2.5-pro'})...`);
    try {
      const review = await crossModelReview(apiKey, config, content, keywordData);
      log(`  Quality score: ${review.score}/10`);
      if (review.score < (config.crossModel?.qualityThreshold || 7) && review.revisedContent) {
        log(`  Below threshold — using revised content`);
        content = review.revisedContent;
        content = fixReadingTime(content);
      }
    } catch (err) {
      log(`  Warning: Cross-model review failed (${err.message}). Using original content.`);
    }
  }

  // ── Step: Validate ────────────────────────────────────────────────
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

    // Retry once if word count is critically low
    if (validation.wordCount < (config.output?.wordCount?.min || 1000) * 0.8) {
      log('  Word count too low — retrying generation...');
      const retryResult = await writePost(
        apiKey, config, selectedTopic,
        existingSlugs,
        { keywordData, writerNotes: scheduleResult.writerNotes, linkedSlugs, styleGuide }
      );
      content = retryResult.content;
      postSlug = retryResult.slug;
      metadata = retryResult.metadata;

      if (config.steps.humanize) {
        content = await humanizePost(apiKey, config, content, styleGuide);
      }
      content = fixReadingTime(content);
      validation = validatePost(content, config, { existingSlugs });
      log(`  Retry result: ${validation.wordCount} words`);
    }

    if (validation.valid) {
      log('  ✓ Validation passed');
    }
  }

  // ── Schema Embedding (optional) ─────────────────────────────────────
  if (config.steps.embedSchema && config.output?.siteUrl) {
    try {
      content = embedSchemaMarkup(content, config);
      log(`  Schema markup embedded (BlogPosting + FAQPage)`);
    } catch (err) {
      log(`  Warning: Schema embedding failed (${err.message}).`);
    }
  }

  // ── Step: Image ───────────────────────────────────────────────────
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

  // Build result object early so context and CMS can reference it
  // Ensure keywordData has searchIntent/contentFormat from topic if not set by keyword research
  if (keywordData && !keywordData.searchIntent) {
    keywordData.searchIntent = selectedTopic.searchIntent || 'informational';
  }
  if (keywordData && !keywordData.contentFormat) {
    keywordData.contentFormat = selectedTopic.contentFormat || null;
  }

  const pipelineResult = {
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

  // ── Context Update (optional) ──────────────────────────────────────
  if (config.context?.enabled && !dryRun) {
    try {
      let performanceData = {};

      // Fetch GSC performance for existing posts
      if (config.gsc?.enabled || process.env.GSC_SERVICE_ACCOUNT_JSON) {
        try {
          const slugs = allMeta.map((m) => m.slug).slice(0, 50);
          const gscPerf = await getGscPerformance(config, slugs);
          for (const [slug, perf] of gscPerf) {
            performanceData[slug] = { ...performanceData[slug], ...perf };
          }
        } catch (err) {
          log(`  Warning: GSC performance fetch failed (${err.message})`);
        }
      }

      // Fetch GA4 performance
      if (config.analytics?.enabled || process.env.GA4_SERVICE_ACCOUNT_JSON) {
        try {
          const slugs = allMeta.map((m) => m.slug).slice(0, 50);
          const gaPerf = await fetchAnalyticsPerformance(config, slugs);
          for (const [slug, perf] of gaPerf) {
            performanceData[slug] = { ...performanceData[slug], ...perf };
          }
        } catch (err) {
          log(`  Warning: GA4 performance fetch failed (${err.message})`);
        }
      }

      updateContext(config, pipelineResult, performanceData);
      log(`  Context updated`);
    } catch (err) {
      log(`  Warning: Context update failed (${err.message})`);
    }
  }

  // ── CMS Publish (optional) ─────────────────────────────────────────
  if (config.publish?.cms && !dryRun) {
    log(`Publishing to ${config.publish.cms}...`);
    try {
      const publishResult = await publishToCms(pipelineResult, config);
      log(`  Published: ${publishResult?.url || publishResult?.id || 'OK'}`);
      pipelineResult.publishResult = publishResult;
    } catch (err) {
      log(`  Warning: CMS publish failed (${err.message}). Post saved locally.`);
    }
  }

  return pipelineResult;
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
