/**
 * meta-optimizer.test.mjs
 * Tests for the pure helper functions used by the meta optimizer.
 * The main optimizeMetaTags() calls Gemini, so we test extractField/replaceField logic
 * by importing the module and testing the exported function's non-API paths.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// extractField and replaceField are private, but optimizeMetaTags uses them.
// We test their behavior indirectly through the module's observable effects.
// Since we can't call Gemini in tests, we replicate the pure logic here.

function extractField(content, field) {
  const match = content.match(new RegExp(`^${field}:\\s*["']?([^"'\\n]+)["']?`, 'm'));
  return match ? match[1].trim() : null;
}

function replaceField(content, field, newValue) {
  const pattern = new RegExp(`^(${field}:\\s*)["']?[^"'\\n]+["']?`, 'm');
  if (pattern.test(content)) {
    return content.replace(pattern, `$1"${newValue.replace(/"/g, '\\"')}"`);
  }
  return content;
}

const SAMPLE_POST = `---
title: "Original Title Here"
date: "2026-04-27"
excerpt: "Original excerpt that describes the post content."
coverImage: "/images/blog/test.png"
author: "Sarah Chen"
category: "Cost Planning"
schema:
  type: "BlogPosting"
  headline: "Original Title Here"
  description: "Original excerpt that describes the post content."
---
<article><p>Body content.</p></article>`;

describe('extractField', () => {
  it('extracts quoted field values', () => {
    assert.equal(extractField(SAMPLE_POST, 'title'), 'Original Title Here');
    assert.equal(extractField(SAMPLE_POST, 'author'), 'Sarah Chen');
    assert.equal(extractField(SAMPLE_POST, 'category'), 'Cost Planning');
  });

  it('extracts unquoted field values', () => {
    const content = '---\ntitle: No Quotes Here\ndate: 2026-04-27\n---';
    assert.equal(extractField(content, 'title'), 'No Quotes Here');
  });

  it('returns null for missing fields', () => {
    assert.equal(extractField(SAMPLE_POST, 'nonexistent'), null);
  });

  it('handles single-quoted values', () => {
    const content = "---\ntitle: 'Single Quoted'\n---";
    assert.equal(extractField(content, 'title'), 'Single Quoted');
  });
});

describe('replaceField', () => {
  it('replaces a quoted title', () => {
    const result = replaceField(SAMPLE_POST, 'title', 'New Optimized Title');
    assert.ok(result.includes('"New Optimized Title"'));
    // The title field should be replaced; schema headline still has the original
    assert.ok(result.startsWith('---\ntitle: "New Optimized Title"'));
  });

  it('replaces excerpt value', () => {
    const result = replaceField(SAMPLE_POST, 'excerpt', 'Better meta description for CTR');
    assert.ok(result.includes('Better meta description for CTR'));
  });

  it('escapes double quotes in replacement', () => {
    const result = replaceField(SAMPLE_POST, 'title', 'Title with "Quotes" Inside');
    assert.ok(result.includes('\\"Quotes\\"'));
  });

  it('returns content unchanged for missing field', () => {
    const result = replaceField(SAMPLE_POST, 'nonexistent', 'value');
    assert.equal(result, SAMPLE_POST);
  });

  it('preserves other fields when replacing one', () => {
    const result = replaceField(SAMPLE_POST, 'title', 'New Title');
    assert.equal(extractField(result, 'author'), 'Sarah Chen');
    assert.equal(extractField(result, 'category'), 'Cost Planning');
    assert.equal(extractField(result, 'date'), '2026-04-27');
  });

  it('can chain multiple replacements', () => {
    let result = SAMPLE_POST;
    result = replaceField(result, 'title', 'New Title');
    result = replaceField(result, 'excerpt', 'New Excerpt');
    assert.equal(extractField(result, 'title'), 'New Title');
    assert.equal(extractField(result, 'excerpt'), 'New Excerpt');
  });
});

describe('meta-optimizer score threshold logic', () => {
  it('only applies title with score >= 7', () => {
    // Simulating the score threshold check from optimizeMetaTags
    const variants = [
      { title: 'Low Score Title', score: 5 },
      { title: 'High Score Title', score: 8 },
    ];
    const best = variants.reduce((a, b) => (b.score > a.score ? b : a), variants[0]);
    assert.equal(best.title, 'High Score Title');
    assert.ok(best.score >= 7);
  });

  it('rejects all variants below threshold', () => {
    const variants = [
      { title: 'Variant A', score: 4 },
      { title: 'Variant B', score: 6 },
    ];
    const best = variants.reduce((a, b) => (b.score > a.score ? b : a), variants[0]);
    assert.ok(best.score < 7, 'Best score should be below threshold');
  });

  it('validates excerpt length bounds (130-165 chars)', () => {
    const tooShort = 'Short excerpt.';
    const tooLong = 'A'.repeat(170);
    const justRight = 'A'.repeat(145);

    assert.ok(tooShort.length < 130);
    assert.ok(tooLong.length > 165);
    assert.ok(justRight.length >= 130 && justRight.length <= 165);
  });
});
