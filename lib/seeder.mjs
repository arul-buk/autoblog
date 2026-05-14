/**
 * seeder.mjs
 * Backfills .autoblog-context.json from existing blog posts on disk.
 *
 * Scans the posts directory, parses frontmatter, and creates context
 * entries so the strategy balancer, content refresh, performance audit,
 * and dedupe systems know about pre-existing content.
 *
 * Usage: npx autoblog seed
 *
 * Zero npm dependencies.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { loadContext, updateContext } from './context.mjs';
import { getGscPerformance } from './gsc.mjs';
import { fetchAnalyticsPerformance } from './context.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/**
 * Extract a frontmatter field value (simple scalar).
 */
function extractField(fm, field) {
  const match = fm.match(new RegExp(`^${field}:\\s*["']?([^"'\\n]+)["']?`, 'm'));
  return match ? match[1].trim() : null;
}

/**
 * Extract seoKeywords from frontmatter (array or inline format).
 */
function extractKeywords(fm) {
  // Block array format
  const blockMatch = fm.match(/^seoKeywords:\s*\n((?:\s+-\s*.*\n?)*)/m);
  if (blockMatch) {
    return blockMatch[1]
      .split('\n')
      .map((line) => line.replace(/^\s*-\s*["']?/, '').replace(/["']?\s*$/, '').trim())
      .filter(Boolean);
  }

  // Inline array format: seoKeywords: ["a", "b"]
  const inlineMatch = fm.match(/^seoKeywords:\s*\[([^\]]+)\]/m);
  if (inlineMatch) {
    return inlineMatch[1].match(/"([^"]+)"/g)?.map((k) => k.replace(/"/g, '')) || [];
  }

  // Comma-separated string: seoKeywords: "a, b, c"
  const strMatch = fm.match(/^seoKeywords:\s*"([^"]+)"/m);
  if (strMatch) {
    return strMatch[1].split(',').map((k) => k.trim()).filter(Boolean);
  }

  return [];
}

/**
 * Infer search intent from category and keywords.
 */
function inferIntent(category, keywords) {
  const lower = [category, ...keywords].join(' ').toLowerCase();
  if (/compar|vs |alternative|review|best /.test(lower)) return 'commercial';
  if (/calculator|tool|signup|pricing|buy|get started/.test(lower)) return 'transactional';
  if (/guide|how to|what is|explain|tips|tutorial/.test(lower)) return 'informational';
  return 'informational';
}

/**
 * Scan posts directory and build context entries.
 *
 * @param {object} config - Full autoblog config
 * @returns {{ posts: object[], skipped: number, errors: string[] }}
 */
export function scanPosts(config) {
  const postsDir = resolve(process.cwd(), config.output.postsDir);
  const posts = [];
  const errors = [];
  let skipped = 0;

  let files;
  try {
    files = readdirSync(postsDir).filter((f) =>
      f.endsWith('.md') && !statSync(join(postsDir, f)).isDirectory()
    );
  } catch {
    return { posts: [], skipped: 0, errors: [`Posts directory not found: ${postsDir}`] };
  }

  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    const filePath = join(postsDir, file);

    try {
      const content = readFileSync(filePath, 'utf-8');
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) {
        errors.push(`${file}: no frontmatter found`);
        skipped++;
        continue;
      }

      const fm = fmMatch[1];
      const title = extractField(fm, 'title') || slug;
      const category = extractField(fm, 'category') || '';
      const date = extractField(fm, 'lastUpdated') || extractField(fm, 'date') || null;
      const keywords = extractKeywords(fm);
      const primaryKeyword = keywords[0] || null;
      const secondaryKeywords = keywords.slice(1, 6);
      const searchIntent = inferIntent(category, keywords);

      posts.push({
        slug,
        title,
        date: date || new Date().toISOString().slice(0, 10),
        category,
        primaryKeyword,
        secondaryKeywords,
        searchIntent,
        contentFormat: null,
        performance: null,
      });
    } catch (err) {
      errors.push(`${file}: ${err.message}`);
      skipped++;
    }
  }

  return { posts, skipped, errors };
}

/**
 * Run the full seed process: scan posts, fetch performance, update context.
 *
 * @param {object} config - Full autoblog config
 * @param {object} [options]
 * @param {boolean} [options.fetchPerformance=true] - Fetch GSC/GA4 data
 * @param {boolean} [options.overwrite=false] - Overwrite existing entries (vs merge)
 * @returns {Promise<{ seeded: number, skipped: number, errors: string[] }>}
 */
