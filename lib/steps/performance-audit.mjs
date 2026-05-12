/**
 * Step: Performance Audit (Gap 3)
 * Uses state.context (already loaded by contextLoad step) to run
 * performance analysis, fetches fresh GSC + GA4 data inline.
 */

import { extractWinningPatterns, detectDecliningPosts, buildAuditReport } from '../performance-audit.mjs';
import { getGscPerformance } from '../gsc.mjs';
import { fetchAnalyticsPerformance } from '../context.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export async function performanceAuditStep(state, config, _options) {
  if (!config.audit?.enabled) {
    return state;
  }

  if (!state.context?.posts?.length) {
    log('Performance audit: no posts in context — skipping');
    return state;
  }

  const posts = state.context.posts;
  const slugs = posts.map((p) => p.slug);
  log(`Performance audit: analysing ${slugs.length} posts...`);

  // Fetch fresh performance data
  let gscData = new Map();
  try {
    gscData = await getGscPerformance(config, slugs);
    log(`  GSC: ${gscData.size} posts with data`);
  } catch (err) {
    log(`  GSC fetch failed: ${err.message}`);
  }

  let ga4Data = new Map();
  try {
    ga4Data = await fetchAnalyticsPerformance(config, slugs);
    log(`  GA4: ${ga4Data.size} posts with data`);
  } catch (err) {
    log(`  GA4 fetch failed: ${err.message}`);
  }

  // Update post performance in context
  for (const post of posts) {
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

  const winningPatterns = extractWinningPatterns(posts, config);
  const decliningPosts = detectDecliningPosts(posts, config);

  const improvingPosts = posts
    .filter((p) => p.performance && p.performance.position < 10 && (p.performance.clicks || 0) > 10)
    .map((p) => ({
      slug: p.slug,
      title: p.title,
      position: p.performance.position,
      clicks: p.performance.clicks,
    }))
    .sort((a, b) => a.position - b.position);

  const refreshCandidates = decliningPosts.filter((d) => {
    const post = posts.find((p) => p.slug === d.slug);
    if (!post) return false;
    const daysSincePublish = (Date.now() - new Date(post.date).getTime()) / 86400000;
    return daysSincePublish > 90;
  });

  const auditReport = {
    decliningPosts,
    improvingPosts,
    winningPatterns,
    refreshCandidates,
  };
  auditReport.report = buildAuditReport(auditReport);

  log(`Audit: ${winningPatterns.length} patterns, ${decliningPosts.length} declining, ${improvingPosts.length} improving`);
  log(auditReport.report);

  return { ...state, auditReport };
}
