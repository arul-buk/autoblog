/**
 * cost-tracker.mjs
 * Tracks Gemini token usage and DataForSEO API costs per pipeline step.
 * Pricing table sourced from https://ai.google.dev/gemini-api/docs/pricing
 *
 * Zero npm dependencies.
 */

/**
 * Gemini model pricing — paid tier, standard, per 1M tokens in USD.
 * Update this table when Google changes pricing.
 *
 * Source: https://ai.google.dev/gemini-api/docs/pricing
 * Last updated: 2026-05-14
 */
const GEMINI_PRICING = {
  // ── Gemini 3.x ────────────────────────────────────────────────
  'gemini-3-flash-preview': {
    input: 0.50, output: 3.00, grounding: 14.00, // per 1K search queries after 5K free/month
  },
  'gemini-3.1-flash-lite': {
    input: 0.25, output: 1.50, grounding: 14.00,
  },
  'gemini-3.1-flash-lite-preview': {
    input: 0.25, output: 1.50, grounding: 14.00,
  },
  'gemini-3.1-pro-preview': {
    input: 2.00, output: 12.00, grounding: 14.00,
  },
  'gemini-3.1-flash-image-preview': {
    input: 0.50, output: 3.00, imageOutput: 60.00, // $60/1M image tokens; ~$0.045/0.5K image, $0.067/1K image
    perImage: { '0.5k': 0.045, '1k': 0.067, '2k': 0.101, '4k': 0.151 },
  },
  'gemini-3-pro-image-preview': {
    input: 2.00, output: 12.00, imageOutput: 120.00,
    perImage: { '1k': 0.134, '2k': 0.134, '4k': 0.24 },
  },

  // ── Gemini 2.5 ────────────────────────────────────────────────
  'gemini-2.5-pro': {
    input: 1.25, output: 10.00, grounding: 35.00, // per 1K grounded prompts after 1.5K free
  },
  'gemini-2.5-flash': {
    input: 0.30, output: 2.50, grounding: 35.00,
  },
  'gemini-2.5-flash-lite': {
    input: 0.10, output: 0.40, grounding: 35.00,
  },
  'gemini-2.5-flash-image': {
    input: 0.30, output: 2.50, perImage: { '1k': 0.039 },
  },

  // ── Gemini 2.0 (deprecated June 2026) ─────────────────────────
  'gemini-2.0-flash': {
    input: 0.10, output: 0.40, grounding: 35.00,
  },
  'gemini-2.0-flash-lite': {
    input: 0.075, output: 0.30,
  },
};

/**
 * Resolve pricing for a model. Tries exact match first, then prefix match.
 * Returns null if model not found.
 */
function resolvePricing(modelName) {
  if (GEMINI_PRICING[modelName]) return GEMINI_PRICING[modelName];

  // Try prefix match (e.g., 'gemini-2.5-pro-latest' → 'gemini-2.5-pro')
  for (const [key, pricing] of Object.entries(GEMINI_PRICING)) {
    if (modelName.startsWith(key)) return pricing;
  }

  return null;
}

/**
 * Calculate cost from token counts and model pricing.
 *
 * @param {object} usageMetadata - From Gemini response.usageMetadata
 * @param {string} modelName - Model used for this call
 * @param {boolean} [isGrounded=false] - Whether Google Search grounding was used
 * @returns {{ inputTokens, outputTokens, thinkingTokens, totalTokens, cost, model }}
 */
export function calculateGeminiCost(usageMetadata, modelName, isGrounded = false) {
  const pricing = resolvePricing(modelName);
  const inputTokens = usageMetadata?.promptTokenCount || 0;
  const outputTokens = usageMetadata?.candidatesTokenCount || 0;
  const thinkingTokens = usageMetadata?.thoughtsTokenCount || 0;
  const totalTokens = usageMetadata?.totalTokenCount || 0;

  if (!pricing) {
    return { inputTokens, outputTokens, thinkingTokens, totalTokens, cost: 0, model: modelName, unknown: true };
  }

  // Input cost
  const inputCost = (inputTokens / 1_000_000) * pricing.input;

  // Output cost (includes thinking tokens in Gemini's billing)
  const outputCost = ((outputTokens + thinkingTokens) / 1_000_000) * pricing.output;

  // Grounding cost (estimate — actual depends on monthly free tier usage)
  const groundingCost = isGrounded ? (1 / 1_000) * (pricing.grounding || 0) : 0;

  return {
    inputTokens,
    outputTokens,
    thinkingTokens,
    totalTokens,
    cost: inputCost + outputCost + groundingCost,
    model: modelName,
  };
}

/**
 * Calculate cost for an image generation call.
 *
 * @param {object} usageMetadata - From Gemini response.usageMetadata
 * @param {string} modelName - Image model name
 * @param {number} [imageCount=1] - Number of images generated
 * @returns {{ inputTokens, outputTokens, imageCost, cost, model }}
 */
