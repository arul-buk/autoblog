/**
 * notifications.mjs
 * Post-pipeline notifications (Telegram).
 *
 * Reads config.notifications.telegram.{botToken, chatId}.
 * Sends success/failure messages with post title, description, and site URL.
 * Zero npm dependencies — uses native fetch.
 */

/**
 * Escape HTML entities for Telegram HTML parse mode.
 * Telegram only allows <b>, <i>, <a>, <code>, <pre> tags — everything else
 * (including bare &, <, >) must be escaped or the API returns ok:false.
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Telegram API HTTP ${response.status}: ${body}`);
  }

  // Telegram returns HTTP 200 with {"ok": false} for malformed HTML, invalid
  // chat_id, etc. Without this check, the caller logs "sent" while the message
  // was silently rejected.
  try {
    const json = JSON.parse(body);
    if (json.ok === false) {
      throw new Error(`Telegram API rejected: ${json.description || body}`);
    }
  } catch (err) {
    if (err.message.startsWith('Telegram API')) throw err;
    // JSON parse failed — unusual but non-fatal; message likely sent
  }
}

/**
 * Build the success notification message from pipeline result.
 *
 * Includes: title, description/excerpt, translation count, site link,
 * Read Post link, and GitHub Actions link.
 */
function buildSuccessMessage(result, config) {
  const title = escapeHtml(result.metadata?.title || result.slug);
  const siteUrl = config.output?.siteUrl?.replace(/\/$/, '');
  const contentPath = config.output?.contentPathPrefix?.replace(/\/$/, '') || '/blog';
  const postUrl = siteUrl ? `${siteUrl}${contentPath}/${result.slug}` : null;
  const domain = siteUrl ? siteUrl.replace(/^https?:\/\//, '') : null;

  const lines = ['<b>Blog Published &amp; Deployed</b>'];
  lines.push('');
  lines.push(`<b>${title}</b>`);

  // Extract description from frontmatter (excerpt field)
  const excerpt = result.metadata?.excerpt || result.metadata?.description;
  if (excerpt) {
    lines.push(escapeHtml(excerpt));
  }

  lines.push('');

  if (result.translations?.size > 0) {
    lines.push(`Translated to ${result.translations.size} languages`);
  }

  if (domain) {
    lines.push(`Site: ${escapeHtml(domain)}`);
  }

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
 * Build a failure notification message.
 */
function buildFailureMessage(error, config) {
  const productName = escapeHtml(config.product?.name || 'Autoblog');
  const domain = config.output?.siteUrl?.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const lines = ['<b>Blog Pipeline Failed</b>'];
  lines.push('');
  if (domain) {
    lines.push(`Site: ${escapeHtml(domain)}`);
  }
  lines.push(`Pipeline: ${productName}`);
  lines.push('');

  // Truncate error to avoid Telegram's 4096-char message limit
  const errorText = String(error?.message || error || 'Unknown error');
  const truncated = errorText.length > 500 ? errorText.slice(0, 500) + '...' : errorText;
  lines.push(`Error: ${escapeHtml(truncated)}`);

  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (repo && runId) {
    lines.push('');
    lines.push(`<a href="https://github.com/${repo}/actions/runs/${runId}">View Logs on GitHub Actions</a>`);
  }

  return lines.join('\n');
}

/**
 * Send post-pipeline success notification.
 *
 * @param {object} result - Pipeline result (status must be 'success')
 * @param {object} config - Full autoblog config
 */
export async function sendNotifications(result, config) {
  const tg = config.notifications?.telegram;
  if (!tg?.botToken || !tg?.chatId) return;

  const message = buildSuccessMessage(result, config);
  await sendTelegram(tg.botToken, tg.chatId, message);
}

/**
 * Build an audit results notification message.
 */
function buildAuditMessage(auditReport, geoMetrics, config) {
  const productName = escapeHtml(config.product?.name || 'Autoblog');
  const domain = config.output?.siteUrl?.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const lines = [`<b>📊 ${productName} Audit Report</b>`];
  if (domain) lines.push(`Site: ${escapeHtml(domain)}`);
  lines.push('');

  if (auditReport) {
    if (auditReport.decliningPosts?.length > 0) {
      lines.push(`<b>⚠️ ${auditReport.decliningPosts.length} declining post(s):</b>`);
      for (const d of auditReport.decliningPosts.slice(0, 5)) {
        lines.push(`  • ${escapeHtml(d.title || d.slug)} — ${escapeHtml(d.reason)}`);
      }
      lines.push('');
    }

    if (auditReport.winningPatterns?.length > 0) {
      lines.push(`<b>✅ ${auditReport.winningPatterns.length} winning pattern(s):</b>`);
      for (const p of auditReport.winningPatterns.slice(0, 3)) {
        lines.push(`  • ${escapeHtml(p.dimension)}: ${escapeHtml(p.value)} (avg pos ${p.avgPosition}, ${p.postCount} posts)`);
      }
      lines.push('');
    }

    if (!auditReport.decliningPosts?.length && !auditReport.winningPatterns?.length) {
      lines.push('No significant patterns or declining posts detected.');
      lines.push('');
    }
  }

  if (geoMetrics) {
    lines.push(`<b>🤖 AI Visibility:</b>`);
    lines.push(`  ${geoMetrics.keywordsWithAiOverview}/${geoMetrics.totalKeywords} keywords have AI Overview`);
    if (geoMetrics.brandMentionRate > 0) {
      lines.push(`  Brand mention rate: ${(geoMetrics.brandMentionRate * 100).toFixed(0)}%`);
    }
    if (geoMetrics.topCoCitations?.length > 0) {
      const topCites = geoMetrics.topCoCitations.slice(0, 3).map((c) => c.domain || c).join(', ');
      lines.push(`  Top co-citations: ${escapeHtml(topCites)}`);
    }
  }

  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (repo && runId) {
    lines.push('');
    lines.push(`<a href="https://github.com/${repo}/actions/runs/${runId}">View Full Report</a>`);
  }

  return lines.join('\n');
}

/**
 * Send audit results notification.
 *
 * @param {object} auditReport - From performanceAudit step
 * @param {object} geoMetrics - From geoTracking step
 * @param {object} config - Full autoblog config
 */
export async function sendAuditNotification(auditReport, geoMetrics, config) {
  const tg = config.notifications?.telegram;
  if (!tg?.botToken || !tg?.chatId) return;

  const message = buildAuditMessage(auditReport, geoMetrics, config);
  await sendTelegram(tg.botToken, tg.chatId, message);
}

/**
 * Send pipeline failure notification.
 *
 * @param {Error|string} error - The error that caused the failure
 * @param {object} config - Full autoblog config
 */
export async function sendFailureNotification(error, config) {
  const tg = config.notifications?.telegram;
  if (!tg?.botToken || !tg?.chatId) return;

  const message = buildFailureMessage(error, config);
  await sendTelegram(tg.botToken, tg.chatId, message);
}
