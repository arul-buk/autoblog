# @stayboba/autoblog

Config-driven automated blog content pipeline powered by Gemini + DataForSEO.

One config file per site. The pipeline handles everything: topic discovery, deduplication, keyword research, writing, humanization, validation, cover images, and translation.

## Quick Start

```bash
# 1. Copy the example config
cp autoblog.config.example.mjs autoblog.config.mjs

# 2. Edit the config with your product details, authors, and topic clusters

# 3. Set environment variables
export GEMINI_API_KEY="your-gemini-api-key"
export DATAFORSEO_LOGIN="your-login"        # optional, only if seo.enabled
export DATAFORSEO_PASSWORD="your-password"  # optional, only if seo.enabled

# 4. Run
npx autoblog              # full run — generates and saves 1 post
npx autoblog --dry-run    # preview without saving files
npx autoblog --batch 5    # generate 5 posts (seeding mode)
npx autoblog --config ./path/to/config.mjs  # custom config path
```

## Pipeline

9 steps, each independently toggleable via `config.steps`:

```
Schedule Check ─> Research ─> Dedupe ─> Keyword Research ─> Write
                                                              │
Translate <── Image <── Validate <── Humanize <───────────────┘
```

| Step | What it does | API calls | Toggle |
|------|-------------|-----------|--------|
| **Schedule** | Checks content calendar for today's entry | 0 | `steps.calendar` |
| **Research** | Gemini + Google Search grounded topic discovery | 1 | `steps.research` |
| **Dedupe** | Semantic dedup against existing posts | 1 | `steps.dedupe` |
| **Keyword Research** | DataForSEO: volumes, difficulty, PAA, competitors | 4 | `steps.keywordResearch` |
| **Write** | Gemini generates full post with frontmatter | 1 | always on |
| **Humanize** | Removes AI writing patterns (Wikipedia-based rules) | 1 | `steps.humanize` |
| **Validate** | Word count, frontmatter, readability, CTA markers | 0 | `steps.validate` |
| **Image** | Gemini generates 16:9 cover image | 1 | `steps.image` |
| **Translate** | Multi-language translation (6 langs = 6 calls) | N | `steps.translate` |

**Cost per post:** ~$0.12-0.17 (full pipeline with 6 translations).

## Config

Everything lives in `autoblog.config.mjs`. See [`autoblog.config.example.mjs`](./autoblog.config.example.mjs) for the complete reference with inline documentation.

### Required sections

```js
export default {
  product: {
    name: 'YourProduct',
    url: 'https://yoursite.com',
    description: 'One-sentence product description',
    features: ['Feature — benefit description', ...],
  },
  authors: [
    { name: 'Jane Doe', role: 'Writer', image: '/img/jane.png', categories: ['Tech'] },
  ],
  topics: {
    clusters: [
      { name: 'Tech', queries: ['your niche topic 2026', ...] },
    ],
  },
};
```

### Step toggles

Disable steps you don't need. Each disabled step = zero API calls for that step.

```js
steps: {
  calendar: true,        // content calendar
  research: true,        // trending topic discovery
  dedupe: true,          // semantic deduplication
  keywordResearch: true, // DataForSEO enrichment
  write: true,           // always runs
  humanize: true,        // AI pattern removal
  validate: true,        // quality gate
  internalLinking: true, // cross-linking
  image: true,           // cover image
  translate: true,       // multi-language
}
```

**Common presets:**

| Use case | Disabled steps | Cost |
|----------|---------------|------|
| Full pipeline | none | ~$0.15/post |
| Budget mode | keywordResearch, humanize, translate | ~$0.02/post |
| English only | translate | ~$0.05/post |
| Manual topics only | research, calendar | ~$0.12/post |

### DataForSEO keyword research

When `seo.enabled: true`, the pipeline calls DataForSEO before writing to get real search data:

- **Keyword overview** — search volume + difficulty for seed keywords
- **Related keywords** — expanded terms filtered by volume and difficulty
- **SERP competitors** — top-ranking pages and their angles
- **Keyword suggestions (questions)** — People Also Ask data for the FAQ section

This data is injected into the writer prompt, producing posts that target real search queries instead of Gemini's guesses.

