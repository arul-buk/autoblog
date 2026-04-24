/**
 * validator.mjs
 * Post-generation validation gate.
 * Checks word count, frontmatter, CTA markers, and readability.
 * Zero API cost — pure string analysis.
 */

import { calculateReadability } from './readability.mjs';

/**
 * Count words in content after stripping HTML/markdown and frontmatter.
 */
function countWords(content) {
  // Remove frontmatter
  const bodyMatch = content.match(/^---[\s\S]*?---\n([\s\S]*)$/);
  const body = bodyMatch ? bodyMatch[1] : content;

  // Strip HTML tags
  const stripped = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped.split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Check that required frontmatter fields are present.
 */
function checkFrontmatter(content, requiredFields) {
  const errors = [];
  const warnings = [];

  if (!content.startsWith('---')) {
    errors.push('Missing opening frontmatter delimiter (---)');
    return { errors, warnings };
  }

  if (!content.match(/\n---\n/)) {
    errors.push('Missing closing frontmatter delimiter (---)');
    return { errors, warnings };
  }

  for (const field of requiredFields) {
    const pattern = new RegExp(`^${field}:`, 'm');
    if (!pattern.test(content)) {
      errors.push(`Missing required frontmatter field: ${field}`);
    }
  }

  return { errors, warnings };
}

/**
 * Check CTA markers are present in content.
 */
function checkCtaMarkers(content, expectedMarkers) {
  const warnings = [];

  for (const marker of expectedMarkers) {
    const commentPattern = `<!-- ${marker} -->`;
    if (!content.includes(commentPattern)) {
      warnings.push(`Missing CTA marker: ${commentPattern}`);
    }
  }

  return warnings;
}

/**
 * Basic language detection for translations.
 * Checks for non-ASCII characters appropriate to the target language.
 */
function checkTranslationLanguage(content, langCode) {
  // Remove frontmatter fields that should stay in English
  const bodyMatch = content.match(/^---[\s\S]*?---\n([\s\S]*)$/);
  const body = bodyMatch ? bodyMatch[1] : content;

  // Strip HTML tags for analysis
  const text = body.replace(/<[^>]+>/g, '').trim();

  if (text.length < 100) {
    return 'Translation appears too short (< 100 chars of body text)';
  }

  // Chinese/Japanese should have CJK characters
  if (['zh', 'ja', 'ko'].includes(langCode)) {
    const cjkPattern = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/;
    if (!cjkPattern.test(text)) {
      return `Translation to ${langCode} appears to be in English (no CJK characters found)`;
    }
  }

  // Arabic should have Arabic script
  if (langCode === 'ar') {
    if (!/[\u0600-\u06ff]/.test(text)) {
      return `Translation to ${langCode} appears to be in English (no Arabic script found)`;
    }
  }

  return null;
}

/**
 * Validate a generated blog post.
 *
 * @param {string} content - The generated blog post with frontmatter
 * @param {object} config - Full autoblog config
 * @param {object} [options]
 * @param {Map<string, string>} [options.translations] - Translation map for language validation
 * @param {string[]} [options.existingSlugs] - For validating internal links
 * @returns {{ valid: boolean, warnings: string[], errors: string[], readability: object|null }}
 */
export function validatePost(content, config, options = {}) {
  const errors = [];
  const warnings = [];

  // 1. Frontmatter validation
  const requiredFields = config.output?.frontmatterSchema?.required || [];
  const fmResult = checkFrontmatter(content, requiredFields);
  errors.push(...fmResult.errors);
  warnings.push(...fmResult.warnings);

  // 2. Word count validation
  const wordCount = countWords(content);
  const minWords = config.output?.wordCount?.min || 1000;
  const maxWords = config.output?.wordCount?.max || 1500;

  if (wordCount < minWords * 0.8) {
    errors.push(`Word count too low: ${wordCount} (minimum: ${minWords})`);
  } else if (wordCount < minWords) {
    warnings.push(`Word count slightly below target: ${wordCount} (target: ${minWords})`);
  }

  if (wordCount > maxWords * 1.3) {
    warnings.push(`Word count significantly above target: ${wordCount} (target max: ${maxWords})`);
  }

  // 3. CTA marker validation
  const ctaMarkers = config.output?.ctaMarkers || [];
  if (ctaMarkers.length > 0) {
    const ctaWarnings = checkCtaMarkers(content, ctaMarkers);
    warnings.push(...ctaWarnings);
  }

  // 4. Readability scoring
  let readabilityResult = null;
  try {
    readabilityResult = calculateReadability(content, config);
    if (readabilityResult.warning) {
      warnings.push(readabilityResult.warning);
    }
  } catch {
    // Non-fatal — readability is informational
  }

  // 5. Translation language validation
  if (options.translations) {
    for (const [langCode, translated] of options.translations) {
      const langWarning = checkTranslationLanguage(translated, langCode);
      if (langWarning) {
        warnings.push(langWarning);
      }
    }
  }

  // 6. Internal link validation
  if (options.existingSlugs) {
    const linkPattern = /href="\/blog\/([^"]+)"/g;
    let match;
    while ((match = linkPattern.exec(content)) !== null) {
      const linkedSlug = match[1];
      if (!options.existingSlugs.includes(linkedSlug)) {
        warnings.push(`Internal link to non-existent post: /blog/${linkedSlug}`);
      }
    }
  }

  // 7. GEO/AEO compliance checks
  const geoAeo = checkGeoAeoCompliance(content, config);
  errors.push(...geoAeo.errors);
  warnings.push(...geoAeo.warnings);

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    readability: readabilityResult,
    wordCount,
    geoAeoScore: geoAeo.score,
  };
}

