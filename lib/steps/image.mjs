/**
 * image.mjs — Cover image generation step wrapper.
 */

import path from 'path';
import { generateCoverImage } from '../image-generator.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/**
 * Generate a cover image for the blog post.
 *
 * @param {object} state - Pipeline state
 * @param {object} config - Autoblog config
 * @param {object} options - { dryRun, apiKey, additionalSlugs }
 * @returns {Promise<object>} Updated state with imagePath
 */
export async function imageStep(state, config, options) {
  const { dryRun, apiKey } = options;

  if (!config.steps.image) {
    return state;
  }

  log('Generating cover image...');

  const imagesDir = path.resolve(process.cwd(), config.output.imagesDir);

  if (dryRun) {
    log('  Skipped (dry-run mode)');
    const imagePath = path.join(imagesDir, `${state.slug}.png`);
    return { ...state, imagePath };
  }

  try {
    const imagePath = await generateCoverImage(apiKey, config, state.selectedTopic, state.slug, imagesDir);
    log(`  Saved: ${imagePath}`);
    return { ...state, imagePath };
  } catch (err) {
    log(`  Warning: Image generation failed (${err.message}). Post will use placeholder.`);
    return { ...state, imagePath: null };
  }
}