```js
seo: {
  enabled: true,
  apiLogin: process.env.DATAFORSEO_LOGIN,
  apiPassword: process.env.DATAFORSEO_PASSWORD,
  location: 2840,          // US (see config example for other codes)
  maxDifficulty: 60,       // skip keywords above this score
  minSearchVolume: 100,    // ignore low-volume keywords
  maxRelatedKeywords: 10,  // how many secondaries to pass to writer
}
```

### Content calendar

Two-level scheduling: **when** the pipeline runs (cron) and **what** it writes about (calendar).

```js
schedule: {
  // Level 1: run frequency
  cron: '17 8 */3 * *',  // every 3 days at 8:17 UTC
  postsPerRun: 1,

  // Level 2: editorial calendar (optional)
  calendar: [
    // Minimal — steer toward a category
    { date: '2026-05-01', category: 'Regulation' },

    // Specific topic — skip research entirely
    { date: '2026-05-04', topic: 'Australia Under-16 Ban Takes Effect' },

    // Full control
    {
      date: '2026-05-08',
      topic: 'Qustodio vs YourProduct Compared',
      category: 'Competitor',
      keywords: ['qustodio alternative', 'best parental control'],
      notes: 'Position as objective comparison.',
      priority: 'high',  // skips dedupe
    },
  ],

  // Or load from external file:
  // calendarFile: './content-calendar.mjs',
}
```

Days without calendar entries fall back to trending topic research. The pipeline always produces content.

## GEO / AEO / Schema Compliance

Every generated post is optimized for traditional search engines AND AI-powered search (Google AI Overviews, ChatGPT, Perplexity, Bing Copilot). The writer prompt enforces these structures and the validator scores compliance (0-100).

### What the writer generates

| Structure | Purpose | Checked by validator |
|-----------|---------|---------------------|
| **TL;DR section** | Self-contained summary block AI overviews can extract | Yes |
| **Key Takeaways** | 4-6 citable bullet points, each a complete statement | Yes |
| **Question-based headings** | H2/H3 as "What/How/Why" questions (3+ required) | Yes (count) |
| **Direct-answer paragraphs** | Each section opens with a quotable 1-2 sentence answer | Yes (filler detection) |
| **FAQ section** | Dedicated section with H3 questions and self-contained answers | Yes |
| **Entity definitions** | 1-sentence definitions on first mention of concepts | Prompt-enforced |
| **Attributed statistics** | Every stat cites source and year inline | Prompt-enforced |
| **Schema frontmatter** | `schema.type`, `schema.headline`, `schema.wordCount` for JSON-LD | Yes |
| **qa frontmatter** | 4-5 Q&A pairs powering FAQ rich snippets | Yes (count) |

### GEO/AEO score

The validator outputs a GEO/AEO score (0-100) based on 7 checks:

```
Step 7/9: Validating post quality...
  Readability: Grade 7.2 (1,247 words)
  GEO/AEO score: 86/100
  ✓ Validation passed
```

Scores below 70 produce warnings identifying which structures are missing.

### Schema markup

The autoblog generates schema-ready frontmatter. Your consuming website's template should render this as JSON-LD:

```js
// Frontmatter generated by autoblog:
schema:
  type: "BlogPosting"
  headline: "Can Kids Bypass YouTube Parental Controls in 2026?"
  description: "A guide to YouTube parental control bypass methods..."
  wordCount: 1247
  keywords: "youtube parental controls, bypass restricted mode"
qa:
  - question: "Can kids bypass YouTube Restricted Mode?"
    answer: "Yes. YouTube Restricted Mode can be disabled in..."
  - question: "What is the most bypass-proof parental control?"
    answer: "Channel-level whitelisting is the most bypass-proof..."
```

Your site template converts `qa` to `FAQPage` schema and `schema` fields to `BlogPosting` JSON-LD. The autoblog does not inject `<script type="application/ld+json">` into the markdown — that's the website's responsibility.

### Passage-level citability

AI search engines cite content at the passage level, not the page level. The writer is instructed to:

1. **Start sections with direct answers** — not vague setup ("In today's world...")
2. **Write self-contained paragraphs** — each quotable without surrounding context
3. **Use the pattern**: Direct answer → Evidence/data → Nuance/context
4. **Avoid cross-references** in FAQ answers ("as mentioned above") — each answer stands alone

## Project Structure

