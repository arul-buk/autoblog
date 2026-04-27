import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { expandTemplate, resolveLocalTopic, buildLocalWriterGuidance } from '../lib/local-content.mjs';

const config = {
  product: { name: 'HomeBuildBudget' },
  topics: { clusters: [{ name: 'Cost Planning' }] },
  contentStrategy: {
    localContent: {
      enabled: true,
      locations: [
        { city: 'Austin', region: 'Texas', country: 'US' },
        { city: 'Denver', region: 'Colorado', country: 'US' },
      ],
      templates: [
        'Home Construction Costs in {city} ({year})',
        'Best Contractors in {city}',
      ],
      maxPerWeek: 1,
    },
  },
};

describe('expandTemplate', () => {
  it('replaces all placeholders', () => {
    const result = expandTemplate(
      '{product} Guide for {city}, {region} ({year})',
      { city: 'Austin', region: 'Texas', country: 'US' },
      config
    );
    assert.ok(result.includes('HomeBuildBudget'));
    assert.ok(result.includes('Austin'));
    assert.ok(result.includes('Texas'));
    assert.ok(result.includes(new Date().getFullYear().toString()));
  });

  it('handles missing region gracefully', () => {
    const result = expandTemplate('{city} {region}', { city: 'Austin', region: '', country: '' }, config);
    assert.ok(result.includes('Austin'));
  });
});

describe('resolveLocalTopic', () => {
  it('returns null when local content is disabled', () => {
    const result = resolveLocalTopic({ contentStrategy: { localContent: { enabled: false } } }, null);
    assert.equal(result, null);
  });

  it('returns null when no locations configured', () => {
    const cfg = { contentStrategy: { localContent: { enabled: true, locations: [], templates: ['test'] } } };
    assert.equal(resolveLocalTopic(cfg, null), null);
  });

  it('returns first unfulfilled combination', () => {
    const result = resolveLocalTopic(config, { posts: [] });
    assert.ok(result);
    assert.equal(result.isLocal, true);
    assert.ok(result.title.includes('Austin'));
    assert.equal(result.contentFormat, 'local-guide');
    assert.equal(result.searchIntent, 'commercial');
    assert.ok(result.locationData.city === 'Austin');
  });

  it('skips already-published slugs', () => {
    const context = {
      posts: [
        { slug: 'home-construction-costs-in-austin-2026', date: '2026-01-01', contentFormat: 'other' },
      ],
    };
    const result = resolveLocalTopic(config, context);
    assert.ok(result);
    // Should skip Austin costs (already published) and return Austin contractors or Denver
    assert.ok(!result.title.includes('Construction Costs in Austin'));
  });

  it('returns null when all combinations fulfilled', () => {
    const year = new Date().getFullYear();
    const context = {
      posts: [
        { slug: `home-construction-costs-in-austin-${year}` },
        { slug: 'best-contractors-in-austin' },
        { slug: `home-construction-costs-in-denver-${year}` },
        { slug: 'best-contractors-in-denver' },
      ],
    };
    assert.equal(resolveLocalTopic(config, context), null);
  });

  it('throttles based on maxPerWeek', () => {
    const today = new Date().toISOString().slice(0, 10);
    const context = {
      posts: [
        { slug: 'recent-local-post', date: today, contentFormat: 'local-guide' },
      ],
    };
    // maxPerWeek is 1, we already have 1 this week
    assert.equal(resolveLocalTopic(config, context), null);
  });
});

describe('buildLocalWriterGuidance', () => {
  it('returns empty string for non-local topics', () => {
    assert.equal(buildLocalWriterGuidance({ isLocal: false }, config), '');
    assert.equal(buildLocalWriterGuidance({}, config), '');
  });

  it('includes city name and product name for local topics', () => {
    const topic = { isLocal: true, locationData: { city: 'Austin', region: 'Texas', country: 'US' } };
    const guidance = buildLocalWriterGuidance(topic, config);
    assert.ok(guidance.includes('Austin'));
    assert.ok(guidance.includes('Texas'));
    assert.ok(guidance.includes('HomeBuildBudget'));
    assert.ok(guidance.includes('LOCAL CONTENT GUIDANCE'));
  });
});
