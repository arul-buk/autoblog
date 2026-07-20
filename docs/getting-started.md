# Getting Started with @stayboba/autoblog

Welcome to `@stayboba/autoblog`! This guide will help you set up your automated blog content pipeline in 5 minutes.

---

## What You Need Before Starting

### Accounts and Keys

| What | Where to get it | Required? | Cost |
|------|----------------|-----------|------|
| **Gemini API key** | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Yes | Free tier available; paid for heavy usage |
| **DataForSEO account** | [app.dataforseo.com/register](https://app.dataforseo.com/register) | Optional | ~$0.04-0.20 per post for real keyword data |

> [!NOTE]
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

Install the package via npm:

```bash
npm install @stayboba/autoblog
```

Or clone the repository directly if you are setting up or developing autoblog itself:

```bash
git clone https://github.com/arul-buk/autoblog.git
cd autoblog
npm install
```

### Step 2 — Create your config

Copy the example configuration file to the root of your project:

```bash
cp autoblog.config.example.mjs autoblog.config.mjs
```

Open `autoblog.config.mjs` and customize it. At a minimum, you'll need to fill in these sections:
1. **product** — Your product's name, URL, description, and key features.
2. **authors** — The roster of authors writing your content.
3. **topics.clusters** — The keyword categories and seed queries you want to cover.

See [Configuration Reference](./configuration.md) for a deep dive into every config parameter.

### Step 3 — Set your API key

Create a `.env` file in your project root:

```bash
GEMINI_API_KEY=your-gemini-api-key
```

Alternatively, export it directly in your terminal:

```bash
export GEMINI_API_KEY="your-gemini-api-key"
```

### Step 4 — Run the Pipeline

```bash
npx autoblog --help        # See all options
npx autoblog --dry-run     # Preview the run without generating or saving files
npx autoblog               # Generate and save one blog post
npx autoblog --batch 5     # Generate 5 posts sequentially
```

### What You Get

After running, the pipeline creates the following folder structure and assets in your project root:

```
_posts/
├── your-topic-slug.md              # Full blog post (YAML frontmatter + Markdown body)
├── es/your-topic-slug.md           # Spanish translation (if enabled)
├── fr/your-topic-slug.md           # French translation (if enabled)
└── ...                              # Other configured languages

public/images/blog/
└── your-topic-slug.png             # AI-generated cover image (16:9 aspect ratio)
```

---

## CLI Commands & Common Scenarios

### Commands Quick Reference

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

### Common Usage Scenarios

#### Full Autonomous Pipeline (Default)
```bash
npx autoblog
```
Runs the complete default sequence. Same behavior as v1.x.

#### Research-Only (Editorial Planning)
```bash
npx autoblog research --dry-run
```
Runs `schedule > gsc > contextLoad > research > dedupe > keywordResearch`. See what topics and keywords are available without generating content.

#### Weekly Performance Audit
```bash
npx autoblog audit
```
Runs `contextLoad > performanceAudit > geoTracking`. Check rankings, detect declining posts, track AI visibility.

#### Content Freshness Check
```bash
npx autoblog refresh
```
Runs `contextLoad > contentRefresh`. See which posts are stale and need updating.

#### Competitor-First Content Strategy
```bash
npx autoblog --steps contextLoad,competitorAnalysis,research,dedupe,keywordResearch,write,humanize,validate
```
Topics come from competitor gaps instead of trending research.

#### Quick Publish (Urgent News)
```bash
npx autoblog --steps write,humanize,validate,cmsPublish,notify
```
Skip research — write from a calendar topic or manual override.

#### Repurpose Existing Content
```bash
npx autoblog --steps contextLoad,repurpose
```
Generate social derivatives (Twitter threads, LinkedIn posts, newsletter snippets) from existing published posts.

#### Resume a Failed Run
```bash
npx autoblog --resume
```
Finds the last checkpoint, skips completed steps, and continues from the failure point.

---

## Updating

Keep `@stayboba/autoblog` up to date with the latest features, prompt engineering enhancements, and bug fixes:

```bash
npm update @stayboba/autoblog
```

### What to check after updating
1. Run `npx autoblog --dry-run` to verify that your configuration is still valid and the pipeline executes.
2. Check `autoblog.config.example.mjs` to see if new configuration options have been introduced.
3. Your context file (`.autoblog-context.json`) will be updated with new fields automatically; older versions are backwards compatible and require no migration.
4. Ensure `.autoblog-checkpoints/` is added to your `.gitignore`.
