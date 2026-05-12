/**
 * dataforseo-client.mjs
 * Shared DataForSEO HTTP client — extracted for reuse across modules.
 */

const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';

/**
 * Extract and validate DataForSEO credentials from config or env.
 *
 * @param {object} config - Autoblog config
 * @returns {{ login: string, password: string }}
 */
export function getDataforseoCredentials(config) {
  const login = config.seo?.apiLogin || process.env.DATAFORSEO_LOGIN;
  const password = config.seo?.apiPassword || process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    throw new Error('DataForSEO credentials not configured');
  }
  return { login, password };
}

/**
 * Make an authenticated POST request to DataForSEO.
 *
 * @param {string} endpoint - API path (e.g. '/serp/google/organic/live/advanced')
 * @param {*} body - Request body (will be JSON-stringified)
 * @param {object} config - Autoblog config (needs seo.apiLogin / seo.apiPassword)
 * @returns {Promise<object>} - Parsed response JSON
 */
export async function dataforseoRequest(endpoint, body, config) {
  const { login, password } = getDataforseoCredentials(config);
  const auth = Buffer.from(`${login}:${password}`).toString('base64');

  const response = await fetch(`${DATAFORSEO_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`DataForSEO ${endpoint} returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status_code !== 20000) {
    throw new Error(`DataForSEO error: ${data.status_message || 'Unknown error'}`);
  }

  return data;
}
