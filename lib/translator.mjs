/**
 * translator.mjs
 * Translates blog posts to multiple languages via Gemini.
 * Languages and brand names come from config.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry } from './retry.mjs';

const LANGUAGE_NAMES = {
  es: 'Spanish',
  pt: 'Portuguese',
  fr: 'French',
  de: 'German',
  zh: 'Chinese (Simplified)',
  ja: 'Japanese',
  ko: 'Korean',
  it: 'Italian',
  nl: 'Dutch',
  ar: 'Arabic',
  hi: 'Hindi',
  ru: 'Russian',
  tr: 'Turkish',
  pl: 'Polish',
  sv: 'Swedish',
  th: 'Thai',
  vi: 'Vietnamese',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildTranslationPrompt(englishContent, targetLanguage, brandNames) {
  const brandList = (brandNames || []).join(', ') || 'product names';

  return `Translate this blog post from English to ${targetLanguage}.

CRITICAL INSTRUCTIONS:
1. Keep ALL brand names in English: ${brandList}
2. Keep ALL URLs unchanged
3. Keep ALL image paths unchanged
4. Preserve ALL markdown and HTML formatting exactly
5. Translate all text content naturally and professionally
6. Keep technical terms consistent
7. Maintain the same tone and marketing style

FRONTMATTER FIELDS TO TRANSLATE:
- title, excerpt, coverImageAlt
- tags (translate descriptive words, keep brand names)
- seoKeywords (translate but keep brand names)
- qa: question and answer fields
- midArticleCTA: title and description

FRONTMATTER FIELDS TO KEEP AS-IS:
- date, lastModified, lastUpdated
- coverImage, authorImage
- author, authorRole
- category, readingTime
- featured, relatedPosts
- All URLs and links

Here's the English post to translate:

${englishContent}

Return ONLY the complete translated markdown file, preserving all formatting.`;
}

/**
 * Translate a blog post into configured languages.
 * Supports partial success — if some translations fail, returns successful ones.
 *
 * @param {string} geminiApiKey
 * @param {object} config - Full autoblog config
 * @param {string} englishContent - Full content of the English post
 * @param {string} slug - Post slug (for logging)
 * @returns {Promise<{ translations: Map<string, string>, errors: Array }>}
 */
export async function translatePost(geminiApiKey, config, englishContent, slug) {
  const languages = config.translation?.languages || [];
  const rateLimitMs = config.translation?.rateLimitMs || 1000;
  const brandNames = config.product?.brandNames || [];

  if (languages.length === 0) {
    return { translations: new Map(), errors: [] };
  }

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: config.models.text });

  const translations = new Map();
  const errors = [];

  for (let i = 0; i < languages.length; i++) {
    const langCode = languages[i];
    const langName = LANGUAGE_NAMES[langCode] || langCode;

    console.log(`  Translating "${slug}" to ${langName} (${langCode})...`);

    try {
      const prompt = buildTranslationPrompt(englishContent, langName, brandNames);

      const result = await withRetry(
        () => model.generateContent(prompt),
        { ...config.retry, label: `translate-${langCode}` }
      );

      let translated = result.response.text().trim();

      // Strip code fences
      if (translated.startsWith('```')) {
        translated = translated.replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```$/, '').trim();
      }

      // Ensure frontmatter
      if (!translated.startsWith('---')) {
        translated = '---\n' + translated;
      }
      if (!translated.match(/\n---\n/)) {
        throw new Error(`Translation to ${langName} missing closing frontmatter delimiter`);
      }

      translations.set(langCode, translated);
      console.log(`  Done: ${langCode}`);
    } catch (err) {
      console.log(`  Warning: Translation to ${langName} (${langCode}) failed: ${err.message}`);
      errors.push({ langCode, langName, error: err.message });
    }

    // Rate limit between requests
    if (i < languages.length - 1) {
      await sleep(rateLimitMs);
    }
  }

  return { translations, errors };
}
