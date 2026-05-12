/**
 * serp-features.test.mjs
 * Tests for SERP feature detection and guidance generation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildSerpFeatureGuidance } from '../lib/serp-features.mjs';

describe('buildSerpFeatureGuidance', () => {
  it('returns guidance for featured_snippet', () => {
    const guidance = buildSerpFeatureGuidance(['featured_snippet']);
    assert.ok(guidance.includes('40-60 word'));
    assert.ok(guidance.includes('directly answers'));
  });

  it('returns guidance for people_also_ask', () => {
    const guidance = buildSerpFeatureGuidance(['people_also_ask']);
    assert.ok(guidance.includes('question-based'));
    assert.ok(guidance.includes('H3'));
  });

  it('returns guidance for ai_overview', () => {
    const guidance = buildSerpFeatureGuidance(['ai_overview']);
    assert.ok(guidance.includes('citable'));
    assert.ok(guidance.includes('self-contained'));
  });

  it('returns guidance for knowledge_panel', () => {
    const guidance = buildSerpFeatureGuidance(['knowledge_panel']);
    assert.ok(guidance.includes('entity definitions'));
  });

  it('returns guidance for video', () => {
    const guidance = buildSerpFeatureGuidance(['video']);
    assert.ok(guidance.includes('video'));
  });

  it('returns guidance for local_pack', () => {
    const guidance = buildSerpFeatureGuidance(['local_pack']);
    assert.ok(guidance.includes('location'));
  });

  it('combines guidance for multiple features', () => {
    const guidance = buildSerpFeatureGuidance(['featured_snippet', 'people_also_ask', 'ai_overview']);
    assert.ok(guidance.includes('40-60 word'));
    assert.ok(guidance.includes('question-based'));
    assert.ok(guidance.includes('citable'));
  });

  it('returns empty string for empty features array', () => {
    const guidance = buildSerpFeatureGuidance([]);
    assert.equal(guidance, '');
  });

  it('returns empty string for null features', () => {
    const guidance = buildSerpFeatureGuidance(null);
    assert.equal(guidance, '');
  });

  it('ignores unknown feature types', () => {
    const guidance = buildSerpFeatureGuidance(['unknown_feature']);
    assert.equal(guidance, '');
  });
});
