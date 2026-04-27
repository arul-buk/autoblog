/**
 * publisher.test.mjs
 * Tests for publisher helper functions and dispatcher logic.
 * CMS adapters call external APIs, but we test the pure helpers
 * (extractField, extractTags, extractBody) and dispatcher routing.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { publishToCms } from '../lib/publisher.mjs';

// Replicate private helpers for direct testing
function extractField(content, field) {
  const match = content.match(new RegExp(`^${field}:\\s*["']?([^"'\\n]+)["']?`, 'm'));
  return match ? match[1].trim() : null;
}

function extractTags(content) {
  const tagBlock = content.match(/^tags:\s*\n((?:\s+-\s*.*\n?)*)/m);
  if (!tagBlock) return [];
  return tagBlock[1]
    .split('\n')
    .map((line) => line.replace(/^\s*-\s*["']?/, '').replace(/["']?\s*$/, '').trim())
    .filter(Boolean);
}

function extractBody(content) {
  const match = content.match(/^---[\s\S]*?---\n([\s\S]*)$/);
  return match ? match[1].trim() : content;
}

const SAMPLE_POST = `---
title: "Test Post Title"
date: "2026-04-27"
excerpt: "A test post excerpt for validation."
coverImage: "/images/blog/test.png"
author: "Sarah Chen"
category: "Cost Planning"
tags:
  - budgeting
  - construction
  - renovation
seoKeywords: "home budget, construction cost"
---
<article class="blog-content">
<section><h2>Section One</h2><p>Content here.</p></section>
<section><h2>Section Two</h2><p>More content.</p></section>
</article>`;

describe('publisher extractField', () => {
  it('extracts title', () => {
    assert.equal(extractField(SAMPLE_POST, 'title'), 'Test Post Title');
  });

  it('extracts author', () => {
    assert.equal(extractField(SAMPLE_POST, 'author'), 'Sarah Chen');
  });

  it('extracts category', () => {
    assert.equal(extractField(SAMPLE_POST, 'category'), 'Cost Planning');
  });

  it('returns null for missing field', () => {
    assert.equal(extractField(SAMPLE_POST, 'missing'), null);
  });
});

describe('publisher extractTags', () => {
  it('extracts all tags from YAML list', () => {
    const tags = extractTags(SAMPLE_POST);
    assert.deepEqual(tags, ['budgeting', 'construction', 'renovation']);
  });

  it('returns empty array when no tags', () => {
    const noTags = '---\ntitle: "Test"\n---\nBody';
    assert.deepEqual(extractTags(noTags), []);
  });

  it('handles quoted tags', () => {
    const quotedTags = '---\ntags:\n  - "tag one"\n  - \'tag two\'\n---\nBody';
    const tags = extractTags(quotedTags);
    assert.ok(tags.includes('tag one'));
    assert.ok(tags.includes('tag two'));
  });
});

describe('publisher extractBody', () => {
  it('extracts everything after frontmatter', () => {
    const body = extractBody(SAMPLE_POST);
    assert.ok(body.startsWith('<article'));
    assert.ok(body.includes('Section One'));
    assert.ok(!body.includes('title:'));
  });

  it('returns full content when no frontmatter', () => {
    const noFm = '<p>Just body content</p>';
    assert.equal(extractBody(noFm), noFm);
  });

  it('strips frontmatter completely', () => {
    const body = extractBody(SAMPLE_POST);
    assert.ok(!body.includes('---'));
    assert.ok(!body.includes('tags:'));
    assert.ok(!body.includes('seoKeywords'));
  });
});

describe('publishToCms dispatcher', () => {
  it('returns null when no CMS configured', async () => {
    const result = await publishToCms({}, { publish: { cms: null } });
    assert.equal(result, null);
  });

  it('returns null when publish section is empty', async () => {
    const result = await publishToCms({}, {});
    assert.equal(result, null);
  });

  it('throws for unsupported CMS type', async () => {
    await assert.rejects(
      () => publishToCms({ status: 'success' }, { publish: { cms: 'fakecms' } }),
      (err) => {
        assert.ok(err.message.includes('Unsupported CMS'));
        assert.ok(err.message.includes('fakecms'));
        return true;
      }
    );
  });

  it('error message lists all supported CMS types', async () => {
    try {
      await publishToCms({ status: 'success' }, { publish: { cms: 'invalid' } });
    } catch (err) {
      assert.ok(err.message.includes('wordpress'));
      assert.ok(err.message.includes('ghost'));
      assert.ok(err.message.includes('webflow'));
      assert.ok(err.message.includes('strapi'));
      assert.ok(err.message.includes('contentful'));
    }
  });
});
