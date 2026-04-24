/**
 * prompts.mjs
 * All Gemini prompt builder functions consolidated in one file.
 *
 * Every prompt sent to the LLM lives here so they can be reviewed,
 * compared, and updated without hunting through multiple modules.
 *
 * Each function takes a destructured object and returns a string.
 * No imports from other lib files — pure functions only.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. TOPIC RESEARCH — Gemini + Google Search grounding
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the research prompt from config-driven clusters and contexts.
 *
 * Used by: topics.mjs
 * Model: config.models.text (with Google Search grounding)
 */
export function buildResearchPrompt({ expandedQueries, config, regionalContexts }) {
  const today = new Date().toISOString().slice(0, 10);
  const recencyDays = config.topics?.recencyDays || 7;
  const sinceDate = new Date(Date.now() - recencyDays * 86400000).toISOString().slice(0, 10);
  const productName = config.product.name;
  const productDesc = config.product.description;

  const regionLines = (regionalContexts || [])
    .map((r) => `- ${r.region}: ${r.focus}`)
    .join('\n');

  const categoryNames = (config.topics?.clusters || []).map((c) => c.name).join(' | ');

  return `You are a content strategist for ${productName}, ${productDesc}.
Today is ${today}.

TASK: Search for the most recent and trending news, social media discussions, and developments relevant to ${productName}'s domain. Focus HEAVILY on content from the last ${recencyDays} days (since ${sinceDate}).

SEARCH THESE TOPICS:
${expandedQueries.map((q, i) => `${i + 1}. ${q}`).join('\n')}

ALSO SEARCH social media for relevant discussions:
- Twitter/X posts and threads about the topics above
- Reddit discussions in relevant subreddits
- News articles from the last ${recencyDays} days

${regionLines ? `ALSO SEARCH these regional perspectives:\n${regionLines}` : ''}

For each article idea, return a JSON array with objects in this format:
{
  "title": "Specific, compelling article title (under 70 chars, SEO-optimized)",
  "summary": "2-3 sentence summary of what the article covers and why it matters NOW",
  "category": "One of: ${categoryNames}",
  "relevanceScore": 0.0-1.0 (1.0 = breaking news this week, 0.5 = trending this month, 0.2 = evergreen),
  "region": "Country or region this is most relevant to, or 'Global'",
  "sources": ["source URLs or publication names found via search"],
  "searchIntent": "informational | commercial | navigational"
}

PRIORITIZE:
1. Breaking news from the last ${recencyDays} days (score 0.8-1.0)
2. Trending social media discussions happening RIGHT NOW (score 0.7-0.9)
3. Recent regulatory changes or enforcement actions (score 0.6-0.8)
4. Long-tail topics with high search intent that no one has written about yet (score 0.5-0.7)
5. Country-specific angles with high search potential (score 0.5-0.7)

AVOID:
- Generic "how to" topics (already well covered)
- Pure product reviews without a news hook
- Topics that haven't changed in the last 3 months

Return 10-15 topic ideas as a valid JSON array. No markdown code fences, no extra text.`;
}


// ═══════════════════════════════════════════════════════════════════════════
// 2. SEMANTIC DEDUPLICATION — detect topical overlap
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the deduplication prompt.
 *
 * Used by: deduper.mjs
 * Model: config.models.text
 */
export function buildDedupePrompt({ productName, existingPostsList, candidateList, existingPostCount }) {
  return `You are a content deduplication expert for ${productName}'s blog.

EXISTING BLOG POSTS (${existingPostCount} posts):
${existingPostsList}

CANDIDATE NEW TOPICS:
${candidateList}

TASK: For each candidate, determine if the TOPIC/SUBJECT MATTER is already covered by an existing post. Two posts are duplicates if they cover the SAME core subject even if the titles use completely different words.

Examples of duplicates:
- "Company X Fined $375M in Safety Lawsuit" and "Juries Slam Company X in Landmark Case" = SAME TOPIC
- "Brazil's New Social Media Law" and "Social Media Age Verification in Brazil" = SAME TOPIC

Examples of NOT duplicates:
- "YouTube Restricted Mode Fails" and "YouTube Shorts Addiction" = DIFFERENT TOPICS
- "Australia Under-16 Ban" and "UK Online Safety Act" = DIFFERENT TOPICS (different countries)

Return a JSON array with one object per candidate:
[
  { "index": 1, "title": "...", "isDuplicate": true/false, "reason": "short explanation", "matchedSlug": "slug-of-matching-post or null" }
]

Return ONLY the JSON array. No markdown fences.`;
}


