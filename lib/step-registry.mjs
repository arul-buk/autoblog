/**
 * step-registry.mjs
 * Central registry of all pipeline steps, their modules, and named sequences.
 *
 * Each step is a thin wrapper that:
 *   1. Extracts inputs from the shared StepState
 *   2. Calls the existing module function
 *   3. Merges outputs back into StepState
 *
 * Steps can be composed into custom sequences via CLI --steps flag
 * or selected from NAMED_SEQUENCES via subcommands.
 */

/**
 * Step definitions: maps step name → { fn, module }
 * - fn: the exported function name in the module
 * - module: path relative to this file (lib/)
 */
export const STEPS = {
  // ── Pre-research ─────────────────────────────────────────────
  schedule:           { fn: 'scheduleStep',          module: './steps/schedule.mjs' },
  gsc:                { fn: 'gscStep',               module: './steps/gsc.mjs' },
  contextLoad:        { fn: 'contextLoadStep',       module: './steps/context-load.mjs' },
  contentRefresh:     { fn: 'contentRefreshStep',    module: './steps/content-refresh.mjs' },
  competitorAnalysis: { fn: 'competitorAnalysisStep',  module: './steps/competitor-analysis.mjs' },
  topicalAuthority:   { fn: 'topicalAuthorityStep',  module: './steps/topical-authority.mjs' },

  // ── Research & selection ─────────────────────────────────────
  research:           { fn: 'researchStep',          module: './steps/research.mjs' },
  dedupe:             { fn: 'dedupeStep',            module: './steps/dedupe.mjs' },
  keywordResearch:    { fn: 'keywordResearchStep',   module: './steps/keyword-research.mjs' },
  intentFormat:       { fn: 'intentFormatStep',      module: './steps/intent-format.mjs' },
  serpFeatures:       { fn: 'serpFeaturesStep',       module: './steps/serp-features.mjs' },
  internalLinking:    { fn: 'linkingStep',           module: './steps/linking.mjs' },

  // ── Writing & refinement ─────────────────────────────────────
  write:              { fn: 'writeStep',             module: './steps/write.mjs' },
  metaOptimize:       { fn: 'metaOptimizeStep',      module: './steps/meta-optimize.mjs' },
  humanize:           { fn: 'humanizeStep',          module: './steps/humanize.mjs' },
  crossModelReview:   { fn: 'crossReviewStep',       module: './steps/cross-review.mjs' },
  validate:           { fn: 'validateStep',          module: './steps/validate.mjs' },
  embedSchema:        { fn: 'schemaStep',            module: './steps/schema.mjs' },

  // ── Post-processing ──────────────────────────────────────────
  image:              { fn: 'imageStep',             module: './steps/image.mjs' },
  translate:          { fn: 'translateStep',         module: './steps/translate.mjs' },
  contextUpdate:      { fn: 'contextUpdateStep',     module: './steps/context-update.mjs' },
  cmsPublish:         { fn: 'cmsPublishStep',        module: './steps/cms-publish.mjs' },
  repurpose:          { fn: 'repurposeStep',         module: './steps/repurpose.mjs' },
  notify:             { fn: 'notifyStep',            module: './steps/notify.mjs' },

  // ── Standalone steps (not in default sequence) ───────────────
  performanceAudit:   { fn: 'performanceAuditStep',  module: './steps/performance-audit.mjs' },
  geoTracking:        { fn: 'geoTrackingStep',       module: './steps/geo-tracking.mjs' },
};

/**
 * Default sequence — matches the current pipeline.mjs behavior.
 * New strategic steps are included but disabled by default in config.
 */
export const DEFAULT_SEQUENCE = [
  'schedule',
  'gsc',
  'contextLoad',
  'contentRefresh',
  'competitorAnalysis',
  'topicalAuthority',
  'research',
  'dedupe',
  'keywordResearch',
  'intentFormat',
  'serpFeatures',
  'internalLinking',
  'write',
  'metaOptimize',
  'humanize',
  'crossModelReview',
  'validate',
  'embedSchema',
  'image',
  'translate',
  'contextUpdate',
  'cmsPublish',
  'repurpose',
  'notify',
];

/**
 * Named sequences for CLI subcommands.
 */
export const NAMED_SEQUENCES = {
  generate: DEFAULT_SEQUENCE,
  audit:    ['contextLoad', 'performanceAudit', 'geoTracking'],
  research: ['schedule', 'gsc', 'contextLoad', 'research', 'dedupe', 'keywordResearch'],
  refresh:  ['contextLoad', 'contentRefresh'],
};

/**
 * Maps step names to config keys that control whether the step runs.
 * Steps not listed here always run (e.g., 'write' is always active).
 *
 * A step is enabled if:
 *   1. It has no config key mapped here (always-on), OR
 *   2. The mapped config key is truthy
 */
const STEP_CONFIG_MAP = {
  schedule:           'steps.calendar',
  gsc:                'gsc.enabled',
  contentRefresh:     'contentRefresh.enabled',
  competitorAnalysis: 'competitors.enabled',
  topicalAuthority:   'topicalMap.enabled',
  research:           'steps.research',
  dedupe:             'steps.dedupe',
  keywordResearch:    'steps.keywordResearch',
  intentFormat:       'contentStrategy.intentFormatMap',
  serpFeatures:       'serpFeatures.enabled',
  internalLinking:    'steps.internalLinking',
  metaOptimize:       'steps.metaOptimize',
  humanize:           'steps.humanize',
  crossModelReview:   'steps.crossModelReview',
  validate:           'steps.validate',
  embedSchema:        'steps.embedSchema',
  image:              'steps.image',
  translate:          'steps.translate',
  cmsPublish:         'publish.cms',
  repurpose:          'repurpose.enabled',
  notify:             'notifications.telegram.botToken',
  geoTracking:        'geoTracking.enabled',
  performanceAudit:   'audit.enabled',
};

/**
 * Check whether a step is enabled given the current config.
 *
 * @param {string} stepName - Step name from STEPS
 * @param {object} config - Full autoblog config
 * @returns {boolean}
 */
export function isStepEnabled(stepName, config) {
  const configPath = STEP_CONFIG_MAP[stepName];
  if (!configPath) return true; // No config key → always enabled

  // Walk the dot-separated path
  const parts = configPath.split('.');
  let value = config;
  for (const part of parts) {
    if (value == null) return false;
    value = value[part];
  }

  return !!value;
}

/**
 * Resolve a sequence from a name or comma-separated step list.
 *
 * @param {string} input - Named sequence ('audit') or step list ('research,dedupe,write')
 * @returns {string[]} Array of step names
 */
export function resolveSequence(input) {
  if (NAMED_SEQUENCES[input]) {
    return NAMED_SEQUENCES[input];
  }

  const steps = input.split(',').map((s) => s.trim()).filter(Boolean);
  const invalid = steps.filter((s) => !STEPS[s]);
  if (invalid.length > 0) {
    throw new Error(`Unknown step(s): ${invalid.join(', ')}. Valid steps: ${Object.keys(STEPS).join(', ')}`);
  }

  // Safety: if sequence includes 'write' but not 'humanize', auto-inject it after write.
  // Humanization is mandatory for all published content — no exceptions.
  if (steps.includes('write') && !steps.includes('humanize')) {
    const writeIdx = steps.indexOf('write');
    steps.splice(writeIdx + 1, 0, 'humanize');
    console.log(`[autoblog] Auto-injected "humanize" step after "write" — humanization is mandatory for all content.`);
  }

  return steps;
}
