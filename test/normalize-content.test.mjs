/**
 * normalize-content.test.mjs
 * Tests for LLM output normalization: numeric tags, category slugification,
 * inline schema stripping, field mapping fallback, and topic JSON parsing.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeContent, applyFieldMappingFallback } from '../lib/writer.mjs';
import { parseTopicsFromResponse } from '../lib/topics.mjs';
import { buildWriterPrompt } from '../lib/prompts.mjs';

// ─── normalizeContent: numeric tag quoting ──────────────────────────────

describe('normalizeContent — numeric tags', () => {
  const config = { steps: {}, output: {} };

  it('quotes bare numeric tags', () => {
    const input = `---
title: "Test"
tags:
  - construction
  - 2026
  - first home
---
Body`;
    const result = normalizeContent(input, config);
    assert.ok(result.includes('- "2026"'), 'bare 2026 should be quoted');
    assert.ok(result.includes('- construction'), 'string tags should be unchanged');
    assert.ok(result.includes('- first home'), 'multi-word string tags should be unchanged');
  });

  it('does not double-quote already quoted numeric tags', () => {
    const input = `---
tags:
  - "2026"
  - construction
---
Body`;
    const result = normalizeContent(input, config);
    assert.ok(!result.includes('""2026""'), 'should not double-quote');
    assert.ok(result.includes('- "2026"'), 'should preserve existing quotes');
  });

  it('handles posts with no tags section', () => {
    const input = `---
title: "No Tags Post"
---
Body`;
    const result = normalizeContent(input, config);
    assert.equal(result, input, 'should be unchanged');
  });

  it('quotes multiple numeric tags', () => {
    const input = `---
tags:
  - 2025
  - renovation
  - 2026
  - 100
---
Body`;
    const result = normalizeContent(input, config);
    assert.ok(result.includes('- "2025"'));
    assert.ok(result.includes('- "2026"'));
    assert.ok(result.includes('- "100"'));
    assert.ok(result.includes('- renovation'));
  });
});

// ─── normalizeContent: category slugification ───────────────────────────

describe('normalizeContent — category slugification', () => {
  const config = { steps: {}, output: {} };

  it('slugifies "State Guides" to "state-guides"', () => {
    const input = `---
category: "State Guides"
---
Body`;
    const result = normalizeContent(input, config);
    assert.ok(result.includes('category: "state-guides"'));
  });

  it('slugifies "Costs & Fees" to "costs-and-fees"', () => {
    const input = `---
category: "Costs & Fees"
---
Body`;
    const result = normalizeContent(input, config);
    assert.ok(result.includes('category: "costs-and-fees"'));
  });

  it('slugifies "Construction Basics" to "construction-basics"', () => {
    const input = `---
category: "Construction Basics"
---
Body`;
    const result = normalizeContent(input, config);
    assert.ok(result.includes('category: "construction-basics"'));
  });

  it('does not modify already-slugified categories', () => {
    const input = `---
category: "decision-guides"
---
Body`;
    const result = normalizeContent(input, config);
    assert.ok(result.includes('category: "decision-guides"'));
  });

  it('handles unquoted category values', () => {
    const input = `---
category: Market Updates
---
Body`;
    const result = normalizeContent(input, config);
    assert.ok(result.includes('category: "market-updates"'));
  });
});

// ─── normalizeContent: inline JSON-LD stripping ─────────────────────────

describe('normalizeContent — inline schema stripping', () => {
  const postWithSchema = `---
title: "Test"
---
Body content here.

<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BlogPosting","headline":"Test"}
</script>

<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[]}
</script>`;

  it('strips inline JSON-LD when stripInlineSchema is true', () => {
    const config = { steps: {}, output: { stripInlineSchema: true } };
    const result = normalizeContent(postWithSchema, config);
    assert.ok(!result.includes('application/ld+json'), 'should strip all JSON-LD scripts');
    assert.ok(result.includes('Body content here'), 'should preserve body');
  });

  it('strips inline JSON-LD when embedSchema is frontmatter-only', () => {
    const config = { steps: { embedSchema: 'frontmatter-only' }, output: {} };
    const result = normalizeContent(postWithSchema, config);
    assert.ok(!result.includes('application/ld+json'));
  });

  it('preserves inline JSON-LD when no strip config', () => {
    const config = { steps: {}, output: {} };
    const result = normalizeContent(postWithSchema, config);
    assert.ok(result.includes('application/ld+json'), 'should preserve scripts');
  });
});

// ─── applyFieldMappingFallback ──────────────────────────────────────────

describe('applyFieldMappingFallback — excerpt to description', () => {
  const config = {
    output: {
      frontmatterTemplate: 'custom',
      frontmatterSchema: {
        required: ['title', 'description', 'lastUpdated', 'readTime', 'author'],
        optional: [],
      },
    },
  };

  it('remaps excerpt to description when description is required but missing', () => {
    const input = `---
title: "Test Post"
excerpt: "This is the excerpt."
date: "2026-04-28"
author: "james-thornton"
---
Body with enough words to calculate reading time. Here is more text to make it longer. Adding more words for the reading time calculation to work properly.`;
    const result = applyFieldMappingFallback(input, config, '2026-04-28');
    assert.ok(result.includes('description: "This is the excerpt."'), 'excerpt should be remapped to description');
    assert.ok(!result.match(/^excerpt:/m), 'excerpt field should no longer exist');
  });

  it('remaps date to lastUpdated when lastUpdated is required but missing', () => {
    const input = `---
title: "Test Post"
description: "Already correct."
date: "2026-04-28"
author: "james-thornton"
---
Body content here with enough words for reading time.`;
    const result = applyFieldMappingFallback(input, config, '2026-04-28');
    assert.ok(result.includes('lastUpdated:'), 'date should be remapped to lastUpdated');
  });

  it('does not remap when target field already exists', () => {
    const input = `---
title: "Test Post"
description: "Custom description."
excerpt: "Should stay as excerpt."
lastUpdated: "2026-04-28"
readTime: "5 min"
author: "james-thornton"
---
Body`;
    const result = applyFieldMappingFallback(input, config, '2026-04-28');
    assert.ok(result.includes('description: "Custom description."'), 'existing description should be unchanged');
  });

  it('calculates readTime when required but missing', () => {
    const input = `---
title: "Test Post"
description: "Test."
lastUpdated: "2026-04-28"
author: "james-thornton"
---
${'word '.repeat(400)}`;
    const result = applyFieldMappingFallback(input, config, '2026-04-28');
    assert.ok(result.includes('readTime: "2 min"'), `should calculate ~2 min for 400 words, got: ${result.match(/readTime:.*/)?.[0]}`);
  });

  it('removes lastModified when not in schema', () => {
    const input = `---
