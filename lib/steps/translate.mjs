/**
 * translate.mjs — Multi-language translation step wrapper.
 */

import { translatePost } from '../translator.mjs';
import { validatePost } from '../validator.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/**
 * Translate post content to configured languages and optionally validate translations.
 *
 * @param {object} state - Pipeline state
 * @param {object} config - Autoblog config
 * @param {object} options - { dryRun, apiKey, additionalSlugs }
 * @returns {Promise<object>} Updated state with translations and translationErrors
 */
export async function translateStep(state, config, options) {
  const { apiKey } = options;

  if (!config.steps.translate || !config.translation?.enabled) {
    return { ...state, translations: new Map(), translationErrors: [] };
  }

  log(`Translating to ${config.translation.languages.length} languages...`);

  const result = await translatePost(apiKey, config, state.content, state.slug);
  const { translations, errors: translationErrors } = result;

  log(`  Translated to ${translations.size} language(s)`);
  if (translationErrors.length > 0) {
    log(`  Translation failures: ${translationErrors.map((e) => e.langCode).join(', ')}`);
  }

  // Validate translations if validation step is enabled
  if (config.steps.validate && translations.size > 0) {
    const transValidation = validatePost(state.content, config, { translations });
    if (transValidation.warnings.length > 0) {
      log(`  Translation warnings: ${transValidation.warnings.join('; ')}`);
    }
  }

  return { ...state, translations, translationErrors };
}
