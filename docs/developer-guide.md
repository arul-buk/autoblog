# Developer Guide & Architecture

This guide details the internal software architecture, dependency limits, module structure, and testing scenarios for developers or AI coding agents working on the `@stayboba/autoblog` core codebase.

---

## 1. Technical Stack & Dependencies

### Runtime Dependencies

| Dependency | Purpose | Version |
|------------|---------|---------|
| `@google/generative-ai` | The official SDK client for Gemini text/image generation and grounding. | `^0.21.0` |

* **Zero-Dependency Core:** That's it. Autoblog is built strictly on standard Node.js native platform APIs (`fetch`, `node:fs`, `node:path`, `node:url`, `node:crypto`). This ensures extreme loading speeds and avoids package version conflicts.

### External APIs & Models

| API | Authentication | Purpose | Config Model |
|-----|----------------|---------|--------------|
| **Gemini API** | `GEMINI_API_KEY` (env) | Research, writer, translator, image, and critiques. | `models.text` (defaults to `gemini-2.5-flash`) |
| **Imagen API** | `GEMINI_API_KEY` (env) | Blog post cover image generation (16:9). | `models.image` (defaults to `gemini-2.5-flash-image`) |
| **DataForSEO API** | Basic Auth (`apiLogin`, `apiPassword`) | Real-world keyword difficulty, volumes, competitor domain gaps. | Direct REST Client |

---

## 2. Codebase Module Map

```
autoblog/
+-- bin/autoblog.mjs                   # CLI entry point. Parses flags and launches sequences.
+-- lib/
|   +-- pipeline.mjs                   # Thin execution wrapper mapping named commands to sequences.
|   +-- runner.mjs                     # Pipeline loop coordinator, error catcher, cost tracker, and checkpoint saver.
|   +-- step-registry.mjs              # Registers all 26 steps and named default sequences.
|   +-- checkpoint.mjs                 # Serialization, loading, cleaning of step checkpoint json files.
|   +-- steps/                         # High-level atomic wrappers around library modules.
|   +-- prompts.mjs                    # Pure-function, zero-import module containing ALL Gemini system prompts.
|   +-- [Core modules]:
|   |     config.mjs, retry.mjs, scheduler.mjs, topics.mjs, deduper.mjs,
|   |     keyword-research.mjs, linker.mjs, writer.mjs, style-guide.mjs,
|   |     humanizer.mjs, meta-optimizer.mjs, cross-reviewer.mjs, validator.mjs,
|   |     readability.mjs, schema-embedder.mjs, image-generator.mjs, translator.mjs,
|   |     publisher.mjs, notifications.mjs
|   +-- [Strategy modules]:
|   |     strategy-balancer.mjs, strategy-wizard.mjs, local-content.mjs
|   +-- [Data sources]:
|         gsc.mjs, context.mjs, dataforseo-client.mjs
+-- test/
|   +-- fixtures/                      # Mocked API responses.
|   +-- [20 test files]                # Automated validation suite (286+ tests).
+-- autoblog.config.example.mjs        # Production-grade baseline configuration template.
+-- package.json
```

---

## 3. Core Design Principles

1. **Config-Driven Architecture:** No product-specific URLs, features, names, or domains are hardcoded in the executable code. All variables map back to `autoblog.config.mjs`.
2. **Atomic Steps:** Steps cannot share global variable state in-memory during execution loops. They must read inputs from the checkpoint state object, and output modified state results.
3. **Stateless Operation:** No local or cloud databases are required. Git commits represent your database records, and `.autoblog-context.json` behaves as a key-value store on disk.
4. **Tolerance of Partial Success:** If the cover image generation times out, save the post anyway. If 5 out of 6 translations complete successfully, write the 5 and log the failed translation gracefully.
5. **Robust Retry Delays:** All API calls are wrapped in exponential backoff handlers that extend wait times on rate-limited `429` responses.

---

## 4. Prompt Engineering & Architecture

