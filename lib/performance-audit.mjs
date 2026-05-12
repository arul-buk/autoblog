/**
 * performance-audit.mjs
 * Performance Feedback Loop (Gap 3)
 * Audits post performance, detects winning patterns and declining posts.
 */

import { loadContext, fetchAnalyticsPerformance } from './context.mjs';
import { getGscPerformance } from './gsc.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/**
 * Extract patterns from top-performing posts.
 * Groups posts with position < threshold by category, searchIntent, contentFormat.
 *
 * @param {object[]} posts - Context posts with performance data
 * @param {object} [config] - Config with audit.winningPatterns.topPositionThreshold
 * @returns {object[]} Array of { dimension, value, avgPosition, avgClicks, postCount }
 */
export function extractWinningPatterns(posts, config = {}) {
  const threshold = config.audit?.winningPatterns?.topPositionThreshold || 10;
  const winners = posts.filter(
    (p) => p.performance && p.performance.position < threshold
  );

  if (winners.length === 0) return [];

  const dimensions = ['category', 'searchIntent', 'contentFormat'];
  const patterns = [];

  for (const dim of dimensions) {
    const groups = new Map();

    for (const post of winners) {
      const value = post[dim];
      if (!value) continue;

      if (!groups.has(value)) {
        groups.set(value, { totalPosition: 0, totalClicks: 0, count: 0 });
      }
      const g = groups.get(value);
      g.totalPosition += post.performance.position;
      g.totalClicks += post.performance.clicks || 0;
      g.count++;
    }

    for (const [value, g] of groups) {
      patterns.push({
        dimension: dim,
        value,
        avgPosition: Math.round((g.totalPosition / g.count) * 10) / 10,
        avgClicks: Math.round(g.totalClicks / g.count),
        postCount: g.count,
      });
    }
  }

  // Sort by postCount descending, then avgClicks descending
  patterns.sort((a, b) => b.postCount - a.postCount || b.avgClicks - a.avgClicks);
  return patterns;
}

/**
 * Find posts that are declining or underperforming.
 *
 * @param {object[]} posts - Context posts with performance data
 * @param {object} config - Config with audit.minPostAgeDays, audit.declineThreshold
 * @returns {object[]} Array of { slug, title, position, clicks, reason }
 */
export function detectDecliningPosts(posts, config) {
  const minAgeDays = config.audit?.minPostAgeDays || 30;
  const declineThreshold = config.audit?.declineThreshold || 5;
  const now = Date.now();
  const declining = [];

  for (const post of posts) {
    if (!post.performance) continue;

    const daysSincePublish = (now - new Date(post.date).getTime()) / 86400000;
    if (daysSincePublish < minAgeDays) continue;

    const reasons = [];
    if (post.performance.position > 20) {
      reasons.push(`position ${post.performance.position} (>20)`);
    }
    if (post.performance.clicks <= declineThreshold) {
      reasons.push(`clicks ${post.performance.clicks} (<= ${declineThreshold})`);
    }

    if (reasons.length > 0) {
      declining.push({
        slug: post.slug,
        title: post.title,
        position: post.performance.position,
        clicks: post.performance.clicks || 0,
        reason: reasons.join('; '),
      });
    }
  }

  // Sort by position descending (worst first)
  declining.sort((a, b) => b.position - a.position);
  return declining;
}

/**
 * Build a human-readable audit report for CLI output.
 *
 * @param {object} auditResult - { decliningPosts, improvingPosts, winningPatterns, refreshCandidates, report }
 * @returns {string} Multi-line report string
 */
