# @stayboba/autoblog

**Automated blog content pipeline that writes, optimizes, and publishes SEO-compliant blog posts on autopilot.**

You describe your product, define your topic areas, and set a schedule. The pipeline discovers trending topics, researches real keyword data, writes full blog posts, removes AI writing patterns, generates cover images, and translates to multiple languages — all from a single config file.

Built for SaaS companies, content teams, and agencies that want a repeatable, quality-controlled blog pipeline running via GitHub Actions or manual execution.

---

## Table of Contents

- [What You Need Before Starting](#-what-you-need-before-starting)
- [Setup (5 Minutes)](#-setup-5-minutes)
- [Controlling What the Blog Writes About](#-controlling-what-the-blog-writes-about)
- [How the Pipeline Works](#-how-the-pipeline-works)
- [Content Quality and SEO Compliance](#-content-quality-and-seo-compliance)
- [Tech Stack and Architecture](#-tech-stack-and-architecture)
- [Configuration Reference](#-configuration-reference)
- [Running on Autopilot (GitHub Actions)](#-running-on-autopilot-github-actions)
- [For AI Agents — Setting Up Autoblog in a New Project](#-for-ai-agents--setting-up-autoblog-in-a-new-project)

---

## 📋 What You Need Before Starting

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

## 🚀 Setup (5 Minutes)

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

## 📝 Controlling What the Blog Writes About

This is the most important section. Everything the pipeline writes — topics, tone, product mentions, sources, audience — is controlled through `autoblog.config.mjs`. Here's exactly where each decision lives.

---

### What is the blog about? → `product` section

This is the foundation. The pipeline injects your product context into every prompt, so the LLM knows what it's writing for.

```js
product: {
  // Your product/brand name — appears in blog posts
  name: 'AcmeSaaS',

  // Your website — used for links in the content
  url: 'https://acme.com',

  // One-sentence description — tells the LLM what category you're in
  description: 'Project management tool for remote engineering teams',

  // Features the LLM can reference in articles
  // Be specific — the LLM weaves these into posts contextually
  features: [
    'Async Standups — automated daily standups across time zones',
    'Sprint Analytics — track velocity without manual calculation',
    'Slack Integration — manage tasks without leaving Slack',
  ],

  // Tone instruction — one sentence that shapes the voice
  tone: 'Technical but approachable. Write for engineering managers, not executives.',
}
```

**What this controls:** Every blog post will reference your product naturally, mention relevant features in context, and link back to your site. The tone instruction affects vocabulary, complexity, and style across all generated content.

---

### What topics does it cover? → `topics.clusters` section

Topic clusters define the **content pillars** your blog writes about. Each cluster has a name and a list of Google Search queries the pipeline uses to find trending topics.

```js
topics: {
  clusters: [
    {
      name: 'Remote Work',              // Category name (matches authors)
      queries: [                        // Search queries for topic discovery
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
    {
      name: 'Engineering Culture',
      queries: [
        'sprint retrospective techniques',
        'engineering team burnout prevention',
        'developer experience metrics',
      ],
    },
  ],
}
```

**Tips for writing good search queries:**
- Include the current year for recency: `"remote work trends 2026"`
- Mix broad and specific: `"project management"` (broad) + `"async standup tools for distributed teams"` (specific)
- Include competitor names if you want comparison content: `"Jira vs Linear"`, `"Asana alternative"`
- Include question formats: `"how to run sprint retros remotely"`
- Aim for 3-8 queries per cluster, 3-6 clusters total

**What this controls:** The pipeline searches Google for these queries, finds trending articles and discussions, and generates blog post ideas from the results. It will never write about topics outside your clusters unless you add them.

---

### What geographic angles should it cover? → `topics.regionalContexts`

Optional. Adds geographic diversity to topic research.

```js
topics: {
  regionalContexts: [
    { region: 'United States', focus: 'tech layoffs, return-to-office mandates' },
    { region: 'Europe', focus: 'GDPR implications for project management tools' },
    { region: 'India', focus: 'growing IT outsourcing market, time zone challenges' },
  ],
}
```

**What this controls:** The pipeline considers these regional angles when generating topics, producing content relevant to different markets.

---

### Who writes the posts? → `authors` section

Define author personas. The pipeline automatically picks the best author for each topic based on category matching.

```js
authors: [
  {
    name: 'Alex Rivera',
    role: 'Engineering Lead',
    image: '/images/authors/alex.png',
    categories: ['Remote Work', 'Engineering Culture'],  // writes about these topics
  },
  {
    name: 'Priya Sharma',
    role: 'Product Analyst',
    image: '/images/authors/priya.png',
    categories: ['Competitor', 'Product'],
  },
],
fallbackAuthor: 'Alex Rivera',  // used when no category match
```

**What this controls:** Each post gets an appropriate byline. Author names, roles, and images appear in the frontmatter. The pipeline won't randomly assign authors — it matches by category.

---

### What NOT to include → `topics.clusters` (by exclusion) + `product.tone`

The pipeline only writes about topics that match your search queries. If you don't include queries about a subject, it won't write about it.

To explicitly steer away from certain content:

```js
product: {
  // The tone instruction can include "don't" guidance
  tone: 'Technical but approachable. Never write about pricing. ' +
        'Avoid mentioning specific customer names. ' +
        'Do not compare on price — compare on features only.',
}
```

You can also add negative guidance through the content calendar:

```js
schedule: {
  calendar: [
    {
      date: '2026-06-01',
      topic: 'Linear vs AcmeSaaS Feature Comparison',
      notes: 'Do NOT mention pricing. Focus only on feature differences. ' +
             'Acknowledge Linear strengths honestly. Do not bash competitors.',
    },
  ],
}
```

---

### How do I match a specific writing style? → `product.styleGuide`

If you have a human-written blog post that captures your ideal tone and style, or brand voice rules you want every post to follow, you can feed these into the pipeline.

```js
product: {
  // ... name, url, features, etc.

  styleGuide: {
    // Option 1: Inline brand voice rules
    voice: `
      Write in second person ("you", not "parents").
      Short paragraphs — 2-3 sentences max.
      No jargon. If you must use a technical term, define it immediately.
      Start sections with a direct answer, then elaborate.
      Use "but" and "and" to start sentences occasionally.
    `,

    // Option 2: Load from a file
    // voiceFile: './style/voice-rules.md',

    // Option 3: Provide a reference post to match
    // referencePost: '...full text of a blog post...',
    // referencePostFile: './style/reference-post.md',
  },
}
```

**Two types of guidance:**

| Type | What it does | When to use |
|------|-------------|-------------|
| `voice` | Prescriptive rules the writer follows | You can articulate your style as rules ("short paragraphs", "second person", "no jargon") |
| `referencePost` | The pipeline studies a sample post and matches its rhythm, vocabulary, and structure | You have a post that "sounds right" but can't articulate why |

**How it works in the pipeline:**

1. **Writer step** — style guide is injected into the generation prompt, so the initial draft is already closer to your target style
2. **Humanizer step** — after removing AI patterns, the humanizer applies a second transformation toward your reference style. Temperature increases from 0.3 → 0.7 to allow more creative rewriting

**File vs inline:** For both `voice` and `referencePost`, you can provide content inline in the config or point to a file. File takes precedence when both are set. Use files when the content is long or shared across projects.

**Omitting `styleGuide`:** Zero behavior change. The pipeline runs exactly as before.

---

### What sources should it use? → Built into the research step

The pipeline uses **Gemini with Google Search grounding** for topic research. This means:

- It searches real, current Google results (not just LLM training data)
- It finds recent news articles, blog posts, and social media discussions
- It prioritizes content from the last 7 days (configurable via `topics.recencyDays`)

You control source quality through your search queries:
- **Broad queries** → pulls from mainstream tech publications, news sites
- **Specific queries** → pulls from niche blogs, industry reports, Reddit/Twitter discussions
- **Academic queries** → add terms like "study", "research", "data" to your queries

The writer prompt instructs the LLM to **attribute all statistics** with source and year inline. Vague attribution ("studies show", "experts say") is explicitly prohibited.

```js
topics: {
  recencyDays: 7,       // only consider sources from last N days
  maxCandidates: 5,     // how many topic ideas to generate before deduplication
}
```

---

### What SEO keywords should it target? → `seo` section

**Without DataForSEO** (`seo.enabled: false`): Gemini still runs an intelligent keyword strategy — analyzing your topic against all existing blog posts to find keyword gaps and suggest seed keywords. The writer gets gap-aware keyword guidance, just without volume/difficulty numbers.

**With DataForSEO** (`seo.enabled: true`): The pipeline gets real search volume, keyword difficulty, related terms, and People Also Ask questions before writing. This data is injected into the writer prompt.

```js
seo: {
  enabled: true,
  apiLogin: process.env.DATAFORSEO_LOGIN,
  apiPassword: process.env.DATAFORSEO_PASSWORD,
  location: 2840,            // US search data (see config example for other country codes)
  maxDifficulty: 60,         // skip keywords harder than this (0-100 scale)
  minSearchVolume: 100,      // ignore keywords with fewer monthly searches
  maxRelatedKeywords: 10,    // how many secondary keywords to pass to the writer
}
```

**What this controls:** The blog targets real search queries with known volume. Posts include primary and secondary keywords naturally, and FAQ sections use real "People Also Ask" questions.

---

### When should it publish? → `schedule` section

Two levels of control:

**Level 1 — How often** (cron expression):
```js
schedule: {
  cron: '17 8 */3 * *',   // every 3 days at 8:17 UTC
  postsPerRun: 1,          // posts per execution
}
```

**Level 2 — What to write on specific days** (content calendar):
```js
schedule: {
  calendar: [
    // Just steer toward a category — research finds the specific topic
    { date: '2026-06-01', category: 'Remote Work' },

    // Specify an exact topic — skips research entirely
    { date: '2026-06-04', topic: 'How to Run Async Standups That Actually Work' },

    // Full editorial control
    {
      date: '2026-06-08',
      topic: 'Linear vs AcmeSaaS: 2026 Feature Comparison',
      category: 'Competitor',
      keywords: ['linear alternative', 'best project management tool'],
      notes: 'Objective comparison. Acknowledge Linear strengths.',
      priority: 'high',  // skip deduplication (intentional overlap with existing post)
    },
  ],
}
```

**Days without calendar entries** → the pipeline discovers trending topics automatically.  
**Days with calendar entries** → the pipeline follows your instructions.

---

## ⚙️ How the Pipeline Works

9 steps, executed in sequence. Each step can be turned on or off independently.

```
┌──────────┐   ┌──────────┐   ┌─────────┐   ┌─────────────┐   ┌─────────┐
│ Schedule │──>│ Research  │──>│ Dedupe  │──>│  Keywords   │──>│  Write  │
│ (calendar)│   │ (Gemini+  │   │ (Gemini │   │(Gemini+DFSEO)│   │(Gemini) │
│          │   │  Google)  │   │semantic)│   │             │   │         │
└──────────┘   └──────────┘   └─────────┘   └─────────────┘   └────┬────┘
                                                                     │
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌───────────┐          │
│Translate │<──│  Image   │<──│ Validate │<──│ Humanize  │<─────────┘
│(Gemini×N)│   │ (Gemini) │   │ (local)  │   │ (Gemini)  │
└──────────┘   └──────────┘   └──────────┘   └───────────┘
```

| # | Step | What happens | API calls | Toggle |
|---|------|-------------|-----------|--------|
| 1 | **Schedule** | Checks content calendar for today. Uses calendar entry if found, otherwise proceeds to research. | 0 | `steps.calendar` |
| 2 | **Research** | Searches Google (via Gemini grounding) for trending topics matching your clusters. Returns 10-15 candidates ranked by recency. | 1 | `steps.research` |
| 3 | **Dedupe** | Sends candidates + all existing post titles to Gemini. Catches semantic duplicates even with different wording. | 1 | `steps.dedupe` |
| 4 | **Keywords** | Gemini analyzes topic + existing blog content to find keyword gaps, then calls DataForSEO for volumes, difficulty, related terms, SERP competitors, PAA. When DataForSEO is unavailable, Gemini-only keyword guidance is still provided to the writer. | 1 Gemini + 4 DataForSEO | `steps.keywordResearch` |
| 5 | **Write** | Gemini generates the full post: YAML frontmatter + HTML/markdown body. Includes product context, keyword data, GEO/AEO rules. | 1 | Always on |
| 6 | **Humanize** | Second Gemini pass removes AI writing patterns (significance inflation, promotional language, filler, structural tells). | 1 | `steps.humanize` |
| 7 | **Validate** | Local quality check: word count, frontmatter fields, readability score, GEO/AEO compliance score. Zero API calls. | 0 | `steps.validate` |
| 8 | **Image** | Gemini generates a 16:9 conceptual cover illustration. Saves as PNG. | 1 | `steps.image` |
| 9 | **Translate** | Translates to each configured language. Brand names preserved. Partial success: saves what succeeds. | N | `steps.translate` |

### How the Keyword Step Works

The keyword step has two layers:

**Layer 1 — Gemini Keyword Strategy (always runs)**

Gemini receives the selected topic + metadata from all existing blog posts (titles, keywords) + your SEO constraints from config. It returns:

- **Primary seed keywords** — 3-5 specific phrases to research
- **Question keywords** — 2-3 question-format keywords for FAQ sections
- **Gap analysis** — what keyword gap this post fills vs existing content
- **Avoid keywords** — keywords the blog already covers (prevents cannibalization)

This replaces naive string-splitting of the topic title. The output is gap-aware and considers your entire blog history.

**Layer 2 — DataForSEO Enrichment (only when `seo.enabled: true`)**

The Gemini-selected seeds are sent to DataForSEO for real search volume, difficulty scores, related terms, SERP competitors, and People Also Ask questions. This data-driven layer adds volume/difficulty numbers to guide the writer's keyword density and FAQ section.

**When DataForSEO is unavailable:** The writer still gets the Gemini keyword strategy output — gap-aware keyword guidance with `null` volume/difficulty. The writer uses these keywords naturally without density targets.

---

## 🔍 Content Quality and SEO Compliance

### Humanization — Removing AI Writing Patterns

Every post passes through an AI pattern removal step based on [Wikipedia's "Signs of AI writing"](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing). The humanizer targets:

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

| Structure | Why it matters | How it's checked |
|-----------|---------------|-----------------|
| **TL;DR section** | AI overviews extract and cite summary blocks | Validator checks for presence |
| **Key Takeaways** (4-6 bullets) | Perplexity and ChatGPT cite bullet lists | Validator checks for presence |
| **Question-based headings** (3+) | Matches People Also Ask queries | Validator counts question headings |
| **Direct-answer paragraphs** | AI engines extract the first sentence after headings | Validator detects filler openers |
| **FAQ section** | Powers FAQ rich snippets and AI answer boxes | Validator checks for presence |
| **Entity definitions** | AI engines extract definitions | Enforced in writer prompt |
| **Attributed statistics** | AI engines penalize unattributed claims | Enforced in writer prompt |
| **Schema-ready frontmatter** | `BlogPosting` + `FAQPage` JSON-LD data | Validator checks for `schema` and `qa` fields |

The validator outputs a **GEO/AEO score** (0-100):

```
Step 7/9: Validating post quality...
  Readability: Grade 7.2 (1,247 words)
  GEO/AEO score: 86/100
  ✓ Validation passed
```

### Schema Markup

The pipeline generates **schema-ready frontmatter** — your website renders it as JSON-LD:

```yaml
# Generated by autoblog in frontmatter:
schema:
  type: "BlogPosting"
  headline: "How to Run Async Standups That Actually Work"
  description: "Async standups eliminate timezone pain..."
  wordCount: 1247
  keywords: "async standups, remote standup tool"
qa:
  - question: "How do async standups work?"
    answer: "Team members post updates at any time during their workday..."
  - question: "Are async standups better than live standups?"
    answer: "For distributed teams across 3+ time zones, async standups..."
```

Your website template converts `schema` → `BlogPosting` JSON-LD and `qa` → `FAQPage` JSON-LD. The autoblog does not inject `<script>` tags into the markdown — that's your website's responsibility.

### Readability Scoring

Flesch-Kincaid grade level, calculated locally (zero API calls):

```js
readability: {
  targetGrade: { min: 6, max: 10 },  // 6th-10th grade reading level
  warnOnly: true,                     // warn but don't block
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

## 🔧 Tech Stack and Architecture

### Runtime Dependency

| Package | Purpose |
|---------|---------|
| `@google/generative-ai` (^0.21.0) | Gemini API client for text, image, and Google Search grounding |

**That's it.** One dependency. Everything else uses Node.js built-ins (`fetch`, `fs`, `path`, `url`).

### External APIs

| API | Auth method | What it provides |
|-----|------------|-----------------|
| **Gemini API** | API key via SDK | Topic research, keyword strategy, writing, humanization, translation, image generation |
| **DataForSEO REST API** | Basic auth (login:password) | Keyword volumes, difficulty, related keywords, SERP competitors, PAA questions |

### Models Used

| Model | Used for | Configurable via |
|-------|----------|-----------------|
| `gemini-2.5-flash` | All text generation | `config.models.text` |
| `gemini-2.5-flash-image` | Cover image generation | `config.models.image` |

### Module Map

```
bin/autoblog.mjs ─── CLI entry point (--dry-run, --batch, --config, --init-strategy)
        │
        ▼
lib/pipeline.mjs ─── Orchestrates 16 steps in sequence
        │
        ├── lib/config.mjs ──────────── Loads config + .autoblog-strategy.json, merges defaults
        ├── lib/prompts.mjs ─────────── All Gemini prompts consolidated (12 prompt builders)
        ├── lib/retry.mjs ───────────── Exponential backoff (rate_limit / network / bad_output / fatal)
        ├── lib/scheduler.mjs ───────── Content calendar resolution
        ├── lib/strategy-balancer.mjs ── Content diversity gap analysis + balancing directive
        ├── lib/strategy-wizard.mjs ─── Interactive --init-strategy wizard (readline + Gemini)
        ├── lib/local-content.mjs ───── Template-based geo page generation
        ├── lib/gsc.mjs ─────────────── Google Search Console mining + schedule frequency
        ├── lib/context.mjs ─────────── Context persistence + performance feedback loop + GA4
        ├── lib/topics.mjs ──────────── Gemini + Google Search topic discovery
        ├── lib/deduper.mjs ─────────── Semantic deduplication via Gemini
        ├── lib/keyword-research.mjs ── Intelligent keyword strategy (Gemini) + DataForSEO
        ├── lib/linker.mjs ──────────── Internal linking (keyword-to-slug index)
        ├── lib/writer.mjs ──────────── Blog post generation with GEO/AEO rules
        ├── lib/style-guide.mjs ─────── Style guide resolver (voice + reference post)
        ├── lib/humanizer.mjs ───────── AI pattern removal + style matching
        ├── lib/meta-optimizer.mjs ──── CTR-optimized titles (optional)
        ├── lib/cross-reviewer.mjs ──── Cross-model quality review (optional)
        ├── lib/validator.mjs ───────── Quality gate + GEO/AEO scoring (0 API calls)
        ├── lib/readability.mjs ─────── Flesch-Kincaid grade level (0 API calls)
        ├── lib/schema-embedder.mjs ─── JSON-LD BlogPosting + FAQPage embedding (optional)
        ├── lib/image-generator.mjs ─── Cover image via Gemini image model
        ├── lib/translator.mjs ──────── Multi-language with brand name preservation
        └── lib/publisher.mjs ───────── CMS publishing — 5 adapters (optional)
```

### DataForSEO Endpoints

| Endpoint | What it returns | Approx. cost |
|----------|----------------|-------------|
| `/dataforseo_labs/google/keyword_overview/live` | Search volume + difficulty for seed keywords | ~$0.01 |
| `/dataforseo_labs/google/related_keywords/live` | Expanded related terms | ~$0.05 |
| `/dataforseo_labs/google/serp_competitors/live` | Top-ranking domains | ~$0.05 |
| `/dataforseo_labs/google/keyword_suggestions/live` | Question-format keywords for FAQ | ~$0.05 |

### Prompt Architecture

All 9 Gemini prompt builders are consolidated in a single file: `lib/prompts.mjs`. This is a pure-function module with zero imports from other lib files — each function takes a destructured object and returns a string.

| Function | Used by | Purpose |
|----------|---------|---------|
| `buildResearchPrompt` | topics.mjs | Topic discovery via Google Search grounding |
| `buildDedupePrompt` | deduper.mjs | Semantic deduplication against existing posts |
| `buildKeywordStrategyPrompt` | keyword-research.mjs | Intelligent seed keyword selection + gap analysis |
| `buildWriterPrompt` | writer.mjs | Full blog post generation with GEO/AEO rules |
| `buildStyleGuideBlock` | (used by buildWriterPrompt) | Style guide injection into writer prompt |
| `buildHumanizationPrompt` | humanizer.mjs | AI pattern removal system instruction |
| `buildHumanizationUserPrompt` | humanizer.mjs | Humanization user message with content |
| `buildTranslationPrompt` | translator.mjs | Multi-language translation with brand preservation |
| `buildImagePrompt` | image-generator.mjs | Cover image generation prompt |

To review or update any prompt, edit `lib/prompts.mjs` — no need to search across module files.

### Design Principles

- **Config-driven**: All project-specific content lives in one config file. No hardcoded product names, URLs, or topic areas in source code.
- **Prompts in one file**: All Gemini prompts consolidated in `lib/prompts.mjs` for easy review and iteration.
- **Stateless**: Reads from disk, writes to disk, exits. No database, no API server. Git is the state store.
- **Partial success**: If 5/6 translations succeed, saves those 5 and reports the failure. If image generation fails, post continues without an image.
- **Retry-aware**: Every API call is wrapped in exponential backoff. Rate limits (429) get longer delays. Fatal errors (401/403) are not retried.

---

## 📖 Configuration Reference

Full configuration with every option: [`autoblog.config.example.mjs`](./autoblog.config.example.mjs)

### Quick reference of all config sections

| Section | What it controls | Required? |
|---------|-----------------|-----------|
| `product` | Product name, URL, description, features, tone, brand names | Yes |
| `authors` | Author roster with name, role, image, category assignments | Yes |
| `topics` | Topic clusters (search queries), regional contexts, recency | Yes |
| `output` | Post/image directories, body format (html/md/mdx), frontmatter schema, word count, CTA markers | Has defaults |
| `translation` | Enabled flag, language codes, rate limiting | Has defaults (disabled) |
| `models` | Gemini model names for text and image | Has defaults |
| `steps` | Toggle each pipeline step on/off | Has defaults (all on) |
| `notifications` | Telegram/Slack config | Optional |
| `retry` | Max attempts, base delay for exponential backoff | Has defaults |
| `seo` | DataForSEO credentials, location, difficulty/volume thresholds | Has defaults (disabled) |
| `schedule` | Cron expression, posts per run, content calendar | Has defaults |
| `readability` | Target Flesch-Kincaid grade range, warn vs. fail | Has defaults |
| `gsc` | GSC property URL, lookback days, schedule frequency | Optional |
| `context` | Enable performance feedback loop, file path | Optional |
| `analytics` | GA4 property ID for pageview/engagement tracking | Optional |
| `contentStrategy` | Intent mix, format mix, category weights, local content (via `--init-strategy` or `.autoblog-strategy.json`) | Optional |

### Body format options

| Format | Config value | Output | Best for |
|--------|-------------|--------|----------|
| HTML | `'html'` | `<article><section><h2><p>` | Next.js, custom rendering |
| Markdown | `'markdown'` | `## Heading\n\nParagraph` | Hugo, Jekyll, Gatsby, Astro |
| MDX | `'mdx'` | Markdown + JSX components | MDX-based sites |

### Astro content collections

Autoblog generates standard `.md` files with YAML frontmatter — compatible with Astro's content collections. Set `bodyFormat: 'markdown'` and define a matching Zod schema in your `src/content.config.ts`:

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
    seoKeywords: z.string(),  // always comma-separated string (normalized by pipeline)
    readingTime: z.string().optional(),
    relatedPosts: z.array(z.string()).default([]),  // empty array when no related posts
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

Set `output.postsDir` to your Astro content directory (e.g., `src/content/blog`).

---

## ⚡ Optional Enhancements

All features below are **opt-in**. Each activates only when its config flag is enabled and/or API credentials are present. If credentials are missing or an API call fails, the feature is silently skipped and the pipeline continues normally.

### GSC-Informed Topic Research

Mines Google Search Console data before trending research to find quick-win keywords (position 4-15), orphan queries (high impressions, no dedicated page), and declining pages that need refreshing.

```js
// In autoblog.config.mjs
gsc: {
  enabled: true,
  propertyUrl: 'sc-domain:example.com',
}
```

**Requires:** `GSC_SERVICE_ACCOUNT_JSON` env var — supports both:
- **Service account key** (JSON with `client_email` + `private_key`) — for autonomous GitHub Actions
- **OAuth user credentials** (JSON with `client_id` + `refresh_token`) — for local development

For service accounts, verify domain ownership via DNS TXT record so the account gets `siteOwner` permission. Add `gsc.quotaProject` with your GCP project ID.

### Search Intent Classification

Automatically classifies keywords as informational, commercial, transactional, or navigational. The writer then structures the post to match searcher expectations (how-to guide vs. comparison vs. product tutorial).

**No config needed** — automatically enhances existing keyword research when `steps.keywordResearch: true`.

### Meta Tag Optimization

After writing, generates 3 optimized title variants using different hook strategies (curiosity, benefit, specificity) and picks the highest-scoring one. Also optimizes the meta description to 150-160 characters.

```js
steps: { metaOptimize: true }
```

**Cost:** ~$0.001 per post (1 Gemini Flash call).

### Cross-Model Quality Review

Sends the post to a stronger model (Gemini Pro) for quality scoring on factual accuracy, keyword naturalness, tone alignment, and structure. If the score is below threshold, automatically rewrites incorporating the feedback.

```js
steps: { crossModelReview: true },
crossModel: {
  model: 'gemini-2.5-pro',
  qualityThreshold: 7,
}
```

**Cost:** ~$0.02-0.05 per post (1 Gemini Pro call, possibly 1 rewrite).

### Embedded JSON-LD Schema

Generates BlogPosting and FAQPage JSON-LD `<script>` blocks from frontmatter and embeds them directly in the post body. Your site renders the post and gets schema markup for free.

```js
steps: { embedSchema: true },
output: { siteUrl: 'https://example.com' }
```

### Context Persistence + Performance Feedback Loop

Maintains a `.autoblog-context.json` file that tracks which topics were generated, what keywords were targeted, and (optionally) performance data from GSC and GA4. **The feedback loop feeds this data back into topic research and keyword strategy** — the pipeline avoids declining keyword angles and prioritizes categories that perform well.

```js
context: { enabled: true },
// Optional: GA4 performance tracking
analytics: { enabled: true, propertyId: '123456789' }
```

When performance data is available, the pipeline:
- Injects top-performing and underperforming categories into the research prompt
- Flags declining keywords (position > 15) to prevent cannibalization
- Computes trend per post (strong/moderate/weak based on position)
- Ignores stale data (> 60 days old)

**Requires:** `GA4_SERVICE_ACCOUNT_JSON` env var — supports both service account keys and OAuth user credentials (same as GSC). For service accounts, grant Viewer access via the GA4 Admin API or link the GA4 property to your GCP project via BigQuery.

### GSC Schedule Frequency

Control how often GSC data is mined, independent of pipeline cron. GSC data lags 2-3 days and rankings need 7-14 days to settle — running every pipeline execution is wasteful.

```js
gsc: {
  enabled: true,
  propertyUrl: 'sc-domain:example.com',
  schedule: {
    frequency: 'weekly',  // 'every-run' | 'weekly' | 'biweekly' | 'monthly' | number (days)
  },
}
```

### Content Strategy + Self-Balancing (`--init-strategy`)

Interactive wizard that asks about your business goals, audience, and competitors, then uses Gemini to recommend an optimal content mix. The pipeline self-balances over time.

```bash
npx autoblog --init-strategy    # launches interactive wizard
```

The wizard asks 6 questions, then saves a `.autoblog-strategy.json` with:
- **Intent mix** — target % for informational, commercial, transactional, navigational
- **Format mix** — target % for how-to, comparison, listicle, news-analysis, tutorial, local-guide, case-study
- **Category weights** — relative weight per topic cluster
- **Local content config** — cities, templates, throttling

Each pipeline run compares actual content distribution against targets. When the mix drifts beyond tolerance (default 10%), the balancer injects a directive into research and keyword prompts (e.g., "prioritize commercial/comparison content").

### Local Content Engine (Programmatic SEO)

Template-based generation of location-specific pages. Define cities and templates; the pipeline generates one per run until all combinations are fulfilled.

```js
// In .autoblog-strategy.json (generated by wizard) or inline in config
contentStrategy: {
  localContent: {
    enabled: true,
    locations: [
      { city: 'Melbourne', region: 'Victoria', country: 'AU' },
      { city: 'Sydney', region: 'New South Wales', country: 'AU' },
    ],
    templates: [
      'How to Find Verified Building Leads in {city} ({year})',
      'Best Contractors in {city}: What to Look For',
    ],
    maxPerWeek: 1,
  },
}
```

Enable with `steps: { localContent: true }`. The writer receives location-specific guidance (mention local industry, use city in headings, add local FAQ).

### Topic Backlog

Research generates 5-10 candidate topics per run but only 1 gets written. Previously the rest were discarded. Now:

- **Time-sensitive topics** (relevanceScore >= 0.8, breaking news) are written immediately
- **Evergreen topics** (score < 0.8, guides, comparisons) are saved to `topicBacklog[]` in the context file
- Next run checks backlog first — picks top topic, only does fresh Gemini research if empty
- Topics expire after 30 days, capped at 30 entries

```
Run 1: Research finds 5 topics → writes #1 (breaking news) → saves #2-#4 to backlog
Run 2: Checks backlog → picks #2 → writes it → #3-#4 remain
Run 3: Checks backlog → picks #3 → writes it
Run 4: Backlog empty → fresh Gemini research
```

**Requires:** `context.enabled: true`. No additional config needed.

### CMS Direct Publishing

After saving files locally, also pushes to your CMS via REST API. Supports WordPress, Ghost, Webflow, Strapi, and Contentful.

```js
publish: {
  cms: 'wordpress',  // or 'ghost', 'webflow', 'strapi', 'contentful'
  draft: true,       // publish as draft
}
```

**Auth via env vars** — see the secrets table in the GitHub Actions section below.

---

## 🤖 Running on Autopilot (GitHub Actions)

### Setup

1. Copy the workflow template:
   ```bash
   cp templates/github-workflow.yml .github/workflows/auto-blog.yml
   ```

2. Edit the workflow — search for `<!-- CHANGE -->` comments and update:
   - Cron schedule (match your `schedule.cron`)
   - Git committer email (must be authorized by your deploy platform)
   - Deploy platform config (Vercel by default — swap for Netlify/Cloudflare/GitHub Pages)
   - Notification config (Telegram chat ID or remove)

3. Add secrets to your GitHub repo (Settings → Secrets → Actions):

| Secret | Required |
|--------|----------|
| `GEMINI_API_KEY` | Yes |
| `DATAFORSEO_LOGIN` | If `seo.enabled` |
| `DATAFORSEO_PASSWORD` | If `seo.enabled` |
| `GSC_SERVICE_ACCOUNT_JSON` | If `gsc.enabled` (GSC topic mining) |
| `GA4_SERVICE_ACCOUNT_JSON` | If `analytics.enabled` (GA4 performance tracking) |
| `CMS_ENDPOINT` | If `publish.cms` is set |
| `CMS_USERNAME` / `CMS_PASSWORD` | WordPress publishing |
| `CMS_ADMIN_API_KEY` | Ghost publishing (id:secret format) |
| `CMS_API_TOKEN` | Webflow/Strapi/Contentful publishing |
| `CMS_COLLECTION_ID` | Webflow publishing |
| `CMS_SPACE_ID` | Contentful publishing |
| `VERCEL_TOKEN` | If deploying to Vercel |
| `TELEGRAM_BOT_TOKEN` | For notifications |
| `TELEGRAM_CHAT_ID` | For notifications |

### Manual trigger

The workflow supports manual execution from the GitHub Actions UI with inputs for `--batch` count and `--dry-run` mode.

### Batch mode for seeding

```bash
npx autoblog --batch 10
```

Generates 10 posts sequentially. Deduplication is cumulative (post 3 knows about posts 1 and 2). If post 5 fails, posts 1-4 are still saved and the pipeline continues to post 6.

---

## 🤖 For AI Agents — Setting Up Autoblog in a New Project

Copy the prompt below and give it to your AI coding agent (Claude Code, Cursor, Windsurf, Copilot, etc.) to set up autoblog in your project.

### Setup Prompt

```
I want to set up @stayboba/autoblog — an automated blog content pipeline that uses Gemini AI
to research trending topics, write SEO-optimized blog posts, generate cover images, and
optionally translate to multiple languages.

Package: https://www.npmjs.com/package/@stayboba/autoblog
Docs: https://github.com/arul-buk/autoblog

Here's what I need you to do:

STEP 1: GATHER INFORMATION

Before doing anything, ask me ALL of the following questions at once (not one by one):

1. Product name — What is the product/brand name?
2. Product URL — What is the website URL?
3. Product description — One sentence describing what the product does and who it's for.
4. Key features — List 3-6 features the AI can reference in blog posts. Be specific
   (e.g., "Async Standups — automated daily standups across time zones" not just "standups").
5. Tone — How should the blog sound? (e.g., "Technical but approachable, write for
   engineering managers" or "Friendly and reassuring, write for non-technical parents")
6. Topic clusters — What 3-6 content pillars should the blog cover? For each, give me
   3-8 Google search queries the pipeline will use to find trending topics. Include the
   current year for recency.
7. Authors — 1-3 author personas (name, role, which topic clusters they cover). Can be fictional.
8. Blog post format — Does your site use HTML body (<article><section><h2><p>), markdown, or MDX?
9. Output directories — Where should posts be saved (e.g., _posts/, src/content/blog/)?
   Where should cover images go (e.g., public/images/blog/)?
10. Translations — Do you want posts translated? If yes, which languages?
    (supported: es, pt, fr, de, zh, ja, ko, ar, hi, etc.)
11. DataForSEO — Do you have a DataForSEO account for real keyword volume data?
    (Optional — the pipeline works without it using Gemini-only keyword strategy)
12. Image style — Any specific visual style for cover images? (e.g., "Swiss Brutalist with
    dark backgrounds", "watercolor illustrations", or leave blank for the default minimalist style)
13. GitHub Actions — Do you want this running automatically on a schedule? If yes, how often?
    (e.g., every 3 days, weekly)
14. Optional enhancements — Do you want any of these? (all are opt-in, all skip gracefully):
    a. GSC topic mining — Mine Google Search Console for quick-win keywords (needs service account)
    b. Meta optimization — CTR-optimize titles with 3 variants (~$0.001/post)
    c. Cross-model review — Quality check via Gemini Pro (~$0.02-0.05/post)
    d. Embedded JSON-LD — Embed BlogPosting + FAQPage schema in post body
    e. Context persistence — Track posts + performance across runs
    f. GA4 analytics — Pull pageview/engagement data (needs service account)
    g. CMS publishing — Push to WordPress, Ghost, Webflow, Strapi, or Contentful

STEP 2: INSTALL AND CONFIGURE

Once I answer the questions above:

1. Run: npm install @stayboba/autoblog
2. Copy the example config:
   cp node_modules/@stayboba/autoblog/autoblog.config.example.mjs autoblog.config.mjs
3. Edit autoblog.config.mjs with my answers — fill in product, authors, topics, output
   paths, and all settings. Refer to the example config for the full schema.
4. Create a .env file with:
   GEMINI_API_KEY=          (I'll fill in the key — get one at https://aistudio.google.com/apikey)
   DATAFORSEO_LOGIN=        (only if using DataForSEO)
   DATAFORSEO_PASSWORD=     (only if using DataForSEO)
5. Add .env and autoblog.config.mjs to .gitignore if not already there

STEP 3: TEST IT

1. Run: npx autoblog --dry-run
2. Show me the output and confirm it looks correct
3. If it works, run: npx autoblog (generates one real post)
4. Verify the post was saved in the correct directory with proper frontmatter

STEP 4: SET UP GITHUB ACTIONS (if requested)

1. Copy the workflow template:
   cp node_modules/@stayboba/autoblog/templates/github-workflow.yml .github/workflows/auto-blog.yml
2. Edit the workflow with the correct cron schedule, output paths, and deploy command
   for my hosting provider (Vercel, Netlify, etc.)
3. Tell me what GitHub repository secrets I need to add:
   - GEMINI_API_KEY (required)
   - DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD (if using DataForSEO)
   - GSC_SERVICE_ACCOUNT_JSON (if using GSC topic mining)
   - GA4_SERVICE_ACCOUNT_JSON (if using GA4 analytics)
   - CMS_ENDPOINT, CMS_USERNAME, CMS_PASSWORD (if publishing to WordPress)
   - CMS_ENDPOINT, CMS_ADMIN_API_KEY (if publishing to Ghost)
   - CMS_API_TOKEN, CMS_COLLECTION_ID (if publishing to Webflow)
   - TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (if you want Telegram notifications)

STEP 5: VERIFY SITE RENDERS THE POSTS

1. Check that my site's blog rendering (frontmatter schema, content format) is compatible
   with the generated output
2. If using Astro 6, set up the content collection config with the correct Zod schema
   (see the README for the full schema)
3. If using Next.js, verify the markdown/MDX rendering pipeline handles the frontmatter fields
4. Start the dev server and confirm the generated post renders correctly

IMPORTANT NOTES:
- The Gemini API key is required. Get one free at https://aistudio.google.com/apikey
- DataForSEO is optional but recommended for real keyword data (~$0.04-0.20 per post)
- Each post costs ~$0.02-0.17 depending on pipeline steps enabled
- The pipeline generates: frontmatter (title, excerpt, author, date, category, coverImage,
  seoKeywords, readingTime, relatedPosts) + full article body
- Cover images are 16:9 AI-generated PNGs
- Do not embed pipeline code in the project — keep autoblog as a package dependency
- Do not modify autoblog source files — everything is config-driven
- Start with budget mode (no DataForSEO, no translations), enable features incrementally
```

### Architecture rules

- **Do not embed pipeline code in the consuming project.** Keep autoblog as a separate package. The config file is the only project-specific artifact.
- **Do not modify autoblog source files** to customize behavior. Everything is config-driven.
- **Schema markup is the website's job.** The pipeline outputs frontmatter; the website renders JSON-LD.
- **Start with budget mode.** Enable DataForSEO and translations after confirming the basic pipeline works.
- **The pipeline is stateless.** Reads from disk, writes to disk, exits. No database. Git is the state store.

### Frontmatter schema reference

The website needs to render JSON-LD schema from `schema` and `qa` frontmatter fields:

```js
// BlogPosting schema
const blogPostingSchema = {
  "@context": "https://schema.org",
  "@type": frontmatter.schema.type,          // "BlogPosting"
  "headline": frontmatter.schema.headline,
  "description": frontmatter.schema.description,
  "wordCount": frontmatter.schema.wordCount,
  "datePublished": frontmatter.date,
  "dateModified": frontmatter.lastModified,
  "author": { "@type": "Person", "name": frontmatter.author },
  "image": `https://${siteUrl}${frontmatter.coverImage}`,
};

// FAQPage schema
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": frontmatter.qa.map(item => ({
    "@type": "Question",
    "name": item.question,
    "acceptedAnswer": { "@type": "Answer", "text": item.answer },
  })),
};
```

### Troubleshooting

| Problem | Fix |
|---------|-----|
| `Config file not found` | Create `autoblog.config.mjs` or use `--config path` |
| `GEMINI_API_KEY required` | `export GEMINI_API_KEY=your-key` or add to `.env` file |
| `seo.apiLogin required` | Set DataForSEO env vars or set `seo.enabled: false` |
| `All candidate topics already covered` | Add new queries to `topics.clusters` or use calendar with specific topics |
| GEO/AEO score below 50 | Usually improves on re-run. Try `steps.humanize: false` temporarily to isolate. |
| Image generation failed | Post saved without image. Non-blocking. Re-run or generate manually. |
| Local topic deduped, pipeline exits | Fixed in 1.2.0 — now falls back to trending research automatically |
| DataForSEO returns no data for AU | Fixed in 1.2.0 — Gemini seed keywords used as fallback |
| `primaryKeyword` null in context | Fixed in 1.2.0 — seeds propagated when DataForSEO unavailable |

---

## 🔐 Google Service Account Setup (GSC + GA4)

One service account handles both GSC and GA4 across all your sites.

### Step 1 — Create GCP project + service account

```bash
gcloud projects create your-project-id
gcloud config set project your-project-id
gcloud services enable searchconsole.googleapis.com analyticsdata.googleapis.com analyticsadmin.googleapis.com siteverification.googleapis.com
gcloud iam service-accounts create autoblog-agent --display-name="Autoblog Pipeline Agent"
gcloud iam service-accounts keys create ~/autoblog-service-account.json \
  --iam-account=autoblog-agent@your-project-id.iam.gserviceaccount.com
```

### Step 2 — Grant project-level permissions

```bash
gcloud projects add-iam-policy-binding your-project-id \
  --member="serviceAccount:autoblog-agent@your-project-id.iam.gserviceaccount.com" \
  --role="roles/viewer"
gcloud projects add-iam-policy-binding your-project-id \
  --member="serviceAccount:autoblog-agent@your-project-id.iam.gserviceaccount.com" \
  --role="roles/serviceusage.serviceUsageConsumer"
```

### Step 3 — Verify domains for GSC (DNS method)

```bash
# Get verification token for each domain
# (use the Site Verification API — see gsc.mjs for the JWT auth pattern)

# Add TXT record to your DNS (e.g., via Cloudflare API)
# Then verify via the Site Verification API

# After verification, add the site to GSC:
# PUT https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Ayour-domain.com
```

The service account becomes `siteOwner` with full read access to search analytics.

### Step 4 — Grant GA4 access

Create an OAuth Desktop client in your GCP project (Cloud Console → APIs & Services → Credentials → OAuth client ID → Desktop). Use it to call the GA4 Admin API once:

```bash
# POST https://analyticsadmin.googleapis.com/v1alpha/accounts/{ACCOUNT_ID}/accessBindings
# Body: { "user": "autoblog-agent@your-project-id.iam.gserviceaccount.com", "roles": ["predefinedRoles/viewer"] }
# Requires: analytics.manage.users OAuth scope
```

This is a one-time operation. The service account then has permanent autonomous access.

### Step 5 — Configure

```bash
# In .env or shell profile
export GSC_SERVICE_ACCOUNT_JSON="$HOME/autoblog-service-account.json"
export GA4_SERVICE_ACCOUNT_JSON="$HOME/autoblog-service-account.json"

# In autoblog.config.mjs
gsc: {
  enabled: true,
  propertyUrl: 'sc-domain:your-domain.com',
  quotaProject: 'your-project-id',
  schedule: { frequency: 'weekly' },
},
analytics: {
  enabled: true,
  propertyId: '123456789',  // GA4 property ID (numeric)
},
```

### Step 6 — GitHub Actions secrets

```bash
gh secret set GSC_SERVICE_ACCOUNT_JSON --repo your-org/your-repo < ~/autoblog-service-account.json
gh secret set GA4_SERVICE_ACCOUNT_JSON --repo your-org/your-repo < ~/autoblog-service-account.json
```

---

## 📦 Updating

### From npm

```bash
npm update @stayboba/autoblog
```

### From GitHub source

```bash
npm install github:arul-buk/autoblog
```

### What to check after updating

1. **Run tests** — `npx autoblog --dry-run` to verify pipeline works with your config
2. **New config options** — check `autoblog.config.example.mjs` for new sections (all optional, backward compatible)
3. **Context file** — new fields are added automatically; old context files work without migration
4. **Strategy file** — `.autoblog-strategy.json` is optional; re-run `--init-strategy` to regenerate with new format options

### Version history

| Version | Changes |
|---------|---------|
| **1.2.0** | Context feedback loop, strategy balancer, local content engine, topic backlog, GSC schedule frequency, OAuth credential support, schema embedder fix, 135 tests |
| **1.1.0** | GSC mining, meta optimizer, cross-model review, schema embedder, context persistence, CMS publishing, intent classification |
| **1.0.1** | Fix bin path for npx resolution |
| **1.0.0** | Initial release — core pipeline with 9 steps |

---

## Project Structure

```
autoblog/
├── bin/
│   └── autoblog.mjs              # CLI entry point
├── lib/
│   ├── config.mjs                 # Config loader + .autoblog-strategy.json merge
│   ├── retry.mjs                  # Exponential backoff
│   ├── scheduler.mjs              # Content calendar
│   ├── strategy-balancer.mjs      # Content diversity gap analysis (new)
│   ├── strategy-wizard.mjs        # Interactive --init-strategy wizard (new)
│   ├── local-content.mjs          # Template-based geo pages (new)
│   ├── gsc.mjs                    # GSC mining + schedule frequency (new)
│   ├── context.mjs                # Context persistence + feedback loop + GA4
│   ├── topics.mjs                 # Topic research (Gemini + Google)
│   ├── deduper.mjs                # Semantic deduplication
│   ├── keyword-research.mjs       # Intelligent keyword strategy + DataForSEO
│   ├── prompts.mjs                # All Gemini prompt builders (single source of truth)
│   ├── writer.mjs                 # Post generation (GEO/AEO compliant)
│   ├── style-guide.mjs            # Style guide resolver
│   ├── humanizer.mjs              # AI pattern removal + style matching
│   ├── meta-optimizer.mjs         # CTR title optimization (optional)
│   ├── cross-reviewer.mjs         # Cross-model quality review (optional)
│   ├── validator.mjs              # Quality gate + GEO/AEO scoring
│   ├── linker.mjs                 # Internal linking
│   ├── readability.mjs            # Flesch-Kincaid scoring
│   ├── schema-embedder.mjs        # JSON-LD embedding (optional)
│   ├── translator.mjs             # Multi-language translation
│   ├── image-generator.mjs        # Cover image generation
│   ├── publisher.mjs              # CMS publishing — 5 adapters (optional)
│   └── pipeline.mjs               # 16-step orchestrator
├── test/
│   ├── fixtures/                   # Mock data for tests
│   ├── context-insights.test.mjs   # Context feedback loop (19 tests)
│   ├── schema-embedder.test.mjs    # JSON-LD schema (13 tests)
│   ├── strategy-balancer.test.mjs  # Strategy balancing (8 tests)
│   ├── local-content.test.mjs      # Local content engine (10 tests)
│   ├── validator.test.mjs          # Post validation + GEO/AEO (20 tests)
│   ├── readability-scheduler-linker.test.mjs  # Readability + scheduler + linker (26 tests)
│   ├── meta-optimizer.test.mjs     # Meta tag optimization (13 tests)
│   ├── cross-reviewer.test.mjs     # Cross-model review (12 tests)
│   ├── publisher.test.mjs          # CMS publishing (14 tests)
│   └── simulate-context-diff.mjs   # Interactive scenario simulation tool
├── autoblog.config.example.mjs    # Full config reference
└── package.json                   # npm test: 135 tests via node:test
```

---

## 🧪 Testing

135 tests using Node.js built-in `node:test` (zero test dependencies).

```bash
npm test              # run all 135 tests
```

### Scenario simulation

Visualize how context and strategy data changes prompts across different scenarios:

```bash
node test/simulate-context-diff.mjs --diff                    # all scenarios, diff only
node test/simulate-context-diff.mjs --prompt research          # research prompt only
node test/simulate-context-diff.mjs --scenario 1,4 --diff      # compare specific scenarios
```

---

## License

MIT - see [LICENSE](./LICENSE)
