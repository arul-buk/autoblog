/**
 * config.mjs
 * Loads and validates autoblog.config.mjs from the consuming project's CWD.
 * Merges user config with sensible defaults.
 */

import { pathToFileURL } from 'url';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const DEFAULTS = {
  models: {
    text: process.env.AUTOBLOG_TEXT_MODEL || 'gemini-2.5-flash',
    image: process.env.AUTOBLOG_IMAGE_MODEL || 'gemini-2.5-flash-image',
  },
  retry: {
    maxAttempts: 3,
    baseDelayMs: 2000,
  },
  readability: {
    targetGrade: { min: 6, max: 10 },
    warnOnly: true,
  },
  output: {
    postsDir: '_posts',
    imagesDir: 'public/images/blog',
    bodyFormat: 'html',
    wordCount: { min: 1000, max: 1500 },
    ctaMarkers: [],
    contentPathPrefix: '/blog/',
    frontmatterSchema: {
      required: ['title', 'description', 'lastUpdated', 'readTime', 'author', 'seoKeywords'],
      optional: ['category', 'breadcrumbLabel', 'relatedGuides', 'hasCalculator', 'heroImage', 'heroAlt'],
    },
    frontmatterTemplate: null,
  },
  translation: {
    enabled: false,
    languages: [],
    rateLimitMs: 1000,
  },
  seo: {
    enabled: false,
    provider: 'dataforseo',
    location: 2840,
    language: 'en',
    maxDifficulty: 60,
    minSearchVolume: 100,
    maxRelatedKeywords: 10,
  },
  schedule: {
    cron: '17 8 */3 * *',
    postsPerRun: 1,
    calendar: [],
    calendarFile: null,
  },
  steps: {
    calendar: true,
    research: true,
    dedupe: true,
    keywordResearch: true,
    write: true,
    metaOptimize: false,
    humanize: true,
    crossModelReview: false,
    validate: true,
    embedSchema: false,
    internalLinking: true,
    image: true,
    translate: true,
    localContent: false,
  },
  gsc: {
    enabled: false,
    propertyUrl: '',
    lookbackDays: 90,
    quickWinPositionRange: [4, 20],
    minImpressions: 1,            // Start at 1 for new sites. See MATURITY MILESTONES below.
    schedule: {
      frequency: 'weekly',       // 'every-run' | 'weekly' | 'biweekly' | 'monthly' | number (days)
      lastRunFile: '.autoblog-gsc-lastrun',
    },
    // ── GSC MATURITY MILESTONES ──────────────────────────────────────
    // Adjust these values as the site grows:
    //
    // NEW SITE (0-50 GSC queries):
    //   minImpressions: 1, quickWinPositionRange: [4, 20]
    //   Every GSC signal matters. Cast a wide net.
    //
    // GROWING (50-200 queries, some with 10+ impressions):
    //   minImpressions: 10, quickWinPositionRange: [4, 15]
    //   Filter noise, focus on validated demand.
    //
    // ESTABLISHED (200+ queries, consistent traffic):
    //   minImpressions: 50, quickWinPositionRange: [4, 15]
    //   Prioritise high-volume opportunities only.
    // ─────────────────────────────────────────────────────────────────
  },
  publish: {
    cms: null,
    draft: true,
  },
  context: {
    enabled: false,
    filePath: '.autoblog-context.json',
  },
  analytics: {
    enabled: false,
    propertyId: '',
  },
  crossModel: {
    model: 'gemini-2.5-pro',
    qualityThreshold: 7,
  },
  notifications: {},
  contentStrategy: null,

  // ── Pipeline infrastructure ────────────────────────────────────
  checkpoint: {
    enabled: true,
    dir: '.autoblog-checkpoints',
    maxAgeMs: 86400000, // 24 hours
  },

  // ── Strategic gap defaults (all disabled by default) ───────────
  contentRefresh: {
    enabled: false,
    rules: [
      { category: '*', maxAgeDays: 365 },
    ],
    maxQueueSize: 10,
    prioritizeByTraffic: true,
  },
  audit: {
    enabled: true,
    minPostAgeDays: 14,
    declineThreshold: 0.3,
    winningPatterns: { minClicks: 50, topPositionThreshold: 10 },
  },
  topicalMap: {
    enabled: false,
    pillars: [],
    requirePillarFirst: true,
  },
  serpFeatures: {
    enabled: false,
    targetFeatures: ['featured_snippet', 'people_also_ask', 'ai_overview'],
  },
  competitors: {
    enabled: false,
    domains: [],
    maxGaps: 20,
    minVolume: 100,
    refreshDays: 30,
  },
  geoTracking: {
    enabled: false,
    brandNames: [],
    platforms: ['google_ai_overview', 'chatgpt'],
  },
  repurpose: {
    enabled: false,
    formats: ['twitter-thread', 'linkedin-post', 'newsletter-snippet'],
    outputDir: '_repurposed',
  },
};

/**
 * Deep merge two objects. Source values override target values.
 * Arrays are replaced, not merged.
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Validates that all required config fields are present.
 * Throws descriptive errors for missing fields.
 */
