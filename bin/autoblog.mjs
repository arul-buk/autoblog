#!/usr/bin/env node
/**
 * autoblog CLI
 *
 * Config-driven automated blog content pipeline.
 *
 * Usage:
 *   npx autoblog                        # Full run
 *   npx autoblog --dry-run              # Preview without saving
 *   npx autoblog --batch 5             # Generate 5 posts
 *   npx autoblog --config ./my.config.mjs  # Custom config path
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

/**
 * Load .env file from CWD if it exists (no dependency required).
 * Skips lines that are comments or empty. Does not override existing env vars.
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

    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Don't override existing env vars
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

Options:
  --dry-run, -n       Preview without saving files or deploying
  --batch <count>     Generate multiple posts (default: 1)
  --config <path>     Path to config file (default: ./autoblog.config.mjs)
  --init-strategy     Interactive wizard to generate a content strategy
  --help, -h          Show this help message

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
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run' || arg === '-n') {
      parsed.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--init-strategy') {
      parsed.initStrategy = true;
    } else if (arg === '--batch' && args[i + 1]) {
      parsed.batch = parseInt(args[i + 1], 10) || 1;
      i++;
    } else if (arg === '--config' && args[i + 1]) {
      parsed.configPath = args[i + 1];
      i++;
    }
  }

  return parsed;
}

async function main() {
  // Load .env before anything else
  loadEnvFile();

  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Load and validate config
  let config;
  try {
    config = await loadConfig(args.configPath);
  } catch (err) {
    console.error(`Config error: ${err.message}`);
    process.exit(1);
  }

  // Run strategy wizard if requested
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
      });

      results.push(result);

      if (result.status === 'success') {
        // Save files (unless dry run)
        if (!args.dryRun) {
          saveResults(result, config);
        }

        // Add slug to dedupe list for subsequent batch iterations
        additionalSlugs.push(result.slug);
      } else {
        log(`Pipeline ended with status: ${result.status}`);
        if (batchCount > 1) {
          log('Continuing to next batch item...');
        }
      }
    } catch (err) {
      log(`Pipeline error: ${err.message}`);
      // Send failure notification (best-effort, don't let notification errors mask the real error)
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
    if (result.translations && result.translations.size > 0) {
      log(`    Translations: ${[...result.translations.keys()].join(', ')}`);
    }
    if (result.imagePath) {
      log(`    Image: ${result.imagePath}`);
    }
  }

  if (failed.length > 0) {
    log(`  ✗ ${failed.length} failed`);
  }

  if (args.dryRun) log('(DRY RUN — nothing was saved to disk)');

  // Exit with error if all posts failed
  if (successful.length === 0 && batchCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