All system prompts used by Gemini are consolidated into a single file: `lib/prompts.mjs`. It is a pure-function module with zero external imports, housing 9 specialized prompts:
* **Research Prompt:** Feeds topic clusters, search groundings, and instructs query extraction.
* **Deduplication Prompt:** Compares candidates semantically against existing publications.
* **Keyword Strategy:** Selects primary/secondary keywords without keyword stuffing.
* **Writer Prompt:** Injects style guides, product features, GEO requirements, and markdown layout specifications.
* **Humanizer Prompt:** Targets Wikipedia-defined AI writing patterns and rewrites sentences to be concise.
* **Critique Prompt:** Assigns score criteria (1-10) checking factual precision and style guide errors.
* **Translation Prompt:** Ensures local idiom conversion while freezing brand names or code blocks.

---

## 5. DataForSEO API Endpoints

Autoblog uses specific REST endpoints to query and merge real keyword analytics.

| Endpoint | Purpose | Est. API Cost |
|----------|---------|---------------|
| `/dataforseo_labs/google/keyword_overview/live` | Queries search volumes and difficulty on seeds. | ~$0.01 |
| `/dataforseo_labs/google/related_keywords/live` | Pulls relevant semantically-related search queries. | ~$0.05 |
| `/dataforseo_labs/google/serp_competitors/live` | Identifies top domain positions. | ~$0.05 |
| `/dataforseo_labs/google/keyword_suggestions/live`| Extracts People Also Ask and autocomplete search trends. | ~$0.05 |

---

## 6. Testing

The testing suite contains 286+ unit and integration tests across 20 `.test.mjs` files, utilizing Node.js's built-in `node:test` framework (meaning zero dev dependencies like Jest or Mocha are required).

Execute the test suite locally:
```bash
npm test
```

### Scenario Simulations
Analyze how context data adjustments and config strategy variables skew prompt engineering outputs before running live APIs:

```bash
# Compare prompt parameters output
node test/simulate-context-diff.mjs --diff

# Print a mock output of the research prompt
node test/simulate-context-diff.mjs --prompt research

# Test the pipeline prompts using pre-compiled scenario profiles
node test/simulate-context-diff.mjs --scenario 1,4 --diff
```

---

## 7. For AI Coding Agents — Setting Up Autoblog in a New Project

If you are an AI assistant setting up `@stayboba/autoblog` in a user's repository, follow this prompt workflow.

### Setup Prompt

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

### Core Architecture Rules for Agents
* **Do not embed raw pipeline files into the root codebase.** Keep `@stayboba/autoblog` loaded strictly as an external node module.
* **Never edit the core step libraries directly.** Custom behaviors should always be configured through options in `autoblog.config.mjs`.

### Frontmatter Schema Reference
The blog website is expected to parse the YAML block. Avoid writing script injection code directly inside markdown; the site template engine should convert frontmatter fields to JSON-LD elements.
* Core fields: `title`, `date`, `excerpt`, `coverImage`, `author`, `category`, `tags`, `seoKeywords`.
* Interactive fields: `qa[].question`, `qa[].answer` (convert to `FAQPage`).
* JSON-LD specific fields: `schema.type`, `schema.headline`, `schema.description`, `schema.wordCount`, `schema.keywords`.

---

## 8. Troubleshooting Common Errors

| Issue | Root Cause | Solution |
|-------|------------|----------|
| `Config file not found` | The pipeline looks for `autoblog.config.mjs` in the current working directory. | Run `cp node_modules/@stayboba/autoblog/autoblog.config.example.mjs ./autoblog.config.mjs` or point to a custom path using `--config path`. |
| `GEMINI_API_KEY required` | The Gemini SDK client did not find an API key variable. | Run `export GEMINI_API_KEY=your-key` or verify that `.env` is located in your project execution directory. |
| `seo.apiLogin required` | SEO DataForSEO features are enabled but credentials are empty. | Provide the credentials in the `.env` file, or set `seo.enabled: false` in the config file. |
| `All candidate topics already covered` | The semantic deduplicator matched every researched topic to your existing list. | Feed new queries into `topics.clusters` or add a manual topic using the `schedule.calendar`. |
| `GEO/AEO score below 50` | The draft scored poorly on entity density or direct structures. | Usually resolves itself on a pipeline re-run with standard seed variations. |
| `Image generation failed` | Gemini Imagen request timed out. | This is non-blocking. The pipeline saves the post successfully without the image. Run `--steps image` to retry just the asset generation. |