// ═══════════════════════════════════════════════════════════════════════════
// 3. KEYWORD STRATEGY — intelligent seed extraction for DataForSEO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the keyword strategy prompt. Replaces naive title-word extraction
 * with a Gemini-powered analysis of topic + existing content gaps.
 *
 * Used by: keyword-research.mjs (getIntelligentSeeds)
 * Model: config.models.text
 */
export function buildKeywordStrategyPrompt({ topic, existingPostMeta, config }) {
  const productName = config.product.name;
  const productDesc = config.product.description;
  const maxDifficulty = config.seo?.maxDifficulty || 60;
  const minSearchVolume = config.seo?.minSearchVolume || 100;
  const location = config.seo?.location || 2840;

  const existingList = (existingPostMeta || [])
    .map((m) => `- "${m.title}" — keywords: ${(m.keywords || []).slice(0, 5).join(', ')}`)
    .join('\n');

  const sourcesBlock = topic.sources?.length
    ? `Sources found during research:\n${topic.sources.map((s) => `- ${s}`).join('\n')}`
    : '';

  return `You are an SEO keyword strategist for ${productName}, ${productDesc}.

TASK: Analyze the topic below and determine the best seed keywords to research in a keyword research tool (DataForSEO). Your goal is to find keywords that:
1. Have real search volume (people actually search for these)
2. Are achievable (not too competitive for a growing blog)
3. Fill gaps in the existing blog content
4. Align with the topic's angle and search intent

TOPIC TO WRITE ABOUT:
Title: "${topic.title}"
Summary: ${topic.summary}
Category: ${topic.category}
Search Intent: ${topic.searchIntent || 'informational'}
${sourcesBlock}

EXISTING BLOG COVERAGE (${(existingPostMeta || []).length} posts):
${existingList || '(no existing posts yet)'}

CONSTRAINTS:
- Target keyword difficulty: under ${maxDifficulty}/100
- Minimum search volume: ${minSearchVolume}/month
- Location: ${location} market

Return a JSON object (no markdown fences):
{
  "primarySeedKeywords": ["3-5 specific keyword phrases to research volumes for"],
  "questionKeywords": ["2-3 question-format keywords for FAQ section"],
  "gapAnalysis": "One sentence explaining what keyword gap this post fills vs existing content",
  "avoidKeywords": ["keywords the blog already ranks for — don't cannibalize"]
}

GUIDELINES:
- Primary seeds should be 2-4 word phrases, not single words
- Include at least one long-tail keyword (4+ words)
- Question keywords must start with how/what/why/can/should/is
- Check existing post keywords — if a keyword is already well covered, put it in avoidKeywords
- Think about what a parent/user would actually type into Google, not marketing jargon`;
}


// ═══════════════════════════════════════════════════════════════════════════
// 4. BLOG POST WRITER — full post generation with GEO/AEO compliance
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build style guide block inserted into the writer and humanizer prompts.
 *
 * Used by: buildWriterPrompt (internal), humanizer.mjs
 * Returns empty string when no style guide is configured.
 */
export function buildStyleGuideBlock(styleGuide) {
  if (!styleGuide || (!styleGuide.voice && !styleGuide.referencePost)) return '';

  const parts = ['\n═══ STYLE GUIDE ═══\n'];

  if (styleGuide.voice) {
    parts.push(`BRAND VOICE RULES:\n${styleGuide.voice}\n`);
  }

  if (styleGuide.referencePost) {
    parts.push(`REFERENCE POST — match the rhythm, vocabulary, sentence length, paragraph pacing, and structural style of this post:\n\n${styleGuide.referencePost}\n\nDo NOT copy content from the reference post. Only match its writing style.\n`);
  }

  return parts.join('\n');
}

