/**
 * schema-embedder.test.mjs
 * Tests for JSON-LD structured data embedding (BlogPosting + FAQPage).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { embedSchemaMarkup } from '../lib/schema-embedder.mjs';

// ─── Test fixtures ───────────────────────────────────────────────────────

const FULL_POST = `---
title: "How to Budget for Home Construction in 2026"
date: "2026-04-27"
lastModified: "2026-04-27"
excerpt: "A complete guide to budgeting for home construction."
coverImage: "/images/blog/home-construction-budget.png"
author: "Sarah Chen"
authorRole: "Cost Analyst"
category: "Cost Planning"
tags:
  - budgeting
  - construction
seoKeywords: "home construction budget, building costs 2026"
schema:
  type: "BlogPosting"
  headline: "How to Budget for Home Construction in 2026"
  description: "A complete guide to budgeting for home construction."
  wordCount: 1250
  keywords: "home construction budget, building costs"
qa:
  - question: "How much does it cost to build a house in 2026?"
    answer: "The average cost is $150-$200 per square foot depending on location."
  - question: "What is the biggest expense in home construction?"
    answer: "Labor typically accounts for 40-50% of total construction costs."
  - question: "How long does it take to build a house?"
    answer: "A typical single-family home takes 7-12 months to complete."
---
<article class="blog-content">
<section class="tldr-section"><p><strong>TL;DR:</strong> Building a home costs $150-$200/sqft.</p></section>
<section><h2>What Does It Cost?</h2><p>The average home construction cost varies by region.</p></section>
</article>`;

const MINIMAL_POST = `---
title: "Simple Post"
date: "2026-04-27"
excerpt: "A simple post."
coverImage: "/images/blog/simple.png"
author: "Mike Torres"
category: "General"
tags:
  - general
seoKeywords: "simple post"
schema:
  type: "BlogPosting"
  headline: "Simple Post"
  description: "A simple post."
  wordCount: 500
  keywords: "simple post"
---
<article class="blog-content">
<section><h2>Content</h2><p>Some content here.</p></section>
</article>`;

const NO_SCHEMA_POST = `---
title: "No Schema Post"
date: "2026-04-27"
excerpt: "Post without schema field."
author: "Sarah Chen"
category: "General"
tags:
  - general
---
<p>Just body content, no schema or qa in frontmatter.</p>`;

const NO_ARTICLE_POST = `---
title: "Markdown Post"
date: "2026-04-27"
excerpt: "A markdown post without article tags."
author: "Sarah Chen"
category: "General"
schema:
  type: "BlogPosting"
  headline: "Markdown Post"
  description: "A markdown post."
  wordCount: 800
  keywords: "markdown post"
qa:
  - question: "Is this markdown?"
    answer: "Yes, this post uses markdown formatting."
---
## Heading

Some markdown content here.`;

const config = {
  output: { siteUrl: 'https://homebuildbudget.com' },
  product: { url: 'https://homebuildbudget.com' },
};

// ─── embedSchemaMarkup ──────────────────────────────────────────────────

describe('embedSchemaMarkup', () => {
  it('embeds both BlogPosting and FAQPage JSON-LD for a full post', () => {
    const result = embedSchemaMarkup(FULL_POST, config);

    assert.ok(result.includes('<script type="application/ld+json">'));

    // Extract all JSON-LD blocks
    const scripts = [...result.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)];
    assert.equal(scripts.length, 2, 'Should have 2 JSON-LD blocks (BlogPosting + FAQPage)');

    const blogPosting = JSON.parse(scripts[0][1]);
    const faqPage = JSON.parse(scripts[1][1]);

    assert.equal(blogPosting['@type'], 'BlogPosting');
    assert.equal(faqPage['@type'], 'FAQPage');
  });

  it('generates valid BlogPosting schema with correct fields', () => {
    const result = embedSchemaMarkup(FULL_POST, config);
    const scripts = [...result.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)];
    const bp = JSON.parse(scripts[0][1]);

    assert.equal(bp['@context'], 'https://schema.org');
    assert.equal(bp['@type'], 'BlogPosting');
    assert.equal(bp.headline, 'How to Budget for Home Construction in 2026');
    assert.equal(bp.description, 'A complete guide to budgeting for home construction.');
    assert.equal(bp.wordCount, 1250);
    assert.equal(bp.datePublished, '2026-04-27');
    assert.equal(bp.dateModified, '2026-04-27');
    assert.equal(bp.author['@type'], 'Person');
    assert.equal(bp.author.name, 'Sarah Chen');
    assert.equal(bp.image, 'https://homebuildbudget.com/images/blog/home-construction-budget.png');
  });

  it('generates valid FAQPage schema with all Q&A pairs', () => {
    const result = embedSchemaMarkup(FULL_POST, config);
    const scripts = [...result.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)];
    const faq = JSON.parse(scripts[1][1]);

    assert.equal(faq['@context'], 'https://schema.org');
    assert.equal(faq['@type'], 'FAQPage');
    assert.equal(faq.mainEntity.length, 3);

    const q1 = faq.mainEntity[0];
    assert.equal(q1['@type'], 'Question');
    assert.equal(q1.name, 'How much does it cost to build a house in 2026?');
    assert.equal(q1.acceptedAnswer['@type'], 'Answer');
    assert.ok(q1.acceptedAnswer.text.includes('$150-$200'));
  });

  it('inserts JSON-LD before closing </article> tag', () => {
    const result = embedSchemaMarkup(FULL_POST, config);
    const articleCloseIdx = result.lastIndexOf('</article>');
    const scriptIdx = result.indexOf('<script type="application/ld+json">');

    assert.ok(scriptIdx < articleCloseIdx, 'JSON-LD should be inserted before </article>');
  });

  it('appends JSON-LD at end when no </article> tag', () => {
    const result = embedSchemaMarkup(NO_ARTICLE_POST, config);

    assert.ok(result.includes('<script type="application/ld+json">'));
    // Should be at the end
    const lastLine = result.trim().split('\n').pop();
    assert.equal(lastLine, '</script>');
  });

  it('returns content unchanged when no schema in frontmatter', () => {
    const result = embedSchemaMarkup(NO_SCHEMA_POST, config);
    assert.equal(result, NO_SCHEMA_POST, 'Content should be unchanged when no schema field');
  });

  it('generates BlogPosting without FAQPage when no qa field', () => {
    const result = embedSchemaMarkup(MINIMAL_POST, config);
    const scripts = [...result.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)];

    assert.equal(scripts.length, 1, 'Should have only BlogPosting (no FAQ)');
    const bp = JSON.parse(scripts[0][1]);
    assert.equal(bp['@type'], 'BlogPosting');
  });

  it('constructs full image URL from siteUrl + coverImage path', () => {
    const result = embedSchemaMarkup(FULL_POST, config);
    const scripts = [...result.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)];
    const bp = JSON.parse(scripts[0][1]);

    assert.equal(bp.image, 'https://homebuildbudget.com/images/blog/home-construction-budget.png');
  });

  it('handles siteUrl with trailing slash', () => {
    const trailingConfig = { output: { siteUrl: 'https://example.com/' }, product: {} };
    const result = embedSchemaMarkup(FULL_POST, trailingConfig);
    const scripts = [...result.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)];
    const bp = JSON.parse(scripts[0][1]);

    assert.ok(!bp.image.includes('//images'), 'Should not have double slashes in image URL');
    assert.equal(bp.image, 'https://example.com/images/blog/home-construction-budget.png');
  });

  it('falls back to product.url when output.siteUrl is not set', () => {
    const fallbackConfig = { output: {}, product: { url: 'https://fallback.com' } };
    const result = embedSchemaMarkup(FULL_POST, fallbackConfig);
    const scripts = [...result.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)];
    const bp = JSON.parse(scripts[0][1]);

    assert.ok(bp.image.startsWith('https://fallback.com'));
  });

  it('uses datePublished as dateModified when lastModified is absent', () => {
    const result = embedSchemaMarkup(MINIMAL_POST, config);
    const scripts = [...result.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)];
    const bp = JSON.parse(scripts[0][1]);

    assert.equal(bp.datePublished, '2026-04-27');
    assert.equal(bp.dateModified, '2026-04-27');
  });

  it('parses wordCount as integer, not string', () => {
    const result = embedSchemaMarkup(FULL_POST, config);
    const scripts = [...result.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)];
    const bp = JSON.parse(scripts[0][1]);

    assert.equal(typeof bp.wordCount, 'number');
    assert.equal(bp.wordCount, 1250);
  });

  it('produces valid JSON in all script blocks', () => {
    const result = embedSchemaMarkup(FULL_POST, config);
    const scripts = [...result.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)];

    for (const [, json] of scripts) {
      assert.doesNotThrow(() => JSON.parse(json), 'Each JSON-LD block must be valid JSON');
    }
  });
});