/**
 * Check GEO/AEO compliance: TL;DR, key takeaways, FAQ section,
 * question-based headings, passage citability, schema readiness.
 *
 * Returns a score (0-100) and specific warnings/errors.
 */
function checkGeoAeoCompliance(content, config) {
  const errors = [];
  const warnings = [];
  let scorePoints = 0;
  const maxPoints = 7;

  // Extract body (strip frontmatter)
  const bodyMatch = content.match(/^---[\s\S]*?---\n([\s\S]*)$/);
  const body = bodyMatch ? bodyMatch[1] : content;
  const bodyLower = body.toLowerCase();

  // 1. TL;DR section present
  const hasTldr = bodyLower.includes('tl;dr') || bodyLower.includes('tldr') || body.includes('tldr-section');
  if (hasTldr) {
    scorePoints++;
  } else {
    warnings.push('GEO: Missing TL;DR section (AI overviews prefer content with summary blocks)');
  }

  // 2. Key Takeaways section present
  const hasTakeaways = bodyLower.includes('key takeaways') || bodyLower.includes('key-takeaways');
  if (hasTakeaways) {
    scorePoints++;
  } else {
    warnings.push('GEO: Missing Key Takeaways section (improves passage-level citability)');
  }

  // 3. FAQ section present
  const hasFaq = bodyLower.includes('frequently asked questions') || bodyLower.includes('faq-section') || bodyLower.includes('faq');
  if (hasFaq) {
    scorePoints++;
  } else {
    warnings.push('AEO: Missing FAQ section (needed for FAQ schema and AI answer extraction)');
  }

  // 4. Question-based headings (check for ? in h2/h3 headings or ## headings)
  const questionHeadingPattern = /<h[23][^>]*>[^<]*\?[^<]*<\/h[23]>|^#{2,3}\s+[^\n]*\?/gm;
  const questionHeadings = body.match(questionHeadingPattern) || [];
  if (questionHeadings.length >= 3) {
    scorePoints++;
  } else if (questionHeadings.length >= 1) {
    scorePoints += 0.5;
    warnings.push(`AEO: Only ${questionHeadings.length} question-based heading(s) found (recommend 3+)`);
  } else {
    warnings.push('AEO: No question-based headings found (use What/How/Why/Can headings for answer engine optimization)');
  }

  // 5. qa frontmatter has sufficient entries
  const qaMatches = content.match(/^\s+-\s+question:/gm) || [];
  if (qaMatches.length >= 4) {
    scorePoints++;
  } else if (qaMatches.length >= 2) {
    scorePoints += 0.5;
    warnings.push(`Schema: Only ${qaMatches.length} Q&A pairs in frontmatter (recommend 4+ for FAQ schema)`);
  } else {
    warnings.push('Schema: Missing or insufficient qa frontmatter entries (needed for FAQ schema markup)');
  }

  // 6. Schema frontmatter present
  const hasSchema = /^schema:/m.test(content);
  if (hasSchema) {
    scorePoints++;
  } else {
    warnings.push('Schema: Missing schema field in frontmatter (needed for BlogPosting JSON-LD)');
  }

  // 7. Direct-answer check: first paragraph after headings should not start with filler
  const fillerStarts = [
    'in today\'s', 'when it comes to', 'it\'s no secret', 'in the ever',
    'in an era', 'in this article', 'as we all know', 'it goes without saying',
    'there\'s no denying', 'in recent years', 'in the world of',
  ];
  const headingFollowPattern = /<h[23][^>]*>[^<]*<\/h[23]>\s*<p>([^<]{0,80})/gi;
  let headingMatch;
  let fillerCount = 0;
  let headingCount = 0;
  while ((headingMatch = headingFollowPattern.exec(body)) !== null) {
    headingCount++;
    const firstWords = headingMatch[1].toLowerCase().trim();
    if (fillerStarts.some((f) => firstWords.startsWith(f))) {
      fillerCount++;
    }
  }
  if (headingCount > 0 && fillerCount === 0) {
    scorePoints++;
  } else if (fillerCount > 0) {
    warnings.push(`GEO: ${fillerCount} section(s) start with filler phrases instead of direct answers (hurts passage citability)`);
  } else {
    // Can't detect (maybe markdown format) — give partial credit
    scorePoints += 0.5;
  }

  const score = Math.round((scorePoints / maxPoints) * 100);

  return { errors, warnings, score };
}
