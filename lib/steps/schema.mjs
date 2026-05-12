/**
 * schema.mjs — JSON-LD schema embedding step wrapper.
 */

import { embedSchemaMarkup } from '../schema-embedder.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/**
 * Embed JSON-LD schema markup into post content.
 *
 * @param {object} state - Pipeline state
 * @param {object} config - Autoblog config
 * @param {object} _options - { dryRun, apiKey, additionalSlugs }
 * @returns {Promise<object>} Updated state with schema markup
 */
export async function schemaStep(state, config, _options) {
  if (!config.steps.embedSchema) {
    return state;
  }

  if (config.steps.embedSchema === 'frontmatter-only') {
    log('Schema: frontmatter-only mode (site layout handles JSON-LD)');
    return state;
  }

  if (!config.output?.siteUrl) {
    return state;
  }

  try {
    const content = embedSchemaMarkup(state.content, config);
    log('Schema markup embedded (BlogPosting + FAQPage)');
    return { ...state, content };
  } catch (err) {
    log(`  Warning: Schema embedding failed (${err.message}).`);
    return state;
  }
}
