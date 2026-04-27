/**
 * publisher.mjs
 * Publishes blog posts to CMS platforms via their REST APIs.
 * Supports WordPress, Ghost, Webflow, Strapi, and Contentful.
 *
 * Optional step — skipped when publish.cms is null.
 * Zero npm dependencies — uses native fetch + crypto.
 */

import { createHmac, createSign } from 'crypto';
import { withRetry } from './retry.mjs';

/**
 * Extract frontmatter fields from content.
 */
function extractField(content, field) {
  const match = content.match(new RegExp(`^${field}:\\s*["']?([^"'\\n]+)["']?`, 'm'));
  return match ? match[1].trim() : null;
}

/**
 * Extract tags array from frontmatter.
 */
function extractTags(content) {
  const tagBlock = content.match(/^tags:\s*\n((?:\s+-\s*.*\n?)*)/m);
  if (!tagBlock) return [];
  return tagBlock[1]
    .split('\n')
    .map((line) => line.replace(/^\s*-\s*["']?/, '').replace(/["']?\s*$/, '').trim())
    .filter(Boolean);
}

/**
 * Extract body content (everything after second ---).
 */
function extractBody(content) {
  const match = content.match(/^---[\s\S]*?---\n([\s\S]*)$/);
  return match ? match[1].trim() : content;
}

// ═══════════════════════════════════════════════════════════════════════════
// WORDPRESS ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

async function publishToWordPress(result, config) {
  const endpoint = process.env.CMS_ENDPOINT;
  const username = process.env.CMS_USERNAME;
  const password = process.env.CMS_PASSWORD;

  if (!endpoint || !username || !password) {
    throw new Error('WordPress requires CMS_ENDPOINT, CMS_USERNAME, CMS_PASSWORD env vars');
  }

  const body = extractBody(result.content);
  const title = result.metadata?.title || extractField(result.content, 'title');
  const excerpt = result.metadata?.excerpt || extractField(result.content, 'excerpt');
  const tags = extractTags(result.content);
  const category = extractField(result.content, 'category');

  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const status = config.publish?.draft ? 'draft' : 'publish';

  const postData = {
    title,
    content: body,
    excerpt,
    status,
    slug: result.slug,
    meta: {
      _yoast_wpseo_metadesc: excerpt,
      _yoast_wpseo_focuskw: result.metadata?.seoKeywords?.split(',')[0]?.trim() || '',
    },
  };

  // Try to find/create category
  if (category) {
    try {
      const catResponse = await fetch(`${endpoint}/categories?search=${encodeURIComponent(category)}`, {
        headers: { 'Authorization': `Basic ${auth}` },
      });
      const cats = await catResponse.json();
      if (cats.length > 0) {
        postData.categories = [cats[0].id];
      }
    } catch {
      // Category lookup failed — skip
    }
  }

  const response = await fetch(`${endpoint}/posts`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(postData),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WordPress publish failed (${response.status}): ${text}`);
  }

  const post = await response.json();
  return { id: post.id, url: post.link, status: post.status };
}

// ═══════════════════════════════════════════════════════════════════════════
// GHOST ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

function createGhostToken(apiKey) {
  const [id, secret] = apiKey.split(':');
  if (!id || !secret) throw new Error('Ghost Admin API key must be in format id:secret');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT', kid: id };
  const payload = { iat: now, exp: now + 300, aud: '/admin/' };

  const base64url = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const headerPayload = `${base64url(header)}.${base64url(payload)}`;
  const signature = createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(headerPayload)
    .digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${headerPayload}.${signature}`;
}

async function publishToGhost(result, config) {
  const endpoint = process.env.CMS_ENDPOINT;
  const apiKey = process.env.CMS_ADMIN_API_KEY;

  if (!endpoint || !apiKey) {
    throw new Error('Ghost requires CMS_ENDPOINT, CMS_ADMIN_API_KEY env vars');
  }

  const token = createGhostToken(apiKey);
  const body = extractBody(result.content);
  const title = result.metadata?.title || extractField(result.content, 'title');
  const excerpt = result.metadata?.excerpt || extractField(result.content, 'excerpt');
  const tags = extractTags(result.content);
  const status = config.publish?.draft ? 'draft' : 'published';

  const postData = {
    posts: [{
      title,
      html: body,
      slug: result.slug,
      status,
      custom_excerpt: excerpt,
      meta_title: title,
      meta_description: excerpt,
      tags: tags.map((t) => ({ name: t })),
    }],
  };

  const response = await fetch(`${endpoint}/ghost/api/admin/posts/?source=html`, {
    method: 'POST',
    headers: {
      'Authorization': `Ghost ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(postData),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ghost publish failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const post = data.posts?.[0];
  return { id: post?.id, url: post?.url, status: post?.status };
}

// ═══════════════════════════════════════════════════════════════════════════
// WEBFLOW ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

async function publishToWebflow(result, config) {
  const apiToken = process.env.CMS_API_TOKEN;
  const collectionId = process.env.CMS_COLLECTION_ID;

  if (!apiToken || !collectionId) {
    throw new Error('Webflow requires CMS_API_TOKEN, CMS_COLLECTION_ID env vars');
  }

  const body = extractBody(result.content);
  const title = result.metadata?.title || extractField(result.content, 'title');
  const excerpt = result.metadata?.excerpt || extractField(result.content, 'excerpt');
  const isDraft = config.publish?.draft !== false;

  const itemData = {
    fieldData: {
      name: title,
      slug: result.slug,
      'post-body': body,
      'post-summary': excerpt,
    },
  };

  const response = await fetch(
    `https://api.webflow.com/v2/collections/${collectionId}/items${isDraft ? '' : '?live=true'}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(itemData),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Webflow publish failed (${response.status}): ${text}`);
  }

  const item = await response.json();
  return { id: item.id, url: null, status: isDraft ? 'draft' : 'published' };
}

// ═══════════════════════════════════════════════════════════════════════════
// STRAPI ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

async function publishToStrapi(result, config) {
  const endpoint = process.env.CMS_ENDPOINT;
  const apiToken = process.env.CMS_API_TOKEN;
  const contentType = process.env.CMS_CONTENT_TYPE_ID || 'articles';

  if (!endpoint || !apiToken) {
    throw new Error('Strapi requires CMS_ENDPOINT, CMS_API_TOKEN env vars');
  }

  const body = extractBody(result.content);
  const title = result.metadata?.title || extractField(result.content, 'title');
  const excerpt = result.metadata?.excerpt || extractField(result.content, 'excerpt');
  const category = extractField(result.content, 'category');

  const postData = {
    data: {
      title,
      slug: result.slug,
      content: body,
      description: excerpt,
      category,
      publishedAt: config.publish?.draft ? null : new Date().toISOString(),
    },
  };

  const response = await fetch(`${endpoint}/api/${contentType}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(postData),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Strapi publish failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return { id: data.data?.id, url: null, status: config.publish?.draft ? 'draft' : 'published' };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTENTFUL ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

async function publishToContentful(result, config) {
  const apiToken = process.env.CMS_API_TOKEN;
  const spaceId = process.env.CMS_SPACE_ID;
  const contentTypeId = process.env.CMS_CONTENT_TYPE_ID || 'blogPost';
  const environmentId = process.env.CMS_ENVIRONMENT_ID || 'master';

  if (!apiToken || !spaceId) {
    throw new Error('Contentful requires CMS_API_TOKEN, CMS_SPACE_ID env vars');
  }

  const body = extractBody(result.content);
  const title = result.metadata?.title || extractField(result.content, 'title');
  const excerpt = result.metadata?.excerpt || extractField(result.content, 'excerpt');

  const entryData = {
    fields: {
      title: { 'en-US': title },
      slug: { 'en-US': result.slug },
      body: { 'en-US': body },
      description: { 'en-US': excerpt },
    },
  };

  const baseUrl = `https://api.contentful.com/spaces/${spaceId}/environments/${environmentId}`;

  // Create entry
  const response = await fetch(`${baseUrl}/entries`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/vnd.contentful.management.v1+json',
      'X-Contentful-Content-Type': contentTypeId,
    },
    body: JSON.stringify(entryData),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Contentful publish failed (${response.status}): ${text}`);
  }

  const entry = await response.json();

  // Publish if not draft
  if (!config.publish?.draft) {
    const version = entry.sys?.version || 1;
    await fetch(`${baseUrl}/entries/${entry.sys.id}/published`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'X-Contentful-Version': String(version),
      },
    });
  }

  return { id: entry.sys?.id, url: null, status: config.publish?.draft ? 'draft' : 'published' };
}

// ═══════════════════════════════════════════════════════════════════════════
// DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════

const ADAPTERS = {
  wordpress: publishToWordPress,
  ghost: publishToGhost,
  webflow: publishToWebflow,
  strapi: publishToStrapi,
  contentful: publishToContentful,
};

/**
 * Publish a pipeline result to the configured CMS.
 *
 * @param {object} result - Pipeline result (must have status 'success')
 * @param {object} config - Full autoblog config
 * @returns {Promise<{ id: string, url: string|null, status: string }>}
 */
export async function publishToCms(result, config) {
  const cms = config.publish?.cms;
  if (!cms) return null;

  const adapter = ADAPTERS[cms.toLowerCase()];
  if (!adapter) {
    throw new Error(`Unsupported CMS: ${cms}. Supported: ${Object.keys(ADAPTERS).join(', ')}`);
  }

  return withRetry(
    () => adapter(result, config),
    { maxAttempts: 2, baseDelayMs: 3000, label: `publish-${cms}` }
  );
}