title: "Test"
description: "Test."
lastUpdated: "2026-04-28"
lastModified: "2026-04-28"
readTime: "5 min"
author: "james-thornton"
---
Body`;
    const result = applyFieldMappingFallback(input, config, '2026-04-28');
    assert.ok(!result.match(/^lastModified:/m), 'lastModified should be removed when not in schema');
  });

  it('does nothing when config has no custom frontmatterTemplate', () => {
    const noTemplateConfig = {
      output: {
        frontmatterSchema: {
          required: ['title', 'date', 'excerpt'],
          optional: ['lastModified'],
        },
      },
    };
    const input = `---
title: "Test"
date: "2026-04-28"
excerpt: "Test."
lastModified: "2026-04-28"
---
Body`;
    // applyFieldMappingFallback is only called when frontmatterTemplate exists,
    // but the function itself should be safe with any config
    const result = applyFieldMappingFallback(input, noTemplateConfig, '2026-04-28');
    assert.ok(result.includes('date:'), 'date should remain');
    assert.ok(result.includes('excerpt:'), 'excerpt should remain');
    assert.ok(result.includes('lastModified:'), 'lastModified should remain when in optional');
  });
});

// ─── parseTopicsFromResponse — hardened JSON parsing ────────────────────

describe('parseTopicsFromResponse — malformed JSON recovery', () => {
  it('parses clean JSON array', () => {
    const input = JSON.stringify([
      { title: 'Topic A', summary: 'Summary A', category: 'News' },
      { title: 'Topic B', summary: 'Summary B', category: 'Tips' },
    ]);
    const topics = parseTopicsFromResponse(input);
    assert.equal(topics.length, 2);
    assert.equal(topics[0].title, 'Topic A');
  });

  it('parses JSON wrapped in markdown code fences', () => {
    const input = '```json\n' + JSON.stringify([
      { title: 'Topic A', summary: 'Summary A' },
    ]) + '\n```';
    const topics = parseTopicsFromResponse(input);
    assert.equal(topics.length, 1);
  });

  it('extracts JSON array from mixed text', () => {
    const input = 'Here are the topics:\n\n' + JSON.stringify([
      { title: 'Topic A', summary: 'Summary A' },
    ]) + '\n\nLet me know if you need more.';
    const topics = parseTopicsFromResponse(input);
    assert.equal(topics.length, 1);
  });

  it('fixes trailing commas in JSON', () => {
    const input = `[
  {"title": "Topic A", "summary": "Summary A"},
  {"title": "Topic B", "summary": "Summary B"},
]`;
    const topics = parseTopicsFromResponse(input);
    assert.equal(topics.length, 2);
  });

  it('filters out entries missing required fields', () => {
    const input = JSON.stringify([
      { title: 'Valid', summary: 'Has both' },
      { title: 'Missing summary' },
      { summary: 'Missing title' },
      { title: 'Also valid', summary: 'Yes' },
    ]);
    const topics = parseTopicsFromResponse(input);
    assert.equal(topics.length, 2);
  });

  it('throws on completely unparseable response', () => {
    assert.throws(
      () => parseTopicsFromResponse('I cannot help with that request.'),
      /Could not parse topic JSON/
    );
  });

  it('preserves optional fields', () => {
    const input = JSON.stringify([
      {
        title: 'Rich Topic',
        summary: 'Detailed summary',
        category: 'Market',
        relevanceScore: 0.9,
        region: 'Sydney',
        sources: ['HIA', 'ABS'],
        searchIntent: 'commercial',
        contentFormat: 'comparison',
      },
    ]);
    const topics = parseTopicsFromResponse(input);
    assert.equal(topics[0].relevanceScore, 0.9);
    assert.equal(topics[0].region, 'Sydney');
    assert.deepEqual(topics[0].sources, ['HIA', 'ABS']);
    assert.equal(topics[0].searchIntent, 'commercial');
    assert.equal(topics[0].contentFormat, 'comparison');
  });
});

