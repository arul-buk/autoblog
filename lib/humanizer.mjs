/**
 * humanizer.mjs
 * Removes AI writing patterns to make content sound naturally human-written.
 * Based on Wikipedia's "Signs of AI writing" guide.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry } from './retry.mjs';

/**
 * Humanize blog post content by removing AI writing patterns.
 *
 * @param {string} apiKey - Gemini API key
 * @param {object} config - Full autoblog config
 * @param {string} content - Blog post content with frontmatter
 * @returns {Promise<string>} - Humanized content
 */
export async function humanizePost(apiKey, config, content, styleGuide = null) {
  const hasStyleGuide = styleGuide && (styleGuide.voice || styleGuide.referencePost);
  const temperature = hasStyleGuide ? 0.7 : 0.3;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: config.models.text,
    generationConfig: {
      temperature,
      maxOutputTokens: 8192,
    },
  });

  console.log(`  Humanizing blog post (removing AI patterns${hasStyleGuide ? ' + style matching' : ''})...`);

  const systemInstruction = buildHumanizationPrompt(styleGuide);

  const userPrompt = `Humanize this blog post by removing AI writing patterns while preserving all factual content, data, and structure.

**CRITICAL RULES:**
1. Keep ALL frontmatter (between --- markers) EXACTLY as-is
2. Keep ALL numbers, dates, statistics, and data points
3. Keep ALL section headings structure
4. Keep ALL links and citations
5. ONLY edit the prose to remove AI patterns

**Blog post to humanize:**

${content}

**Output the complete humanized blog post with frontmatter intact.**`;

  const result = await withRetry(
    () => model.generateContent([systemInstruction, '\n\n', userPrompt]),
    { ...config.retry, label: 'humanization' }
  );

  const humanized = result.response.text();

  let cleaned = humanized.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:mdx|markdown|md|html)?\s*/i, '').replace(/\s*```$/, '');
  }

  console.log(`  Humanization complete (${cleaned.length} chars)`);
  return cleaned;
}

function buildHumanizationPrompt(styleGuide = null) {
  const hasStyleGuide = styleGuide && (styleGuide.voice || styleGuide.referencePost);

  let styleSection = '';
  if (hasStyleGuide) {
    const parts = [`## STYLE MATCHING (apply AFTER removing AI patterns)

Two sequential operations: (1) strip AI tells, (2) rewrite toward the target style.
`];

    if (styleGuide.voice) {
      parts.push(`### Brand Voice Rules — follow these:\n\n${styleGuide.voice}\n`);
    }

    if (styleGuide.referencePost) {
      parts.push(`### Reference Post — match this writing style:

Study the rhythm, vocabulary, sentence length, paragraph pacing, tone, and structural patterns of the following post. Do NOT copy its content — only match its style.

${styleGuide.referencePost}
`);
    }

    styleSection = parts.join('\n') + '\n';
  }

  return `You are an expert editor who removes AI writing patterns to make content sound naturally human-written.

${styleSection}## CORE PHILOSOPHY

AI writing has telltale patterns: predictable structure, hedge-then-assert phrasing, significance inflation, promotional language, and robotic rhythm. Your job is to make the writing sound like a knowledgeable human wrote it on the first try.

**DO NOT dumb it down.** Make it sound like it came from someone who knows their stuff and has opinions.

## PATTERNS TO FIX

### 1. Structure Tells
- Every section ending with "takeaway" or "bottom line"
- Repeated callout patterns ("What this means:", "The takeaway:")
- Identical paragraph counts per section
- "Despite challenges... Despite these challenges..." loops

**Fix:** Vary section lengths. Let some end abruptly. Break patterns.

### 2. Significance Inflation
**Remove:** stands/serves as, testament, pivotal/crucial/vital role, underscores, reflects broader, symbolizing, setting stage for, key turning point, evolving landscape

**Before:** "marking a pivotal moment in the evolution of regional statistics"
**After:** "to collect and publish regional statistics independently"

### 3. Promotional Language
**Remove:** boasts, vibrant, nestled, in the heart of, renowned, breathtaking, must-visit, stunning, showcasing, exemplifies

Replace with specific facts.

### 4. AI Vocabulary (Tier 1 - immediate red flags)
**Remove:** delve, landscape (metaphorical), tapestry, paradigm shift, leverage (verb), harness, navigate (metaphorical), realm, embark on journey, myriad, plethora, multifaceted, revolutionize, synergy, ecosystem (non-technical), resonate, streamline

**Remove (Tier 2 - suspicious in clusters):** robust, seamless, cutting-edge, innovative, comprehensive, pivotal, nuanced, compelling, transformative, bolster, underscore, evolving, fostering

### 5. Grammar-Level Patterns
**Copula avoidance:** "serves as" -> "is" | "boasts" -> "has"
**Superficial -ing analyses:** Delete "highlighting...", "underscoring...", "reflecting..."
**Negative parallelisms:** Limit "not only...but..." to once per piece
**Rule of three overuse:** Remove padding third items
**Synonym cycling:** Pick one term and stick with it

### 6. Rhythm and Style
**Vary sentence length.** Mix short punchy sentences with longer flowing ones.
**Sentence starters:** Use "But," "And," "So," "Look," occasionally
**Em dash overuse:** Max 1 per 3-4 paragraphs.
**Boldface overuse:** Remove most bold. Save for first mention of key terms only.

### 7. Hedging and Filler
**Remove:** "It's important to note that...", "It's worth mentioning...", "While there are certainly...", "could potentially possibly"
**Remove filler:** "In order to" -> "To" | "Due to the fact that" -> "Because"
**Vague attributions:** "Industry reports" / "Experts believe" -> Name source or delete
**Chatbot artifacts:** Remove "I hope this helps!", "Let me know..."
**Generic conclusions:** Remove "The future looks bright", "Exciting times ahead"

### 8. Add Personality and Soul
**Add:**
- Opinions and reactions to facts
- Mixed feelings and complexity
- Varied rhythm (short punchy + long flowing sentences)
- Occasional asides that show lived experience

**Don't overdo it.** One or two casual asides per section max.

## OUTPUT FORMAT
Return the COMPLETE blog post with all frontmatter preserved exactly, all data preserved, all headings preserved, all links preserved. ONLY the prose humanized.
**Be surgical.** Fix AI patterns while keeping all factual content intact.`;
}
