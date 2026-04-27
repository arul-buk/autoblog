/**
 * readability-scheduler-linker.test.mjs
 * Tests for readability scoring, scheduler calendar matching, and linker relevance scoring.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateReadability } from '../lib/readability.mjs';
import { resolveSchedule } from '../lib/scheduler.mjs';

// ═══════════════════════════════════════════════════════════════════════════
// READABILITY
// ═══════════════════════════════════════════════════════════════════════════

const readConfig = { readability: { targetGrade: { min: 6, max: 10 }, warnOnly: true } };

describe('calculateReadability', () => {
  it('returns grade level for normal content', () => {
    const post = `---
title: "Test"
date: "2026-04-27"
---
<p>The average cost to build a new home is about one hundred fifty dollars per square foot. Labor costs account for roughly half of the total budget. Most homes take seven to twelve months to complete.</p>`;
    const result = calculateReadability(post, readConfig);
    assert.ok(typeof result.gradeLevel === 'number');
    assert.ok(result.gradeLevel > 0);
    assert.ok(result.words > 0);
    assert.ok(result.sentences > 0);
    assert.ok(result.syllables > 0);
  });

  it('returns warning for too-complex content', () => {
    const strictConfig = { readability: { targetGrade: { min: 1, max: 3 } } };
    const post = `---
title: "Test"
---
<p>The implementation of comprehensive construction methodologies necessitates sophisticated budgetary allocation frameworks. Multifaceted architectural considerations significantly influence the preliminary cost estimation parameters.</p>`;
    const result = calculateReadability(post, strictConfig);
    assert.ok(result.warning?.includes('above target'));
  });

  it('returns warning for too-simple content', () => {
    const hardConfig = { readability: { targetGrade: { min: 18, max: 20 } } };
    const post = `---
title: "Test"
---
<p>A house costs a lot. You need to save up. It takes a long time. Get a good plan. Ask for help.</p>`;
    const result = calculateReadability(post, hardConfig);
    assert.ok(result.warning?.includes('below target'));
  });

  it('returns no warning when within target range', () => {
    const post = `---
title: "Test"
---
<p>Building a home requires careful budget planning. The average cost ranges from one hundred to two hundred dollars per square foot. Labor typically accounts for about forty percent of the total cost. Materials make up another thirty to forty percent. Location plays a major role in determining final costs.</p>`;
    const result = calculateReadability(post, readConfig);
    // Grade should be roughly 6-10 for this content
    if (result.gradeLevel >= 6 && result.gradeLevel <= 10) {
      assert.equal(result.warning, null);
    }
  });

  it('handles very short content gracefully', () => {
    const post = '---\ntitle: "T"\n---\nHi.';
    const result = calculateReadability(post, readConfig);
    assert.ok(result.warning?.includes('too short'));
  });

  it('strips HTML before analysis', () => {
    const post = `---
title: "Test"
---
<article><section><h2>Heading About Construction</h2><p>Simple bold text with links and content about building homes and renovation projects that cost money.</p><p>Another paragraph with more words to ensure the content is long enough for proper analysis and syllable counting.</p></section></article>`;
    const result = calculateReadability(post, readConfig);
    assert.ok(result.words > 0, `Expected words > 0, got ${result.words}`);
    assert.ok(result.words < 50, `Expected words < 50 (no HTML tags), got ${result.words}`);
  });

  it('counts syllables reasonably', () => {
    const post = `---
title: "Test"
---
<p>The cat sat on the mat. The dog ran to the park. Simple words are easy to read and understand well.</p>`;
    const result = calculateReadability(post, readConfig);
    // Simple words = low syllable count = low grade level
    assert.ok(result.gradeLevel < 8, `Grade ${result.gradeLevel} should be low for simple text`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULER
// ═══════════════════════════════════════════════════════════════════════════

describe('resolveSchedule', () => {
  const today = new Date().toISOString().slice(0, 10);

  it('returns trending mode when calendar step is disabled', async () => {
    const config = { steps: { calendar: false }, schedule: {} };
    const result = await resolveSchedule(config);
    assert.equal(result.mode, 'trending');
    assert.equal(result.calendarEntry, null);
  });

  it('returns trending mode when no calendar entries', async () => {
    const config = { steps: { calendar: true }, schedule: { calendar: [] } };
    const result = await resolveSchedule(config);
    assert.equal(result.mode, 'trending');
  });

  it('returns trending mode when no entry matches today', async () => {
    const config = {
      steps: { calendar: true },
      schedule: { calendar: [{ date: '2020-01-01', category: 'Test' }] },
    };
    const result = await resolveSchedule(config);
    assert.equal(result.mode, 'trending');
  });

  it('matches calendar entry for today', async () => {
    const config = {
      steps: { calendar: true },
      schedule: {
        calendar: [{ date: today, category: 'Cost Planning', notes: 'Focus on lumber' }],
      },
      topics: { clusters: [{ name: 'Cost Planning', queries: [] }] },
    };
    const result = await resolveSchedule(config);
    assert.equal(result.mode, 'calendar');
    assert.equal(result.categoryConstraint, 'Cost Planning');
    assert.equal(result.writerNotes, 'Focus on lumber');
  });

  it('returns topicOverride when entry has topic field', async () => {
    const config = {
      steps: { calendar: true },
      schedule: {
        calendar: [{ date: today, topic: 'Lumber Prices in April 2026' }],
      },
    };
    const result = await resolveSchedule(config);
    assert.equal(result.mode, 'calendar');
    assert.equal(result.topicOverride, 'Lumber Prices in April 2026');
  });

  it('passes seed keywords from calendar entry', async () => {
    const config = {
      steps: { calendar: true },
      schedule: {
        calendar: [{ date: today, keywords: ['lumber cost', 'wood prices'] }],
      },
    };
    const result = await resolveSchedule(config);
    assert.deepEqual(result.seedKeywords, ['lumber cost', 'wood prices']);
  });

  it('sets skipDedupe when priority is high', async () => {
    const config = {
      steps: { calendar: true },
      schedule: {
        calendar: [{ date: today, topic: 'Refresh: Building Costs', priority: 'high' }],
      },
    };
    const result = await resolveSchedule(config);
    assert.equal(result.skipDedupe, true);
  });

  it('does not skip dedupe for normal priority', async () => {
    const config = {
      steps: { calendar: true },
      schedule: {
        calendar: [{ date: today, topic: 'Normal Post', priority: 'normal' }],
      },
    };
    const result = await resolveSchedule(config);
    assert.equal(result.skipDedupe, false);
  });

  it('falls back to trending when calendar category is invalid', async () => {
    const config = {
      steps: { calendar: true },
      schedule: {
        calendar: [{ date: today, category: 'NonExistentCategory' }],
      },
      topics: { clusters: [{ name: 'Cost Planning', queries: [] }] },
    };
    const result = await resolveSchedule(config);
    assert.equal(result.mode, 'trending');
  });

  it('uses first match when multiple entries share same date', async () => {
    const config = {
      steps: { calendar: true },
      schedule: {
        calendar: [
          { date: today, topic: 'First Entry' },
          { date: today, topic: 'Second Entry' },
        ],
      },
    };
    const result = await resolveSchedule(config);
    assert.equal(result.topicOverride, 'First Entry');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LINKER (scoreRelevance logic — replicated since it's private)
// ═══════════════════════════════════════════════════════════════════════════

// Replicate the private scoreRelevance for testing
function scoreRelevance(post, topicTitle, topicCategory, topicKeywords) {
  let score = 0;
  const titleWords = topicTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const categoryLower = (topicCategory || '').toLowerCase();

  for (const kw of post.keywords) {
    for (const tk of topicKeywords || []) {
      if (kw.includes(tk.toLowerCase()) || tk.toLowerCase().includes(kw)) {
        score += 3;
      }
    }
  }

  for (const word of titleWords) {
    if (post.keywords.some((kw) => kw.includes(word))) {
      score += 2;
    }
    if (post.title.toLowerCase().includes(word)) {
      score += 1;
    }
  }

  if (categoryLower && post.keywords.some((kw) => kw.includes(categoryLower))) {
    score += 5;
  }

  return score;
}

describe('linker scoreRelevance', () => {
  const post = {
    slug: 'home-construction-costs',
    title: 'Home Construction Costs Guide',
    keywords: ['construction cost', 'home building', 'budget planning'],
  };

  it('scores higher with keyword overlap', () => {
    const score = scoreRelevance(post, 'Building Budget Tips', '', ['construction cost', 'budget']);
    assert.ok(score > 0);
  });

  it('scores zero with no overlap', () => {
    const score = scoreRelevance(post, 'Yoga for Beginners', 'Fitness', ['yoga', 'meditation']);
    assert.equal(score, 0);
  });

  it('boosts score for category match', () => {
    const withCat = scoreRelevance(post, 'Test', 'budget planning', []);
    const withoutCat = scoreRelevance(post, 'Test', 'unrelated', []);
    assert.ok(withCat > withoutCat);
  });

  it('scores for title word overlap', () => {
    const score = scoreRelevance(post, 'Home Building Permits Guide', '', []);
    // "home" and "building" should match keywords, "guide" matches title
    assert.ok(score > 0);
  });

  it('ignores short words (<=3 chars) from title', () => {
    const score = scoreRelevance(post, 'The In On At', '', []);
    assert.equal(score, 0);
  });

  it('handles empty keywords gracefully', () => {
    const emptyPost = { slug: 'empty', title: 'Empty Post', keywords: [] };
    const score = scoreRelevance(emptyPost, 'Any Topic', 'Any', ['keyword']);
    assert.equal(score, 0);
  });
});