export async function runSeed(config, options = {}) {
  const { fetchPerformance = true, overwrite = false } = options;

  log('Scanning posts directory...');
  const { posts, skipped, errors } = scanPosts(config);

  if (posts.length === 0) {
    log('No posts found to seed.');
    return { seeded: 0, skipped, errors };
  }

  log(`Found ${posts.length} post(s) to seed (${skipped} skipped)`);

  // Load existing context
  const ctx = loadContext(config);
  const existingSlugs = new Set(ctx.posts.map((p) => p.slug));

  // Merge or overwrite
  let seeded = 0;
  for (const post of posts) {
    if (existingSlugs.has(post.slug) && !overwrite) {
      continue; // Already in context
    }

    const existing = ctx.posts.findIndex((p) => p.slug === post.slug);
    if (existing >= 0) {
      // Overwrite: preserve performance data
      const oldPerf = ctx.posts[existing].performance;
      ctx.posts[existing] = { ...post, performance: oldPerf };
    } else {
      ctx.posts.push(post);
    }

    // Track category in topicHistory
    if (post.category && !ctx.topicHistory.includes(post.category)) {
      ctx.topicHistory.push(post.category);
    }

    seeded++;
  }

  log(`Seeded ${seeded} new post(s) into context (${ctx.posts.length} total)`);

  // Fetch performance data if credentials available
  if (fetchPerformance) {
    const slugs = ctx.posts.map((p) => p.slug);

    // GSC performance
    if (config.gsc?.enabled || process.env.GSC_SERVICE_ACCOUNT_JSON) {
      log('Fetching GSC performance data...');
      try {
        const gscPerf = await getGscPerformance(config, slugs);
        let gscUpdated = 0;
        for (const [slug, perf] of gscPerf) {
          const post = ctx.posts.find((p) => p.slug === slug);
          if (post) {
            post.performance = { ...post.performance, ...perf, lastChecked: new Date().toISOString().slice(0, 10) };
            gscUpdated++;
          }
        }
        log(`  GSC: ${gscUpdated} post(s) with data`);
      } catch (err) {
        log(`  Warning: GSC fetch failed (${err.message})`);
      }
    }

    // GA4 performance
    if (config.analytics?.enabled || process.env.GA4_SERVICE_ACCOUNT_JSON) {
      log('Fetching GA4 performance data...');
      try {
        const gaPerf = await fetchAnalyticsPerformance(config, slugs);
        let gaUpdated = 0;
        for (const [slug, perf] of gaPerf) {
          const post = ctx.posts.find((p) => p.slug === slug);
          if (post) {
            post.performance = { ...post.performance, ...perf, lastChecked: new Date().toISOString().slice(0, 10) };
            gaUpdated++;
          }
        }
        log(`  GA4: ${gaUpdated} post(s) with data`);
      } catch (err) {
        log(`  Warning: GA4 fetch failed (${err.message})`);
      }
    }
  }

  // Save context
  const filePath = resolve(process.cwd(), config.context?.filePath || '.autoblog-context.json');
  const { writeFileSync } = await import('fs');
  ctx.lastRun = new Date().toISOString();
  writeFileSync(filePath, JSON.stringify(ctx, null, 2), 'utf-8');

  log(`Context saved to ${config.context?.filePath || '.autoblog-context.json'}`);

  // Summary
  const withPerf = ctx.posts.filter((p) => p.performance).length;
  const categories = [...new Set(ctx.posts.map((p) => p.category).filter(Boolean))];
  const intents = {};
  for (const p of ctx.posts) {
    intents[p.searchIntent] = (intents[p.searchIntent] || 0) + 1;
  }

  log('');
  log('Seed summary:');
  log(`  Total posts in context: ${ctx.posts.length}`);
  log(`  With performance data: ${withPerf}`);
  log(`  Categories: ${categories.join(', ') || '(none)'}`);
  log(`  Intent distribution: ${Object.entries(intents).map(([k, v]) => `${k}: ${v}`).join(', ')}`);

  if (errors.length > 0) {
    log('');
    log('Errors:');
    for (const err of errors) {
      log(`  - ${err}`);
    }
  }

  return { seeded, skipped, errors };
}
