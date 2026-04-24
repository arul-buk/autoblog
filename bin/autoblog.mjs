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

import { loadConfig } from '../lib/config.mjs';
import { runPipeline, saveResults } from '../lib/pipeline.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function parseArgs(args) {
  const parsed = {
    dryRun: false,
    batch: 1,
    configPath: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else if (arg === '--batch' && args[i + 1]) {
      parsed.batch = parseInt(args[i + 1], 10) || 1;
      i++;
    } else if (arg === '--config' && args[i + 1]) {
      parsed.configPath = args[i + 1];
      i++;
    }
  }

  // Config schedule.postsPerRun can be overridden by --batch
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Load and validate config
  let config;
  try {
    config = await loadConfig(args.configPath);
  } catch (err) {
    console.error(`Config error: ${err.message}`);
    process.exit(1);
  }

  // Check required env vars
  if (!process.env.GEMINI_API_KEY) {
    console.error('Error: GEMINI_API_KEY environment variable is required');
    process.exit(1);
  }

  if (config.seo?.enabled && config.steps?.keywordResearch) {
    if (!process.env.DATAFORSEO_LOGIN && !config.seo?.apiLogin) {
      console.error('Error: DATAFORSEO_LOGIN environment variable required when seo.enabled=true');
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
  log(`Mode: ${args.dryRun ? 'DRY RUN' : 'PRODUCTION'}`);
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
    if (result.translations.size > 0) {
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
