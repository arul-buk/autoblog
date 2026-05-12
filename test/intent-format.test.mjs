/**
 * intent-format.test.mjs
 * Tests for intent-to-format enforcement step.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import the step directly to test
import { intentFormatStep } from '../lib/steps/intent-format.mjs';

const baseConfig = {
  contentStrategy: {
    intentFormatMap: {
      informational: ['how-to-guide', 'explainer', 'listicle'],
      commercial: ['comparison', 'review', 'roundup'],
      transactional: ['product-tutorial', 'calculator-guide', 'setup-guide'],
      navigational: ['brand-feature', 'documentation', 'changelog'],
    },
  },
};

describe('intentFormatStep', () => {
  it('assigns how-to-guide for informational intent', async () => {
    const state = {
      keywordData: { searchIntent: 'informational', contentFormat: null },
    };
    const result = await intentFormatStep(state, baseConfig, {});
    assert.equal(result.keywordData.contentFormat, 'how-to-guide');
  });

  it('assigns comparison for commercial intent', async () => {
    const state = {
      keywordData: { searchIntent: 'commercial', contentFormat: null },
    };
    const result = await intentFormatStep(state, baseConfig, {});
    assert.equal(result.keywordData.contentFormat, 'comparison');
  });

  it('assigns product-tutorial for transactional intent', async () => {
    const state = {
      keywordData: { searchIntent: 'transactional', contentFormat: null },
    };
    const result = await intentFormatStep(state, baseConfig, {});
    assert.equal(result.keywordData.contentFormat, 'product-tutorial');
  });

  it('does NOT override existing contentFormat', async () => {
    const state = {
      keywordData: { searchIntent: 'informational', contentFormat: 'case-study' },
    };
    const result = await intentFormatStep(state, baseConfig, {});
    assert.equal(result.keywordData.contentFormat, 'case-study');
  });

  it('returns state unchanged when keywordData is null', async () => {
    const state = { keywordData: null };
    const result = await intentFormatStep(state, baseConfig, {});
    assert.equal(result.keywordData, null);
  });

  it('returns state unchanged when no searchIntent', async () => {
    const state = { keywordData: { contentFormat: null } };
    const result = await intentFormatStep(state, baseConfig, {});
    assert.equal(result.keywordData.contentFormat, null);
  });

  it('falls back gracefully for unknown intent', async () => {
    const state = {
      keywordData: { searchIntent: 'unknown-intent', contentFormat: null },
    };
    const result = await intentFormatStep(state, baseConfig, {});
    assert.equal(result.keywordData.contentFormat, null);
  });

  it('uses custom intentFormatMap from config', async () => {
    const customConfig = {
      contentStrategy: {
        intentFormatMap: {
          informational: ['tutorial', 'guide'],
          commercial: ['versus-page'],
        },
      },
    };
    const state = {
      keywordData: { searchIntent: 'informational', contentFormat: null },
    };
    const result = await intentFormatStep(state, customConfig, {});
    assert.equal(result.keywordData.contentFormat, 'tutorial');
  });

  it('uses default map when no config', async () => {
    const state = {
      keywordData: { searchIntent: 'commercial', contentFormat: null },
    };
    const result = await intentFormatStep(state, {}, {});
    assert.equal(result.keywordData.contentFormat, 'comparison');
  });
});
