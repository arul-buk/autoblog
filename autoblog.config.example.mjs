/**
 * autoblog.config.example.mjs
 *
 * Example configuration for @stayboba/autoblog.
 * Copy this file to `autoblog.config.mjs` in your project root and customise.
 *
 * Every field is documented inline. Required fields are marked [REQUIRED].
 * Optional fields show their defaults so you can delete lines you don't need.
 */

export default {
  // ═══════════════════════════════════════════════════════════════════════════
  // PRODUCT CONTEXT — injected into the writer prompt so the LLM knows what
  // product it's writing about. This is the single most important section.
  // ═══════════════════════════════════════════════════════════════════════════
  product: {
    // [REQUIRED] Product / brand name as it should appear in posts.
    name: 'AcmeSaaS',

    // [REQUIRED] Primary marketing URL. Used for homepage links in posts.
    url: 'https://acme.example.com',

    // [REQUIRED] One-sentence description of the product. Injected into
    // the writer system prompt so the LLM understands the product category.
    description:
      'Project management tool for remote engineering teams with async standups and sprint analytics.',

    // [REQUIRED] Feature list. Each entry is injected verbatim into the
    // writer prompt. Be specific — the LLM uses these to weave product
    // mentions into articles contextually.
    //
    // FORMAT: "Feature Name — one-sentence description of benefit"
    features: [
      'Async Standups — automated daily standups that work across time zones without scheduling meetings.',
      'Sprint Analytics — track velocity, burndown, and cycle time without manual calculation.',
      'Slack Integration — create and manage tasks directly from Slack without context switching.',
    ],

    // Call-to-action button used in mid-article and conclusion CTAs.
    cta: {
      text: 'Get Started Free',
      url: 'https://app.acme.example.com',
    },

    // Tone guidance injected into the writer prompt.
    // Keep it short — one sentence is usually enough.
    tone: 'Technical but approachable. Write for engineering managers, not executives.',

    // Brand names that must NEVER be translated. The translator module
    // injects these as "keep as-is" instructions.
    brandNames: ['AcmeSaaS'],

    // Cover image style directive. Replaces the default "clean minimalist
    // digital art style" with your brand's visual language.
    //
    // EXAMPLES:
    //   'Swiss Brutalist style, bold black typography, raw concrete textures'
    //   'Dark mode illustration, neon accents on #0D1117 background'
    //   'Flat vector illustration, brand colours #FF6B35 and #004E89'
    //   'Isometric 3D illustration, soft pastel palette, no gradients'
    //
    // Omit to use the default (gradient background, minimalist digital art).
    imageStyle: null,

    // ─── STYLE GUIDE (optional) ───────────────────────────────────────
    //
    // Provide brand voice rules and/or a reference blog post to shape
    // the writing style. Affects BOTH the writer (initial generation)
    // and the humanizer (style transformation after AI pattern removal).
    //
    // Two types of guidance, used together or independently:
    //
    //   voice         — Prescriptive rules ("write in second person",
    //                   "short paragraphs", "no jargon"). Think of this
    //                   as a style sheet.
    //
    //   referencePost — A demonstrative example. Paste the full text of
    //                   a blog post that exemplifies your ideal style.
    //                   The pipeline studies its rhythm, vocabulary,
    //                   sentence length, and paragraph pacing — then
    //                   matches it. Does NOT copy content.
    //
    // For each type, you can provide the content inline OR as a file
    // path. File takes precedence when both are set.
    //
    // TIPS:
    //   - Voice rules: keep under 500 words. Use observable rules, not
    //     vague adjectives ("short paragraphs" > "engaging tone").
    //   - Reference post: pick ONE representative post. Strip dates and
    //     product-specific facts that shouldn't be mimicked.
    //   - When active, the humanizer uses a higher temperature (0.7 vs
    //     0.3) to allow more creative rewriting toward your style.
    //   - Omitting styleGuide entirely preserves default behavior.
    //
    styleGuide: {
      // Brand voice rules — inline text (markdown or plain text)
      voice: null,
      // OR load from file (takes precedence over inline when both set)
      voiceFile: null,

      // Reference blog post — inline full text
      referencePost: null,
      // OR load from file
      referencePostFile: null,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHOR ROSTER — the pipeline selects the best author for each topic
  // based on category matching. Define at least 2 authors.
  // ═══════════════════════════════════════════════════════════════════════════
  authors: [
    {
      // Display name used in frontmatter and byline.
      name: 'Alex Rivera',
      // Short title/role shown below the name.
      role: 'Engineering Lead',
      // Path to author headshot (relative to your site's public dir).
      image: '/images/authors/alex-rivera.png',
      // Topic categories this author is best suited for.
      // The pipeline fuzzy-matches the topic's category against these strings.
      categories: ['Remote Work', 'Engineering Culture'],
    },
    {
      name: 'Priya Sharma',
      role: 'Product Analyst',
      image: '/images/authors/priya-sharma.png',
      categories: ['Competitor', 'Product', 'Platform Updates'],
    },
  ],

  // Fallback author name (must match one of the names above).
  // Used when no author's categories match the topic.
  fallbackAuthor: 'Alex Rivera',

  // ═══════════════════════════════════════════════════════════════════════════
  // TOPIC RESEARCH — controls how the pipeline discovers trending topics.
  //
  // The pipeline uses Gemini + Google Search grounding to find recent,
  // relevant topics. Clusters define WHAT to search for. Regional contexts
  // add geographic diversity.
  // ═══════════════════════════════════════════════════════════════════════════
  topics: {
    // [REQUIRED] Topic clusters. Each cluster has a name (used for category
    // matching with authors) and an array of search queries.
    //
    // TIPS:
    //   - Use 3-6 clusters covering your main content pillars
    //   - Each cluster should have 3-8 search queries
    //   - Include year in queries for recency: "youtube safety 2026"
    //   - Mix broad + specific queries within each cluster
    //   - Include competitor names if you write comparison content
    clusters: [
      {
        name: 'Remote Work',
        queries: [
          'remote team management challenges {year}',
          'async communication best practices',
          'remote engineering team productivity',
        ],
      },
      {
        name: 'Competitor',
        queries: [
          'best project management tool review {year}',
          'Jira alternative for remote teams',
          'Linear vs Asana comparison',
        ],
      },
      {
        name: 'Engineering Culture',
        queries: [
          'sprint retrospective techniques',
          'engineering team burnout prevention',
          'developer experience metrics {year}',
        ],
      },
    ],

    // Regional contexts add geographic diversity to topic research.
    // The pipeline cycles through these, adding region-specific angles.
    //
    // OPTIONAL — omit or set to [] to skip regional diversity.
    regionalContexts: [
      { region: 'United States', focus: 'tech layoffs, return-to-office mandates' },
      { region: 'Europe', focus: 'GDPR implications for project management tools' },
    ],

    // Only consider content from the last N days when researching topics.
    // Lower = more timely but fewer results. Higher = more candidates.
    // Default: 7
    recencyDays: 7,

    // Maximum number of candidate topics to generate before deduplication.
    // Default: 5
    maxCandidates: 5,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTENT OUTPUT — controls the format and structure of generated posts.
  // ═══════════════════════════════════════════════════════════════════════════
  output: {
    // [REQUIRED] Directory where generated posts are saved (relative to CWD).
    postsDir: '_posts',

    // [REQUIRED] Directory where cover images are saved (relative to CWD).
    imagesDir: 'public/images/blog',

    // Body format: 'html' | 'markdown' | 'mdx'
    //
    //   'html'     — <article><section><h2><p> tags (recommended for most sites)
    //   'markdown' — standard markdown (## headings, paragraphs, etc.)
    //   'mdx'      — MDX with JSX component support
    //
    // Default: 'html'
    bodyFormat: 'html',

    // Frontmatter schema. Controls which fields are required/optional
    // in the generated post's YAML frontmatter.
    frontmatterSchema: {
      required: [
        'title',
        'date',
        'excerpt',
        'coverImage',
        'author',
        'category',
        'tags',
        'seoKeywords',
        'qa',       // FAQ schema — 4+ Q&A pairs for FAQ rich snippets + AI answer extraction
        'schema',   // BlogPosting JSON-LD metadata (type, headline, description, wordCount)
      ],
      optional: [
        'midArticleCTA',
        'ctaType',
        'readingTime',
        'relatedPosts',
        'featured',
        'lastModified',
        'coverImageAlt',
        'authorRole',
        'authorImage',
      ],
    },

    // Target word count range for generated posts.
    // The validator flags posts outside this range.
    wordCount: { min: 1000, max: 1500 },

    // CTA markers inserted into the post body as HTML comments.
    // The consuming website replaces these with interactive components.
    //
    // Set to [] if you don't use CTA markers.
    ctaMarkers: [],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSLATION — multi-language support.
  //
  // The pipeline translates each post into configured languages using Gemini.
  // Partial success: if 5/6 translations succeed, the pipeline saves those
  // and reports the failure. It does NOT block on translation errors.
  // ═══════════════════════════════════════════════════════════════════════════
  translation: {
    // Set to false to disable translation entirely (English-only output).
    enabled: true,

    // ISO 639-1 language codes. Supported: es, pt, fr, de, zh, ja, ko,
    // it, nl, ru, ar, hi, th, vi, pl, tr, id
    languages: ['es', 'pt', 'fr', 'de', 'zh', 'ja'],

    // Delay between translation API calls (ms). Prevents rate limiting.
    // Default: 1000
    rateLimitMs: 1000,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MODELS — which Gemini models to use for each task.
  //
  // Text model is used for: topic research, deduplication, writing,
  // humanization, and translation.
  // Image model is used for: cover image generation.
  // ═══════════════════════════════════════════════════════════════════════════
  models: {
    text: 'gemini-2.5-flash',
    image: 'gemini-2.5-flash-image',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PIPELINE STEP TOGGLES — enable/disable individual pipeline steps.
  //
  // Each step can be disabled independently. Disabling a step skips it
  // entirely — no API calls, no cost.
  //
  // COMMON CONFIGURATIONS:
  //
  //   Full pipeline (default):
  //     All steps enabled — maximum quality, highest cost.
  //
  //   Budget mode:
  //     keywordResearch: false, humanize: false, translate: false
  //     — Gemini-only, English, raw output. ~3 API calls per post.
  //
  //   English + polished:
  //     translate: false
  //     — Full quality, no translation cost.
  //
  //   Seeding mode (new site):
  //     calendar: false, dedupe: false
  //     — Generate many posts quickly without calendar or dedup checks.
  //
  //   Manual topic control:
  //     research: false
  //     — Only processes calendar entries, never does trending research.
  //     Requires content calendar to be populated.
  //
  // ═══════════════════════════════════════════════════════════════════════════
  steps: {
    calendar: true,          // Check content calendar before research
    research: true,          // Gemini + Google Search topic discovery
    dedupe: true,            // Semantic deduplication against existing posts
    keywordResearch: true,   // DataForSEO keyword enrichment
    write: true,             // Gemini content generation (always runs)
    humanize: true,          // AI pattern removal pass
    validate: true,          // Post-generation quality checks
    internalLinking: true,   // Cross-link to existing posts
    image: true,             // Cover image generation
    translate: true,         // Multi-language translation
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NOTIFICATIONS — optional post-publish notifications.
  //
  // Currently supports Telegram. Slack support planned.
  // Omit or set to {} to disable notifications.
  //
  // TELEGRAM SETUP:
  //   1. Message @BotFather on Telegram → /newbot → save the token
  //   2. Message @userinfobot to get your chat ID
  //   3. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars
  // ═══════════════════════════════════════════════════════════════════════════
  notifications: {
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
    },
    // slack: {
    //   webhookUrl: process.env.SLACK_WEBHOOK,
    // },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RETRY — exponential backoff configuration for API calls.
  //
  // All Gemini and DataForSEO calls are wrapped in retry logic that
  // distinguishes between rate limits (429), network failures, bad output
  // (malformed responses), and fatal errors (auth failures).
  //
  // Rate limit errors: retried with longer backoff.
  // Network errors: retried normally.
  // Bad output: retried (LLM may produce different output on retry).
  // Fatal errors (401, 403): NOT retried.
  // ═══════════════════════════════════════════════════════════════════════════
  retry: {
    maxAttempts: 3,    // Total attempts (1 initial + 2 retries)
    baseDelayMs: 2000, // Delay before first retry. Doubles each retry.
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SEO / KEYWORD RESEARCH — DataForSEO integration.
  //
  // When enabled, the pipeline calls DataForSEO BEFORE writing to enrich
  // the writer prompt with real keyword data: search volumes, difficulty
  // scores, competitor angles, and People Also Ask questions.
  //
  // This produces significantly better SEO content than Gemini-only
  // keyword selection.
  //
  // COST: ~4 DataForSEO API calls per post (~$0.04-0.20 depending on
  // endpoints). Uses REST API directly via fetch (no SDK needed).
  //
  // AUTHENTICATION: Basic auth using login + password from env vars.
  // Sign up at https://app.dataforseo.com/register
  //
  // Set enabled: false to skip DataForSEO entirely. The writer will
  // fall back to Gemini-only keyword selection (current behavior).
  // ═══════════════════════════════════════════════════════════════════════════
  seo: {
    enabled: true,
    provider: 'dataforseo',

    // DataForSEO credentials (from environment variables).
    apiLogin: process.env.DATAFORSEO_LOGIN,
    apiPassword: process.env.DATAFORSEO_PASSWORD,

    // DataForSEO location code. Determines which country's search data
    // is used for keyword volumes and difficulty.
    //
    // COMMON CODES:
    //   2840 — United States
    //   2826 — United Kingdom
    //   2036 — Australia
    //   2276 — France
    //   2276 — Germany
    //   2356 — India
    //   2392 — Japan
    //   2076 — Brazil
    //   2124 — Canada
    //
    // Full list: https://api.dataforseo.com/v3/serp/google/locations
    location: 2840,

    // Language code for keyword data.
    language: 'en',

    // Skip keywords with difficulty above this score (0-100).
    // Higher = more competitive. 60 is a good starting point for
    // sites with moderate domain authority.
    maxDifficulty: 60,

    // Ignore keywords with monthly search volume below this number.
    // Set lower (50) for niche topics, higher (500) for competitive niches.
    minSearchVolume: 100,

    // Maximum secondary keywords passed to the writer prompt.
    // More keywords = more SEO signals but potentially less natural writing.
    maxRelatedKeywords: 10,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SCHEDULE CONFIGURATION
  //
  // Controls WHEN the pipeline runs and WHAT it writes about.
  // Two levels: run frequency (Level 1) and content calendar (Level 2).
  //
  // ─── HOW THE TWO LEVELS INTERACT ───────────────────────────────────────
  //
  //   Level 1 (cron) determines WHEN the pipeline executes.
  //   Level 2 (calendar) determines WHAT it writes about on that execution.
  //
  //   On each run:
  //   1. Pipeline starts (triggered by cron or manual invocation)
  //   2. Checks calendar for an entry matching today's date
  //   3. If calendar entry found → uses its constraints (topic, category, etc.)
  //   4. If no calendar entry → falls back to trending topic research
  //   5. Pipeline ALWAYS produces content, calendar just steers it
  //
  //   This means:
  //   - Calendar entries on non-cron days are IGNORED (pipeline doesn't run)
  //   - Cron days without calendar entries → trending research as usual
  //   - You don't need to fill every cron day with calendar entries
  //
  // ═══════════════════════════════════════════════════════════════════════════
  schedule: {

    // ─── Level 1: Run Frequency ─────────────────────────────────────────
    //
    // Standard cron expression controlling how often the pipeline runs
    // via GitHub Actions. This value is injected into the generated
    // workflow template.
    //
    // FORMAT: minute hour day-of-month month day-of-week
    //
    // EXAMPLES:
    //   '17 8 */3 * *'   → every 3 days at 8:17 AM UTC (default)
    //   '0 9 * * 1'      → every Monday at 9 AM UTC
    //   '0 6 * * *'      → daily at 6 AM UTC (aggressive — watch costs)
    //   '0 10 * * 1,4'   → Monday + Thursday at 10 AM UTC (2x/week)
    //   '0 8 1,15 * *'   → 1st and 15th of each month at 8 AM UTC
    //
    // GUIDELINES:
    //   New sites      → every 3 days to build initial content library
    //   Established    → weekly is usually sufficient
    //   High-volume    → daily, but watch DataForSEO/Gemini API costs
    //   Each run costs → ~$0.12-0.17 (Gemini + DataForSEO + translations)
    //
    cron: '17 8 */3 * *',

    // How many posts to generate per pipeline execution.
    // CLI flag --batch overrides this value.
    //
    // EXAMPLES:
    //   1  → one post per run (default, steady publishing cadence)
    //   5  → five posts per run (useful for initial site seeding)
    //   10 → ten posts (launch mode — run once to seed, then set to 1)
    //
    // NOTES:
    //   - Each post ≈ 11 Gemini API calls + 4 DataForSEO calls
    //   - Batch mode staggers frontmatter dates (post 2 = tomorrow, etc.)
    //   - Dedupe is cumulative within a batch (post 3 knows about 1 and 2)
    //   - Translations multiply cost: 1 post × 6 languages = 7 write calls
    //
    postsPerRun: 1,

    // ─── Level 2: Content Calendar ──────────────────────────────────────
    //
    // Optional editorial calendar that guides WHAT the pipeline writes.
    // When a calendar entry matches today's date, the pipeline uses that
    // entry's constraints instead of open-ended trending topic research.
    //
    // ─── HOW IT WORKS ───────────────────────────────────────────────────
    //
    //   1. Pipeline checks calendar for entry matching today (YYYY-MM-DD)
    //   2. If match found:
    //      a. entry.topic     → skip research, use this topic directly
    //      b. entry.category  → restrict research to this topic cluster
    //      c. entry.keywords  → skip DataForSEO seed extraction, use these
    //      d. entry.notes     → inject as extra guidance in writer prompt
    //      e. entry.priority  → 'high' skips dedupe (intentional overlap)
    //   3. If no match → normal trending topic research (Step 1)
    //   4. Dedupe STILL runs regardless (unless priority: 'high')
    //
    //   Pipeline ALWAYS produces content, even without calendar entries.
    //   Calendar steers; it doesn't block.
    //
    // ─── ENTRY FIELDS ───────────────────────────────────────────────────
    //
    //   date       [REQUIRED]  ISO date 'YYYY-MM-DD'
    //
    //   category   [optional]  Restrict research to this cluster name.
    //                          Must match a name in topics.clusters[].
    //                          If invalid, logs warning, falls back to all.
    //
    //   topic      [optional]  Specific topic title. Skips research entirely.
    //                          Goes straight to dedupe → write.
    //
    //   keywords   [optional]  Array of seed keywords. Skips DataForSEO
    //                          seed extraction, passes directly to writer.
    //                          Useful when you already know target keywords.
    //
    //   notes      [optional]  Free-text guidance injected into writer prompt.
    //                          e.g., "focus on Australian market"
    //                          e.g., "compare with Bark, acknowledge strengths"
    //                          e.g., "this is a refresh of our top post"
    //
    //   priority   [optional]  'high' | 'normal' (default: 'normal')
    //                          'high' skips dedupe — use when intentionally
    //                          writing about a previously covered topic
    //                          (e.g., updated take, new data, different angle).
    //
    // ─── EXAMPLES ───────────────────────────────────────────────────────
    //
    //   Minimal — just steer toward a category:
    //     { date: '2026-05-01', category: 'Regulation' }
    //
    //   Specific topic — skip research entirely:
    //     { date: '2026-05-04', topic: 'Australia Under-16 Ban Takes Effect' }
    //
    //   Full control — topic + keywords + notes:
    //     {
    //       date: '2026-05-08',
    //       topic: 'Linear vs AcmeSaaS: Feature Comparison',
    //       category: 'Competitor',
    //       keywords: ['qustodio alternative', 'best youtube parental control'],
    //       notes: 'Position as objective comparison. Acknowledge strengths.',
    //       priority: 'normal',
    //     }
    //
    //   Monthly plan — mix planned + unplanned:
    //     [
    //       { date: '2026-05-01', category: 'Regulation' },
    //       { date: '2026-05-04', category: 'Competitor' },
    //       { date: '2026-05-07', category: 'Parent Concerns' },
    //       // days without entries → trending research as usual
    //     ]
    //
    //   Override dedupe for intentional refresh:
    //     {
    //       date: '2026-05-20',
    //       topic: 'Can Kids Bypass Qustodio in 2026? Updated Guide',
    //       priority: 'high',
    //       notes: 'Refresh of our top-traffic post with 2026 data.',
    //     }
    //
    // ─── LOADING ────────────────────────────────────────────────────────
    //
    //   Calendar can be defined INLINE here OR in a SEPARATE FILE.
    //   If calendarFile is set, it takes precedence over inline entries.
    //
    //   Inline:
    //     calendar: [{ date: '2026-05-01', category: 'Regulation' }]
    //
    //   External file:
    //     calendarFile: './content-calendar.mjs'
    //     // content-calendar.mjs: export default [{ date: '...', ... }]
    //
    // ─── TIPS ───────────────────────────────────────────────────────────
    //
    //   - You don't need to fill every run date. Gaps = trending research.
    //   - Mix planned + unplanned: calendar for strategic, gaps for news.
    //   - Review and update monthly. Stale entries are harmless (ignored).
    //   - Use 'notes' liberally — it's free-text injected into the prompt.
    //   - Calendar does NOT affect translation or image generation.
    //   - Multiple entries for same date → first match used, warning logged.
    //   - Past dates in calendar → ignored (only today's date matters).
    //
    calendar: [],
    calendarFile: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // READABILITY TARGET — Flesch-Kincaid grade level check.
  //
  // The validator calculates a readability score for each generated post
  // and compares it against this target range.
  //
  // GRADE LEVEL GUIDE:
  //   5-6   → 5th-6th grade (very simple, good for broad consumer audiences)
  //   7-8   → 7th-8th grade (most marketing content, recommended default)
  //   9-10  → 9th-10th grade (informed consumers, some technical concepts)
  //   11-12 → 11th-12th grade (professional/technical audiences)
  //   13+   → college level (academic, B2B enterprise)
  //
  // Set warnOnly: true to log a warning without blocking the pipeline.
  // Set warnOnly: false to fail the pipeline if score is outside range.
  // ═══════════════════════════════════════════════════════════════════════════
  readability: {
    targetGrade: { min: 6, max: 10 },
    warnOnly: true,
  },
};
