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

> **Without DataForSEO:** The pipeline still works. Gemini picks keywords on its own. Results are decent but not data-driven. You can start without it and add it later.

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
| **Full pipeline** (6 translations) | Research + keywords + write + humanize + image + 6 translations | ~$0.12-0.17 |
| **English + polished** | Research + keywords + write + humanize + image | ~$0.05 |
| **Budget mode** | Research + write + image only | ~$0.02-0.04 |

---

## 🚀 Setup (5 Minutes)

### Step 1 — Get the code

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

```bash
export GEMINI_API_KEY="your-gemini-api-key"
```

### Step 4 — Run it

```bash
npx autoblog --dry-run    # preview without saving files (recommended first time)
npx autoblog              # generate and save one blog post
npx autoblog --batch 5    # generate 5 posts at once (for seeding a new blog)
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

**Without DataForSEO** (`seo.enabled: false`): Gemini picks keywords based on its own judgment. Works fine, but not data-driven.

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
┌──────────┐   ┌──────────┐   ┌─────────┐   ┌───────────┐   ┌─────────┐
│ Schedule │──>│ Research  │──>│ Dedupe  │──>│ Keywords  │──>│  Write  │
│ (calendar)│   │ (Gemini+  │   │ (Gemini │   │(DataForSEO)│   │(Gemini) │
│          │   │  Google)  │   │semantic)│   │           │   │         │
└──────────┘   └──────────┘   └─────────┘   └───────────┘   └────┬────┘
                                                                   │
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌───────────┐        │
│Translate │<──│  Image   │<──│ Validate │<──│ Humanize  │<───────┘
│(Gemini×N)│   │ (Gemini) │   │ (local)  │   │ (Gemini)  │
└──────────┘   └──────────┘   └──────────┘   └───────────┘
```

| # | Step | What happens | API calls | Toggle |
|---|------|-------------|-----------|--------|
| 1 | **Schedule** | Checks content calendar for today. Uses calendar entry if found, otherwise proceeds to research. | 0 | `steps.calendar` |
| 2 | **Research** | Searches Google (via Gemini grounding) for trending topics matching your clusters. Returns 10-15 candidates ranked by recency. | 1 | `steps.research` |
| 3 | **Dedupe** | Sends candidates + all existing post titles to Gemini. Catches semantic duplicates even with different wording. | 1 | `steps.dedupe` |
| 4 | **Keywords** | Calls DataForSEO: keyword volumes, difficulty, related terms, SERP competitors, People Also Ask. Injects data into writer prompt. | 4 | `steps.keywordResearch` |
| 5 | **Write** | Gemini generates the full post: YAML frontmatter + HTML/markdown body. Includes product context, keyword data, GEO/AEO rules. | 1 | Always on |
| 6 | **Humanize** | Second Gemini pass removes AI writing patterns (significance inflation, promotional language, filler, structural tells). | 1 | `steps.humanize` |
| 7 | **Validate** | Local quality check: word count, frontmatter fields, readability score, GEO/AEO compliance score. Zero API calls. | 0 | `steps.validate` |
| 8 | **Image** | Gemini generates a 16:9 conceptual cover illustration. Saves as PNG. | 1 | `steps.image` |
| 9 | **Translate** | Translates to each configured language. Brand names preserved. Partial success: saves what succeeds. | N | `steps.translate` |

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
| **Gemini API** | API key via SDK | Topic research, writing, humanization, translation, image generation |
| **DataForSEO REST API** | Basic auth (login:password) | Keyword volumes, difficulty, related keywords, SERP competitors, PAA questions |

### Models Used

| Model | Used for | Configurable via |
|-------|----------|-----------------|
| `gemini-3.1-flash-lite-preview` | All text generation | `config.models.text` |
| `gemini-2.5-flash-image` | Cover image generation | `config.models.image` |

### Module Map

