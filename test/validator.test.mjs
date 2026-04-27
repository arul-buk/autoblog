/**
 * validator.test.mjs
 * Tests for post validation: frontmatter, word count, GEO/AEO compliance, readability.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validatePost } from '../lib/validator.mjs';

const baseConfig = {
  output: {
    wordCount: { min: 100, max: 300 },
    frontmatterSchema: {
      required: ['title', 'date', 'excerpt', 'author'],
      optional: [],
    },
    ctaMarkers: [],
  },
  readability: {
    targetGrade: { min: 6, max: 12 },
    warnOnly: true,
  },
};

const VALID_POST = `---
title: "How Much Does It Cost to Build a House?"
date: "2026-04-27"
excerpt: "Complete guide to home construction budgeting."
author: "Sarah Chen"
category: "Cost Planning"
schema:
  type: "BlogPosting"
  headline: "How Much Does It Cost to Build a House?"
  description: "Complete guide."
  wordCount: 200
  keywords: "home construction cost"
qa:
  - question: "How much does it cost?"
    answer: "The average cost is $150-$200 per square foot."
  - question: "What is the biggest expense?"
    answer: "Labor typically accounts for 40-50% of total costs."
  - question: "How long does it take?"
    answer: "A typical home takes 7-12 months to complete."
  - question: "Do I need a permit?"
    answer: "Yes, building permits are required in most jurisdictions."
---
<article class="blog-content">
<section class="tldr-section"><p><strong>TL;DR:</strong> Building a home costs $150-$200 per square foot depending on location and materials.</p></section>
<section class="key-takeaways"><h2>Key Takeaways</h2><ul><li>Average cost is $150-$200/sqft.</li><li>Labor is 40-50% of total.</li><li>Timeline is 7-12 months.</li><li>Permits are required.</li></ul></section>
<section><h2>How Much Does a New Home Cost in 2026?</h2><p>The average cost to build a new home in 2026 ranges from $150 to $200 per square foot according to HomeAdvisor (2026). This includes foundation, framing, roofing, and interior finishes.</p></section>
<section><h2>What Are the Biggest Expenses?</h2><p>Labor accounts for approximately 40-50% of total construction costs according to the NAHB (2025). Materials make up another 30-40%.</p></section>
<section><h2>Can You Build a Home for Under $200K?</h2><p>Yes, building a home for under $200K is possible in rural areas according to Zillow data (2026). The key factors are location, square footage, and material choices.</p></section>
<section class="faq-section"><h2>Frequently Asked Questions</h2><h3>How much does it cost?</h3><p>The average cost is $150-$200 per square foot.</p><h3>What is the biggest expense?</h3><p>Labor typically accounts for 40-50%.</p></section>
</article>`;

// ─── Frontmatter Validation ─────────────────────────────────────────────

describe('validatePost — frontmatter', () => {
  it('passes with all required fields present', () => {
    const result = validatePost(VALID_POST, baseConfig);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('fails when missing required fields', () => {
    const noTitle = VALID_POST.replace('title: "How Much Does It Cost to Build a House?"', '');
    const result = validatePost(noTitle, baseConfig);
    assert.ok(result.errors.some((e) => e.includes('title')));
  });

  it('errors on missing frontmatter delimiters', () => {
    const noDash = 'title: "Test"\nBody content here.';
    const result = validatePost(noDash, baseConfig);
    assert.ok(result.errors.some((e) => e.includes('frontmatter delimiter')));
  });
});

// ─── Word Count ─────────────────────────────────────────────────────────

describe('validatePost — word count', () => {
  it('counts words correctly (stripping HTML)', () => {
    const result = validatePost(VALID_POST, baseConfig);
    assert.ok(result.wordCount > 50, `Word count ${result.wordCount} should be > 50`);
  });

  it('warns when word count is slightly below min', () => {
    const shortConfig = { ...baseConfig, output: { ...baseConfig.output, wordCount: { min: 5000, max: 8000 } } };
    const result = validatePost(VALID_POST, shortConfig);
    assert.ok(
      result.warnings.some((w) => w.includes('Word count')) || result.errors.some((e) => e.includes('Word count')),
      'Should flag low word count'
    );
  });

  it('warns when word count exceeds max by >30%', () => {
    const tinyConfig = { ...baseConfig, output: { ...baseConfig.output, wordCount: { min: 10, max: 20 } } };
    const result = validatePost(VALID_POST, tinyConfig);
    assert.ok(result.warnings.some((w) => w.includes('above target')));
  });
});

// ─── GEO/AEO Compliance ────────────────────────────────────────────────

describe('validatePost — GEO/AEO', () => {
  it('scores high for a compliant post', () => {
    const result = validatePost(VALID_POST, baseConfig);
    assert.ok(result.geoAeoScore >= 70, `GEO/AEO score ${result.geoAeoScore} should be >= 70`);
  });

  it('detects TL;DR section', () => {
    const result = validatePost(VALID_POST, baseConfig);
    const hasTldrWarning = result.warnings.some((w) => w.includes('TL;DR'));
    assert.equal(hasTldrWarning, false, 'Should not warn about TL;DR when present');
  });

  it('warns when TL;DR is missing', () => {
    const noTldr = VALID_POST.replace('tldr-section', 'intro-section').replace('TL;DR:', 'Introduction:');
    const result = validatePost(noTldr, baseConfig);
    assert.ok(result.warnings.some((w) => w.includes('TL;DR')));
  });

  it('detects Key Takeaways section', () => {
    const result = validatePost(VALID_POST, baseConfig);
    const hasWarning = result.warnings.some((w) => w.includes('Key Takeaways'));
    assert.equal(hasWarning, false);
  });

  it('detects FAQ section', () => {
    const result = validatePost(VALID_POST, baseConfig);
    const hasWarning = result.warnings.some((w) => w.includes('FAQ'));
    assert.equal(hasWarning, false);
  });

  it('detects question-based headings', () => {
    const result = validatePost(VALID_POST, baseConfig);
    // Post has 3 question headings (How Much, What Are, Can You)
    const hasWarning = result.warnings.some((w) => w.includes('question-based heading'));
    assert.equal(hasWarning, false);
  });

  it('warns on filler phrase openings', () => {
    const fillerPost = VALID_POST.replace(
      '<h2>How Much Does a New Home Cost in 2026?</h2><p>The average cost',
      '<h2>How Much Does a New Home Cost in 2026?</h2><p>In today\'s world, the average cost'
    );
    const result = validatePost(fillerPost, baseConfig);
    assert.ok(result.warnings.some((w) => w.includes('filler')));
  });

  it('checks qa frontmatter entries count', () => {
    const result = validatePost(VALID_POST, baseConfig);
    // Post has 4 qa entries — should pass
    const hasWarning = result.warnings.some((w) => w.includes('Q&A pairs'));
    assert.equal(hasWarning, false);
  });

  it('detects schema frontmatter field', () => {
    const result = validatePost(VALID_POST, baseConfig);
    const hasWarning = result.warnings.some((w) => w.includes('schema field'));
    assert.equal(hasWarning, false);
  });
});

// ─── Readability ────────────────────────────────────────────────────────

describe('validatePost — readability', () => {
  it('returns readability score', () => {
    const result = validatePost(VALID_POST, baseConfig);
    assert.ok(result.readability);
    assert.ok(typeof result.readability.gradeLevel === 'number');
    assert.ok(result.readability.words > 0);
    assert.ok(result.readability.sentences > 0);
  });

  it('warns when readability is too complex', () => {
    const strictConfig = { ...baseConfig, readability: { targetGrade: { min: 1, max: 3 }, warnOnly: true } };
    const result = validatePost(VALID_POST, strictConfig);
    assert.ok(result.readability.warning?.includes('above target'));
  });

  it('warns when readability is too simple', () => {
    const hardConfig = { ...baseConfig, readability: { targetGrade: { min: 20, max: 25 }, warnOnly: true } };
    const result = validatePost(VALID_POST, hardConfig);
    assert.ok(result.readability.warning?.includes('below target'));
  });
});

// ─── CTA Markers ────────────────────────────────────────────────────────

describe('validatePost — CTA markers', () => {
  it('does not warn when no markers configured', () => {
    const result = validatePost(VALID_POST, baseConfig);
    const ctaWarnings = result.warnings.filter((w) => w.includes('CTA marker'));
    assert.equal(ctaWarnings.length, 0);
  });

  it('warns on missing CTA markers', () => {
    const ctaConfig = { ...baseConfig, output: { ...baseConfig.output, ctaMarkers: ['mid-cta', 'end-cta'] } };
    const result = validatePost(VALID_POST, ctaConfig);
    assert.ok(result.warnings.some((w) => w.includes('mid-cta')));
    assert.ok(result.warnings.some((w) => w.includes('end-cta')));
  });

  it('passes when CTA markers are present', () => {
    const withMarkers = VALID_POST.replace(
      '</section>\n<section><h2>What Are',
      '</section>\n<!-- mid-cta -->\n<section><h2>What Are'
    );
    const ctaConfig = { ...baseConfig, output: { ...baseConfig.output, ctaMarkers: ['mid-cta'] } };
    const result = validatePost(withMarkers, ctaConfig);
    const ctaWarnings = result.warnings.filter((w) => w.includes('mid-cta'));
    assert.equal(ctaWarnings.length, 0);
  });
});

// ─── Translation Validation ─────────────────────────────────────────────

describe('validatePost — translation language check', () => {
  it('warns if CJK translation has no CJK characters', () => {
    // Body must be > 100 chars for the language check to trigger
    const longEnglishBody = 'This is still entirely in English without any Chinese characters at all. '.repeat(3);
    const translations = new Map([['zh', `---\ntitle: "Test"\n---\n${longEnglishBody}`]]);
    const result = validatePost(VALID_POST, baseConfig, { translations });
    assert.ok(result.warnings.some((w) => w.includes('zh') && w.includes('English')));
  });

  it('passes for valid CJK translation', () => {
    const translations = new Map([['zh', '---\ntitle: "测试"\n---\n这是一篇关于家庭建设成本的文章，包含足够长的中文内容来通过验证测试。']]);
    const result = validatePost(VALID_POST, baseConfig, { translations });
    assert.ok(!result.warnings.some((w) => w.includes('zh')));
  });
});
