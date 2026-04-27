/**
 * schema-embedder.mjs
 * Embeds JSON-LD structured data directly into post body.
 * Zero API cost — pure frontmatter-to-JSON-LD transformation.
 */

/**
 * Extract a frontmatter field value (simple scalar).
 */
function extractField(content, field) {
  const match = content.match(new RegExp(`^${field}:\\s*["']?([^"'\\n]+)["']?`, 'm'));
  return match ? match[1].trim() : null;
}

/**
 * Extract qa array from frontmatter.
 */
function extractQa(content) {
  const qaSection = content.match(/^qa:\s*\n((?:\s+(?:-\s+)?(?:question|answer):.*\n?)*)/m);
  if (!qaSection) return [];

  const pairs = [];
  const lines = qaSection[1].split('\n');
  let current = null;

  for (const line of lines) {
    const qMatch = line.match(/^\s+-\s+question:\s*["']?(.+?)["']?\s*$/);
    const aMatch = line.match(/^\s+answer:\s*["']?(.+?)["']?\s*$/);

    if (qMatch) {
      current = { question: qMatch[1] };
    } else if (aMatch && current) {
      current.answer = aMatch[1];
      pairs.push(current);
      current = null;
    }
  }

  return pairs;
}

/**
 * Extract schema object from frontmatter.
 */
function extractSchema(content) {
  const schemaMatch = content.match(/^schema:\s*\n((?:\s+\w+:.*\n?)*)/m);
  if (!schemaMatch) return null;

  const fields = {};
  for (const line of schemaMatch[1].split('\n')) {
    const fieldMatch = line.match(/^\s+(\w+):\s*["']?(.+?)["']?\s*$/);
    if (fieldMatch) {
      const value = fieldMatch[2];
      // Try to parse numbers
      fields[fieldMatch[1]] = /^\d+$/.test(value) ? parseInt(value, 10) : value;
    }
  }

  return Object.keys(fields).length > 0 ? fields : null;
}

/**
 * Build BlogPosting JSON-LD from frontmatter data.
 */
function buildBlogPostingLd(content, siteUrl) {
  const schema = extractSchema(content);
  if (!schema) return null;

  const date = extractField(content, 'date');
  const lastModified = extractField(content, 'lastModified');
  const author = extractField(content, 'author');
  const coverImage = extractField(content, 'coverImage');

  return {
    '@context': 'https://schema.org',
    '@type': schema.type || 'BlogPosting',
    headline: schema.headline || extractField(content, 'title'),
    description: schema.description || extractField(content, 'excerpt'),
    wordCount: schema.wordCount,
    keywords: schema.keywords,
    datePublished: date,
    dateModified: lastModified || date,
    author: author ? { '@type': 'Person', name: author } : undefined,
    image: coverImage && siteUrl ? `${siteUrl.replace(/\/$/, '')}${coverImage}` : undefined,
    mainEntityOfPage: {
      '@type': 'WebPage',
    },
  };
}

/**
 * Build FAQPage JSON-LD from qa frontmatter.
 */
function buildFaqLd(content) {
  const qa = extractQa(content);
  if (qa.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qa.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

/**
 * Embed JSON-LD schema markup into post body.
 *
 * @param {string} content - Full post content (frontmatter + body)
 * @param {object} config - Autoblog config (needs output.siteUrl)
 * @returns {string} - Content with JSON-LD script tags appended
 */
export function embedSchemaMarkup(content, config) {
  const siteUrl = config.output.siteUrl || config.product.url || '';

  const schemas = [];

  const blogPosting = buildBlogPostingLd(content, siteUrl);
  if (blogPosting) schemas.push(blogPosting);

  const faq = buildFaqLd(content);
  if (faq) schemas.push(faq);

  if (schemas.length === 0) return content;

  const scriptBlocks = schemas
    .map((s) => `<script type="application/ld+json">\n${JSON.stringify(s, null, 2)}\n</script>`)
    .join('\n\n');

  // Insert before closing </article> if present, otherwise append to end
  if (content.includes('</article>')) {
    return content.replace('</article>', `\n${scriptBlocks}\n</article>`);
  }

  return `${content}\n\n${scriptBlocks}`;
}
