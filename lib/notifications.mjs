/**
 * notifications.mjs
 * Post-pipeline notifications (Telegram).
 *
 * Reads config.notifications.telegram.{botToken, chatId}.
 * Sends a summary message with post title, slug, and site URL.
 * Zero npm dependencies — uses native fetch.
 */

/**
 * Send a Telegram message via Bot API.
 *
 * @param {string} botToken
 * @param {string} chatId
 * @param {string} text - HTML-formatted message
 */
async function sendTelegram(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API ${response.status}: ${body}`);
  }
}

/**
 * Build the notification message from pipeline result.
 *
 * Format mirrors the WhitelistVideo Telegram notification style:
 *   Blog Published & Deployed
 *
 *   Post Title Here
 *   Translated to N languages
 *   Live on example.com
 *
 *   Read Post | GitHub Actions
 */
function buildMessage(result, config) {
  const title = result.metadata?.title || result.slug;
  const siteUrl = config.output?.siteUrl?.replace(/\/$/, '');
  const contentPath = config.output?.contentPathPrefix?.replace(/\/$/, '') || '/blog';
  const postUrl = siteUrl ? `${siteUrl}${contentPath}/${result.slug}` : null;
  const domain = siteUrl ? siteUrl.replace(/^https?:\/\//, '') : null;

  const lines = ['<b>Blog Published &amp; Deployed</b>'];
  lines.push('');
  lines.push(title);

  if (result.translations?.size > 0) {
    lines.push(`Translated to ${result.translations.size} languages`);
  }

  if (domain) {
    lines.push(`Live on <a href="${siteUrl}">${domain}</a>`);
  }

  lines.push('');

  const links = [];
  if (postUrl) {
    links.push(`<a href="${postUrl}">Read Post</a>`);
  }

  // Include GitHub Actions link when running in CI
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (repo && runId) {
    links.push(`<a href="https://github.com/${repo}/actions/runs/${runId}">GitHub Actions</a>`);
  }

  if (links.length > 0) {
    lines.push(links.join(' | '));
  }

  return lines.join('\n');
}

/**
 * Send post-pipeline notifications based on config.
 *
 * @param {object} result - Pipeline result (status must be 'success')
 * @param {object} config - Full autoblog config
 */
export async function sendNotifications(result, config) {
  const tg = config.notifications?.telegram;
  if (!tg?.botToken || !tg?.chatId) return;

  const message = buildMessage(result, config);
  await sendTelegram(tg.botToken, tg.chatId, message);
}
