/**
 * linker.mjs
 * Internal linking strategy for cross-linking blog posts.
 * Builds a keyword-to-slug index and finds topically relevant posts.
 * Zero API cost — pure text matching.
 */

import fs from 'fs';
import path from 'path';

/**
 * Load existing posts and build a keyword-to-slug index.
 *
 * @param {string} postsDir - Absolute path to posts directory
 * @returns {Array<{ slug: string, title: string, keywords: string[] }>}
 */
function loadPostIndex(postsDir) {
  if (!fs.existsSync(postsDir)) return [];

  return fs.readdirSync(postsDir)
    .filter((f) => f.endsWith('.md') && !fs.statSync(path.join(postsDir, f)).isDirectory())
    .map((f) => {
      const slug = f.replace(/\.md$/, '');
      const content = fs.readFileSync(path.join(postsDir, f), 'utf-8');
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) return { slug, title: slug, keywords: [] };

      const fm = fmMatch[1];
      const titleMatch = fm.match(/^title:\s*"(.+?)"/m);

      // Extract seoKeywords (both array and inline formats)
      let keywords = [];
      const kwBlockMatch = fm.match(/^seoKeywords:\s*\n((?:\s+-\s*.*\n?)*)/m);
      if (kwBlockMatch) {
        keywords = kwBlockMatch[1]
          .split('\n')
          .map((line) => line.replace(/^\s*-\s*["']?/, '').replace(/["']?\s*$/, '').trim())
          .filter(Boolean);
      } else {
        const kwInlineMatch = fm.match(/^seoKeywords:\s*\[([\s\S]*?)\]/m);
        if (kwInlineMatch) {
          keywords = kwInlineMatch[1].match(/"([^"]+)"/g)?.map((k) => k.replace(/"/g, '')) || [];
        }
      }

      // Also extract tags
      const tagBlockMatch = fm.match(/^tags:\s*\n((?:\s+-\s*.*\n?)*)/m);
      if (tagBlockMatch) {
        const tags = tagBlockMatch[1]
          .split('\n')
          .map((line) => line.replace(/^\s*-\s*["']?/, '').replace(/["']?\s*$/, '').trim())
          .filter(Boolean);
        keywords.push(...tags);
      }

      return {
        slug,
        title: titleMatch ? titleMatch[1] : slug,
        keywords: [...new Set(keywords.map((k) => k.toLowerCase()))],
      };
    });
}

/**
 * Score relevance of an existing post to a new topic.
 */
function scoreRelevance(post, topicTitle, topicCategory, topicKeywords) {
  let score = 0;
  const titleWords = topicTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const categoryLower = (topicCategory || '').toLowerCase();

  // Keyword overlap
  for (const kw of post.keywords) {
    for (const tk of topicKeywords || []) {
      if (kw.includes(tk.toLowerCase()) || tk.toLowerCase().includes(kw)) {
        score += 3;
      }
    }
  }

  // Title word overlap
  for (const word of titleWords) {
    if (post.keywords.some((kw) => kw.includes(word))) {
      score += 2;
    }
    if (post.title.toLowerCase().includes(word)) {
      score += 1;
    }
  }

  // Category match (check if any keyword relates to category)
  if (categoryLower && post.keywords.some((kw) => kw.includes(categoryLower))) {
    score += 5;
  }

  return score;
}

/**
 * Find the most relevant existing posts to cross-link from a new post.
 *
 * @param {object} config - Full autoblog config
 * @param {object} topic - New topic { title, summary, category }
 * @param {string} currentSlug - Slug of the new post (exclude from results)
 * @param {object} [options]
 * @param {string[]} [options.topicKeywords] - Keywords from DataForSEO
 * @returns {{ linkedSlugs: string[], postIndex: Array }}
 */
export function findRelatedPosts(config, topic, currentSlug, options = {}) {
  const postsDir = path.resolve(process.cwd(), config.output.postsDir);
  const postIndex = loadPostIndex(postsDir);

  const scored = postIndex
    .filter((p) => p.slug !== currentSlug)
    .map((post) => ({
      ...post,
      score: scoreRelevance(post, topic.title, topic.category, options.topicKeywords),
    }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);

  const linkedSlugs = scored.slice(0, 5).map((p) => p.slug);

  if (linkedSlugs.length > 0) {
    console.log(`  Internal linking: found ${linkedSlugs.length} relevant posts`);
    for (const s of linkedSlugs.slice(0, 3)) {
      const post = scored.find((p) => p.slug === s);
      console.log(`    - ${s} (score: ${post.score})`);
    }
  } else {
    console.log('  Internal linking: no relevant posts found');
  }

  return { linkedSlugs, postIndex };
}

/**
 * Get existing post metadata for deduplication.
 *
 * @param {object} config - Full autoblog config
 * @returns {Array<{ slug: string, title: string, keywords: string[] }>}
 */
export function getExistingPostMeta(config) {
  const postsDir = path.resolve(process.cwd(), config.output.postsDir);
  return loadPostIndex(postsDir);
}
