/**
 * cross-reviewer.test.mjs
 * Tests for cross-reviewer response parsing and threshold logic.
 * The actual Gemini calls can't be tested without API, so we test
 * the parsing/decision logic by replicating the patterns.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicate the parsing and decision logic from crossModelReview
function parseReviewResponse(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      return { score: 8, revisedContent: null, feedback: { error: 'Failed to parse review response' } };
    }
    parsed = JSON.parse(match[0]);
  }

  const score = parsed.overallScore || parsed.score || 8;
  const feedback = {
    factualIssues: parsed.factualIssues || [],
    keywordIssues: parsed.keywordIssues || [],
    toneIssues: parsed.toneIssues || [],
    suggestions: parsed.suggestions || [],
  };

  return { score, feedback };
}

function shouldRewrite(score, threshold, suggestions) {
  return score < threshold && suggestions.length > 0;
}

describe('cross-reviewer — response parsing', () => {
  it('parses clean JSON response', () => {
    const response = JSON.stringify({
      overallScore: 7,
      factualIssues: ['Stat needs citation'],
      keywordIssues: [],
      toneIssues: ['Too formal in section 3'],
      suggestions: ['Add source for the 27% stat', 'Simplify section 3'],
    });
    const { score, feedback } = parseReviewResponse(response);
    assert.equal(score, 7);
    assert.equal(feedback.factualIssues.length, 1);
    assert.equal(feedback.toneIssues.length, 1);
    assert.equal(feedback.suggestions.length, 2);
  });

  it('parses JSON wrapped in markdown fences', () => {
    const response = '```json\n{"overallScore": 9, "suggestions": []}\n```';
    const { score } = parseReviewResponse(response);
    assert.equal(score, 9);
  });

  it('extracts JSON from mixed text response', () => {
    const response = 'Here is my review:\n{"score": 6, "suggestions": ["Fix intro"]}\nThat is all.';
    const { score, feedback } = parseReviewResponse(response);
    assert.equal(score, 6);
    assert.equal(feedback.suggestions.length, 1);
  });

  it('defaults to score 8 on unparseable response', () => {
    const response = 'This is not JSON at all.';
    const { score, feedback } = parseReviewResponse(response);
    assert.equal(score, 8);
    assert.ok(feedback.error);
  });

  it('handles "score" field name (alternative to overallScore)', () => {
    const response = JSON.stringify({ score: 5, suggestions: ['Rewrite intro'] });
    const { score } = parseReviewResponse(response);
    assert.equal(score, 5);
  });

  it('prefers overallScore over score when both present', () => {
    const response = JSON.stringify({ overallScore: 9, score: 5 });
    const { score } = parseReviewResponse(response);
    assert.equal(score, 9);
  });

  it('defaults missing arrays to empty', () => {
    const response = JSON.stringify({ overallScore: 7 });
    const { feedback } = parseReviewResponse(response);
    assert.deepEqual(feedback.factualIssues, []);
    assert.deepEqual(feedback.keywordIssues, []);
    assert.deepEqual(feedback.toneIssues, []);
    assert.deepEqual(feedback.suggestions, []);
  });
});

describe('cross-reviewer — rewrite decision', () => {
  it('triggers rewrite when score below threshold with suggestions', () => {
    assert.equal(shouldRewrite(5, 7, ['Fix something']), true);
  });

  it('does NOT rewrite when score meets threshold', () => {
    assert.equal(shouldRewrite(7, 7, ['Suggestion']), false);
  });

  it('does NOT rewrite when score above threshold', () => {
    assert.equal(shouldRewrite(9, 7, ['Minor thing']), false);
  });

  it('does NOT rewrite when no suggestions even if score is low', () => {
    assert.equal(shouldRewrite(3, 7, []), false);
  });

  it('uses configurable threshold', () => {
    assert.equal(shouldRewrite(6, 8, ['Fix']), true);  // threshold 8
    assert.equal(shouldRewrite(6, 5, ['Fix']), false);  // threshold 5
  });
});
