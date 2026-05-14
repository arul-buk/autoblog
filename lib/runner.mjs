/**
 * runner.mjs
 * Step executor — runs a sequence of pipeline steps with checkpoint support.
 *
 * Replaces the monolithic pipeline function with a composable step runner.
 * Each step reads from and writes to a shared StepState object.
 * Checkpoints enable resume-from-failure.
 */

import { resolveStyleGuide } from './style-guide.mjs';
import { getExistingPostMeta } from './linker.mjs';
import { STEPS, isStepEnabled } from './step-registry.mjs';
import { CostTracker } from './cost-tracker.mjs';
import {
  generateRunId,
  resolveCheckpointDir,
  saveCheckpoint,
  loadCheckpoint,
  cleanExpiredCheckpoints,
} from './checkpoint.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/**
 * Build the initial pipeline state before any steps run.
 *
 * @param {object} config - Full autoblog config
 * @param {object} options - CLI options
 * @returns {object} Initial StepState
 */
export function buildInitialState(config, options = {}) {
  const styleGuide = resolveStyleGuide(config);
  const existingMeta = getExistingPostMeta(config);
  const additionalSlugs = options.additionalSlugs || [];

  const allMeta = [
    ...existingMeta,
    ...additionalSlugs.map((s) => ({ slug: s, title: s, keywords: [] })),
  ];

  return {
    // Pre-computed inputs
    styleGuide,
    existingMeta: allMeta,

    // Schedule (populated by schedule step)
    scheduleResult: {
      mode: 'trending',
      topicOverride: null,
      categoryConstraint: null,
      seedKeywords: null,
      writerNotes: null,
      skipDedupe: false,
    },

    // Accumulated through pipeline
    gscInsights: null,
    context: null,
    contextInsights: null,
    balancingDirective: null,
    localTopic: null,
    candidateTopics: [],
    selectedTopic: null,
    keywordData: null,
    linkedSlugs: [],
    slug: null,
    content: null,
    metadata: null,
    validation: null,
    imagePath: null,
    translations: new Map(),
    translationErrors: [],
    publishResult: null,

    // Strategic gap fields
    refreshQueue: null,
    serpFeatures: null,
    competitorGaps: null,
    repurposedContent: null,
    predictedPerformance: null,
    auditReport: null,
    geoMetrics: null,
  };
}

/**
 * Count how many steps in a sequence are enabled.
 */
function countEnabledSteps(sequence, config) {
  return sequence.filter((name) => isStepEnabled(name, config)).length;
}

/**
 * Run a sequence of pipeline steps.
 *
 * @param {string[]} sequence - Ordered array of step names
 * @param {object} config - Full autoblog config
 * @param {object} [options]
 * @param {boolean} [options.dryRun=false]
 * @param {string} [options.runId] - Explicit run ID (for resume)
 * @param {string[]} [options.additionalSlugs=[]]
 * @param {string[]} [options.resumeCompletedSteps=[]] - Steps already completed (for resume)
 * @returns {Promise<object>} Final StepState
 */
