# Configuration Reference

All behavior in `@stayboba/autoblog` is driven by a single config file: `autoblog.config.mjs`. This document provides an exhaustive guide to configuring the pipeline to perfectly match your brand, target audience, and business goals.

---

## Configuration File Sections Quick Reference

| Section | What it controls | Required? |
|---------|-----------------|-----------|
| `product` | Product name, URL, description, features, tone, brand names, style guide | **Yes** |
| `authors` | Author roster with name, role, image, category assignments | **Yes** |
| `topics` | Topic clusters (search queries), regional contexts, recency | **Yes** |
| `output` | Post/image directories, body format (html/md/mdx), frontmatter schema, word count | Has defaults |
| `translation` | Enabled flag, language codes, rate limiting | Has defaults (disabled) |
| `models` | Gemini model names for text and image | Has defaults |
| `steps` | Toggle each pipeline step on/off | Has defaults |
| `checkpoint` | Checkpoint directory, max age, enabled flag | Has defaults (enabled) |
| `schedule` | Cron expression, posts per run, content calendar, skip probability (cadence jitter) | Has defaults |
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
| `contentQuality` | First-party data, min publish score, local page limits, originality flag | Optional |
| `crossModel` | Review model, quality threshold | Optional |
| `publish` | CMS adapter (wordpress/ghost/webflow/strapi/contentful), draft mode | Optional |

> [!TIP]
> The absolute source of truth for all config defaults and structures is [`autoblog.config.example.mjs`](../autoblog.config.example.mjs). Check this file in the root of the repo for comments on every single config setting.

---

## 1. Product Section (`product`)

Configures your brand identity, product value, features, and writing style. Every generated post naturally weaves in references to this section.

```javascript
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

### Style Matching (`product.styleGuide`)

You can match your existing editorial voice using one of three options:

```javascript
product: {
  styleGuide: {
    // Option 1: Inline brand voice rules
    voice: `
      Write in second person ("you", not "they" or "the user").
      Short paragraphs — 2-3 sentences max.
      No jargon. If you must use a technical term, define it immediately.
    `,
    // Option 2: Load from a markdown style file
    // voiceFile: './style/voice-rules.md',
    // Option 3: Reference a post to mimic its voice and formatting
    // referencePostFile: './style/reference-post.md',
  },
}
```

| Type | When to Use |
|------|-------------|
| `voice` | You can clearly articulate your style guide rules in sentences. |
| `referencePostFile` | You have a post that "sounds perfect" and want the AI to emulate its exact tone and structural rhythm. |

---

## 2. Topic Clusters Section (`topics`)

Defines the search query groups and topics the AI uses to research and write articles.

```javascript
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

### Tips for Search Queries:
* **Recency:** Include the current year for maximum recency, e.g., `"remote work trends 2026"`.
* **Mix Search Intent:** Mix broad query intents with specific ones.
* **Competitor Names:** Include competitor brands for unbiased comparison pieces.
* **Question Formats:** Use direct questions: `"how to run sprint retros remotely"`.
* **Sizing:** Target 3-8 queries per cluster and 3-6 clusters in total.

### Regional Contexts (`topics.regionalContexts`)

Enables geographic angles. This tells the AI writer what regional news or laws apply to specific content topics:

```javascript
topics: {
  regionalContexts: [
    { region: 'United States', focus: 'tech layoffs, return-to-office mandates' },
    { region: 'Europe', focus: 'GDPR implications for project management tools' },
  ],
}
```

---

## 3. Authors Section (`authors`)

Assigns fictional or real author personas to your blog categories. The pipeline selects the most relevant author based on the post's cluster category.

```javascript
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

## 4. Scheduling & Calendar (`schedule`)

Governs when the pipeline should write and what topics it should target on specific dates.

```javascript
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

> [!NOTE]
> Days without custom calendar entries automatically fall back to **Trending Topic Discovery** powered by Gemini Search Grounding.

---

## 5. SEO & DataForSEO Section (`seo`)

Integrates real keyword analytics from DataForSEO into the research step.

```javascript
seo: {
  enabled: true,
  apiLogin: process.env.DATAFORSEO_LOGIN,
  apiPassword: process.env.DATAFORSEO_PASSWORD,
  location: 2840,            // US location code
  maxDifficulty: 60,
  minSearchVolume: 100,
  maxRelatedKeywords: 10,
}
```

---

## 6. Output & Format Options (`output`)

Defines how and where your posts and images are saved.

### Body Format

```javascript
output: {
  bodyFormat: 'markdown', // 'markdown' | 'html' | 'mdx'
}
```

| Format | Config Value | Best For |
|--------|-------------|----------|
| **HTML** | `'html'` | Next.js custom templates, raw CMS uploads |
| **Markdown** | `'markdown'` | Hugo, Jekyll, Gatsby, Astro, VitePress |
| **MDX** | `'mdx'` | Modern React-based static site builders |

### Astro Content Collections Integration

To use `@stayboba/autoblog` with Astro, set `bodyFormat: 'markdown'` and define your blog schema in `src/content.config.ts`:

```typescript
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