```
bin/autoblog.mjs ─── CLI entry point (parses --dry-run, --batch, --config flags)
        │
        ▼
lib/pipeline.mjs ─── Orchestrates 9 steps in sequence
        │
        ├── lib/config.mjs ──────────── Loads config, merges defaults, validates
        ├── lib/retry.mjs ───────────── Exponential backoff (rate_limit / network / bad_output / fatal)
        ├── lib/scheduler.mjs ───────── Content calendar resolution
        ├── lib/topics.mjs ──────────── Gemini + Google Search topic discovery
        ├── lib/deduper.mjs ─────────── Semantic deduplication via Gemini
        ├── lib/keyword-research.mjs ── DataForSEO REST API (4 endpoints)
        ├── lib/linker.mjs ──────────── Internal linking (keyword-to-slug index)
        ├── lib/writer.mjs ──────────── Blog post generation with GEO/AEO rules
        ├── lib/humanizer.mjs ───────── AI pattern removal (Wikipedia-based)
        ├── lib/validator.mjs ───────── Quality gate + GEO/AEO scoring (0 API calls)
        ├── lib/readability.mjs ─────── Flesch-Kincaid grade level (0 API calls)
        ├── lib/image-generator.mjs ─── Cover image via Gemini image model
        └── lib/translator.mjs ──────── Multi-language with brand name preservation
```

### DataForSEO Endpoints

| Endpoint | What it returns | Approx. cost |
|----------|----------------|-------------|
| `/dataforseo_labs/google/keyword_overview/live` | Search volume + difficulty for seed keywords | ~$0.01 |
| `/dataforseo_labs/google/related_keywords/live` | Expanded related terms | ~$0.05 |
| `/dataforseo_labs/google/serp_competitors/live` | Top-ranking domains | ~$0.05 |
| `/dataforseo_labs/google/keyword_suggestions/live` | Question-format keywords for FAQ | ~$0.05 |

### Design Principles

- **Config-driven**: All project-specific content lives in one config file. No hardcoded product names, URLs, or topic areas in source code.
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

### Body format options

| Format | Config value | Output | Best for |
|--------|-------------|--------|----------|
| HTML | `'html'` | `<article><section><h2><p>` | Next.js, custom rendering |
| Markdown | `'markdown'` | `## Heading\n\nParagraph` | Hugo, Jekyll, Gatsby, Astro |
| MDX | `'mdx'` | Markdown + JSX components | MDX-based sites |

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
| `VERCEL_TOKEN` | If deploying to Vercel |
| `TELEGRAM_BOT_TOKEN` | For notifications |

### Manual trigger

The workflow supports manual execution from the GitHub Actions UI with inputs for `--batch` count and `--dry-run` mode.

### Batch mode for seeding

```bash
npx autoblog --batch 10
```

Generates 10 posts sequentially. Deduplication is cumulative (post 3 knows about posts 1 and 2). If post 5 fails, posts 1-4 are still saved and the pipeline continues to post 6.

---

## 🤖 For AI Agents — Setting Up Autoblog in a New Project

This section is written for AI coding agents (Claude Code, Cursor, Windsurf, Copilot, etc.) tasked with implementing the autoblog pipeline in a new codebase. Follow these steps in order.

### Information to gather from the user

Before writing any code, get these answers:

| Question | Maps to config | Example |
|----------|---------------|---------|
| What is your product? | `product.name`, `product.url`, `product.description` | "AcmeSaaS, https://acme.com, project management for remote teams" |
| What are 3-7 key features? | `product.features` | "Async standups, sprint analytics, Slack integration" |
| What topics should the blog cover? | `topics.clusters` | "Remote work, competitor comparisons, engineering culture" |
| Who are the author personas? (2+) | `authors` | "Alex Rivera (Engineering Lead), Priya Sharma (Product Analyst)" |
| What languages should posts be in? | `translation.languages` | "English only" or "English + Spanish + French" |
| What framework is the site built with? | `output.bodyFormat` | Next.js → `'html'`, Hugo → `'markdown'`, Gatsby/MDX → `'mdx'` |
| Where do blog posts live in the repo? | `output.postsDir` | `_posts/`, `content/blog/`, `src/posts/` |
| Where do images live? | `output.imagesDir` | `public/images/blog/`, `static/img/` |
| Do they have a DataForSEO account? | `seo.enabled` | If no → `false` (pipeline still works) |
| What is the desired tone? | `product.tone` | "Technical but approachable, never salesy" |
| Any topics to AVOID? | `product.tone` (add negatives) | "Never mention pricing, don't bash competitors" |

### Implementation steps

#### 1. Install the package

