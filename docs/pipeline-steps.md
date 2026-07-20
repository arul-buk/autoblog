# Pipeline Architecture & Steps Reference

The `@stayboba/autoblog` pipeline is engineered on a **discrete-step design architecture**. Instead of a monolithic run, the system partitions execution into 26 atomic steps. Each step performs a narrow, testable action, saves its output to a checkpoint state, and hands over to the next step.

---

## The 26 Steps Reference

Each step is defined and registered in `lib/step-registry.mjs` and wrapped under `lib/steps/`.

| Step Name | Category | What Happens | API Calls | Config Toggle |
|-----------|----------|--------------|-----------|---------------|
| **schedule** | Scheduler | Checks calendar; decides if a post is scheduled for today. | 0 | `steps.calendar` |
| **gsc** | Data Mining | Mines Google Search Console for "quick-win" keywords (pos 4-15) and declining queries. | 1 GSC | `gsc.enabled` |
| **contextLoad**| Persistence | Loads `.autoblog-context.json` containing history and performance data. | 0 | `context.enabled` |
| **contentRefresh**| Refresh | Scans existing post index; flags stale posts according to age rules. | 0 | `contentRefresh.enabled` |
| **competitorAnalysis**| Research | Calls DataForSEO to discover competitor keyword gaps. | 1 DFSEO | `competitors.enabled` |
| **topicalAuthority**| Strategy | Sequences pillar and cluster pages. Prioritizes pillars. | 0 | `topicalMap.enabled` |
| **research** | Research | Gemini + Google Search Grounding to research the topic. | 1 Gemini | `steps.research` |
| **dedupe** | Quality | Semantically dedupes candidate topic against existing post titles. | 1 Gemini | `steps.dedupe` |
| **keywordResearch**| SEO | Generates keyword targets using Gemini strategy and DataForSEO metrics. | 1 Gemini + 4 DFSEO | `steps.keywordResearch` |
| **intentFormat**| Strategy | Maps search intent classification (e.g. transactional) to formatting template. | 0 | `contentStrategy.intentFormatMap` |
| **serpFeatures**| SEO | Detects SERP features (featured snippets, People Also Ask) using DataForSEO. | 1 DFSEO | `serpFeatures.enabled` |
| **internalLinking**| SEO | Builds internal links based on keywords matching historical posts. | 0 | `steps.internalLinking` |
| **write** | Core Write | Drafts full post using Gemini, applying formatting/SEO guidelines. | 1 Gemini | Always enabled |
| **metaOptimize**| SEO | Generates and selects CTR-optimized titles and meta descriptions. | 1 Gemini | `steps.metaOptimize` |
| **humanize** | Quality | Mandatorily removes AI patterns, applies brand voice. | 1 Gemini | `steps.humanize` |
| **crossModelReview**| Quality | Stronger model (Gemini Pro) evaluates draft; issues rewrites if low score. | 1 Gemini | `steps.crossModelReview` |
| **validate** | Quality | Zero-cost quality gate validation (GEO, Flesch-Kincaid, syntax). | 0 | `steps.validate` |
| **embedSchema** | SEO | Generates JSON-LD (`BlogPosting`, `FAQPage`) and embeds in the document. | 0 | `steps.embedSchema` |
| **image** | Core Asset | Generates 16:9 featured cover image via Gemini Imagen. | 1 Gemini | `steps.image` |
| **translate** | Asset | Translates final post into configured languages while keeping brand keywords. | N Gemini | `steps.translate` |
| **contextUpdate**| Persistence | Updates `.autoblog-context.json` with the current run's metrics. | 0 | `context.enabled` |
| **cmsPublish** | Distribution| Pushes post drafts to Webflow, Ghost, WordPress, Strapi, or Contentful. | 1 CMS | `publish.cms` |
| **repurpose** | Socials | Generates Twitter threads, LinkedIn posts, and newsletter highlights. | 1 Gemini | `repurpose.enabled` |
| **notify** | Alerts | Sends Telegram success or failure alert reports. | 1 Telegram | `notifications.telegram` |
| **performanceAudit**| Analytics | Run weekly/monthly via GSC + GA4 to compute clicks, traffic drops. | 1 GSC + 1 GA4 | `audit.enabled` |
| **geoTracking**| SEO | Measures brand visibility inside AI Overviews and Perplexity references. | 1 Gemini | `geoTracking.enabled` |

---

## Execution Sequences

The pipeline executes steps by feeding sequences (arrays of step names) to `lib/runner.mjs`.

### 1. Default Sequence
Runs during standard `npx autoblog` execution:
```
schedule > gsc > contextLoad > research > dedupe > keywordResearch >
internalLinking > write > metaOptimize > humanize > crossModelReview >
validate > embedSchema > image > translate > contextUpdate > cmsPublish > notify
```

### 2. Named Sequences

You can trigger pre-compiled pipelines via CLI subcommands:

* **Research-Only Sequence (`npx autoblog research`)**: For planning keyword strategy without drafting content.
  ```
  schedule > gsc > contextLoad > research > dedupe > keywordResearch
  ```
* **Performance Audit Sequence (`npx autoblog audit`)**: For checking keyword rankings and brand co-citations.
  ```
  contextLoad > performanceAudit > geoTracking
  ```
* **Content Freshness Sequence (`npx autoblog refresh`)**: Scans for old articles and schedules rewrites.
  ```
  contextLoad > contentRefresh
  ```

### 3. Cherry-Picking Steps

You can override the execution sequence completely using the `--steps` CLI flag:

```bash
npx autoblog --steps write,humanize,validate
```

---

## Checkpoint & Resumability System

The pipeline features a fault-tolerant **Checkpoint System** managed by `lib/checkpoint.mjs`.

### How It Works:
1. **Auto-Save:** After the successful completion of *any* step, the runner saves the current run state, config, and variables to `.autoblog-checkpoints/{runId}/step_{stepIndex}_{stepName}.json`.
2. **Resuming:** If the pipeline fails due to an external error (e.g., an image API timeout or rate limit), you can resume the exact execution state using:
   ```bash
   npx autoblog --resume
   ```
3. **Execution Skip:** The runner detects the checkpoint folder, finds the highest completed step index, restores the memory variables, and starts executing *only* the remaining steps in the sequence.

### Configuration Reference:

```javascript
checkpoint: {
  enabled: true,
  dir: '.autoblog-checkpoints',
  maxAgeMs: 86400000, // 24 hours expiry
}
```

---

## Pipeline Block Diagram

```
bin/autoblog.mjs ─── CLI Command Parser (--steps, --resume, audit, etc.)
        |
        v
lib/pipeline.mjs ─── Module Loader -> runSteps(sequence)
        |
        v
lib/runner.mjs ──── Step Loop Coordinator + Checkpoint Saver
        |
        +-- lib/step-registry.mjs ── Defines Sequences & Step Functions
        +-- lib/checkpoint.mjs ───── Handles State Disk Serialization
        +-- lib/steps/*.mjs ──────── Individual Step Runners (1-26)
```
