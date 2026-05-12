/**
 * runner.test.mjs
 * Integration tests for the step runner, step registry, and CLI argument parsing.
 * Tests the actual wiring between components without making API calls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildInitialState, stateToResult } from '../lib/runner.mjs';
import { STEPS, DEFAULT_SEQUENCE, NAMED_SEQUENCES, isStepEnabled, resolveSequence } from '../lib/step-registry.mjs';

// ── Minimal config for testing (no API keys needed) ─────────────────

const minimalConfig = {
  product: { name: 'TestProduct', url: 'https://test.com', description: 'Test', brandNames: ['TestProduct'] },
  authors: [{ name: 'Test Author', role: 'Writer', categories: ['General'] }],
  fallbackAuthor: 'Test Author',
  topics: { clusters: [{ name: 'General', queries: ['test query'] }], recencyDays: 7 },
  output: { postsDir: '_posts', siteUrl: 'https://test.com', contentPathPrefix: '/blog/', wordCount: { min: 800, max: 1500 }, frontmatterSchema: { required: ['title'], optional: [] } },
  models: { text: 'gemini-2.5-flash' },
  steps: { calendar: false, research: true, dedupe: true, keywordResearch: true, write: true, metaOptimize: false, humanize: false, crossModelReview: false, validate: true, embedSchema: false, internalLinking: false, image: false, translate: false },
  seo: { enabled: false },
  gsc: { enabled: false },
  analytics: { enabled: false },
  context: { enabled: false },
  publish: { cms: null },
  notifications: {},
  contentStrategy: null,
  checkpoint: { enabled: true, dir: '/tmp/autoblog-test-checkpoints', maxAgeMs: 86400000 },
  contentRefresh: { enabled: false },
  topicalMap: { enabled: false },
  serpFeatures: { enabled: false },
  competitors: { enabled: false, domains: [] },
  geoTracking: { enabled: false },
  repurpose: { enabled: false },
  audit: { enabled: true, minPostAgeDays: 14, declineThreshold: 0.3, winningPatterns: { minClicks: 50, topPositionThreshold: 10 } },
  retry: { maxAttempts: 2, baseDelayMs: 1000 },
  readability: { targetGrade: { min: 6, max: 10 }, warnOnly: true },
};

// ── Step Registry Tests ─────────────────────────────────────────────

describe('Step Registry', () => {
  it('STEPS contains all expected step names', () => {
    const expected = [
      'schedule', 'gsc', 'contextLoad', 'research', 'dedupe',
      'keywordResearch', 'internalLinking', 'write', 'metaOptimize',
      'humanize', 'crossModelReview', 'validate', 'embedSchema',
      'image', 'translate', 'contextUpdate', 'cmsPublish', 'notify',
      // New strategic steps
      'contentRefresh', 'competitorAnalysis', 'topicalAuthority',
      'intentFormat', 'serpFeatures', 'repurpose',
      'performanceAudit', 'geoTracking',
    ];
    for (const name of expected) {
      assert.ok(STEPS[name], `Missing step: ${name}`);
      assert.ok(STEPS[name].fn, `Step ${name} missing fn`);
      assert.ok(STEPS[name].module, `Step ${name} missing module`);
    }
  });

  it('DEFAULT_SEQUENCE contains write step', () => {
    assert.ok(DEFAULT_SEQUENCE.includes('write'));
  });

  it('DEFAULT_SEQUENCE has research before dedupe before write', () => {
    const ri = DEFAULT_SEQUENCE.indexOf('research');
    const di = DEFAULT_SEQUENCE.indexOf('dedupe');
    const wi = DEFAULT_SEQUENCE.indexOf('write');
    assert.ok(ri < di, 'research should come before dedupe');
    assert.ok(di < wi, 'dedupe should come before write');
  });

  it('NAMED_SEQUENCES has audit, refresh, research', () => {
    assert.ok(NAMED_SEQUENCES.audit);
    assert.ok(NAMED_SEQUENCES.refresh);
    assert.ok(NAMED_SEQUENCES.research);
    assert.ok(NAMED_SEQUENCES.generate);
  });

  it('audit sequence includes contextLoad and performanceAudit', () => {
    assert.ok(NAMED_SEQUENCES.audit.includes('contextLoad'));
    assert.ok(NAMED_SEQUENCES.audit.includes('performanceAudit'));
  });
});

// ── isStepEnabled Tests ─────────────────────────────────────────────

describe('isStepEnabled', () => {
  it('returns true for always-on steps (write, contextLoad)', () => {
    assert.equal(isStepEnabled('write', minimalConfig), true);
    assert.equal(isStepEnabled('contextLoad', minimalConfig), true);
    assert.equal(isStepEnabled('contextUpdate', minimalConfig), true);
  });

  it('returns false for disabled steps', () => {
    assert.equal(isStepEnabled('schedule', minimalConfig), false); // steps.calendar = false
    assert.equal(isStepEnabled('gsc', minimalConfig), false); // gsc.enabled = false
    assert.equal(isStepEnabled('cmsPublish', minimalConfig), false); // publish.cms = null
    assert.equal(isStepEnabled('serpFeatures', minimalConfig), false);
    assert.equal(isStepEnabled('competitorAnalysis', minimalConfig), false);
    assert.equal(isStepEnabled('repurpose', minimalConfig), false);
  });

  it('returns true for enabled steps', () => {
    assert.equal(isStepEnabled('research', minimalConfig), true); // steps.research = true
    assert.equal(isStepEnabled('dedupe', minimalConfig), true);
    assert.equal(isStepEnabled('validate', minimalConfig), true);
  });

  it('handles nested config paths', () => {
    const config = { ...minimalConfig, notifications: { telegram: { botToken: 'test-token' } } };
    assert.equal(isStepEnabled('notify', config), true);
  });
});

// ── resolveSequence Tests ───────────────────────────────────────────

describe('resolveSequence', () => {
  it('resolves named sequences', () => {
    const seq = resolveSequence('audit');
    assert.deepEqual(seq, NAMED_SEQUENCES.audit);
  });

  it('resolves comma-separated step list (auto-injects humanize after write)', () => {
    const seq = resolveSequence('research,dedupe,write');
    assert.deepEqual(seq, ['research', 'dedupe', 'write', 'humanize']);
  });

  it('throws on invalid step names', () => {
    assert.throws(
      () => resolveSequence('research,nonexistent,write'),
      /Unknown step\(s\): nonexistent/
    );
  });

  it('handles single step (auto-injects humanize after write)', () => {
    const seq = resolveSequence('write');
    assert.deepEqual(seq, ['write', 'humanize']);
  });

  it('does not double-inject humanize when already present', () => {
    const seq = resolveSequence('write,humanize,validate');
    assert.deepEqual(seq, ['write', 'humanize', 'validate']);
  });

  it('auto-injects humanize after write in custom sequences', () => {
    const seq = resolveSequence('research,write,validate');
    assert.ok(seq.includes('humanize'), 'humanize should be auto-injected');
    assert.ok(seq.indexOf('humanize') > seq.indexOf('write'), 'humanize should be after write');
    assert.ok(seq.indexOf('humanize') < seq.indexOf('validate'), 'humanize should be before validate');
  });
});

// ── buildInitialState Tests ─────────────────────────────────────────

describe('buildInitialState', () => {
  it('returns object with all expected fields', () => {
    const state = buildInitialState(minimalConfig, {});
    assert.ok(state.styleGuide);
    assert.ok(Array.isArray(state.existingMeta));
    assert.ok(state.scheduleResult);
    assert.equal(state.scheduleResult.mode, 'trending');
    assert.equal(state.gscInsights, null);
    assert.equal(state.context, null);
    assert.equal(state.selectedTopic, null);
    assert.equal(state.content, null);
    assert.ok(state.translations instanceof Map);
    assert.equal(state.refreshQueue, null);
    assert.equal(state.serpFeatures, null);
    assert.equal(state.competitorGaps, null);
    assert.equal(state.auditReport, null);
    assert.equal(state.geoMetrics, null);
  });

  it('includes additionalSlugs in existingMeta', () => {
    const state = buildInitialState(minimalConfig, { additionalSlugs: ['slug-1', 'slug-2'] });
    const slugs = state.existingMeta.map((m) => m.slug);
    assert.ok(slugs.includes('slug-1'));
    assert.ok(slugs.includes('slug-2'));
  });
});

// ── stateToResult Tests ─────────────────────────────────────────────

describe('stateToResult', () => {
  it('converts state with content to success result', () => {
    const state = {
      content: '---\ntitle: Test\n---\nHello',
      slug: 'test-post',
      metadata: { title: 'Test', author: 'Author' },
      translations: new Map([['es', 'hola']]),
      translationErrors: [],
      imagePath: null,
      validation: { valid: true },
      scheduleResult: { mode: 'trending' },
      keywordData: null,
      publishResult: null,
      refreshQueue: null,
      auditReport: null,
      geoMetrics: null,
      repurposedContent: null,
    };
    const result = stateToResult(state);

    assert.equal(result.status, 'success');
    assert.equal(result.slug, 'test-post');
    assert.ok(result.translations instanceof Map);
    assert.equal(result.translations.get('es'), 'hola');
  });

  it('converts state without content to no_topics', () => {
    const state = { content: null, slug: null, metadata: null, translations: new Map(), scheduleResult: {} };
    const result = stateToResult(state);
    assert.equal(result.status, 'no_topics');
  });
});

// ── Step Module Import Smoke Tests ──────────────────────────────────

describe('Step module imports', () => {
  const stepNames = Object.keys(STEPS);

  for (const name of stepNames) {
    it(`step "${name}" module can be imported and has correct export`, async () => {
      const def = STEPS[name];
      try {
        const mod = await import(`../lib/${def.module.replace('./', '')}`);
        assert.equal(typeof mod[def.fn], 'function', `${def.module} should export ${def.fn} as a function`);
      } catch (err) {
        // Module might have dependencies that fail at import (e.g., missing env vars)
        // but the export should still be a function if the module loads
        assert.fail(`Failed to import ${def.module}: ${err.message}`);
      }
    });
  }
});