function validateConfig(config) {
  const errors = [];

  if (!config.product?.name) errors.push('product.name is required');
  if (!config.product?.url) errors.push('product.url is required');
  if (!config.product?.description) errors.push('product.description is required');
  if (!config.authors || !Array.isArray(config.authors) || config.authors.length === 0) {
    errors.push('authors[] must be a non-empty array');
  }
  if (!config.topics?.clusters || !Array.isArray(config.topics.clusters) || config.topics.clusters.length === 0) {
    errors.push('topics.clusters[] must be a non-empty array');
  }

  // Validate author structure
  if (config.authors) {
    for (const [i, author] of config.authors.entries()) {
      if (!author.name) errors.push(`authors[${i}].name is required`);
      if (!author.categories || !Array.isArray(author.categories)) {
        errors.push(`authors[${i}].categories must be an array`);
      }
    }
  }

  // Validate topic clusters
  if (config.topics?.clusters) {
    for (const [i, cluster] of config.topics.clusters.entries()) {
      if (!cluster.name) errors.push(`topics.clusters[${i}].name is required`);
      if (!cluster.queries || !Array.isArray(cluster.queries) || cluster.queries.length === 0) {
        errors.push(`topics.clusters[${i}].queries must be a non-empty array`);
      }
    }
  }

  // Validate bodyFormat
  const validFormats = ['html', 'markdown', 'mdx'];
  if (config.output?.bodyFormat && !validFormats.includes(config.output.bodyFormat)) {
    errors.push(`output.bodyFormat must be one of: ${validFormats.join(', ')} (got "${config.output.bodyFormat}")`);
  }

  // Validate translation language codes
  const validLangCodes = ['es', 'pt', 'fr', 'de', 'zh', 'ja', 'ko', 'it', 'nl', 'ar', 'hi', 'ru', 'tr', 'pl', 'sv', 'th', 'vi'];
  if (config.translation?.languages?.length > 0) {
    for (const lang of config.translation.languages) {
      if (!validLangCodes.includes(lang)) {
        errors.push(`translation.languages contains invalid code "${lang}". Valid: ${validLangCodes.join(', ')}`);
      }
    }
  }

  // Validate style guide file paths if set
  if (config.product?.styleGuide) {
    const sg = config.product.styleGuide;
    if (sg.voiceFile && typeof sg.voiceFile !== 'string') {
      errors.push('product.styleGuide.voiceFile must be a string (file path)');
    }
    if (sg.referencePostFile && typeof sg.referencePostFile !== 'string') {
      errors.push('product.styleGuide.referencePostFile must be a string (file path)');
    }
  }

  // Validate SEO config if enabled
  if (config.steps?.keywordResearch && config.seo?.enabled) {
    if (!config.seo.apiLogin && !process.env.DATAFORSEO_LOGIN) {
      errors.push('seo.apiLogin or DATAFORSEO_LOGIN env var required when seo.enabled=true');
    }
    if (!config.seo.apiPassword && !process.env.DATAFORSEO_PASSWORD) {
      errors.push('seo.apiPassword or DATAFORSEO_PASSWORD env var required when seo.enabled=true');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Config validation failed:\n  - ${errors.join('\n  - ')}`);
  }
}

/**
 * Load autoblog config from the given path or CWD.
 *
 * @param {string} [configPath] - Path to config file. Defaults to './autoblog.config.mjs' in CWD.
 * @returns {Promise<object>} - Validated, merged config object
 */
export async function loadConfig(configPath) {
  const resolvedPath = configPath
    ? path.resolve(configPath)
    : path.resolve(process.cwd(), 'autoblog.config.mjs');

  let userConfig;
  try {
    const fileUrl = pathToFileURL(resolvedPath).href;
    const mod = await import(fileUrl);
    userConfig = mod.default || mod;
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'ENOENT') {
      throw new Error(
        `Config file not found at ${resolvedPath}\n` +
        'Create an autoblog.config.mjs file or specify --config path/to/config.mjs'
      );
    }
    throw new Error(`Failed to load config from ${resolvedPath}: ${err.message}`);
  }

  const config = deepMerge(DEFAULTS, userConfig);

  // Ensure intentFormatMap exists in contentStrategy
  if (config.contentStrategy && !config.contentStrategy.intentFormatMap) {
    config.contentStrategy.intentFormatMap = {
      informational: ['how-to-guide', 'explainer', 'listicle'],
      commercial: ['comparison', 'review', 'roundup'],
      transactional: ['product-tutorial', 'calculator-guide', 'setup-guide'],
      navigational: ['brand-feature', 'documentation', 'changelog'],
    };
  }

  // Load content strategy from .autoblog-strategy.json if it exists
  // (inline contentStrategy in config takes precedence)
  if (!config.contentStrategy) {
    const strategyPath = path.resolve(process.cwd(), '.autoblog-strategy.json');
    if (existsSync(strategyPath)) {
      try {
        config.contentStrategy = JSON.parse(readFileSync(strategyPath, 'utf-8'));
      } catch (err) {
        console.log(`Warning: Failed to load .autoblog-strategy.json: ${err.message}`);
      }
    }
  }

  validateConfig(config);

  return config;
}

export { DEFAULTS };
