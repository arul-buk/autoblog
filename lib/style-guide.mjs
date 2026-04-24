/**
 * style-guide.mjs
 * Resolves style guide content from config.
 * Supports inline text and external file paths for both
 * brand voice rules and reference blog posts.
 *
 * File fields take precedence over inline fields.
 * Missing files log a warning and fall back to inline or null.
 */

import fs from 'fs';
import path from 'path';

/**
 * Resolve a single field: file path takes precedence over inline.
 * @param {string|null} filePath
 * @param {string|null} inline
 * @param {string} fieldName - for warning messages
 * @returns {string|null}
 */
function resolveField(filePath, inline, fieldName) {
  if (filePath) {
    const resolved = path.resolve(process.cwd(), filePath);
    try {
      const content = fs.readFileSync(resolved, 'utf-8').trim();
      if (inline) {
        console.log(`  [style-guide] Both ${fieldName} and inline value set — using file`);
      }
      return content;
    } catch (err) {
      console.log(`  [style-guide] Warning: Could not read ${fieldName} at ${resolved}: ${err.message}`);
    }
  }
  return inline ?? null;
}

/**
 * Resolve style guide content from config.
 *
 * @param {object} config - Full autoblog config
 * @returns {{ voice: string|null, referencePost: string|null }}
 */
export function resolveStyleGuide(config) {
  const sg = config.product?.styleGuide;
  if (!sg) return { voice: null, referencePost: null };

  const voice = resolveField(sg.voiceFile, sg.voice, 'voiceFile');
  const referencePost = resolveField(sg.referencePostFile, sg.referencePost, 'referencePostFile');

  return { voice, referencePost };
}
