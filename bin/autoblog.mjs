#!/usr/bin/env node
/**
 * autoblog CLI
 *
 * Config-driven automated blog content pipeline.
 *
 * Usage:
 *   npx autoblog                              # Full pipeline
 *   npx autoblog --dry-run                    # Preview without saving
 *   npx autoblog --batch 5                    # Generate 5 posts
 *   npx autoblog --steps research,dedupe      # Run specific steps
 *   npx autoblog --resume                     # Resume from last checkpoint
 *   npx autoblog audit                        # Run performance audit
 *   npx autoblog refresh                      # Check content freshness
 *   npx autoblog research                     # Research topics only
 *   npx autoblog --config ./my.config.mjs     # Custom config path
 *
 * Environment variables:
 *   GEMINI_API_KEY (required)
 *   DATAFORSEO_LOGIN (required if seo.enabled)
 *   DATAFORSEO_PASSWORD (required if seo.enabled)
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { loadConfig } from '../lib/config.mjs';
import { runPipeline, saveResults } from '../lib/pipeline.mjs';
import { sendFailureNotification } from '../lib/notifications.mjs';
import { resolveSequence, NAMED_SEQUENCES } from '../lib/step-registry.mjs';
import { findLatestRun } from '../lib/checkpoint.mjs';

/**
 * Load .env file from CWD if it exists (no dependency required).
 */
function loadEnvFile() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function printHelp() {
  console.log(`
@stayboba/autoblog — Automated blog content pipeline

Usage:
  npx autoblog [options]
  npx autoblog <command>

Commands:
  audit                Run performance audit (GSC + GA4 + GEO tracking)
  refresh              Check content freshness and flag stale posts
  research             Research and evaluate topics without generating
  seed                 Backfill context from existing posts on disk

Options:
  --dry-run, -n        Preview without saving files or deploying
  --batch <count>      Generate multiple posts (default: 1)
  --steps <list>       Run specific steps: research,dedupe,write,validate
  --resume             Resume from the last failed run's checkpoint
  --config <path>      Path to config file (default: ./autoblog.config.mjs)
  --init-strategy      Interactive wizard to generate a content strategy
  --help, -h           Show this help message

Available steps:
  schedule, gsc, contextLoad, contentRefresh, competitorAnalysis,
  topicalAuthority, research, dedupe, keywordResearch, intentFormat,
  serpFeatures, internalLinking, write, metaOptimize, humanize,
  crossModelReview, validate, embedSchema, image, translate,
  contextUpdate, cmsPublish, repurpose, notify

Environment variables:
  GEMINI_API_KEY              Gemini API key (required)
                              Get one at: https://aistudio.google.com/apikey

  DATAFORSEO_LOGIN            DataForSEO login (optional, for keyword research)
  DATAFORSEO_PASSWORD         DataForSEO password
                              Sign up at: https://app.dataforseo.com/register

  GSC_SERVICE_ACCOUNT_JSON    Google service account JSON path or inline
                              (optional, for GSC topic mining)

  GA4_SERVICE_ACCOUNT_JSON    Google service account JSON path or inline
                              (optional, for analytics performance tracking)

  CMS_ENDPOINT                CMS API endpoint (optional, for CMS publishing)
  CMS_USERNAME / CMS_PASSWORD WordPress basic auth
  CMS_ADMIN_API_KEY           Ghost Admin API key (id:secret format)
  CMS_API_TOKEN               Webflow/Strapi/Contentful API token
  CMS_COLLECTION_ID           Webflow collection ID
  CMS_SPACE_ID                Contentful space ID
  CMS_CONTENT_TYPE_ID         Strapi/Contentful content type

  AUTOBLOG_TEXT_MODEL         Override text model (default: gemini-2.5-flash)
  AUTOBLOG_IMAGE_MODEL        Override image model (default: gemini-2.5-flash-image)

Setup:
  1. cp autoblog.config.example.mjs autoblog.config.mjs
  2. Edit autoblog.config.mjs with your product info
  3. export GEMINI_API_KEY="your-key"  (or add to .env file)
  4. npx autoblog --dry-run

Docs: https://github.com/arul-buk/autoblog#readme
`);
}

function parseArgs(args) {
  const parsed = {
    dryRun: false,
    batch: 1,
    configPath: null,
    help: false,
    initStrategy: false,
    steps: null,
    resume: false,
    command: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run' || arg === '-n') {
      parsed.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--init-strategy') {
      parsed.initStrategy = true;
    } else if (arg === '--resume') {
      parsed.resume = true;
    } else if (arg === '--batch' && args[i + 1]) {
      parsed.batch = parseInt(args[i + 1], 10) || 1;
      i++;
    } else if (arg === '--config' && args[i + 1]) {
      parsed.configPath = args[i + 1];
      i++;
    } else if (arg === '--steps' && args[i + 1]) {
      parsed.steps = args[i + 1];
      i++;
    } else if (arg === 'seed') {
      parsed.command = 'seed';
    } else if (!arg.startsWith('-') && NAMED_SEQUENCES[arg]) {
      parsed.command = arg;
    }
  }

  return parsed;
}

