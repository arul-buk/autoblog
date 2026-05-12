/**
 * content-refresh.mjs
 * Content Refresh Scheduler (Gap 2)
 * Pure functions — no API calls.
 * Determines which posts need refreshing based on age, category rules, and traffic.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/**
 * Find the most specific category rule for a post.
 * Exact category match wins over wildcard '*'.
 *
 * @param {object} post - Post object with { slug, title, date, category, ... }
 * @param {object[]} rules - Array of { category, maxAgeDays }
 * @returns {object|null} Matched rule or null
 */
export function matchRefreshRule(post, rules) {
  if (!rules || rules.length === 0) return null;

  // Try exact category match first
  const exact = rules.find(
    (r) => r.category !== '*' && r.category === post.category
  );
  if (exact) return exact;

  // Fall back to wildcard
  const wildcard = rules.find((r) => r.category === '*');
  return wildcard || null;
}

/**
 * Compute refresh priority for a post matched against a rule.
 * Higher scores = more urgent refresh.
 *
 * Score = (daysPastDue / rule.maxAgeDays) * (1 + clicks/100)
 * If prioritizeByTraffic is false, just use daysPastDue.
 *
 * @param {object} post - Post with performance data
 * @param {object} rule - Matched refresh rule
 * @param {object} config - Full autoblog config
 * @returns {number} Priority score
 */
export function computeRefreshPriority(post, rule, config) {
  const lastRefreshed = post.refreshMetadata?.lastRefreshed || post.date;
  const daysSinceRefresh = (Date.now() - new Date(lastRefreshed).getTime()) / 86400000;
  const daysPastDue = Math.max(0, daysSinceRefresh - rule.maxAgeDays);

  if (!config.contentRefresh?.prioritizeByTraffic) {
    return daysPastDue;
  }

  const clicks = post.performance?.clicks || 0;
  return (daysPastDue / rule.maxAgeDays) * (1 + clicks / 100);
}

/**
 * Iterate context posts and build a refresh queue sorted by priority.
 *
 * @param {object} context - Context object with posts array
 * @param {object} config - Full autoblog config
 * @returns {object[]} Sorted array of { slug, title, category, reason, priority, daysSincePublish, daysSinceRefresh }
 */
export function computeRefreshQueue(context, config) {
  const refreshConfig = config.contentRefresh || {};
  const rules = refreshConfig.rules || [{ category: '*', maxAgeDays: 365 }];
  const maxQueueSize = refreshConfig.maxQueueSize || 10;
  const now = Date.now();
  const queue = [];

  for (const post of context.posts) {
    const rule = matchRefreshRule(post, rules);
    if (!rule) continue;

    const daysSincePublish = (now - new Date(post.date).getTime()) / 86400000;
    const lastRefreshed = post.refreshMetadata?.lastRefreshed || post.date;
    const daysSinceRefresh = (now - new Date(lastRefreshed).getTime()) / 86400000;

    // Skip posts that are not yet due
    if (daysSinceRefresh < rule.maxAgeDays) continue;

    const priority = computeRefreshPriority(post, rule, config);

    queue.push({
      slug: post.slug,
      title: post.title,
      category: post.category,
      reason: `${Math.floor(daysSinceRefresh)}d since last refresh (max ${rule.maxAgeDays}d)`,
      priority,
      daysSincePublish: Math.floor(daysSincePublish),
      daysSinceRefresh: Math.floor(daysSinceRefresh),
    });
  }

  // Sort by priority descending, cap size
  queue.sort((a, b) => b.priority - a.priority);
  return queue.slice(0, maxQueueSize);
}

/**
 * Mark a post as refreshed in context.
 * Loads context, updates post refreshMetadata, saves.
 *
 * @param {object} config - Full autoblog config
 * @param {string} slug - Post slug to mark
 */
export function markAsRefreshed(config, slug) {
  const filePath = resolve(process.cwd(), config.context?.filePath || '.autoblog-context.json');
  let ctx;

  try {
    ctx = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    log(`Cannot load context from ${filePath} — skipping markAsRefreshed`);
    return;
  }

  const post = ctx.posts?.find((p) => p.slug === slug);
  if (!post) {
    log(`Post "${slug}" not found in context — skipping`);
    return;
  }

  const rules = config.contentRefresh?.rules || [{ category: '*', maxAgeDays: 365 }];
  const rule = matchRefreshRule(post, rules);
  const maxAgeDays = rule?.maxAgeDays || 365;
  const today = new Date().toISOString().slice(0, 10);
  const nextDate = new Date(Date.now() + maxAgeDays * 86400000).toISOString().slice(0, 10);

  post.refreshMetadata = {
    lastRefreshed: today,
    nextRefreshDate: nextDate,
  };

  writeFileSync(filePath, JSON.stringify(ctx, null, 2), 'utf-8');
  log(`Marked "${slug}" as refreshed — next refresh due ${nextDate}`);
}