export function buildAuditReport(auditResult) {
  const lines = [];
  lines.push('=== PERFORMANCE AUDIT REPORT ===');
  lines.push('');

  // Winning patterns
  if (auditResult.winningPatterns.length > 0) {
    lines.push('WINNING PATTERNS:');
    for (const p of auditResult.winningPatterns.slice(0, 10)) {
      lines.push(`  ${p.dimension}: "${p.value}" — avg pos ${p.avgPosition}, avg clicks ${p.avgClicks}, ${p.postCount} posts`);
    }
    lines.push('');
  }

  // Declining posts
  if (auditResult.decliningPosts.length > 0) {
    lines.push(`DECLINING POSTS (${auditResult.decliningPosts.length}):`);
    for (const d of auditResult.decliningPosts.slice(0, 10)) {
      lines.push(`  ${d.slug} — ${d.reason}`);
    }
    lines.push('');
  }

  // Improving posts
  if (auditResult.improvingPosts?.length > 0) {
    lines.push(`IMPROVING POSTS (${auditResult.improvingPosts.length}):`);
    for (const p of auditResult.improvingPosts.slice(0, 5)) {
      lines.push(`  ${p.slug} — pos ${p.position}, ${p.clicks} clicks`);
    }
    lines.push('');
  }

  // Refresh candidates
  if (auditResult.refreshCandidates?.length > 0) {
    lines.push(`REFRESH CANDIDATES (${auditResult.refreshCandidates.length}):`);
    for (const r of auditResult.refreshCandidates.slice(0, 5)) {
      lines.push(`  ${r.slug} — ${r.reason}`);
    }
    lines.push('');
  }

  lines.push('=== END AUDIT REPORT ===');
  return lines.join('\n');
}

/**
 * Run a full performance audit.
 * Loads context, fetches fresh GSC + GA4 data, analyses patterns.
 *
 * @param {object} config - Full autoblog config
 * @returns {Promise<object>} { decliningPosts, improvingPosts, winningPatterns, refreshCandidates, report }
 */
export async function runAudit(config) {
  log('Starting performance audit...');

  const context = loadContext(config);
  if (!context?.posts?.length) {
    log('No posts in context — audit skipped');
    return {
      decliningPosts: [],
      improvingPosts: [],
      winningPatterns: [],
      refreshCandidates: [],
      report: 'No posts to audit.',
    };
  }

  const slugs = context.posts.map((p) => p.slug);
  log(`Auditing ${slugs.length} posts...`);

  // Fetch fresh performance data
  let gscData = new Map();
  try {
    gscData = await getGscPerformance(config, slugs);
    log(`  GSC data: ${gscData.size} posts with data`);
  } catch (err) {
    log(`  GSC fetch failed: ${err.message}`);
  }

  let ga4Data = new Map();
  try {
    ga4Data = await fetchAnalyticsPerformance(config, slugs);
    log(`  GA4 data: ${ga4Data.size} posts with data`);
  } catch (err) {
    log(`  GA4 fetch failed: ${err.message}`);
  }

  // Merge performance data into posts
  for (const post of context.posts) {
    const gsc = gscData.get(post.slug);
    const ga4 = ga4Data.get(post.slug);
    if (gsc || ga4) {
      post.performance = {
        ...post.performance,
        lastChecked: new Date().toISOString().slice(0, 10),
        ...(gsc || {}),
        ...(ga4 || {}),
      };
    }
  }

  const winningPatterns = extractWinningPatterns(context.posts, config);
  const decliningPosts = detectDecliningPosts(context.posts, config);

  // Improving posts: position < 10 and clicks > threshold
  const improvingPosts = context.posts
    .filter((p) => p.performance && p.performance.position < 10 && (p.performance.clicks || 0) > 10)
    .map((p) => ({
      slug: p.slug,
      title: p.title,
      position: p.performance.position,
      clicks: p.performance.clicks,
    }))
    .sort((a, b) => a.position - b.position);

  // Refresh candidates = declining posts that are old enough
  const refreshCandidates = decliningPosts.filter((d) => {
    const post = context.posts.find((p) => p.slug === d.slug);
    if (!post) return false;
    const daysSincePublish = (Date.now() - new Date(post.date).getTime()) / 86400000;
    return daysSincePublish > 90;
  });

  const result = { decliningPosts, improvingPosts, winningPatterns, refreshCandidates };
  result.report = buildAuditReport(result);

  log(`Audit complete: ${winningPatterns.length} patterns, ${decliningPosts.length} declining, ${improvingPosts.length} improving`);

  return result;
}
