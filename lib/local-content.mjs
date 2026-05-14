/**
 * local-content.mjs
 * Template-based local/geo content generation.
 * Expands location × template combinations and tracks which
 * have been published via the context system.
 *
 * Zero npm dependencies.
 */

/**
 * Expand a template string with location and config data.
 *
 * @param {string} template - Template with {city}, {region}, {country}, {year}, {product}, {category} placeholders
 * @param {object} location - { city, region, country }
 * @param {object} config - Full autoblog config
 * @returns {string}
 */
export function expandTemplate(template, location, config) {
  return template
    .replace(/\{city\}/gi, location.city)
    .replace(/\{region\}/gi, location.region || '')
    .replace(/\{country\}/gi, location.country || '')
    .replace(/\{year\}/gi, new Date().getFullYear().toString())
    .replace(/\{product\}/gi, config.product?.name || '')
    .replace(/\{category\}/gi, config.topics?.clusters?.[0]?.name || '');
}

/**
 * Generate a slug from a title string.
 */
function toSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/**
 * Resolve the next local content topic to generate.
 * Returns null if all combinations are fulfilled or local content is throttled.
 *
 * @param {object} config - Full autoblog config
 * @param {object} context - Context object from loadContext()
 * @returns {object|null} Topic object compatible with pipeline, or null
 */
export function resolveLocalTopic(config, context) {
  const local = config.contentStrategy?.localContent;
  if (!local?.enabled) return null;

  const locations = local.locations || [];
  const templates = local.templates || [];
  if (locations.length === 0 || templates.length === 0) return null;

  // Throttle: check maxPerWeek
  const maxPerWeek = local.maxPerWeek ?? 1;
  if (context?.posts?.length > 0) {
    const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const recentLocal = context.posts.filter(
      (p) => p.contentFormat === 'local-guide' && p.date >= oneWeekAgo
    ).length;
    if (recentLocal >= maxPerWeek) return null;
  }

  // Build all possible combinations, respecting maxLocalPagesPerTemplate
  const existingSlugs = new Set((context?.posts || []).map((p) => p.slug));
  const maxPerTemplate = config.contentQuality?.maxLocalPagesPerTemplate ?? Infinity;

  for (const template of templates) {
    // Count how many pages already exist for this template
    let templateCount = 0;
    for (const location of locations) {
      const slug = toSlug(expandTemplate(template, location, config));
      if (existingSlugs.has(slug)) templateCount++;
    }
    // Skip this template if limit reached
    if (templateCount >= maxPerTemplate) continue;

    for (const location of locations) {
      const title = expandTemplate(template, location, config);
      const slug = toSlug(title);

      if (!existingSlugs.has(slug)) {
        return {
          title,
          summary: `Location-specific guide for ${location.city}${location.region ? `, ${location.region}` : ''}. Generated from template: "${template}".`,
          category: 'Local Guide',
          relevanceScore: 0.85,
          region: `${location.city}${location.region ? `, ${location.region}` : ''}`,
          sources: [],
          searchIntent: 'commercial',
          contentFormat: 'local-guide',
          isLocal: true,
          locationData: { ...location },
        };
      }
    }
  }

  // All combinations fulfilled
  return null;
}

/**
 * Build local content guidance for the writer prompt.
 *
 * @param {object} topic - Topic object with isLocal and locationData
 * @param {object} config - Full autoblog config
 * @returns {string} Writer prompt block, or empty string if not local
 */
export function buildLocalWriterGuidance(topic, config) {
  if (!topic?.isLocal || !topic.locationData) return '';

  const { city, region, country } = topic.locationData;
  const productName = config.product?.name || 'our product';
  const locationStr = `${city}${region ? `, ${region}` : ''}`;

  return `
LOCAL CONTENT GUIDANCE:
This is a location-specific article for ${locationStr}.
- Include local context: mention local industry, companies, or culture relevant to ${city}
- Use "${city}" in the H1 title and at least 2 H2 headings
- Include "${city}" and "near me" keyword variants naturally
- Add a local FAQ: "How much does it cost to build a home in ${city}?" or similar
- Reference local data points (costs, regulations, climate considerations) if relevant
- Mention ${productName} as a tool that works for ${locationStr} residents
- Do NOT make up specific local businesses or addresses`;
}
