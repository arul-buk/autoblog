/**
 * retry.mjs
 * Wraps async functions with exponential backoff retry logic.
 * Distinguishes rate-limit (429) from bad output from network failure.
 */

/**
 * Retry an async function with exponential backoff.
 *
 * @param {Function} fn - Async function to retry
 * @param {object} [options]
 * @param {number} [options.maxAttempts=3] - Maximum number of attempts
 * @param {number} [options.baseDelayMs=2000] - Base delay in milliseconds (doubles each retry)
 * @param {string} [options.label='operation'] - Label for log messages
 * @returns {Promise<*>} - Result of the function
 */
export async function withRetry(fn, options = {}) {
  const { maxAttempts = 3, baseDelayMs = 2000, label = 'operation' } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const errorType = classifyError(err);

      if (attempt === maxAttempts) {
        break;
      }

      if (errorType === 'fatal') {
        // Don't retry fatal errors (bad config, missing params, etc.)
        break;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.log(
        `  [retry] ${label} failed (attempt ${attempt}/${maxAttempts}, ${errorType}): ${err.message}`
      );
      console.log(`  [retry] Waiting ${delay}ms before retry...`);
      await sleep(delay);
    }
  }

  throw new Error(`${label} failed after ${maxAttempts} attempts: ${lastError.message}`);
}

/**
 * Classify an error to determine retry strategy.
 *
 * @param {Error} err
 * @returns {'rate_limit' | 'network' | 'bad_output' | 'fatal'}
 */
function classifyError(err) {
  const msg = (err.message || '').toLowerCase();
  const status = err.status || err.statusCode || err.httpStatusCode;

  // Rate limiting
  if (status === 429 || msg.includes('rate limit') || msg.includes('quota')) {
    return 'rate_limit';
  }

  // Network errors
  if (
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    status === 503 ||
    status === 502
  ) {
    return 'network';
  }

  // Server errors (retryable)
  if (status >= 500) {
    return 'network';
  }

  // Bad output (JSON parse failures, missing fields — retryable, model might produce better output)
  if (
    msg.includes('json') ||
    msg.includes('parse') ||
    msg.includes('missing') ||
    msg.includes('frontmatter')
  ) {
    return 'bad_output';
  }

  // Everything else is fatal (bad config, missing API key, etc.)
  return 'fatal';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { classifyError };