```
├── bin/
│   └── autoblog.mjs           # CLI entry point
├── lib/
│   ├── config.mjs              # Config loader + validation
│   ├── retry.mjs               # Exponential backoff (rate limit aware)
│   ├── scheduler.mjs           # Content calendar resolution
│   ├── topics.mjs              # Gemini + Google Search topic research
│   ├── deduper.mjs             # Semantic deduplication
│   ├── keyword-research.mjs    # DataForSEO keyword enrichment
│   ├── writer.mjs              # Blog post generation
│   ├── humanizer.mjs           # AI pattern removal
│   ├── validator.mjs           # Post-generation quality gate
│   ├── linker.mjs              # Internal linking strategy
│   ├── readability.mjs         # Flesch-Kincaid scoring
│   ├── translator.mjs          # Multi-language translation
│   ├── image-generator.mjs     # Cover image generation
│   └── pipeline.mjs            # 9-step orchestrator
├── templates/
│   └── github-workflow.yml     # GitHub Actions workflow template
├── autoblog.config.example.mjs # Full config reference
└── package.json
```

## GitHub Actions

Copy `templates/github-workflow.yml` to `.github/workflows/auto-blog.yml` in your project. The template includes:

- Cron schedule (matches your `schedule.cron`)
- Manual trigger with `--batch` and `--dry-run` inputs
- Commit + push with configurable git identity
- Vercel deploy with retry logic (swap for Netlify/Cloudflare/GitHub Pages)
- Telegram notification

**Required secrets:** `GEMINI_API_KEY`, optionally `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `VERCEL_TOKEN`, `TELEGRAM_BOT_TOKEN`.

## Environment Variables

| Variable | Required | Used by |
|----------|----------|---------|
| `GEMINI_API_KEY` | Yes | All Gemini calls (research, write, humanize, translate, image) |
| `DATAFORSEO_LOGIN` | If `seo.enabled` | Keyword research |
| `DATAFORSEO_PASSWORD` | If `seo.enabled` | Keyword research |
| `TELEGRAM_BOT_TOKEN` | No | Notifications (via workflow) |

## Batch Mode

Generate multiple posts in one run. Useful for seeding new sites.

```bash
npx autoblog --batch 10
```

Batch mode:
- Runs the full pipeline N times sequentially
- Dedupe is cumulative (post 3 knows about posts 1 and 2)
- Partial failure: if post 3 fails, posts 1-2 are still saved, pipeline continues to post 4
- Each post gets its own cover image and translations

## Humanization

Every generated post passes through an AI pattern removal step based on [Wikipedia's "Signs of AI writing"](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) guide. The humanizer targets:

- Significance inflation ("pivotal", "testament", "landscape")
- Promotional language ("boasts", "vibrant", "renowned")
- AI vocabulary red flags ("delve", "tapestry", "leverage")
- Structural tells (uniform section lengths, repeated patterns)
- Hedging and filler ("It's important to note that...")
- Copula avoidance, synonym cycling, em dash overuse

Disable with `steps.humanize: false` if you prefer raw Gemini output.

## Validation

The validator runs zero API calls and checks:

- Word count within `output.wordCount` range
- All required frontmatter fields present
- CTA markers present (if configured)
- Flesch-Kincaid readability grade within target range
- Internal links point to existing slugs
- Translation language detection (basic heuristic)

Configure readability targets:

```js
readability: {
  targetGrade: { min: 6, max: 10 },  // Flesch-Kincaid grade level
  warnOnly: true,                     // log warning vs. fail pipeline
}
```

## Body Formats

The writer supports three output formats via `output.bodyFormat`:

| Format | Output | Best for |
|--------|--------|----------|
| `html` | `<article><section><h2><p>` | Next.js, custom sites |
| `markdown` | `## Heading\n\nParagraph` | Jekyll, Hugo, Gatsby |
| `mdx` | Markdown + JSX components | MDX-based sites |

## Models

```js
models: {
  text: 'gemini-3.1-flash-lite-preview',  // research, write, humanize, translate
  image: 'gemini-2.5-flash-image',         // cover images only
}
```

The text model is used for all text generation. The image model is only used for cover image generation.

## Translation

Translates each post to configured languages with partial success handling (if 5/6 succeed, those 5 are saved).

```js
translation: {
  enabled: true,
  languages: ['es', 'pt', 'fr', 'de', 'zh', 'ja'],
  rateLimitMs: 1000,  // delay between API calls
}
```

Brand names from `product.brandNames` are preserved untranslated.

## License

UNLICENSED (private/internal use)
