/**
 * topical-authority.mjs
 * Topical Authority Sequencing (Gap 4)
 * Determines which topic to write next based on pillar/cluster strategy.
 * Pure functions — no API calls, no side effects.
 */

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/**
 * Convert a title into a URL-safe slug (max 60 chars).
 * Same logic as writer.mjs titleToSlug.
 *
 * @param {string} title
 * @returns {string}
 */
export function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/-$/, '');
}

/**
 * Check if a cluster keyword is covered by any existing post.
 * Matches if any post slug contains the slugified cluster keyword,
 * or post title contains the cluster text (case-insensitive).
 *
 * @param {string} clusterKeyword - The cluster keyword to check
 * @param {object[]} posts - Existing context posts
 * @returns {boolean}
 */
function isClusterWritten(clusterKeyword, posts) {
  const slugified = titleToSlug(clusterKeyword);
  const lowerKeyword = clusterKeyword.toLowerCase();

  return posts.some(
    (p) =>
      p.slug.includes(slugified) ||
      (p.title && p.title.toLowerCase().includes(lowerKeyword))
  );
}

/**
 * Resolve the next topic to write based on the topical map.
 *
 * Strategy:
 * 1. If requirePillarFirst and pillar not written, return the pillar topic.
 * 2. For each pillar with an existing post, find the first unwritten cluster.
 * 3. Return null if everything is written.
 *
 * @param {object} topicalMap - Config topical map with { pillars, requirePillarFirst }
 * @param {object} context - Context object with posts array
 * @returns {object|null} { topic, isPillar, pillarSlug, internalLinks } or null
 */
export function resolveNextTopic(topicalMap, context) {
  const posts = context?.posts || [];
  const pillars = topicalMap?.pillars || [];
  const requirePillarFirst = topicalMap?.requirePillarFirst !== false;

  for (const pillar of pillars) {
    const pillarExists = posts.some((p) => p.slug === pillar.slug);

    // If pillar not written, return it as next topic
    // (if requirePillarFirst, this blocks cluster writing; otherwise it's just next in queue)
    if (!pillarExists) {
      log(`Pillar "${pillar.topic}" not yet written — selecting as next topic`);
      return {
        topic: pillar.topic,
        isPillar: true,
        pillarSlug: pillar.slug,
        internalLinks: [],
      };
    }

    // Find unwritten clusters for this pillar
    const clusters = pillar.clusters || [];
    for (const cluster of clusters) {
      if (!isClusterWritten(cluster, posts)) {
        // Gather internal links: pillar + already-written sibling clusters
        const writtenSiblings = clusters
          .filter((c) => c !== cluster && isClusterWritten(c, posts))
          .map((c) => {
            const match = posts.find(
              (p) =>
                p.slug.includes(titleToSlug(c)) ||
                (p.title && p.title.toLowerCase().includes(c.toLowerCase()))
            );
            return match?.slug;
          })
          .filter(Boolean);

        log(`Cluster "${cluster}" under pillar "${pillar.topic}" — not yet written`);
        return {
          topic: cluster,
          isPillar: false,
          pillarSlug: pillar.slug,
          internalLinks: [pillar.slug, ...writtenSiblings],
        };
      }
    }
  }

  log('All pillars and clusters are written');
  return null;
}

/**
 * Get status overview for all pillars and their clusters.
 *
 * @param {object} topicalMap - Config topical map with { pillars }
 * @param {object} context - Context object with posts array
 * @returns {object[]} Array of { pillarTopic, pillarSlug, exists, clustersTotal, clustersWritten, clustersRemaining }
 */
export function getPillarStatus(topicalMap, context) {
  const posts = context?.posts || [];
  const pillars = topicalMap?.pillars || [];
  const statuses = [];

  for (const pillar of pillars) {
    const exists = posts.some((p) => p.slug === pillar.slug);
    const clusters = pillar.clusters || [];
    const written = clusters.filter((c) => isClusterWritten(c, posts));

    statuses.push({
      pillarTopic: pillar.topic,
      pillarSlug: pillar.slug,
      exists,
      clustersTotal: clusters.length,
      clustersWritten: written.length,
      clustersRemaining: clusters.length - written.length,
    });
  }

  return statuses;
}