export async function runSteps(sequence, config, options = {}) {
  const { dryRun = false, resumeCompletedSteps = [] } = options;
  const apiKey = process.env.GEMINI_API_KEY;

  const runId = options.runId || generateRunId();
  const checkpointEnabled = config.checkpoint?.enabled !== false;
  const checkpointDir = checkpointEnabled ? resolveCheckpointDir(config, runId) : null;

  let state = buildInitialState(config, options);

  const totalSteps = countEnabledSteps(sequence, config);
  let currentStep = 0;

  log(`=== ${config.product.name} Auto-Publish Blog Pipeline ===`);
  log(`Run ID: ${runId}`);
  if (dryRun) log('DRY RUN MODE - no files will be saved');
  if (resumeCompletedSteps.length > 0) log(`Resuming — ${resumeCompletedSteps.length} steps restored from checkpoint`);

  if (state.styleGuide.voice || state.styleGuide.referencePost) {
    log(`  Style guide active: ${state.styleGuide.voice ? 'voice rules' : ''}${state.styleGuide.voice && state.styleGuide.referencePost ? ' + ' : ''}${state.styleGuide.referencePost ? 'reference post' : ''}`);
  }

  // Cost tracker — accumulates Gemini token + DataForSEO costs per step
  const costTracker = new CostTracker();

  // Merge options that steps need
  const stepOptions = { dryRun, apiKey, additionalSlugs: options.additionalSlugs || [], costTracker };

  // Track which steps have actually executed (for safety checks)
  const executedSteps = new Set(resumeCompletedSteps);

  for (const stepName of sequence) {
    // Skip disabled steps
    if (!isStepEnabled(stepName, config)) continue;

    currentStep++;
    const stepLabel = `Step ${currentStep}/${totalSteps}`;

    // Check for checkpoint (resume support)
    if (resumeCompletedSteps.includes(stepName)) {
      const cached = checkpointDir ? loadCheckpoint(checkpointDir, stepName) : null;
      if (cached) {
        state = cached;
        log(`  [${stepName}] ✓ restored from checkpoint`);
        continue;
      }
    }

    // Load and run the step
    const stepDef = STEPS[stepName];
    if (!stepDef) {
      log(`  Warning: Unknown step "${stepName}" — skipping`);
      continue;
    }

    // Safety: humanize must run before any publishing step when content was written
    const PUBLISH_STEPS = ['cmsPublish', 'notify', 'repurpose'];
    if (PUBLISH_STEPS.includes(stepName) && state.content && !executedSteps.has('humanize')) {
      if (sequence.includes('write') || executedSteps.has('write')) {
        log(`  WARNING: "${stepName}" requires humanized content. The humanize step has not run.`);
        log(`  Content will not be published without humanization. Add "humanize" to your step sequence.`);
        continue;
      }
    }

    log(`${stepLabel}: ${stepName}...`);

    try {
      const mod = await import(stepDef.module);
      const stepFn = mod[stepDef.fn];
      if (typeof stepFn !== 'function') {
        log(`  Warning: Step "${stepName}" has no export "${stepDef.fn}" — skipping`);
        continue;
      }

      state = await stepFn(state, config, stepOptions);
      executedSteps.add(stepName);

      // Check for early exit signals from steps
      if (state.status === 'all_duplicates' || state.status === 'no_topics') {
        log(`  Pipeline stopping early: ${state.status}`);
        if (checkpointDir && !dryRun) {
          saveCheckpoint(checkpointDir, stepName, state);
        }
        break;
      }

      // Save checkpoint after successful step
      if (checkpointDir && !dryRun) {
        saveCheckpoint(checkpointDir, stepName, state);
      }
    } catch (err) {
      log(`  Error in step "${stepName}": ${err.message}`);
      // Save partial state so resume can pick up
      if (checkpointDir && !dryRun) {
        saveCheckpoint(checkpointDir, `_failed_${stepName}`, state);
      }
      throw err;
    }
  }

  // Clean expired checkpoints periodically
  if (checkpointEnabled && !dryRun) {
    try {
      cleanExpiredCheckpoints(config);
    } catch {
      // Non-fatal
    }
  }

  // Log cost report
  const costSummary = costTracker.getSummary();
  if (costSummary.total > 0) {
    log('');
    log(costTracker.formatReport());
  }

  // Attach cost summary to state for context persistence
  state.costSummary = costSummary;

  return state;
}

/**
 * Convert final StepState to the pipeline result format expected by
 * saveResults() and the CLI.
 *
 * @param {object} state - Final StepState
 * @returns {object} Pipeline result
 */
export function stateToResult(state) {
  return {
    status: state.content ? 'success' : 'no_topics',
    slug: state.slug,
    content: state.content,
    metadata: state.metadata,
    translations: state.translations instanceof Map ? state.translations : new Map(Object.entries(state.translations || {})),
    translationErrors: state.translationErrors || [],
    imagePath: state.imagePath,
    validation: state.validation,
    scheduleMode: state.scheduleResult?.mode || 'trending',
    keywordData: state.keywordData,
    publishResult: state.publishResult,
    // Strategic gap fields
    refreshQueue: state.refreshQueue,
    auditReport: state.auditReport,
    geoMetrics: state.geoMetrics,
    repurposedContent: state.repurposedContent,
  };
}