/**
 * Build the writer prompt from config.
 *
 * Used by: writer.mjs
 * Model: config.models.text
 */
export function buildWriterPrompt({ topic, slug, author, today, relatedPosts, config, keywordData, writerNotes, styleGuide }) {
  const { product, output } = config;
  const relatedList = relatedPosts.length
    ? relatedPosts.map((s) => `"${s}"`).join(', ')
    : '(none available)';

  // Build features section
  const featuresBlock = (product.features || [])
    .map((f) => `- ${f}`)
    .join('\n');

  // Build CTA markers section
  const ctaMarkersBlock = (output.ctaMarkers || []).length > 0
    ? `\nCTA PLACEMENT MARKERS — Insert these HTML comment markers between sections:\n${output.ctaMarkers.map((m, i) => `- <!-- ${m} --> (marker ${i + 1})`).join('\n')}\n\nRules:\n- Each marker goes on its own line BETWEEN two sections\n- Never place markers inside a <section> tag\n- Never place two markers next to each other\n- All ${output.ctaMarkers.length} markers are required`
    : '';

  // Build keyword guidance from DataForSEO data
  let keywordBlock = '';
  if (keywordData && !keywordData.skip) {
    const primary = keywordData.primaryKeyword;
    const secondaries = keywordData.secondaryKeywords || [];
    const questions = keywordData.questions || [];
    const competitors = keywordData.competitorAngles || [];

    keywordBlock = `\nSEO KEYWORD DATA (from search volume analysis — use these to guide content):
Primary keyword: "${primary.keyword}" (${primary.volume !== null ? `${primary.volume} monthly searches, difficulty ${primary.difficulty}/100` : 'volume data unavailable'})
Secondary keywords to weave in naturally:
${secondaries.map((k) => `- "${k.keyword}" (${k.volume !== null ? `${k.volume}/mo` : 'suggested'})`).join('\n')}

${questions.length > 0 ? `Real questions people search for (use in FAQ section):\n${questions.map((q) => `- ${q}`).join('\n')}\n` : ''}
${competitors.length > 0 ? `Top competing articles (cover what they miss):\n${competitors.map((c) => `- "${c.title}"`).join('\n')}\n` : ''}`;
  }

  // Build frontmatter schema
  const requiredFields = output.frontmatterSchema?.required || ['title', 'date', 'excerpt', 'coverImage', 'author', 'category', 'tags', 'seoKeywords'];
  const optionalFields = output.frontmatterSchema?.optional || [];

  // Build body format instruction
  const formatInstruction = output.bodyFormat === 'markdown'
    ? 'Use MARKDOWN formatting (## headings, **bold**, - bullets).'
    : output.bodyFormat === 'mdx'
      ? 'Use MDX formatting (## headings, **bold**, JSX components allowed).'
      : 'Use HTML tags — NOT markdown. Wrap in <article class="blog-content"> with <section>, <h2>, <p>, <ul>/<li> elements.';

  return `You are a senior content writer for ${product.name} (${product.url}), ${product.description}.

Write a COMPLETE blog post markdown file for the following topic. The output must be a single, self-contained markdown document with YAML frontmatter followed by the body.

TOPIC: ${topic.title}
TOPIC SUMMARY: ${topic.summary}
CATEGORY: ${topic.category}
SLUG: ${slug}
AUTHOR: ${author.name}
AUTHOR ROLE: ${author.role || ''}
AUTHOR IMAGE: ${author.image || ''}
TODAY'S DATE: ${today}
RELATED POST SLUGS AVAILABLE: ${relatedList}
${keywordBlock}
---

OUTPUT FORMAT — produce YAML frontmatter with these fields:
Required: ${requiredFields.join(', ')}
Optional: ${optionalFields.join(', ')}

Use this frontmatter template:
\`\`\`
---
title: "<compelling SEO title, max 70 chars>"
date: "${today}"
lastModified: "${today}"
excerpt: "<2-sentence meta description, 140-160 chars>"
coverImage: "/images/blog/${slug}.png"
coverImageAlt: "<descriptive alt text>"
author: "${author.name}"
authorRole: "${author.role || ''}"
authorImage: "${author.image || ''}"
category: "${topic.category}"
tags:
  - <tag1>
  - <tag2>
  - <tag3>
  - <tag4>
  - <tag5>
featured: false
relatedPosts:
${relatedPosts.length > 0 ? relatedPosts.map((s) => `  - ${s}`).join('\n') : '  []'}
seoKeywords: "<comma-separated keywords, e.g. keyword1, keyword2, keyword3>"
ctaType: <awareness|comparison|how_to>
schema:
  type: "BlogPosting"
  headline: "<same as title>"
  description: "<same as excerpt>"
  wordCount: <approximate word count>
  keywords: "<comma-separated primary keywords>"
qa:
  - question: "<real question people search for>"
    answer: "<complete 2-3 sentence answer, self-contained>"
  - question: "<question 2>"
    answer: "<answer 2>"
  - question: "<question 3>"
    answer: "<answer 3>"
  - question: "<question 4>"
    answer: "<answer 4>"
  - question: "<question 5>"
    answer: "<answer 5>"
midArticleCTA:
  title: "<short CTA headline>"
  description: "<one sentence value proposition>"
  primaryText: "${product.cta?.text || 'Get Started Free'}"
---
\`\`\`

BODY FORMAT:
${formatInstruction}

PRODUCT CONTEXT — weave these points naturally where relevant:

${product.name} — ${product.description}

Key features:
${featuresBlock || '(no features specified in config)'}

${product.cta ? `CTA: ${product.cta.text} → ${product.cta.url}` : ''}

TONE: ${product.tone || 'Helpful and educational, not salesy.'}
${buildStyleGuideBlock(styleGuide)}${ctaMarkersBlock}
${writerNotes ? `\nADDITIONAL GUIDANCE:\n${writerNotes}` : ''}

WRITING GUIDELINES:
- Total body length: ${output.wordCount?.min || 1000}-${output.wordCount?.max || 1500} words
- 5-7 sections with clear headings
- Include product mentions in at least 3 sections with specific feature relevance
- Cross-link to related posts where relevant
- Write for the target audience — plain language, empathetic tone
- Back up claims with statistics or research where relevant

═══ GEO / AEO / SCHEMA COMPLIANCE (MANDATORY) ═══

These rules ensure the post ranks in traditional search AND gets cited by AI search engines (Google AI Overviews, ChatGPT, Perplexity, Bing Copilot).

1. TL;DR SECTION (REQUIRED)
   - FIRST section of the body, immediately after frontmatter
   - 2-3 sentences maximum, written as a standalone answer
   - Must be self-contained — an AI should be able to quote this block as a complete answer
   - Bold the single most important takeaway
   - ${output.bodyFormat === 'html' ? 'Wrap in <section class="tldr-section"><p><strong>TL;DR:</strong> ...text...</p></section>' : 'Start with **TL;DR:** on its own line'}

2. KEY TAKEAWAYS SECTION (REQUIRED)
   - Place immediately after TL;DR, before the main content sections
   - 4-6 bullet points, each one a complete, citable statement
   - Each bullet should answer one specific question a reader might have
   - ${output.bodyFormat === 'html' ? 'Wrap in <section class="key-takeaways"><h2>Key Takeaways</h2><ul><li>...</li></ul></section>' : 'Use ## Key Takeaways heading with bullet list'}

3. DIRECT-ANSWER PARAGRAPHS (passage-level citability)
   - Start each section with a 1-2 sentence direct answer BEFORE elaborating
   - These opening sentences must be self-contained — quotable on their own
   - Pattern: [Direct answer] → [Evidence/data] → [Nuance/context]
   - Example: "YouTube Restricted Mode fails to block 27% of violent content. A 2025 Stanford study tested 5,000 flagged videos and found..."
   - NEVER start a section with vague setup ("In today's world...", "When it comes to...")

4. QUESTION-BASED HEADINGS (AEO)
   - At least 3 of your section headings MUST be phrased as questions
   - Use natural "What/How/Why/Can/Should/Is" question formats
   - Match real search queries — use DataForSEO questions if provided
   - Example headings: "How Does YouTube Restricted Mode Actually Work?", "Can Kids Bypass Parental Controls?", "What Should Parents Do Instead?"
   - The first paragraph after each question heading must DIRECTLY answer the question

5. FAQ SECTION (REQUIRED — for FAQ schema and AI extraction)
   - Use the qa frontmatter data to write a dedicated FAQ section near the end
   - Each Q must be a real question people search for (use DataForSEO questions when available)
   - Each A must be a complete, self-contained answer in 2-3 sentences
   - ${output.bodyFormat === 'html' ? 'Format as: <section class="faq-section"><h2>Frequently Asked Questions</h2> then <h3>Question?</h3><p>Answer.</p> for each pair' : 'Format as: ## Frequently Asked Questions then ### Question? followed by answer paragraph'}
   - Answers must NOT reference other parts of the article ("as mentioned above")

6. ENTITY DEFINITIONS
   - When introducing a product, regulation, or technical concept for the first time, give a clear 1-sentence definition
   - Pattern: "[Entity] is [definition]. [Context/relevance]."
   - Example: "COPPA is the Children's Online Privacy Protection Act, a US federal law requiring parental consent before collecting data from children under 13. It directly affects how YouTube handles kids' accounts."

7. STATISTICAL CLAIMS
   - Every statistic must include its source inline: "[Stat] according to [Source] ([Year])"
   - Never use vague attribution ("studies show", "experts say", "research indicates")
   - If no real source exists, frame as product data or omit the claim
   - AI search engines penalize unattributed statistics

8. SCHEMA-READY FRONTMATTER
   - The qa field must contain 4-6 real Q&A pairs (these power FAQ schema)
   - Each answer must be a complete sentence, not a fragment
   - The excerpt must answer the article's core question in 1-2 sentences
   - The title must include the primary keyword naturally

Return ONLY the raw file (frontmatter + body). No extra commentary, no wrapping code fences.`;
}


