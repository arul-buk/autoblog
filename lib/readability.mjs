/**
 * readability.mjs
 * Flesch-Kincaid readability scoring for blog posts.
 * Zero API cost — pure text analysis.
 */

/**
 * Count syllables in a word (English approximation).
 */
function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 2) return 1;

  // Remove trailing 'e'
  word = word.replace(/e$/, '');

  // Count vowel groups
  const matches = word.match(/[aeiouy]+/g);
  let count = matches ? matches.length : 1;

  return Math.max(1, count);
}

/**
 * Extract body text from a blog post (strip frontmatter and HTML).
 */
function extractBodyText(content) {
  // Remove frontmatter
  const bodyMatch = content.match(/^---[\s\S]*?---\n([\s\S]*)$/);
  const body = bodyMatch ? bodyMatch[1] : content;

  // Strip HTML tags
  return body
    .replace(/<[^>]+>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate Flesch-Kincaid Grade Level.
 *
 * Formula: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
 *
 * @param {string} content - Blog post with frontmatter
 * @param {object} config - Full autoblog config
 * @returns {{ gradeLevel: number, words: number, sentences: number, syllables: number, warning: string|null }}
 */
export function calculateReadability(content, config) {
  const text = extractBodyText(content);

  if (text.length < 50) {
    return { gradeLevel: 0, words: 0, sentences: 0, syllables: 0, warning: 'Content too short for readability analysis' };
  }

  // Count sentences (split on . ! ?)
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5).length || 1;

  // Count words
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length || 1;

  // Count syllables
  const totalSyllables = words.reduce((sum, word) => sum + countSyllables(word), 0);

  // Flesch-Kincaid Grade Level
  const gradeLevel = 0.39 * (wordCount / sentences) + 11.8 * (totalSyllables / wordCount) - 15.59;
  const rounded = Math.round(gradeLevel * 10) / 10;

  // Check against config targets
  let warning = null;
  const target = config.readability?.targetGrade;
  if (target) {
    if (rounded < target.min) {
      warning = `Readability grade ${rounded} is below target minimum ${target.min} (too simple)`;
    } else if (rounded > target.max) {
      warning = `Readability grade ${rounded} is above target maximum ${target.max} (too complex)`;
    }
  }

  return {
    gradeLevel: rounded,
    words: wordCount,
    sentences,
    syllables: totalSyllables,
    warning,
  };
}
