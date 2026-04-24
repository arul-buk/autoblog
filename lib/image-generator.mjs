/**
 * image-generator.mjs
 * Generates blog cover images via Gemini's image generation API.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Build image generation prompt using product context.
 */
function buildImagePrompt(topicTitle, config) {
  const domain = config.product?.description || 'technology';
  return (
    `Blog cover image for a ${domain} article about ${topicTitle}. ` +
    'Conceptual illustration with gradient background, clean minimalist digital art style, ' +
    'no text overlays, no watermarks. Professional blog header illustration. 16:9 aspect ratio.'
  );
}

/**
 * Extract first base64 image from Gemini response.
 */
function extractImageData(result) {
  const candidates = result.response.candidates ?? [];

  for (const candidate of candidates) {
    const parts = candidate.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        return {
          data: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/png',
        };
      }
    }
  }

  throw new Error(
    'Gemini image generation returned no inline image data. ' +
    'Check that the model supports image output and that responseModalities includes "IMAGE".'
  );
}

/**
 * Generate a blog cover image and save to disk.
 *
 * @param {string} geminiApiKey
 * @param {object} config - Full autoblog config
 * @param {object} topic - Topic object with title
 * @param {string} slug - Post slug for filename
 * @param {string} outputDir - Directory to save the image
 * @returns {Promise<string>} - Path to saved image
 */
export async function generateCoverImage(geminiApiKey, config, topic, slug, outputDir) {
  const genAI = new GoogleGenerativeAI(geminiApiKey);

  const model = genAI.getGenerativeModel({
    model: config.models.image,
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  });

  const prompt = buildImagePrompt(topic.title || String(topic), config);

  let result;
  try {
    result = await model.generateContent(prompt);
  } catch (err) {
    throw new Error(`Image generation failed for "${slug}": ${err.message}`);
  }

  const { data: base64Data } = extractImageData(result);

  mkdirSync(outputDir, { recursive: true });

  const filename = `${slug}.png`;
  const outputPath = join(outputDir, filename);

  writeFileSync(outputPath, Buffer.from(base64Data, 'base64'));

  console.log(`  Image saved: ${outputPath}`);
  return outputPath;
}
