# @stayboba/autoblog

**An automated, config-driven blog content pipeline that researches, writes, optimizes, and publishes SEO-compliant articles on autopilot.**

[![NPM Version](https://img.shields.io/npm/v/@stayboba/autoblog?color=blue&style=flat-square)](https://www.npmjs.com/package/@stayboba/autoblog)
[![License](https://img.shields.io/npm/l/@stayboba/autoblog?style=flat-square)](./LICENSE)
[![Tests Status](https://img.shields.io/badge/tests-286%20passed-success?style=flat-square)](#)

Describe your product, list your target topic areas, and define a schedule. The pipeline automatically discovers trending topics, gathers live keyword statistics, drafts in-depth blog posts, removes detectable AI writing patterns, generates custom cover illustrations, and translates the output into multiple languages — all coordinated via a single configuration file.

Perfect for SaaS companies, content marketing teams, and agencies looking to build a high-quality, repeatable SEO content loop running via **GitHub Actions** or scheduled workflows.

---

## 🚀 Key Functionalities & Capabilities

`@stayboba/autoblog` is designed from the ground up to produce genuine editorial quality at scale, completely bypassing generic "AI-generated text" footprints.

*   **Autonomous Research & Topic Discovery:** Utilizes Gemini with **Google Search Grounding** to research current real-world trends, statistics, and citations from the last 7 days.
*   **Real Keyword Analytics:** Connects optionally to DataForSEO to enrich topic plans with search volume, keyword difficulty, related searches, and People Also Ask questions.
*   **AI Pattern Removal (Humanization):** Filters drafts against Wikipedia-standard "AI tells" (removing words like *delve, tapestry, leverage, pivotal*, uniform sections, and generic summary conclusions).
*   **GEO/AEO Compliance:** Formats and structures articles (including TL;DR blocks, key takeaways, and question-based headings) specifically optimized for generative engines like Google AI Overviews, ChatGPT Search, and Perplexity.
*   **Multi-Language Translations:** Automatically translates posts into any target language (e.g., Spanish, French, German) while strictly preserving brand names, code snippets, and structural keywords.
*   **Fault-Tolerant Checkpoint System:** Saves step-by-step progress locally. If an external API experiences a rate limit or timeout, the pipeline resumes exactly where it failed without wasting API costs.
*   **Pillar-Cluster Topical Authority:** Schedules and link-connects a high-level pillar content roadmap before drafting detailed cluster sub-posts.
*   **Continuous Performance Loop:** Mines GSC and GA4 trends to track ranking shifts and traffic declines, skewing future automated topics toward top-performing themes.
*   **Direct CMS Publishing:** Directly pushes draft uploads to headless or classic content systems including **Webflow**, **Ghost**, **WordPress**, **Strapi**, and **Contentful**.

---

## ⚡ Setup in 3 Steps (5 Minutes)

### 1. Install the Package

```bash
npm install @stayboba/autoblog
```

### 2. Initialize the Configuration

Copy the baseline configuration file into your project root:

```bash
cp node_modules/@stayboba/autoblog/autoblog.config.example.mjs autoblog.config.mjs
```

Open `autoblog.config.mjs` and define your brand identity (`product`), author roster (`authors`), and seed target queries (`topics.clusters`).

### 3. Set Your API Key & Run

Add your Gemini API key to your environment or a `.env` file:

```bash
export GEMINI_API_KEY="your-gemini-api-key"
```

Preview what the pipeline will write without consuming API writing charges or saving files:

```bash
npx autoblog --dry-run
```

If the plan looks great, run a live generation:

```bash
npx autoblog
```

Your completed assets will be written to `_posts/` and `public/images/blog/` instantly!

---

## 📚 Comprehensive Documentation Hub

Because the pipeline supports enterprise-grade scaling and optimizations, the core documentation has been segmented into specialized technical modules:

```
docs/
├── 🎯 getting-started.md      # Installation, cost matrices, prerequisites, and CLI execution scenarios.
├── ⚙️ configuration.md        # Full parameters guide, brand style guides, and Astro collection schemas.
├── 🔄 pipeline-steps.md       # The discrete 26-step engine, named execution hooks, and checkpoint recoveries.
├── 📈 strategic-features.md   # The 9 growth hacking gaps (Intent mapping, competitor gap analytics, GEO trackers).
├── 🛡️ safety-quality.md        # Cadence jitter, quality gates, originality checklists, and AI pattern filters.
├── ☁️ deployment.md            # GitHub Actions integration, CI best practices, and GSC/GA4 Service Account setups.
└── 🛠️ developer-guide.md      # Tech stack details, modular blueprints, Gemini prompt builders, and test guides.
```

### 🧭 Document Navigator:

1.  **[Getting Started Guide](./docs/getting-started.md)**
    *   Prerequisites, accounts, and API key setups.
    *   Cost per post estimates (Budget mode vs. Full Translation Mode).
    *   CLI parameters reference and operational scenarios (e.g. Weekly Audits, Freshness Checks).
2.  **[Configuration Reference](./docs/configuration.md)**
    *   Complete configuration sections mapping table.
    *   Mimicking style guides using `.voiceFile` or `.referencePostFile`.
    *   Configuring query clusters and regional context factors.
    *   Integrating generated markdown outputs into **Astro Content Collections**.
3.  **[Pipeline & Step Mechanics](./docs/pipeline-steps.md)**
    *   The 26 discrete pipeline steps breakdown.
    *   Default vs. custom steps cherry-picking.
    *   State saving checkpoint directories and `--resume` workflows.
4.  **[Strategic SEO Features](./docs/strategic-features.md)**
    *   Intent-to-Format mappings (Transaction templates vs. Informational lists).
    *   Content Refresh schedulers & Topical Authority pillars.
    *   Competitive Gap intersections and SERP feature targeting (snippets, PAA).
    *   Content Repurposing (compiling social threads, LinkedIn, and newsletters on write).
5.  **[Safety, Quality Gates & Humanization](./docs/safety-quality.md)**
    *   Mandatory Humanization auto-injection rules.
    *   Bot cadence jitters & automated low-score rejections.
    *   Structure variation blueprints & original insights injection.
    *   YAML Frontmatter auto-repair handlers.
    *   Wikipedia-standard AI patterns filter table.
6.  **[Deployment, CI Best Practices & Google Cloud](./docs/deployment.md)**
    *   Setting up the GitHub Actions YAML workflows.
    *   CI best practices (pulling with rebase, random sleep cron jitters, skipping duplicate logs).
    *   Google Service Account generation and connection (GSC + GA4 properties).
7.  **[Developer Guide & Architecture](./docs/developer-guide.md)**
    *   Software dependencies and external API endpoints.
    *   Consolidated system prompt architecture (`lib/prompts.mjs`).
    *   Built-in automated testing routines (`npm test`).
    *   AI Copilot/Agent setup integration prompt and troubleshooting.

---

## 📂 Project Structure Overview

```
autoblog/
├── bin/autoblog.mjs                   # CLI entry point parsing flags
├── docs/                              # Detailed technical documentation hub
├── lib/
│   ├── prompts.mjs                    # Consolidated Gemini prompt templates
│   ├── runner.mjs                     # Pipeline sequence execution coordinator
│   ├── step-registry.mjs              # Step registry and pre-defined sequences
│   └── steps/                         # Core execution code for all 26 steps
├── templates/
│   └── github-workflow.yml            # CI workflow template for GHA
└── test/                              # Automated test suite (286 unit and integration tests)
```

---

## 📄 License

Distributed under the MIT License. See [LICENSE](./LICENSE) for details.
