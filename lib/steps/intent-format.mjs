/**
 * Step: Intent-to-Format Enforcement (Gap 1)
 * If keywordData has searchIntent but no contentFormat,
 * resolves the format from config.contentStrategy.intentFormatMap.
 */

const DEFAULT_MAP = {
  informational: ['how-to-guide', 'explainer', 'listicle'],
  commercial: ['comparison', 'review', 'roundup'],
  transactional: ['product-tutorial', 'calculator-guide', 'setup-guide'],
  navigational: ['brand-feature', 'documentation', 'changelog'],
};

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export async function intentFormatStep(state, config, _options) {
  const kd = state.keywordData;

  // Nothing to do if no keyword data or format already set
  if (!kd || kd.contentFormat) {
    return state;
  }

  const intent = kd.searchIntent;
  if (!intent) {
    return state;
  }

  const intentMap = config.contentStrategy?.intentFormatMap || DEFAULT_MAP;
  const formats = intentMap[intent];

  if (!formats || formats.length === 0) {
    log(`Intent "${intent}" has no mapped formats — skipping`);
    return state;
  }

  const contentFormat = formats[0];
  log(`Intent "${intent}" → format "${contentFormat}"`);

  return {
    ...state,
    keywordData: {
      ...kd,
      contentFormat,
    },
  };
}
