/**
 * Step: Content Repurposing
 * Converts the generated blog post into distribution formats
 * (Twitter threads, LinkedIn posts, newsletter snippets).
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { repurposeContent } from '../repurposer.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export async function repurposeStep(state, config, options) {
  if (!config.repurpose?.enabled) {
    return state;
  }

  if (!state.content) {
    log('Repurpose: skipped (no content to repurpose)');
    return state;
  }

  if (options.dryRun) {
    log('Repurpose: skipped (dry run)');
    return state;
  }

  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    log('Warning: Repurpose skipped (no Gemini API key)');
    return state;
  }

  try {
    const metadata = {
      title: state.selectedTopic?.title || state.title || 'Untitled',
      slug: state.slug || 'untitled',
    };

    log(`Repurposing content into ${(config.repurpose.formats || []).length} format(s)...`);
    const results = await repurposeContent(apiKey, config, state.content, metadata);

    if (results.size === 0) {
      log('Repurpose: no formats generated');
      return state;
    }

    // Track cost estimate per repurposed format
    if (options.costTracker) {
      for (const [format, text] of results) {
        const outputEstimate = Math.round(text.length / 4);
        options.costTracker.addGemini('repurpose', { promptTokenCount: 1000, candidatesTokenCount: outputEstimate, totalTokenCount: 1000 + outputEstimate }, config.models?.text || 'gemini-3-flash-preview');
      }
    }

    // Save each format to disk
    const outputDir = config.repurpose?.outputDir || 'repurposed';
    const slugDir = join(outputDir, metadata.slug);
    await mkdir(slugDir, { recursive: true });

    const paths = {};
    for (const [format, text] of results) {
      const filePath = join(slugDir, `${format}.md`);
      await writeFile(filePath, text, 'utf-8');
      paths[format] = filePath;
    }

    log(`Repurposed into ${results.size} format(s), saved to ${slugDir}/`);

    return {
      ...state,
      repurposedContent: {
        formats: Array.from(results.keys()),
        paths,
      },
    };
  } catch (err) {
    log(`Warning: Content repurposing failed: ${err.message}`);
    return state;
  }
}