// ═══════════════════════════════════════════════════════════════════════════
// 5. HUMANIZATION — AI pattern removal + optional style matching
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the humanization system instruction.
 *
 * Used by: humanizer.mjs (as system instruction)
 * Model: config.models.text
 * Temperature: 0.3 without style guide, 0.7 with style guide
 */
export function buildHumanizationPrompt(styleGuide = null) {
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

/**
 * Build the humanization user prompt (the content to humanize).
 *
 * Used by: humanizer.mjs (as user message, paired with system instruction)
 */
export function buildHumanizationUserPrompt(content) {
  return `Humanize this blog post by removing AI writing patterns while preserving all factual content, data, and structure.

**CRITICAL RULES:**
1. Keep ALL frontmatter (between --- markers) EXACTLY as-is
2. Keep ALL numbers, dates, statistics, and data points
3. Keep ALL section headings structure
4. Keep ALL links and citations
5. ONLY edit the prose to remove AI patterns

**Blog post to humanize:**

${content}

**Output the complete humanized blog post with frontmatter intact.**`;
}


// ═══════════════════════════════════════════════════════════════════════════
// 6. TRANSLATION — multi-language with brand name preservation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the translation prompt.
 *
 * Used by: translator.mjs (called once per language)
 * Model: config.models.text
 */
export function buildTranslationPrompt({ englishContent, targetLanguage, brandNames }) {
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


// ═══════════════════════════════════════════════════════════════════════════
// 7. IMAGE GENERATION — cover image via Gemini image model
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build image generation prompt.
 *
 * Used by: image-generator.mjs
 * Model: config.models.image (with responseModalities: ['TEXT', 'IMAGE'])
 */
export function buildImagePrompt({ topicTitle, domain, imageStyle }) {
  const style = imageStyle ||
    'Conceptual illustration with gradient background, clean minimalist digital art style';

  return (
    `Blog cover image for a ${domain} article about ${topicTitle}. ` +
    `${style}, no text overlays, no watermarks. Professional blog header illustration. 16:9 aspect ratio.`
  );
}
