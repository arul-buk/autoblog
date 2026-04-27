/**
 * strategy-balancer.mjs
 * Compares actual content distribution against strategy targets
 * and produces a balancing directive for downstream pipeline steps.
 *
 * Pure functions — no API calls, no side effects.
 */

/**
 * Compute the largest positive gap between target and actual distribution.
 *
 * @param {object} targets - Target percentages { key: number }
 * @param {object} actual - Actual percentages { key: number }
 * @returns {{ key: string, gap: number }[]} Sorted by gap descending
 */
function computeGaps(targets, actual) {
  const gaps = [];
  for (const [key, target] of Object.entries(targets)) {
    const current = actual[key] || 0;
    gaps.push({ key, gap: target - current });
  }
  return gaps.sort((a, b) => b.gap - a.gap);
}

/**
 * Compute category gaps using weight-normalized targets.
 * Category weights are relative multipliers, not absolute percentages.
 *
 * @param {object} weights - Category weight multipliers { category: number }
 * @param {object} actual - Actual category percentages { category: number }
 * @returns {{ key: string, gap: number }[]}
 */
function computeCategoryGaps(weights, actual) {
  if (!weights || Object.keys(weights).length === 0) return [];

  // Normalize weights to percentages
  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0);
  const targets = {};
  for (const [cat, weight] of Object.entries(weights)) {
    targets[cat] = Math.round((weight / totalWeight) * 100);
  }

  return computeGaps(targets, actual);
}

/**
 * Compute a balancing directive by comparing strategy targets
 * against actual content distribution.
 *
 * @param {object} strategy - contentStrategy config object
 * @param {object} distribution - Output from computeStrategyDistribution()
 * @returns {object} Balancing directive
 */
export function computeBalancingDirective(strategy, distribution) {
  const inactive = {
    active: false,
    preferredIntent: null,
    preferredFormat: null,
    preferredCategory: null,
    balancingGuidance: '',
    gaps: { intent: {}, format: {}, category: {} },
  };

  if (!strategy) return inactive;

  const minPosts = strategy.minPostsBeforeBalancing ?? 10;
  if (distribution.totalTrackedPosts < minPosts) return inactive;

  const tolerance = strategy.balanceTolerance ?? 10;

  // Compute gaps
  const intentGaps = strategy.intentMix
    ? computeGaps(strategy.intentMix, distribution.intentDistribution)
    : [];
  const formatGaps = strategy.formatMix
    ? computeGaps(strategy.formatMix, distribution.formatDistribution)
    : [];
  const categoryGaps = strategy.categoryWeights
    ? computeCategoryGaps(strategy.categoryWeights, distribution.categoryDistribution)
    : [];

  // Check if any gap exceeds tolerance
  const maxIntentGap = intentGaps[0]?.gap || 0;
  const maxFormatGap = formatGaps[0]?.gap || 0;
  const maxCategoryGap = categoryGaps[0]?.gap || 0;

  if (maxIntentGap <= tolerance && maxFormatGap <= tolerance && maxCategoryGap <= tolerance) {
    return inactive;
  }

  // Build guidance text
  const guidanceParts = [];
  if (intentGaps[0] && intentGaps[0].gap > tolerance) {
    const actual = distribution.intentDistribution[intentGaps[0].key] || 0;
    const target = strategy.intentMix[intentGaps[0].key];
    guidanceParts.push(
      `The blog has ${actual}% ${intentGaps[0].key} content but targets ${target}%. Prioritize ${intentGaps[0].key}-intent topics.`
    );
  }
  if (formatGaps[0] && formatGaps[0].gap > tolerance) {
    const actual = distribution.formatDistribution[formatGaps[0].key] || 0;
    const target = strategy.formatMix[formatGaps[0].key];
    guidanceParts.push(
      `${formatGaps[0].key} format is at ${actual}% vs target ${target}%.`
    );
  }
  if (categoryGaps[0] && categoryGaps[0].gap > tolerance) {
    guidanceParts.push(
      `The ${categoryGaps[0].key} category is underrepresented.`
    );
  }

  // Build gap maps
  const gapMap = (arr) => {
    const m = {};
    for (const { key, gap } of arr) m[key] = gap;
    return m;
  };

  return {
    active: true,
    preferredIntent: intentGaps[0]?.key || null,
    preferredFormat: formatGaps[0]?.key || null,
    preferredCategory: categoryGaps[0]?.key || null,
    balancingGuidance: guidanceParts.join(' '),
    gaps: {
      intent: gapMap(intentGaps),
      format: gapMap(formatGaps),
      category: gapMap(categoryGaps),
    },
  };
}