// ─── buildWriterPrompt — contentPathPrefix ──────────────────────────────

describe('buildWriterPrompt — contentPathPrefix', () => {
  const baseConfig = {
    product: {
      name: 'TestProduct',
      url: 'https://test.com',
      description: 'A test product',
      features: ['Feature A'],
      cta: { text: 'Try Free', url: 'https://test.com/start' },
    },
    output: {
      bodyFormat: 'markdown',
      frontmatterSchema: { required: ['title'], optional: [] },
      contentPathPrefix: '/guides/',
    },
    topics: { clusters: [] },
  };

  const args = {
    topic: { title: 'Test Topic', summary: 'A test', category: 'General' },
    slug: 'test-topic',
    author: { name: 'Test Author', role: 'Writer', categories: ['General'] },
    today: '2026-04-28',
    relatedPosts: [],
    config: baseConfig,
  };

  it('includes contentPathPrefix in the prompt', () => {
    const prompt = buildWriterPrompt(args);
    assert.ok(prompt.includes('/guides/'), 'prompt should contain the custom prefix');
  });

  it('instructs LLM to use the custom prefix for internal links', () => {
    const prompt = buildWriterPrompt(args);
    assert.ok(
      prompt.includes('INTERNAL LINK PREFIX: /guides/'),
      'prompt should have INTERNAL LINK PREFIX instruction'
    );
  });

  it('defaults to /blog/ when contentPathPrefix not set', () => {
    const defaultConfig = {
      ...baseConfig,
      output: { ...baseConfig.output, contentPathPrefix: undefined },
    };
    const prompt = buildWriterPrompt({ ...args, config: defaultConfig });
    assert.ok(prompt.includes('/blog/'), 'should default to /blog/');
  });

  it('uses custom frontmatterTemplate when provided', () => {
    const customConfig = {
      ...baseConfig,
      output: {
        ...baseConfig.output,
        frontmatterTemplate: `---
title: "<title>"
description: "<desc>"
lastUpdated: "\${today}"
author: "\${author.name}"
---`,
      },
    };
    const prompt = buildWriterPrompt({ ...args, config: customConfig });
    assert.ok(prompt.includes('lastUpdated: "2026-04-28"'), 'should interpolate ${today}');
    assert.ok(prompt.includes('author: "Test Author"'), 'should interpolate ${author.name}');
    assert.ok(!prompt.includes('${today}'), 'should not have unresolved placeholders');
  });
});