async function main() {
  loadEnvFile();

  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  let config;
  try {
    config = await loadConfig(args.configPath);
  } catch (err) {
    console.error(`Config error: ${err.message}`);
    process.exit(1);
  }

  // Seed mode — backfill context from existing posts
  if (args.command === 'seed') {
    const { runSeed } = await import('../lib/seeder.mjs');
    const result = await runSeed(config, { fetchPerformance: true, overwrite: false });
    process.exit(result.errors.length > 0 ? 1 : 0);
  }

  // Strategy wizard mode
  if (args.initStrategy) {
    if (!process.env.GEMINI_API_KEY) {
      console.error('Error: GEMINI_API_KEY is required for strategy wizard.');
      process.exit(1);
    }
    const { runStrategyWizard } = await import('../lib/strategy-wizard.mjs');
    await runStrategyWizard(config, process.env.GEMINI_API_KEY);
    process.exit(0);
  }

  // Check required env vars
  if (!process.env.GEMINI_API_KEY) {
    console.error(`Error: GEMINI_API_KEY is not set.

To fix this, either:
  1. Create a .env file in your project root:
     GEMINI_API_KEY=your-key-here

  2. Or export it directly:
     export GEMINI_API_KEY="your-key-here"

Get a free API key at: https://aistudio.google.com/apikey`);
    process.exit(1);
  }

  if (config.seo?.enabled && config.steps?.keywordResearch) {
    if (!process.env.DATAFORSEO_LOGIN && !config.seo?.apiLogin) {
      console.error(`Error: DataForSEO credentials required (seo.enabled is true).

To fix this, either:
  1. Add to your .env file:
     DATAFORSEO_LOGIN=your-login
     DATAFORSEO_PASSWORD=your-password

  2. Or set seo.enabled to false in autoblog.config.mjs to skip keyword research.

Sign up at: https://app.dataforseo.com/register`);
      process.exit(1);
    }
    if (!process.env.DATAFORSEO_PASSWORD && !config.seo?.apiPassword) {
      console.error('Error: DATAFORSEO_PASSWORD environment variable required when seo.enabled=true');
      process.exit(1);
    }
  }

  // Resolve step sequence
  let sequence = null;
  let resumeOptions = {};

  if (args.command) {
    // Named subcommand: audit, refresh, research
    try {
      sequence = resolveSequence(args.command);
      log(`Running sequence: ${args.command}`);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  } else if (args.steps) {
    // Custom step list
    try {
      sequence = resolveSequence(args.steps);
      log(`Running steps: ${sequence.join(', ')}`);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  } else if (args.resume) {
    // Resume from last checkpoint
    const latestRun = findLatestRun(config);
    if (!latestRun) {
      console.error('No checkpoint found to resume from.');
      process.exit(1);
    }
    log(`Resuming run ${latestRun.runId} (${latestRun.completedSteps.length} steps completed)`);
    resumeOptions = {
      runId: latestRun.runId,
      resumeCompletedSteps: latestRun.completedSteps,
    };
  }

  // Determine batch count
  const batchCount = args.batch > 1 ? args.batch : (config.schedule?.postsPerRun || 1);

  log(`Config loaded: ${config.product.name}`);
  if (args.dryRun) log('Mode: DRY RUN (no files will be saved)');
  if (batchCount > 1) log(`Batch mode: generating ${batchCount} posts`);

  const startTime = Date.now();
  const results = [];
  const additionalSlugs = [];

  for (let i = 0; i < batchCount; i++) {
    if (batchCount > 1) {
      log(`\n━━━ Post ${i + 1}/${batchCount} ━━━`);
    }

    try {
      const result = await runPipeline(config, {
        dryRun: args.dryRun,
        additionalSlugs,
        sequence: sequence || undefined,
        ...resumeOptions,
      });

      results.push(result);

      if (result.status === 'success') {
        if (!args.dryRun) {
          saveResults(result, config);
        }
        additionalSlugs.push(result.slug);
      } else {
        log(`Pipeline ended with status: ${result.status}`);
        if (batchCount > 1) {
          log('Continuing to next batch item...');
        }
      }
    } catch (err) {
      log(`Pipeline error: ${err.message}`);
      try {
        await sendFailureNotification(err, config);
      } catch (_notifyErr) {
        log(`  Warning: Failure notification failed (${_notifyErr.message})`);
      }
      if (batchCount > 1) {
        log('Continuing to next batch item...');
        results.push({ status: 'error', error: err.message });
      } else {
        throw err;
      }
    }
  }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const successful = results.filter((r) => r.status === 'success');
  const failed = results.filter((r) => r.status === 'error');

  log('\n=== Pipeline complete ===');
  log(`Time: ${elapsed}s`);
  log(`Posts generated: ${successful.length}/${batchCount}`);

  for (const result of successful) {
    log(`  ✓ ${result.slug} (${result.scheduleMode})`);
    const translations = result.translations instanceof Map
      ? result.translations
      : new Map(Object.entries(result.translations || {}));
    if (translations.size > 0) {
      log(`    Translations: ${[...translations.keys()].join(', ')}`);
    }
    if (result.imagePath) {
      log(`    Image: ${result.imagePath}`);
    }
  }

  if (failed.length > 0) {
    log(`  ✗ ${failed.length} failed`);
  }

  if (args.dryRun) log('(DRY RUN — nothing was saved to disk)');

  // Exit with code 1 only for real failures, not expected skips
  const expectedSkips = ['all_duplicates', 'no_topics', 'skipped_jitter', 'quality_rejected'];
  const hasRealFailure = results.some((r) => r.status === 'error');
  const allExpectedSkips = results.every((r) => expectedSkips.includes(r.status) || r.status === 'success');

  if (hasRealFailure) {
    process.exit(1);
  }
  // Expected skips (jitter, duplicates, quality) exit cleanly
}

main().catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