```bash
npm install github:arul-buk/autoblog
```

#### 2. Create the config file

Create `autoblog.config.mjs` in the project root with user-provided values:

```js
export default {
  product: {
    name: '',               // from user
    url: '',                // from user
    description: '',        // from user
    features: [],           // from user (array of 'Feature — benefit' strings)
    cta: { text: 'Get Started Free', url: '' }, // from user
    tone: '',               // from user (include any "don't" guidance here)
    brandNames: [],         // product name + any names that shouldn't be translated
  },
  authors: [],              // from user (min 2, each needs: name, role, image, categories[])
  fallbackAuthor: '',       // name of default author
  topics: {
    clusters: [],           // from user (each: { name, queries[] })
  },
  output: {
    postsDir: '',           // match project structure
    imagesDir: '',          // match project structure
    bodyFormat: '',         // 'html' | 'markdown' | 'mdx' based on framework
  },

  // Start conservative — enable features incrementally:
  seo: { enabled: false },
  translation: { enabled: false },
  steps: {
    calendar: false,
    keywordResearch: false,
    humanize: true,
  },
};
```

#### 3. Configure the website to render generated posts

The website needs to:

1. **Read `.md` files** from `output.postsDir` and render frontmatter + body
2. **Render JSON-LD schema** from `schema` and `qa` frontmatter fields:

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

3. **Serve cover images** from `output.imagesDir`

#### 4. Test

```bash
GEMINI_API_KEY=key npx autoblog --dry-run
```

Verify: config loads → topics discovered → post generated → GEO/AEO score > 70.

#### 5. Generate first real post

```bash
GEMINI_API_KEY=key npx autoblog
```

Build the site, verify the post renders with correct schema markup.

#### 6. Set up GitHub Actions (if requested)

Copy `templates/github-workflow.yml` → `.github/workflows/auto-blog.yml`. Update `<!-- CHANGE -->` markers. Add secrets.

### Architecture rules

- **Do not embed pipeline code in the consuming project.** Keep autoblog as a separate package. The config file is the only project-specific artifact.
- **Do not modify autoblog source files** to customize behavior. Everything is config-driven.
- **Schema markup is the website's job.** The pipeline outputs frontmatter; the website renders JSON-LD.
- **Start with budget mode.** Enable DataForSEO and translations after confirming the basic pipeline works.
- **The pipeline is stateless.** Reads from disk, writes to disk, exits. No database. Git is the state store.

### Troubleshooting

| Problem | Fix |
|---------|-----|
| `Config file not found` | Create `autoblog.config.mjs` or use `--config path` |
| `GEMINI_API_KEY required` | `export GEMINI_API_KEY=your-key` |
| `seo.apiLogin required` | Set DataForSEO env vars or set `seo.enabled: false` |
| `All candidate topics already covered` | Add new queries to `topics.clusters` or use calendar with specific topics |
| GEO/AEO score below 50 | Usually improves on re-run. Try `steps.humanize: false` temporarily to isolate. |
| Image generation failed | Post saved without image. Non-blocking. Re-run or generate manually. |

---

## Project Structure

```
autoblog/
├── bin/
│   └── autoblog.mjs              # CLI entry point
├── lib/
│   ├── config.mjs                 # Config loader + validation
│   ├── retry.mjs                  # Exponential backoff
│   ├── scheduler.mjs              # Content calendar
│   ├── topics.mjs                 # Topic research (Gemini + Google)
│   ├── deduper.mjs                # Semantic deduplication
│   ├── keyword-research.mjs       # DataForSEO integration
│   ├── writer.mjs                 # Post generation (GEO/AEO compliant)
│   ├── humanizer.mjs              # AI pattern removal
│   ├── validator.mjs              # Quality gate + GEO/AEO scoring
│   ├── linker.mjs                 # Internal linking
│   ├── readability.mjs            # Flesch-Kincaid scoring
│   ├── translator.mjs             # Multi-language translation
│   ├── image-generator.mjs        # Cover image generation
│   └── pipeline.mjs               # 9-step orchestrator
├── templates/
│   └── github-workflow.yml        # GitHub Actions template
├── autoblog.config.example.mjs    # Full config reference
└── package.json
```

---

## License

UNLICENSED (private/internal use)
