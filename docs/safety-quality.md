# Content Quality, Safety Guards & Humanization

Publishing programmatic or AI content at scale without quality checks is a high-risk strategy that modern search engines (including Google and Bing) actively penalize. `@stayboba/autoblog` is built from the ground up to prevent detectable automation footprints through robust safety guards and advanced humanization.

---

## 1. Safety Guards & Anti-Pattern Protections

### Mandatory Humanization

The humanization step is non-negotiable. To ensure your blog never publishes generic AI drafts:
1. **Auto-Injection:** If you request custom steps (e.g. `--steps write,cmsPublish`) without including `humanize`, the pipeline will automatically inject `humanize` right after the writing step and log:
   ```
   [autoblog] Auto-injected "humanize" step after "write" — humanization is mandatory for all content.
   ```
2. **Publish Blocking:** Before running `cmsPublish`, `repurpose`, or `notify`, the step runner checks if the text has been humanized. If the humanize flag is missing, the execution exits with a warning and blocks publishing.

### Cadence Jitter
Fixed publish times (e.g., every 3 days at exactly 8:15 AM) are a dead giveaway for automation detection. Cadence jitter randomizes publication dates:

```javascript
schedule: {
  cron: '17 8 */3 * *',
  skipProbability: 0.3, // 30% chance to skip a scheduled run
}
```
* **Result:** Skipped runs exit immediately with zero API costs. Over time, a 3-day cron with `0.3` skip probability staggers posts by 3, 6, 3, 9, 3, 3, 6 days.

### Quality Gate & Automated Rejections
Rejects and re-queues low-quality posts before they hit your site:

```javascript
contentQuality: {
  minPublishScore: 7, // Rejects if cross-model review scores under 7/10
}
```
* Posts that fail the quality threshold or score below **30/100** on GEO metrics are blocked from saving, publishing, or sending notifications. The topic returns to the backlog for research in the next scheduled run.

### Structure Variation
Avoids structural footprints (e.g., every post starting with "In today's fast-paced world..." followed by identical bullet lists). The writer randomly chooses different component combinations for each draft:
* Optional summary TL;DR blocks (only when the topic has a direct bottom-line answer).
* Narrative or story openings using real-world scenarios or stats.
* Bullet lists versus numbered guides vs tabular summaries.
* Conditional FAQ blocks.

### Originality & First-Party Data Injection
Google ranks unique insights. Autoblog forces the writer to introduce data or angles absent from the top 10 SERPs. You can inject custom proprietary database text into the writer's memory:

```javascript
contentQuality: {
  firstPartyData: 'Our suburb-level cost database shows Melbourne CBD renovation costs averaged $2,850/sqm in Q1 2026, 12% above the HIA national average.',
}
```

### YAML Frontmatter Auto-Repair
Slight syntax irregularities from LLM-generated YAML can break website builds. The pipeline cleans and auto-repairs YAML before outputting files:
* Escapes double quotes inside string values (`title: "The "Best" Way"` -> `The \"Best\" Way`).
* Wraps strings containing colons or dashes in outer quotes.
* Normalizes numeric values or booleans to string values if they clash with schema templates (`category: true` -> `category: "true"`).

### Local Content Scaling Limits
Caps programmatic location targeting to avoid building low-value thin city pages:

```javascript
contentQuality: {
  maxLocalPagesPerTemplate: 5, // Capped to 5 cities per template file
}
```

---

## 2. Content Humanization (AI Pattern Removal)

Every post passes through an automated filter inspired by [Wikipedia's "Signs of AI writing"](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing). The filter locates and rewrites characteristic AI "tells":

| Pattern Type | Examples Targeted & Rewritten |
|--------------|------------------------------|
| **Significance Inflation** | *"pivotal", "testament", "key turning point", "evolving landscape"* |
| **Promotional Hype** | *"boasts", "vibrant", "nestled", "breathtaking", "renowned", "cutting-edge"* |
| **AI Vocabulary (Tier 1)** | *"delve", "tapestry", "leverage", "paradigm shift", "myriad", "demystify"* |
| **AI Vocabulary (Tier 2)** | *"robust", "seamless", "transformative", "bolster", "moreover"* |
| **Structural Telling** | Uniform paragraph sizing, overusing "Rule of Three" lists, concluding with summarizations. |
| **Hedging / Filler** | *"It is important to note that...", "In order to...", "Due to the fact that..."* |
| **Generic Conclusions** | *"The future looks bright...", "Exciting times ahead...", "Only time will tell..."* |

---

## 3. GEO/AEO Optimization (AI Search Engine Readiness)

Generative Engine Optimization (GEO) ensures your content ranks highly inside AI-generated summaries (Google AI Overviews, Perplexity, ChatGPT Search). The pipeline structures content with these specific components:

| Feature Element | Strategic Importance |
|-----------------|----------------------|
| **TL;DR Block** | AI summary engines extract and cite crisp definition cards. |
| **Key Takeaways** | Bulleted summary boxes (4-6 items) are directly referenced by ChatGPT Search. |
| **Question-Headings** | Headings in question formats match Google "People Also Ask" triggers. |
| **Direct-Answer Sentences** | Immediate, authoritative first-line answers following secondary headings. |
| **Attributed Stats** | Specific numerical data paired with inline bracket sources and years. |
| **Linked JSON Schema** | Auto-injected `BlogPosting` and `FAQPage` rich schemas. |

---

## 4. Readability Scoring

Measures the readability of drafts using the **Flesch-Kincaid Grade Level** formula.

```javascript
readability: {
  targetGrade: { min: 6, max: 10 },
  warnOnly: true, // Warns in console logs if grade is exceeded; set to false to trigger fail-and-rewrite
}
```

| Grade Level | Ideal For |
|-------------|-----------|
| **5-6** | Broad consumer audiences, extremely easy-to-read content. |
| **7-8** | **Recommended Default.** Standard editorial and marketing blogs. |
| **9-10** | Informed readers, some specialized technical details. |
| **11-12** | Highly technical or B2B developer audiences. |
| **13+** | Academic, scientific, or highly complex enterprise whitepapers. |
