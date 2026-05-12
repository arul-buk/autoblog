# @stayboba/autoblog

**Automated blog content pipeline that writes, optimizes, and publishes SEO-compliant blog posts on autopilot.**

You describe your product, define your topic areas, and set a schedule. The pipeline discovers trending topics, researches real keyword data, writes full blog posts, removes AI writing patterns, generates cover images, and translates to multiple languages — all from a single config file.

Built for SaaS companies, content teams, and agencies that want a repeatable, quality-controlled blog pipeline running via GitHub Actions or manual execution.

---

## Table of Contents

- [What You Need Before Starting](#-what-you-need-before-starting)
- [Setup (5 Minutes)](#-setup-5-minutes)
- [CLI Commands and Usage Scenarios](#-cli-commands-and-usage-scenarios)
- [Controlling What the Blog Writes About](#-controlling-what-the-blog-writes-about)
- [How the Pipeline Works](#-how-the-pipeline-works)
- [Strategic Capabilities (9 New Gaps)](#-strategic-capabilities-9-new-gaps)
- [Checkpoint System](#-checkpoint-system)
- [Content Quality and SEO Compliance](#-content-quality-and-seo-compliance)
- [Tech Stack and Architecture](#-tech-stack-and-architecture)
- [Configuration Reference](#-configuration-reference)
- [Running on Autopilot (GitHub Actions)](#-running-on-autopilot-github-actions)
- [For AI Agents — Setting Up Autoblog in a New Project](#-for-ai-agents--setting-up-autoblog-in-a-new-project)

---

## What You Need Before Starting

### Accounts and Keys

| What | Where to get it | Required? | Cost |
|------|----------------|-----------|------|
| **Gemini API key** | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Yes | Free tier available; paid for heavy usage |
| **DataForSEO account** | [app.dataforseo.com/register](https://app.dataforseo.com/register) | Optional | ~$0.04-0.20 per post for real keyword data |

> **Without DataForSEO:** The pipeline still works. Gemini runs an intelligent keyword strategy — analyzing your topic against existing blog posts to find keyword gaps and suggest seed keywords. You get gap-aware keyword guidance, just without search volume numbers. You can add DataForSEO later for data-driven enrichment.

### Technical Requirements

| What | Minimum version |
|------|----------------|
| Node.js | v20.0.0+ |
| npm | v9+ |
| Git | Any recent version |
| A website framework that renders markdown | Next.js, Hugo, Jekyll, Gatsby, Astro, etc. |

### Cost Per Blog Post

| Pipeline mode | What's included | Cost |
|---------------|----------------|------|
| **Full pipeline** (6 translations) | Research + keyword strategy + DataForSEO + write + humanize + image + 6 translations | ~$0.12-0.17 |
| **English + polished** | Research + keyword strategy + write + humanize + image | ~$0.05 |
| **Budget mode** | Research + write + image only | ~$0.02-0.04 |

---

## Setup (5 Minutes)

### Step 1 — Install

```bash
npm install @stayboba/autoblog
```

Or clone the repo directly:

```bash
git clone https://github.com/arul-buk/autoblog.git
cd autoblog
npm install
```

### Step 2 — Create your config

```bash
cp autoblog.config.example.mjs autoblog.config.mjs
```

Open `autoblog.config.mjs` and fill in three sections (explained in detail in the [next section](#-controlling-what-the-blog-writes-about)):

1. **Your product** — name, URL, description, features
2. **Your authors** — who writes the blog (can be fictional personas)
3. **Your topics** — what the blog covers

### Step 3 — Set your API key

Create a `.env` file in your project root (loaded automatically):

```bash
GEMINI_API_KEY=your-gemini-api-key
```

Or export directly:

```bash
export GEMINI_API_KEY="your-gemini-api-key"
```

### Step 4 — Run it

```bash
npx autoblog --help        # see all options
npx autoblog --dry-run     # preview without saving files (recommended first time)
npx autoblog               # generate and save one blog post
npx autoblog --batch 5     # generate 5 posts at once (for seeding a new blog)
```

### What you get

After running, you'll find:

```
_posts/
├── your-topic-slug.md              # Full blog post (frontmatter + body)
├── es/your-topic-slug.md           # Spanish translation
├── fr/your-topic-slug.md           # French translation
├── ...                              # Other configured languages

public/images/blog/
└── your-topic-slug.png             # AI-generated cover image (16:9)
```

---

## CLI Commands and Usage Scenarios

### Commands

```bash
npx autoblog                              # Full pipeline (default sequence)
npx autoblog --dry-run                    # Preview without saving files
npx autoblog --batch 5                    # Generate 5 posts sequentially
npx autoblog --steps research,dedupe      # Cherry-pick specific steps
npx autoblog --resume                     # Resume from last checkpoint
npx autoblog --init-strategy              # Content strategy wizard
npx autoblog audit                        # Performance audit (GSC + GA4 + GEO)
npx autoblog refresh                      # Content freshness check
npx autoblog research                     # Research topics only (no writing)
```

### Usage Scenarios

**Full Autonomous Pipeline (default, unchanged)**
```bash
npx autoblog
```
Runs the complete default sequence. Same behavior as v1.x.

**Research-Only (editorial planning)**
```bash
npx autoblog research --dry-run
```
Runs: schedule > gsc > contextLoad > research > dedupe > keywordResearch. See what topics and keywords are available without generating content.

**Weekly Performance Audit**
```bash
npx autoblog audit
```
Runs: contextLoad > performanceAudit > geoTracking. Check rankings, detect declining posts, track AI visibility.

**Content Freshness Check**
```bash
npx autoblog refresh
```
Runs: contextLoad > contentRefresh. See which posts are stale and need updating.

**Competitor-First Content Strategy**
```bash
npx autoblog --steps contextLoad,competitorAnalysis,research,dedupe,keywordResearch,write,humanize,validate
```
Topics come from competitor gaps instead of trending research.

**Quick Publish (urgent news)**
```bash
npx autoblog --steps write,humanize,validate,cmsPublish,notify
```
Skip research — write from a calendar topic or manual override.

**Repurpose Existing Content**
```bash
npx autoblog --steps contextLoad,repurpose
```
Generate social derivatives (Twitter threads, LinkedIn posts, newsletter snippets) from existing published posts.

**Resume a Failed Run**
```bash
npx autoblog --resume
```
Finds the last checkpoint, skips completed steps, continues from the failure point.

**GitHub Actions with Separate Audit**
Two cron schedules: content generation every 3 days + weekly audit on Mondays.

```yaml
# Content generation
- cron: '17 8 */3 * *'
  # npx autoblog

# Weekly audit
- cron: '0 9 * * 1'
  # npx autoblog audit
```

---

## Controlling What the Blog Writes About

Everything the pipeline writes — topics, tone, product mentions, sources, audience — is controlled through `autoblog.config.mjs`.

---

### What is the blog about? > `product` section

```js
product: {
  name: 'AcmeSaaS',
  url: 'https://acme.com',
  description: 'Project management tool for remote engineering teams',
  features: [
    'Async Standups — automated daily standups across time zones',
    'Sprint Analytics — track velocity without manual calculation',
    'Slack Integration — manage tasks without leaving Slack',
  ],
  tone: 'Technical but approachable. Write for engineering managers, not executives.',
}
```

Every blog post references your product naturally, mentions relevant features in context, and links back to your site.

---

### What topics does it cover? > `topics.clusters` section

```js
topics: {
  clusters: [
    {
      name: 'Remote Work',
      queries: [
        'remote team management challenges 2026',
        'async communication best practices',
        'remote engineering team productivity',
      ],
    },
    {
      name: 'Competitor',
      queries: [
        'Jira alternative for remote teams',
        'Linear vs Asana comparison',
        'best project management tool review 2026',
      ],
    },
  ],
}
```

**Tips for search queries:**
- Include the current year for recency: `"remote work trends 2026"`
- Mix broad and specific queries
- Include competitor names for comparison content
- Use question formats: `"how to run sprint retros remotely"`
- Aim for 3-8 queries per cluster, 3-6 clusters total

---

### Geographic angles > `topics.regionalContexts`

```js
topics: {
  regionalContexts: [
    { region: 'United States', focus: 'tech layoffs, return-to-office mandates' },
    { region: 'Europe', focus: 'GDPR implications for project management tools' },
  ],
}
```

---

### Who writes the posts? > `authors` section

```js
authors: [
  {
    name: 'Alex Rivera',
    role: 'Engineering Lead',
    image: '/images/authors/alex.png',
    categories: ['Remote Work', 'Engineering Culture'],
  },
  {
    name: 'Priya Sharma',
    role: 'Product Analyst',
    image: '/images/authors/priya.png',
    categories: ['Competitor', 'Product'],
  },
],
fallbackAuthor: 'Alex Rivera',
```

---

### Style matching > `product.styleGuide`

```js
product: {
  styleGuide: {
    // Option 1: Inline brand voice rules
    voice: `
      Write in second person ("you", not "parents").
      Short paragraphs — 2-3 sentences max.
      No jargon. If you must use a technical term, define it immediately.
    `,
    // Option 2: Load from a file
    // voiceFile: './style/voice-rules.md',
    // Option 3: Reference post to match
    // referencePostFile: './style/reference-post.md',
  },
}
```

| Type | When to use |
|------|-------------|
| `voice` | You can articulate your style as rules ("short paragraphs", "second person") |
| `referencePost` | You have a post that "sounds right" but can't articulate why |

Both are injected into the writer prompt and the humanizer step.

---

### What sources does it use?

The pipeline uses **Gemini with Google Search grounding** — real, current Google results (not just LLM training data). It prioritizes content from the last 7 days (configurable via `topics.recencyDays`).

The writer prompt instructs the LLM to **attribute all statistics** with source and year inline. Vague attribution ("studies show", "experts say") is explicitly prohibited.

---

### SEO keywords > `seo` section

**Without DataForSEO:** Gemini analyzes your topic against all existing blog posts to find keyword gaps and suggest seeds.

**With DataForSEO:** Real search volume, keyword difficulty, related terms, and People Also Ask questions.

```js
seo: {
  enabled: true,
  apiLogin: process.env.DATAFORSEO_LOGIN,
  apiPassword: process.env.DATAFORSEO_PASSWORD,
  location: 2840,            // US (see config example for other codes)
  maxDifficulty: 60,
  minSearchVolume: 100,
  maxRelatedKeywords: 10,
}
```

---

### Publishing schedule > `schedule` section

```js
schedule: {
  cron: '17 8 */3 * *',   // every 3 days at 8:17 UTC
  postsPerRun: 1,
  calendar: [
    { date: '2026-06-01', category: 'Remote Work' },
    { date: '2026-06-04', topic: 'How to Run Async Standups That Actually Work' },
    {
      date: '2026-06-08',
      topic: 'Linear vs AcmeSaaS: 2026 Feature Comparison',
      category: 'Competitor',
      keywords: ['linear alternative', 'best project management tool'],
      notes: 'Objective comparison. Acknowledge Linear strengths.',
      priority: 'high',
    },
  ],
}
```

Days without calendar entries use automatic trending topic discovery.

---

## How the Pipeline Works

26 discrete steps, registered in `lib/step-registry.mjs`. Each step can run independently or as part of named sequences.

### All 26 Steps

```
schedule, gsc, contextLoad, contentRefresh, competitorAnalysis,
topicalAuthority, research, dedupe, keywordResearch, intentFormat,
serpFeatures, internalLinking, write, metaOptimize, humanize,
crossModelReview, validate, embedSchema, image, translate,
contextUpdate, cmsPublish, repurpose, notify,
performanceAudit, geoTracking
```

### Default Sequence

The default `npx autoblog` runs this sequence (same behavior as v1.x):

```
schedule > gsc > contextLoad > research > dedupe > keywordResearch >
internalLinking > write > metaOptimize > humanize > crossModelReview >
validate > embedSchema > image > translate > contextUpdate >
cmsPublish > notify
```

### Pipeline Diagram

```
bin/autoblog.mjs ─── CLI (--steps, --resume, audit, refresh, research)
        |
        v
lib/pipeline.mjs ─── Thin wrapper --> runSteps(sequence)
        |
        v
lib/runner.mjs ──── Step executor + checkpoint integration
        |
        +-- lib/step-registry.mjs ── Step definitions + named sequences
        +-- lib/checkpoint.mjs ───── Save/load/clean state
        +-- lib/steps/*.mjs ──────── 26 discrete step wrappers
              |
              +-- Existing modules (unchanged): topics.mjs, deduper.mjs, writer.mjs, etc.
              +-- New modules: content-refresh.mjs, performance-audit.mjs,
                  topical-authority.mjs, serp-features.mjs, competitor-analysis.mjs,
                  geo-tracker.mjs, repurposer.mjs
```

### Named Sequences

| Command | Sequence |
|---------|----------|
| `npx autoblog` | Full default pipeline (18 steps) |
| `npx autoblog research` | schedule > gsc > contextLoad > research > dedupe > keywordResearch |
| `npx autoblog audit` | contextLoad > performanceAudit > geoTracking |
| `npx autoblog refresh` | contextLoad > contentRefresh |

### Step Reference

| Step | What happens | API calls | Toggle |
|------|-------------|-----------|--------|
| **schedule** | Checks content calendar for today | 0 | `steps.calendar` |
| **gsc** | Mines Google Search Console for quick-win keywords | 1 GSC | `gsc.enabled` |
| **contextLoad** | Loads `.autoblog-context.json` (topic history, performance data) | 0 | `context.enabled` |
| **contentRefresh** | Flags stale posts by category-based age rules | 0 | `contentRefresh.enabled` |
| **competitorAnalysis** | DataForSEO domain intersection — finds competitor keyword gaps | 1 DFSEO | `competitors.enabled` |
| **topicalAuthority** | Pillar-cluster sequencing — writes pillars first, then clusters | 0 | `topicalMap.enabled` |
| **research** | Gemini + Google Search grounding for trending topics | 1 | `steps.research` |
| **dedupe** | Semantic deduplication against existing posts via Gemini | 1 | `steps.dedupe` |
| **keywordResearch** | Gemini keyword strategy + DataForSEO enrichment | 1 + 4 DFSEO | `steps.keywordResearch` |
| **intentFormat** | Maps search intent to content format (informational > how-to, etc.) | 0 | `contentStrategy.intentFormatMap` |
| **serpFeatures** | DataForSEO SERP API — detects featured snippets, PAA, AI Overview | 1 DFSEO | `serpFeatures.enabled` |
| **internalLinking** | Keyword-to-slug index for automatic internal links | 0 | `steps.internalLinking` |
| **write** | Full blog post generation with GEO/AEO rules | 1 | Always on |
| **metaOptimize** | CTR-optimized title variants + meta description | 1 | `steps.metaOptimize` |
| **humanize** | AI pattern removal + style matching | 1 | `steps.humanize` |
| **crossModelReview** | Quality scoring via stronger model + auto-rewrite | 1 | `steps.crossModelReview` |
| **validate** | Quality gate + GEO/AEO scoring (zero API calls) | 0 | `steps.validate` |
| **embedSchema** | JSON-LD BlogPosting + FAQPage embedding | 0 | `steps.embedSchema` |
| **image** | Cover image via Gemini image model | 1 | `steps.image` |
| **translate** | Multi-language with brand name preservation | N | `steps.translate` |
| **contextUpdate** | Saves run data to `.autoblog-context.json` | 0 | `context.enabled` |
| **cmsPublish** | Push to WordPress, Ghost, Webflow, Strapi, or Contentful | 1 CMS | `publish.cms` |
| **repurpose** | Generate Twitter threads, LinkedIn posts, newsletter snippets | 1 | `repurpose.enabled` |
| **notify** | Telegram notification (success or failure) | 1 | `notifications.telegram` |
| **performanceAudit** | Extract winning patterns, detect declining posts, compare rankings | 1 GSC + 1 GA4 | `audit.enabled` |
| **geoTracking** | Track brand mentions in AI Overviews, co-citation competitors | 1 | `geoTracking.enabled` |

---

## Strategic Capabilities (9 New Gaps)

All nine capabilities are **disabled by default**. Enable each one via its config flag. They integrate seamlessly into the step pipeline — enable, configure, and they run in the correct order automatically.

### Gap 1 — Intent-to-Format Enforcement

Maps search intent to content format automatically.

| Intent | Default formats |
|--------|----------------|
| informational | how-to-guide, explainer, listicle |
| commercial | comparison, review, alternatives |
| transactional | product-tutorial, setup-guide |
| navigational | brand-feature, changelog |

```js
contentStrategy: {
  intentFormatMap: {
    informational: ['how-to-guide', 'explainer', 'listicle'],
    commercial: ['comparison', 'review', 'alternatives'],
    transactional: ['product-tutorial', 'setup-guide'],
    navigational: ['brand-feature', 'changelog'],
  },
}
```

### Gap 2 — Content Refresh Scheduler

Flags stale posts by category-based age rules. Prioritizes high-traffic stale posts.

```js
contentRefresh: {
  enabled: false,
  rules: [
    { category: 'regulatory', maxAgeDays: 30 },
    { category: 'statistics', maxAgeDays: 180 },
    { category: '*', maxAgeDays: 365 },
  ],
  maxQueueSize: 10,
  prioritizeByTraffic: true,
}
```

### Gap 3 — Performance Feedback Loop

Extracts winning patterns (which categories/intents/formats perform best), detects declining posts, compares predicted vs actual rankings. Available via `npx autoblog audit`.

```js
audit: {
  enabled: true,
  minPostAgeDays: 14,
  declineThreshold: 0.3,
  winningPatterns: { minClicks: 50, topPositionThreshold: 10 },
}
```

### Gap 4 — Topical Authority Sequencing

Pillar-cluster architecture. Define pillar topics with cluster subtopics. The pipeline writes the pillar first, then clusters in order, with automatic internal linking.

```js
topicalMap: {
  enabled: false,
  requirePillarFirst: true,
  pillars: [
    {
      topic: 'Remote Team Management',
      clusters: [
        'Async Communication Best Practices',
        'Remote Onboarding Playbook',
        'Distributed Team Tools',
      ],
    },
  ],
}
```

### Gap 5 — SERP Feature Targeting

DataForSEO SERP API detects featured snippets, PAA, AI Overview, video, local pack. Injects writing guidance ("write 40-60 word direct answer for featured snippet").

```js
serpFeatures: {
  enabled: false,
  targetFeatures: ['featured_snippet', 'people_also_ask', 'ai_overview'],
}
```

### Gap 6 — Competitive Gap Analysis

DataForSEO domain intersection finds keywords competitors rank for but you don't. Injects top gaps as high-priority topic candidates.

```js
competitors: {
  enabled: false,
  domains: ['competitor1.com', 'competitor2.com'],
  maxGaps: 20,
  minVolume: 100,
  refreshDays: 30,
}
```

### Gap 7 — AI Visibility / GEO Tracking

Tracks brand mentions in AI Overviews and co-citation competitors. Available via `npx autoblog audit`.

```js
geoTracking: {
  enabled: false,
  brandNames: ['AcmeSaaS', 'Acme'],
  platforms: ['google_ai_overview', 'chatgpt'],
}
```

### Gap 8 — Content Repurposing

Generates social derivatives from each blog post. Saves to `_repurposed/{slug}/`.

```js
repurpose: {
  enabled: false,
  formats: ['twitter-thread', 'linkedin-post', 'newsletter-snippet'],
  outputDir: '_repurposed',
}
```

### Gap 9 — Cross-Model Quality Review

Sends the post to a stronger model for quality scoring on factual accuracy, keyword naturalness, tone alignment, and structure. If the score is below threshold, automatically rewrites incorporating feedback.

```js
steps: { crossModelReview: true },
crossModel: {
  model: 'gemini-2.5-pro',
  qualityThreshold: 7,
}
```

**Cost:** ~$0.02-0.05 per post (1 Gemini Pro call, possibly 1 rewrite).

---

## Checkpoint System

The pipeline auto-saves state after each step, so you can resume from failures instead of restarting from scratch.

- State saved to `.autoblog-checkpoints/{runId}/` after each step
- `--resume` finds the latest checkpoint and continues from the failure point
- Checkpoints expire after 24 hours (configurable)
- Handles Map serialization (translations)

```js
checkpoint: {
  enabled: true,
  dir: '.autoblog-checkpoints',
  maxAgeMs: 86400000, // 24 hours
}
```

```bash
# Run fails at step 14 (image generation)
npx autoblog
# Error: Gemini image API timeout

# Resume — skips steps 1-13, continues from image
npx autoblog --resume
```

---

## Content Quality and SEO Compliance

### Humanization — Removing AI Writing Patterns

Every post passes through an AI pattern removal step based on [Wikipedia's "Signs of AI writing"](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing).

| Pattern | Examples removed |
|---------|-----------------|
| Significance inflation | "pivotal", "testament", "key turning point", "evolving landscape" |
| Promotional language | "boasts", "vibrant", "nestled", "breathtaking", "renowned" |
| AI vocabulary (Tier 1) | "delve", "tapestry", "leverage", "paradigm shift", "myriad" |
| AI vocabulary (Tier 2) | "robust", "seamless", "cutting-edge", "transformative", "bolster" |
| Structural tells | Uniform section lengths, repeated "takeaway" patterns, rule-of-three overuse |
| Hedging and filler | "It's important to note that...", "In order to", "Due to the fact that" |
| Generic conclusions | "The future looks bright", "Exciting times ahead", "Only time will tell" |

### GEO/AEO Compliance — Optimized for AI Search Engines

Every post is structured for both traditional Google search **and** AI-powered search (Google AI Overviews, ChatGPT, Perplexity, Bing Copilot).

| Structure | Why it matters |
|-----------|---------------|
| **TL;DR section** | AI overviews extract and cite summary blocks |
| **Key Takeaways** (4-6 bullets) | Perplexity and ChatGPT cite bullet lists |
| **Question-based headings** (3+) | Matches People Also Ask queries |
| **Direct-answer paragraphs** | AI engines extract the first sentence after headings |
| **FAQ section** | Powers FAQ rich snippets and AI answer boxes |
| **Entity definitions** | AI engines extract definitions |
| **Attributed statistics** | AI engines penalize unattributed claims |
| **Schema-ready frontmatter** | `BlogPosting` + `FAQPage` JSON-LD data |

The validator outputs a **GEO/AEO score** (0-100).

### Schema Markup

The pipeline generates schema-ready frontmatter — your website renders it as JSON-LD:

```yaml
schema:
  type: "BlogPosting"
  headline: "How to Run Async Standups That Actually Work"
  description: "Async standups eliminate timezone pain..."
  wordCount: 1247
  keywords: "async standups, remote standup tool"
qa:
  - question: "How do async standups work?"
    answer: "Team members post updates at any time during their workday..."
```

Your website template converts `schema` to `BlogPosting` JSON-LD and `qa` to `FAQPage` JSON-LD.

### Readability Scoring

Flesch-Kincaid grade level, calculated locally (zero API calls):

```js
readability: {
  targetGrade: { min: 6, max: 10 },
  warnOnly: true,
}
```

| Grade range | Audience |
|-------------|----------|
| 5-6 | Broad consumer, very simple |
| 7-8 | Marketing content (recommended default) |
| 9-10 | Informed consumers, some technical depth |
| 11-12 | Professional/technical audience |
| 13+ | Academic, B2B enterprise |

---

## Tech Stack and Architecture

### Runtime Dependency

| Package | Purpose |
|---------|---------|
| `@google/generative-ai` (^0.21.0) | Gemini API client for text, image, and Google Search grounding |

**That's it.** One dependency. Everything else uses Node.js built-ins (`fetch`, `fs`, `path`, `url`).

### External APIs

| API | Auth method | What it provides |
|-----|------------|-----------------|
| **Gemini API** | API key via SDK | Topic research, keyword strategy, writing, humanization, translation, image generation |
| **DataForSEO REST API** | Basic auth (login:password) | Keyword volumes, difficulty, related keywords, SERP competitors, PAA questions, domain intersection |

### Models Used

| Model | Used for | Configurable via |
|-------|----------|-----------------|
| `gemini-2.5-flash` | All text generation | `config.models.text` |
| `gemini-2.5-flash-image` | Cover image generation | `config.models.image` |

### Module Map

```
bin/autoblog.mjs ─── CLI entry point (--steps, --resume, --batch, --dry-run, audit, refresh, research)
        |
        v
lib/pipeline.mjs ─── Thin wrapper --> runSteps(sequence)
        |
        v
lib/runner.mjs ──── Step executor + checkpoint integration
        |
        +-- lib/step-registry.mjs ── Step definitions + named sequences
        +-- lib/checkpoint.mjs ───── Save/load/clean state
        +-- lib/steps/*.mjs ──────── 26 discrete step wrappers
        |
        +-- Core modules (unchanged):
        |     config.mjs, prompts.mjs, retry.mjs, scheduler.mjs, topics.mjs,
        |     deduper.mjs, keyword-research.mjs, linker.mjs, writer.mjs,
        |     style-guide.mjs, humanizer.mjs, meta-optimizer.mjs, cross-reviewer.mjs,
        |     validator.mjs, readability.mjs, schema-embedder.mjs, image-generator.mjs,
        |     translator.mjs, publisher.mjs, notifications.mjs
        |
        +-- Strategy modules:
        |     strategy-balancer.mjs, strategy-wizard.mjs, local-content.mjs
        |
        +-- Data source modules:
        |     gsc.mjs, context.mjs, dataforseo-client.mjs
        |
        +-- New capability modules (v2.0):
              content-refresh.mjs, performance-audit.mjs, topical-authority.mjs,
              serp-features.mjs, competitor-analysis.mjs, geo-tracker.mjs, repurposer.mjs
```

### Prompt Architecture

All Gemini prompt builders are consolidated in `lib/prompts.mjs` — a pure-function module with zero imports. 9 prompt builders covering research, deduplication, keyword strategy, writing, humanization, translation, and image generation.

### DataForSEO Endpoints

| Endpoint | What it returns | Approx. cost |
|----------|----------------|-------------|
| `/dataforseo_labs/google/keyword_overview/live` | Search volume + difficulty for seeds | ~$0.01 |
| `/dataforseo_labs/google/related_keywords/live` | Expanded related terms | ~$0.05 |
| `/dataforseo_labs/google/serp_competitors/live` | Top-ranking domains | ~$0.05 |
| `/dataforseo_labs/google/keyword_suggestions/live` | Question-format keywords for FAQ | ~$0.05 |

### Design Principles

- **Config-driven**: All project-specific content in one config file. No hardcoded product names or URLs in source.
- **Discrete steps**: Each step is a standalone module. Run any subset with `--steps`.
- **Checkpoint-resumable**: State saved after each step. Resume from failure with `--resume`.
- **Prompts in one file**: All Gemini prompts in `lib/prompts.mjs` for easy review.
- **Stateless**: Reads from disk, writes to disk, exits. No database. Git is the state store.
- **Partial success**: If 5/6 translations succeed, saves those 5. If image fails, post continues.
- **Retry-aware**: Every API call wrapped in exponential backoff. Rate limits (429) get longer delays.

---

## Configuration Reference

Full configuration with every option: [`autoblog.config.example.mjs`](./autoblog.config.example.mjs)

### Quick reference of all config sections

| Section | What it controls | Required? |
|---------|-----------------|-----------|
| `product` | Product name, URL, description, features, tone, brand names, style guide | Yes |
| `authors` | Author roster with name, role, image, category assignments | Yes |
| `topics` | Topic clusters (search queries), regional contexts, recency | Yes |
| `output` | Post/image directories, body format (html/md/mdx), frontmatter schema, word count | Has defaults |
| `translation` | Enabled flag, language codes, rate limiting | Has defaults (disabled) |
| `models` | Gemini model names for text and image | Has defaults |
| `steps` | Toggle each pipeline step on/off | Has defaults |
| `checkpoint` | Checkpoint directory, max age, enabled flag | Has defaults (enabled) |
| `schedule` | Cron expression, posts per run, content calendar | Has defaults |
| `seo` | DataForSEO credentials, location, difficulty/volume thresholds | Has defaults (disabled) |
| `readability` | Target Flesch-Kincaid grade range, warn vs. fail | Has defaults |
| `retry` | Max attempts, base delay for exponential backoff | Has defaults |
| `gsc` | GSC property URL, lookback days, schedule frequency | Optional |
| `context` | Enable performance feedback loop, file path | Optional |
| `analytics` | GA4 property ID for pageview/engagement tracking | Optional |
| `contentStrategy` | Intent mix, format mix, category weights, local content, intent-to-format map | Optional |
| `contentRefresh` | Stale content rules, max queue, traffic prioritization | Optional (disabled) |
| `audit` | Decline threshold, winning pattern criteria | Optional |
| `topicalMap` | Pillar-cluster definitions, require-pillar-first flag | Optional (disabled) |
| `serpFeatures` | Target SERP features list | Optional (disabled) |
| `competitors` | Competitor domains, max gaps, min volume, refresh interval | Optional (disabled) |
| `geoTracking` | Brand names, AI platforms to track | Optional (disabled) |
| `repurpose` | Output formats (twitter, linkedin, newsletter), output directory | Optional (disabled) |
| `notifications` | Telegram bot token + chat ID | Optional |
| `crossModel` | Review model, quality threshold | Optional |
| `publish` | CMS adapter (wordpress/ghost/webflow/strapi/contentful), draft mode | Optional |

### Body format options

| Format | Config value | Best for |
|--------|-------------|----------|
| HTML | `'html'` | Next.js, custom rendering |
| Markdown | `'markdown'` | Hugo, Jekyll, Gatsby, Astro |
| MDX | `'mdx'` | MDX-based sites |

### Astro content collections

<details>
<summary>Zod schema for Astro content collections</summary>

Set `bodyFormat: 'markdown'` and define in `src/content.config.ts`:

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    excerpt: z.string(),
    coverImage: z.string(),
    author: z.string(),
    category: z.string(),
    tags: z.array(z.string()),
    seoKeywords: z.string(),
    readingTime: z.string().optional(),
    relatedPosts: z.array(z.string()).default([]),
    qa: z.array(z.object({ question: z.string(), answer: z.string() })),
    schema: z.object({
      type: z.string(),
      headline: z.string(),
      description: z.string(),
      wordCount: z.number(),
      keywords: z.string().optional(),
    }),
  }),
});

export const collections = { blog };
```

</details>

---

## Optional Enhancements

All features below are **opt-in**. Each activates only when its config flag is enabled and/or API credentials are present. If credentials are missing or an API call fails, the feature is silently skipped.

### GSC-Informed Topic Research

Mines Google Search Console for quick-win keywords (position 4-15), orphan queries, and declining pages.

```js
gsc: {
  enabled: true,
  propertyUrl: 'sc-domain:example.com',
  schedule: { frequency: 'weekly' },  // 'every-run' | 'weekly' | 'biweekly' | 'monthly'
}
```

**Requires:** `GSC_SERVICE_ACCOUNT_JSON` env var (service account key or OAuth credentials).

### Meta Tag Optimization

Generates 3 optimized title variants using different hook strategies and picks the highest-scoring one. Cost: ~$0.001 per post.

```js
steps: { metaOptimize: true }
```

### Embedded JSON-LD Schema

Generates `<script>` blocks from frontmatter and embeds directly in post body.

```js
steps: { embedSchema: true },
output: { siteUrl: 'https://example.com' }
```

### Context Persistence + Performance Feedback Loop

Tracks topics, keywords, and performance across runs. Feeds data back into research and keyword prompts.

```js
context: { enabled: true },
analytics: { enabled: true, propertyId: '123456789' }  // Optional: GA4
```

### Content Strategy + Self-Balancing

Interactive wizard that recommends an optimal content mix. The pipeline self-balances over time.

```bash
npx autoblog --init-strategy
```

### Local Content Engine (Programmatic SEO)

Template-based generation of location-specific pages.

```js
contentStrategy: {
  localContent: {
    enabled: true,
    locations: [
      { city: 'Melbourne', region: 'Victoria', country: 'AU' },
    ],
    templates: [
      'How to Find Verified Building Leads in {city} ({year})',
    ],
    maxPerWeek: 1,
  },
}
```

### Topic Backlog

Research generates 5-10 candidates but only 1 gets written. Evergreen topics are saved to backlog. Next run checks backlog first. Topics expire after 30 days.

**Requires:** `context.enabled: true`.

### CMS Direct Publishing

```js
publish: {
  cms: 'wordpress',  // or 'ghost', 'webflow', 'strapi', 'contentful'
  draft: true,
}
```

### Telegram Notifications

Success and failure notifications with post title, site link, and GitHub Actions link.

```js
notifications: {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },
},
```

**Setup:** Message [@BotFather](https://t.me/BotFather) > `/newbot` > save token. Message [@userinfobot](https://t.me/userinfobot) for chat ID.

---

## Running on Autopilot (GitHub Actions)

### Setup

1. Copy the workflow template:
   ```bash
   cp templates/github-workflow.yml .github/workflows/auto-blog.yml
   ```

2. Edit the workflow — search for `<!-- CHANGE -->` comments and update cron, git email, deploy config.

3. Add secrets to your GitHub repo (Settings > Secrets > Actions):

| Secret | Required |
|--------|----------|
| `GEMINI_API_KEY` | Yes |
| `DATAFORSEO_LOGIN` | If `seo.enabled` |
| `DATAFORSEO_PASSWORD` | If `seo.enabled` |
| `GSC_SERVICE_ACCOUNT_JSON` | If `gsc.enabled` |
| `GA4_SERVICE_ACCOUNT_JSON` | If `analytics.enabled` |
| `CMS_ENDPOINT` | If `publish.cms` is set |
| `CMS_USERNAME` / `CMS_PASSWORD` | WordPress |
| `CMS_ADMIN_API_KEY` | Ghost (id:secret format) |
| `CMS_API_TOKEN` | Webflow/Strapi/Contentful |
| `CMS_COLLECTION_ID` | Webflow |
| `CMS_SPACE_ID` | Contentful |
| `VERCEL_TOKEN` | If deploying to Vercel |
| `TELEGRAM_BOT_TOKEN` | For notifications |
| `TELEGRAM_CHAT_ID` | For notifications |

### Manual trigger

The workflow supports manual execution from the GitHub Actions UI with inputs for `--batch` count and `--dry-run` mode.

### Batch mode for seeding

```bash
npx autoblog --batch 10
```

Generates 10 posts sequentially. Deduplication is cumulative. If post 5 fails, posts 1-4 are saved and the pipeline continues.

---

## For AI Agents — Setting Up Autoblog in a New Project

Copy the prompt below and give it to your AI coding agent (Claude Code, Cursor, Windsurf, Copilot, etc.).

### Setup Prompt

<details>
<summary>Click to expand the full agent setup prompt</summary>

```
I want to set up @stayboba/autoblog — an automated blog content pipeline that uses Gemini AI
to research trending topics, write SEO-optimized blog posts, generate cover images, and
optionally translate to multiple languages.

Package: https://www.npmjs.com/package/@stayboba/autoblog
Docs: https://github.com/arul-buk/autoblog

STEP 1: GATHER INFORMATION — Ask me ALL questions at once:

1. Product name, URL, one-sentence description
2. Key features (3-6) the AI can reference in posts
3. Tone — how should the blog sound?
4. Topic clusters (3-6 pillars, each with 3-8 Google search queries)
5. Authors (1-3 personas: name, role, topic clusters)
6. Blog post format — HTML, markdown, or MDX?
7. Output directories for posts and cover images
8. Translations — which languages?
9. DataForSEO — do you have an account?
10. Image style preference
11. GitHub Actions — automatic schedule?
12. Optional enhancements:
    a. GSC topic mining  b. Meta optimization  c. Cross-model review
    d. Embedded JSON-LD  e. Context persistence  f. GA4 analytics
    g. CMS publishing  h. Content refresh  i. Competitor gap analysis
    j. SERP feature targeting  k. Topical authority  l. Content repurposing
    m. AI visibility / GEO tracking  n. Telegram notifications

STEP 2: INSTALL AND CONFIGURE
1. npm install @stayboba/autoblog
2. cp node_modules/@stayboba/autoblog/autoblog.config.example.mjs autoblog.config.mjs
3. Edit config with my answers + create .env with GEMINI_API_KEY
4. Add .env and autoblog.config.mjs to .gitignore

STEP 3: TEST — npx autoblog --dry-run, then npx autoblog

STEP 4: GITHUB ACTIONS (if requested)
cp node_modules/@stayboba/autoblog/templates/github-workflow.yml .github/workflows/auto-blog.yml

STEP 5: VERIFY site renders the generated posts correctly
```

</details>

### Architecture rules

- **Do not embed pipeline code in the consuming project.** Keep autoblog as a separate package.
- **Do not modify autoblog source files.** Everything is config-driven.
- **Schema markup is the website's job.** The pipeline outputs frontmatter; the website renders JSON-LD.
- **Start with budget mode.** Enable features incrementally.
- **The pipeline is stateless.** Reads from disk, writes to disk, exits.

### Frontmatter schema reference

Your website converts `schema` to `BlogPosting` JSON-LD and `qa` to `FAQPage` JSON-LD. Fields available: `schema.type`, `schema.headline`, `schema.description`, `schema.wordCount`, `date`, `lastModified`, `author`, `coverImage`, `qa[].question`, `qa[].answer`.

### Troubleshooting

| Problem | Fix |
|---------|-----|
| `Config file not found` | Create `autoblog.config.mjs` or use `--config path` |
| `GEMINI_API_KEY required` | `export GEMINI_API_KEY=your-key` or add to `.env` |
| `seo.apiLogin required` | Set DataForSEO env vars or set `seo.enabled: false` |
| `All candidate topics already covered` | Add new queries to `topics.clusters` or use calendar |
| GEO/AEO score below 50 | Usually improves on re-run |
| Image generation failed | Non-blocking. Post saved without image. |
| Local topic deduped, pipeline exits | Falls back to trending research automatically |
| Telegram says "sent" but no message | HTML-escape issue — fixed in 1.3.1 |

---

## Google Service Account Setup (GSC + GA4)

One service account handles both GSC and GA4 across all your sites.

<details>
<summary>Click to expand setup steps</summary>

**1. Create GCP project + service account**
```bash
gcloud projects create your-project-id
gcloud config set project your-project-id
gcloud services enable searchconsole.googleapis.com analyticsdata.googleapis.com analyticsadmin.googleapis.com siteverification.googleapis.com
gcloud iam service-accounts create autoblog-agent --display-name="Autoblog Pipeline Agent"
gcloud iam service-accounts keys create ~/autoblog-service-account.json \
  --iam-account=autoblog-agent@your-project-id.iam.gserviceaccount.com
```

**2. Grant project-level permissions**
```bash
gcloud projects add-iam-policy-binding your-project-id \
  --member="serviceAccount:autoblog-agent@your-project-id.iam.gserviceaccount.com" \
  --role="roles/viewer"
gcloud projects add-iam-policy-binding your-project-id \
  --member="serviceAccount:autoblog-agent@your-project-id.iam.gserviceaccount.com" \
  --role="roles/serviceusage.serviceUsageConsumer"
```

**3. Verify domains for GSC** — Add DNS TXT record, verify via Site Verification API. Service account becomes `siteOwner`.

**4. Grant GA4 access** — Create OAuth Desktop client, call GA4 Admin API once to grant viewer access (one-time operation).

**5. Configure**
```bash
export GSC_SERVICE_ACCOUNT_JSON="$HOME/autoblog-service-account.json"
export GA4_SERVICE_ACCOUNT_JSON="$HOME/autoblog-service-account.json"
```
```js
gsc: { enabled: true, propertyUrl: 'sc-domain:your-domain.com', quotaProject: 'your-project-id' },
analytics: { enabled: true, propertyId: '123456789' },
```

**6. GitHub Actions secrets**
```bash
gh secret set GSC_SERVICE_ACCOUNT_JSON --repo your-org/your-repo < ~/autoblog-service-account.json
gh secret set GA4_SERVICE_ACCOUNT_JSON --repo your-org/your-repo < ~/autoblog-service-account.json
```

</details>

---

## Updating

```bash
npm update @stayboba/autoblog
```

### What to check after updating

1. `npx autoblog --dry-run` to verify pipeline works
2. Check `autoblog.config.example.mjs` for new config sections
3. Context file — new fields added automatically; old files work without migration
4. Checkpoint directory — add `.autoblog-checkpoints/` to `.gitignore`

### Version history

| Version | Changes |
|---------|---------|
| **2.0.0** | Discrete step architecture (26 steps), step runner + checkpoint system, `--steps` / `--resume` CLI, named sequences (`audit`, `refresh`, `research`), 9 new strategic capabilities (content refresh, performance audit, topical authority, SERP features, competitor analysis, GEO tracking, intent-format, repurposing, cross-model review), 286 tests |
| **1.3.1** | Fix Telegram notifications: HTML-escape, response body check, failure notifications |
| **1.3.0** | Telegram notifications, humanizer frontmatter guard |
| **1.2.0** | Context feedback loop, strategy balancer, local content engine, topic backlog, GSC schedule frequency, OAuth support, 135 tests |
| **1.1.0** | GSC mining, meta optimizer, cross-model review, schema embedder, context persistence, CMS publishing, intent classification |
| **1.0.1** | Fix bin path for npx resolution |
| **1.0.0** | Initial release — core pipeline with 9 steps |

---

## Project Structure

```
autoblog/
+-- bin/autoblog.mjs                   # CLI entry point
+-- lib/
|   +-- pipeline.mjs                   # Thin wrapper --> runSteps()
|   +-- runner.mjs                     # Step executor + checkpoint integration
|   +-- step-registry.mjs              # Step definitions + named sequences
|   +-- checkpoint.mjs                 # Save/load/clean checkpoint state
|   +-- steps/                         # 26 discrete step wrappers
|   +-- config.mjs                     # Config loader + strategy merge
|   +-- prompts.mjs                    # All Gemini prompt builders (single source of truth)
|   +-- [35 modules]                   # See Module Map above for full list
+-- test/
|   +-- fixtures/                      # Mock data
|   +-- [20 test files]                # 286 tests (see Testing section)
+-- autoblog.config.example.mjs        # Full config reference
+-- package.json
```

---

## Testing

286 tests across 20 test files using Node.js built-in `node:test` (zero test dependencies).

```bash
npm test
```

### Scenario simulation

Visualize how context and strategy data changes prompts:

```bash
node test/simulate-context-diff.mjs --diff
node test/simulate-context-diff.mjs --prompt research
node test/simulate-context-diff.mjs --scenario 1,4 --diff
```

---

## License

MIT - see [LICENSE](./LICENSE)