export function calculateImageCost(usageMetadata, modelName, imageCount = 1) {
  const pricing = resolvePricing(modelName);
  const inputTokens = usageMetadata?.promptTokenCount || 0;
  const outputTokens = usageMetadata?.candidatesTokenCount || 0;

  if (!pricing) {
    return { inputTokens, outputTokens, imageCost: 0, cost: 0, model: modelName, unknown: true };
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.input;

  // Image cost — use perImage pricing if available, otherwise estimate from token output
  let imageCost = 0;
  if (pricing.perImage) {
    // Default to 1K resolution pricing
    imageCost = (pricing.perImage['1k'] || pricing.perImage['0.5k'] || 0) * imageCount;
  } else if (pricing.imageOutput) {
    imageCost = (outputTokens / 1_000_000) * pricing.imageOutput;
  }

  return {
    inputTokens,
    outputTokens,
    imageCost,
    cost: inputCost + imageCost,
    model: modelName,
  };
}

/**
 * Pipeline cost accumulator.
 * Create one per pipeline run, call addGemini/addDataforseo per API call,
 * then getSummary() at the end.
 */
export class CostTracker {
  constructor() {
    this.steps = {};
    this.totalGeminiCost = 0;
    this.totalDataforseoCost = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.totalThinkingTokens = 0;
    this.totalImages = 0;
    this.groundedCalls = 0;
  }

  /**
   * Record a Gemini API call cost.
   */
  addGemini(stepName, usageMetadata, modelName, isGrounded = false) {
    const cost = calculateGeminiCost(usageMetadata, modelName, isGrounded);

    if (!this.steps[stepName]) {
      this.steps[stepName] = { geminiCost: 0, dataforseoCost: 0, calls: 0, tokens: 0 };
    }

    this.steps[stepName].geminiCost += cost.cost;
    this.steps[stepName].calls += 1;
    this.steps[stepName].tokens += cost.totalTokens;

    this.totalGeminiCost += cost.cost;
    this.totalInputTokens += cost.inputTokens;
    this.totalOutputTokens += cost.outputTokens;
    this.totalThinkingTokens += cost.thinkingTokens;
    if (isGrounded) this.groundedCalls += 1;

    return cost;
  }

  /**
   * Record an image generation call cost.
   */
  addImage(stepName, usageMetadata, modelName, imageCount = 1) {
    const cost = calculateImageCost(usageMetadata, modelName, imageCount);

    if (!this.steps[stepName]) {
      this.steps[stepName] = { geminiCost: 0, dataforseoCost: 0, calls: 0, tokens: 0 };
    }

    this.steps[stepName].geminiCost += cost.cost;
    this.steps[stepName].calls += 1;
    this.steps[stepName].tokens += cost.inputTokens + cost.outputTokens;
    this.totalGeminiCost += cost.cost;
    this.totalImages += imageCount;

    return cost;
  }

  /**
   * Record a DataForSEO API call cost.
   * DataForSEO returns cost in the response body.
   */
  addDataforseo(stepName, cost) {
    if (!this.steps[stepName]) {
      this.steps[stepName] = { geminiCost: 0, dataforseoCost: 0, calls: 0, tokens: 0 };
    }

    this.steps[stepName].dataforseoCost += cost;
    this.steps[stepName].calls += 1;
    this.totalDataforseoCost += cost;
  }

  /**
   * Get the full cost summary.
   */
  getSummary() {
    const total = this.totalGeminiCost + this.totalDataforseoCost;

    return {
      total,
      gemini: {
        cost: this.totalGeminiCost,
        inputTokens: this.totalInputTokens,
        outputTokens: this.totalOutputTokens,
        thinkingTokens: this.totalThinkingTokens,
        images: this.totalImages,
        groundedCalls: this.groundedCalls,
      },
      dataforseo: {
        cost: this.totalDataforseoCost,
      },
      steps: { ...this.steps },
    };
  }

  /**
   * Format a human-readable cost report for CLI output.
   */
  formatReport() {
    const summary = this.getSummary();
    const lines = [];

    lines.push('Cost breakdown:');

    const sortedSteps = Object.entries(summary.steps)
      .filter(([, v]) => v.geminiCost > 0 || v.dataforseoCost > 0)
      .sort((a, b) => (b[1].geminiCost + b[1].dataforseoCost) - (a[1].geminiCost + a[1].dataforseoCost));

    for (const [step, data] of sortedSteps) {
      const stepTotal = data.geminiCost + data.dataforseoCost;
      const parts = [];
      if (data.tokens > 0) parts.push(`${data.tokens.toLocaleString()} tokens`);
      if (data.dataforseoCost > 0) parts.push(`DFSEO $${data.dataforseoCost.toFixed(4)}`);
      lines.push(`  ${step.padEnd(20)} $${stepTotal.toFixed(4)}  (${parts.join(', ')})`);
    }

    lines.push(`  ${'─'.repeat(48)}`);
    lines.push(`  ${'Total'.padEnd(20)} $${summary.total.toFixed(4)}`);

    if (summary.gemini.inputTokens > 0) {
      lines.push(`  Gemini tokens: ${summary.gemini.inputTokens.toLocaleString()} in / ${summary.gemini.outputTokens.toLocaleString()} out / ${summary.gemini.thinkingTokens.toLocaleString()} thinking`);
    }
    if (summary.gemini.images > 0) {
      lines.push(`  Images generated: ${summary.gemini.images}`);
    }
    if (summary.dataforseo.cost > 0) {
      lines.push(`  DataForSEO: $${summary.dataforseo.cost.toFixed(4)}`);
    }

    return lines.join('\n');
  }
}

/**
 * Export the pricing table for transparency / debugging.
 */
export { GEMINI_PRICING };
