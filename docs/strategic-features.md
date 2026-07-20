# Strategic SEO & Marketing Capabilities

`@stayboba/autoblog` introduces 9 sophisticated, enterprise-grade strategic capabilities designed to bypass traditional "AI spam filters" and establish true **Topical Authority** and visibility in both traditional and AI-driven search engines.

By default, these features are **disabled** for a bare-minimum setup. This guide explains how to enable and configure them.

---

## 1. Intent-to-Format Enforcement

Bridges the gap between search intent and content delivery. It automatically maps the keyword classification to a specific article format template.

```javascript
contentStrategy: {
  intentFormatMap: {
    informational: ['how-to-guide', 'explainer', 'listicle'],
    commercial: ['comparison', 'review', 'alternatives'],
    transactional: ['product-tutorial', 'setup-guide'],
    navigational: ['brand-feature', 'changelog'],
  },
}
```

* **How It Works:** When DataForSEO classifies a keyword as "Transactional," the pipeline skips standard blog layouts and forces a structured "product-tutorial" layout with step-by-step images and product calls-to-action.

---

## 2. Content Refresh Scheduler

Identifies and rewrites stale posts according to category-based expiration rules.

```javascript
contentRefresh: {
  enabled: true,
  rules: [
    { category: 'regulatory', maxAgeDays: 30 },
    { category: 'statistics', maxAgeDays: 180 },
    { category: '*', maxAgeDays: 365 },
  ],
  maxQueueSize: 10,
  prioritizeByTraffic: true,
}
```

* **How It Works:** On running `npx autoblog refresh`, the system checks your post metadata history. If a regulatory post is over 30 days old, it's flagged as stale. If `prioritizeByTraffic` is on, GSC traffic analytics are checked, and the highest-traffic stale posts are pushed to the top of the update queue first.

---

## 3. Performance Feedback Loop

Compares predicted search positions against actual organic impressions, and automatically adjusts future research parameters.

```javascript
audit: {
  enabled: true,
  minPostAgeDays: 14,
  declineThreshold: 0.3, // Flag posts whose clicks drop > 30% month-over-month
  winningPatterns: { minClicks: 50, topPositionThreshold: 10 },
}
```

* **How It Works:** Triggers during `npx autoblog audit`. It connects to Google Search Console and GA4 to extract winning categories. If posts about "Async Communication" rank higher and receive more clicks than "Competitor Reviews," future topics will automatically skew heavily toward the winning "Async Communication" cluster.

---

## 4. Topical Authority Sequencing

Enforces a rigid **Pillar & Cluster** architecture to establish subject authority.

```javascript
topicalMap: {
  enabled: true,
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

* **How It Works:** If `requirePillarFirst` is set to `true`, the pipeline will block drafting any cluster sub-pages (e.g., "Async Communication Best Practices") until the main core pillar page ("Remote Team Management") is written and published. Once written, the cluster pages are automatically linked back to the pillar.

---

## 5. SERP Feature Targeting

Specifically drafts and structures portions of your posts to claim high-value SERP features like Featured Snippets or People Also Ask boxes.

```javascript
serpFeatures: {
  enabled: true,
  targetFeatures: ['featured_snippet', 'people_also_ask', 'ai_overview'],
}
```

* **How It Works:** Utilizes DataForSEO to find what widgets appear on the target keyword search. If a Featured Snippet is active, the pipeline injects an explicit instruction to the Gemini writer: *"Provide a crisp 45-60 word definition paragraph at the start of Section 2."*

---

## 6. Competitive Gap Analysis

Automatically tracks your competitors' rankings and identifies keywords that they rank for, but you do not.

```javascript
competitors: {
  enabled: true,
  domains: ['competitor-alpha.com', 'competitor-beta.com'],
  maxGaps: 20,
  minVolume: 100,
  refreshDays: 30,
}
```

* **How It Works:** Calls DataForSEO's Domain Intersection API. Keywords where both competitors rank in the Top 15, but your site has zero presence, are automatically pulled as high-priority seed topics for the pipeline.

---

## 7. AI Visibility / GEO Tracking

Analyzes search queries to verify if your brand is cited inside AI search outputs (Google AI Overviews, ChatGPT Search, Perplexity).

```javascript
geoTracking: {
  enabled: true,
  brandNames: ['AcmeSaaS', 'Acme'],
  platforms: ['google_ai_overview', 'chatgpt', 'perplexity'],
}
```

* **How It Works:** Scrapes search queries and tracks which co-citation competitors are referenced. Generates an AI visibility score that helps you track your brand's footprint in generative engine optimization (GEO).

---

## 8. Content Repurposing

Maximizes the mileage of every article by automatically compiling social-media-ready derivatives.

```javascript
repurpose: {
  enabled: true,
  formats: ['twitter-thread', 'linkedin-post', 'newsletter-snippet'],
  outputDir: '_repurposed',
}
```

* **How It Works:** Saves generated assets to `_repurposed/{slug}/`. These are complete with Markdown carriage breaks, emojis, and hashtags matching your product voice.

---

## 9. Cross-Model Quality Review

Employs a multi-agent model critique step. Draft posts written by a fast model (e.g., `gemini-2.5-flash`) are audited by a larger model (e.g., `gemini-2.5-pro`).

```javascript
steps: { crossModelReview: true },
crossModel: {
  model: 'gemini-2.5-pro',
  qualityThreshold: 7, // Out of 10 points
}
```

* **How It Works:** The review model grades the post on factual consistency, brand voice, keyword stuffing, and depth. If the grade falls below `7/10`, the reviewer generates a structured feedback JSON and commands the writer model to perform an auto-rewrite.

---

## Optional Enhancements Summary

* **GSC Topic Mining:** Mines search console query history to target long-tail search terms that already trigger impressions for your domain.
* **Topic Backlog:** Generates 5-10 keyword ideas per run, drafts the top 1, and pushes the remaining to a `.json` backlog to speed up future runs.
* **CMS Direct Publishing:** Supports direct drafts uploads into standard headless/monolithic systems:
  ```javascript
  publish: {
    cms: 'wordpress', // 'ghost', 'webflow', 'strapi', 'contentful'
    draft: true,
  }
  ```
* **Telegram Notifications:** Receives pipeline heartbeat alerts on success or failure, including details like cost-per-run, SEO score, and article title.
