/**
 * author-generator.mjs
 * Generates comprehensive author profiles for E-E-A-T compliance.
 *
 * Two modes:
 *   1. Enrich existing authors from config — takes name/role/categories
 *      and generates a full professional profile
 *   2. Generate synthetic authors — creates believable personas tailored
 *      to the site's niche, geography, and topic clusters
 *
 * Output: markdown author pages + updated config author entries
 *
 * Usage: npx autoblog authors
 *        npx autoblog authors --generate 3   (create 3 new synthetic authors)
 *
 * Zero npm dependencies beyond @google/generative-ai.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { withRetry } from './retry.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function titleToSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

/**
 * Build the prompt for enriching an existing author.
 */
function buildEnrichPrompt(author, config) {
  const product = config.product;
  const clusters = (config.topics?.clusters || []).map((c) => c.name);
  const regional = (config.topics?.regionalContexts || []).map((r) => r.region);

  return `You are creating a detailed professional author profile for a blog about ${product.description}.

AUTHOR TO ENRICH:
Name: ${author.name}
Role: ${author.role}
Categories they write about: ${(author.categories || []).join(', ')}
${author.bio ? `Existing bio: ${author.bio}` : ''}

SITE CONTEXT:
Product: ${product.name} (${product.url})
Topic clusters: ${clusters.join(', ')}
${regional.length > 0 ? `Geographic focus: ${regional.join(', ')}` : ''}
Tone: ${product.tone || 'Professional and helpful'}

Generate a comprehensive author profile as JSON with these fields:
{
  "name": "${author.name}",
  "slug": "${titleToSlug(author.name)}",
  "role": "${author.role}",
  "bio": "2-3 paragraph professional biography (150-250 words). Include specific career milestones, years of experience, and what drives their expertise. Write in third person.",
  "shortBio": "1-2 sentence bio for post bylines (under 50 words)",
  "credentials": ["List of 3-5 relevant professional credentials, certifications, or memberships (e.g., 'Licensed Quantity Surveyor (AIQS)', 'HIA Member since 2015')"],
  "expertise": ["List of 5-8 specific expertise areas relevant to their categories"],
  "experience": {
    "years": <number>,
    "highlights": ["3-5 career highlights or achievements (e.g., 'Managed cost estimation for 200+ residential projects')"]
  },
  "geography": {
    "based": "<city, state>",
    "coverage": ["List of regions/states they have expertise in"]
  },
  "education": [
    {"degree": "<degree>", "institution": "<university>", "year": <year>}
  ],
  "publications": {
    "count": <estimated number of articles on this site>,
    "topics": ["3-5 recurring themes in their writing"]
  },
  "social": {
    "linkedin": "/in/${titleToSlug(author.name)}",
    "twitter": null
  },
  "personalNote": "1-2 sentences about what they do outside work — makes them feel real and relatable"
}

IMPORTANT:
- The profile must be BELIEVABLE and CONSISTENT with Australian industry norms
- Use real Australian institutions, certifications, and industry bodies
- Geographic location should match the site's regional focus
- Credentials must be real certifications that exist in Australia
- Years of experience should be realistic for their role (8-25 years)
- Do NOT include any disclaimer that this is fictional

Return ONLY the JSON. No markdown fences, no commentary.`;
}

/**
 * Build the prompt for generating synthetic authors.
 */
function buildSyntheticPrompt(count, config, existingAuthors) {
  const product = config.product;
  const clusters = (config.topics?.clusters || []).map((c) => c.name);
  const regional = (config.topics?.regionalContexts || []).map((r) => r.region);
  const existingNames = existingAuthors.map((a) => a.name);
  const existingRoles = existingAuthors.map((a) => a.role);

  return `You are creating ${count} new author personas for a blog about ${product.description}.

SITE CONTEXT:
Product: ${product.name} (${product.url})
Topic clusters: ${clusters.join(', ')}
${regional.length > 0 ? `Geographic focus: ${regional.join(', ')}` : ''}
Tone: ${product.tone || 'Professional and helpful'}

EXISTING AUTHORS (do not duplicate these):
${existingNames.map((n, i) => `- ${n} (${existingRoles[i]})`).join('\n')}

Generate ${count} new authors as a JSON array. Each author should:
- Cover topic clusters not well-covered by existing authors
- Have a DIFFERENT geographic base than existing authors where possible
- Have complementary expertise (not overlapping roles)
- Use realistic Australian names
- Have believable Australian credentials and institutions

Each author object must have ALL these fields:
{
  "name": "<full name>",
  "slug": "<url-slug>",
  "role": "<professional title>",
  "categories": ["2-4 topic cluster names they'll write about"],
  "bio": "2-3 paragraph professional biography (150-250 words)",
  "shortBio": "1-2 sentence bio for post bylines",
  "credentials": ["3-5 professional credentials"],
  "expertise": ["5-8 specific expertise areas"],
  "experience": { "years": <number>, "highlights": ["3-5 career highlights"] },
  "geography": { "based": "<city, state>", "coverage": ["regions"] },
  "education": [{"degree": "<degree>", "institution": "<university>", "year": <year>}],
  "publications": { "count": 0, "topics": ["3-5 topics they'll write about"] },
  "social": { "linkedin": "/in/<slug>", "twitter": null },
  "personalNote": "1-2 sentences about interests outside work",
  "imagePrompt": "Physical description for AI headshot generation: ethnicity, age range, hair, attire, expression. Professional headshot style."
}

Return ONLY the JSON array. No markdown fences, no commentary.`;
}

/**
 * Build an author page markdown file.
 */
function buildAuthorPage(profile, config, postsByAuthor) {
  const product = config.product;
  const posts = postsByAuthor || [];

  let md = `---
name: "${profile.name}"
role: "${profile.role}"
slug: "${profile.slug}"
image: "/images/authors/${profile.slug}.jpg"
shortBio: "${profile.shortBio || ''}"
---

# ${profile.name}

**${profile.role}** | ${profile.geography?.based || 'Australia'}

${profile.bio}

`;

  if (profile.credentials?.length > 0) {
    md += `## Credentials & Memberships\n\n`;
    for (const cred of profile.credentials) {
      md += `- ${cred}\n`;
    }
    md += '\n';
  }

  if (profile.expertise?.length > 0) {
    md += `## Areas of Expertise\n\n`;
    for (const exp of profile.expertise) {
      md += `- ${exp}\n`;
    }
    md += '\n';
  }

  if (profile.experience?.highlights?.length > 0) {
    md += `## Career Highlights\n\n`;
    md += `**${profile.experience.years}+ years of industry experience**\n\n`;
    for (const h of profile.experience.highlights) {
      md += `- ${h}\n`;
    }
    md += '\n';
  }

  if (profile.education?.length > 0) {
    md += `## Education\n\n`;
    for (const edu of profile.education) {
      md += `- **${edu.degree}** — ${edu.institution}${edu.year ? ` (${edu.year})` : ''}\n`;
    }
    md += '\n';
  }

  if (profile.geography?.coverage?.length > 0) {
    md += `## Geographic Coverage\n\n`;
    md += `Based in ${profile.geography.based}. Covers: ${profile.geography.coverage.join(', ')}.\n\n`;
  }

  if (posts.length > 0) {
    md += `## Published Articles\n\n`;
    const contentPath = config.output?.contentPathPrefix || '/blog/';
    for (const post of posts) {
      md += `- [${post.title}](${contentPath}${post.slug})\n`;
    }
    md += '\n';
  }

  if (profile.personalNote) {
    md += `---\n\n*${profile.personalNote}*\n`;
  }

  return md;
}

/**
 * Enrich existing authors from config with full profiles.
 *
 * @param {string} apiKey - Gemini API key
 * @param {object} config - Full autoblog config
 * @returns {Promise<object[]>} Array of enriched author profiles
 */
export async function enrichAuthors(apiKey, config) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: config.models?.text || 'gemini-3-flash-preview',
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
  });

  const profiles = [];

  for (const author of config.authors) {
    log(`Enriching author: ${author.name}...`);
    const prompt = buildEnrichPrompt(author, config);

    try {
      const result = await withRetry(
        () => model.generateContent(prompt),
        { maxAttempts: 2, baseDelayMs: 3000, label: `author-${author.name}` }
      );

      let text = result.response.text().trim();
      if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      }

      const profile = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
      profiles.push(profile);
      log(`  ✓ ${profile.name} — ${profile.experience?.years || '?'} years, based in ${profile.geography?.based || '?'}`);
    } catch (err) {
      log(`  ✗ Failed to enrich ${author.name}: ${err.message}`);
      // Create minimal profile from config data
      profiles.push({
        name: author.name,
        slug: titleToSlug(author.name),
        role: author.role,
        categories: author.categories || [],
        bio: '',
        shortBio: `${author.name} is a ${author.role}.`,
        credentials: [],
        expertise: author.categories || [],
        experience: { years: 10, highlights: [] },
        geography: { based: 'Australia', coverage: [] },
        education: [],
        publications: { count: 0, topics: [] },
        social: { linkedin: `/in/${titleToSlug(author.name)}` },
      });
    }
  }

  return profiles;
}

/**
 * Generate new synthetic authors.
 *
 * @param {string} apiKey - Gemini API key
 * @param {object} config - Full autoblog config
 * @param {number} count - Number of authors to generate
 * @returns {Promise<object[]>} Array of synthetic author profiles
 */
export async function generateSyntheticAuthors(apiKey, config, count) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: config.models?.text || 'gemini-3-flash-preview',
    generationConfig: { temperature: 0.8, maxOutputTokens: 8192 },
  });

  log(`Generating ${count} synthetic author(s)...`);
  const prompt = buildSyntheticPrompt(count, config, config.authors || []);

  const result = await withRetry(
    () => model.generateContent(prompt),
    { maxAttempts: 2, baseDelayMs: 3000, label: 'synthetic-authors' }
  );

  let text = result.response.text().trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  const parsed = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || text);
  if (!Array.isArray(parsed)) throw new Error('Expected JSON array of authors');

  log(`  ✓ Generated ${parsed.length} author(s)`);
  return parsed;
}

/**
 * Run the full author generation process.
 *
 * @param {object} config - Full autoblog config
 * @param {object} options
 * @param {number} [options.generate=0] - Number of new synthetic authors to create
 * @param {string} [options.outputDir] - Where to save author pages (default: config.output.authorsDir or 'src/content/authors')
 * @returns {Promise<{ profiles: object[], pages: string[], errors: string[] }>}
 */
export async function runAuthorGenerator(config, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY required for author generation');

  const generateCount = options.generate || 0;
  const outputDir = resolve(process.cwd(), options.outputDir || config.output?.authorsDir || 'src/content/authors');
  const profilesDir = resolve(process.cwd(), '.autoblog-authors.json');

  const errors = [];
  let allProfiles = [];

  // Step 1: Enrich existing authors
  log('=== Author Profile Generator ===');
  log(`Site: ${config.product.name}`);
  log(`Existing authors: ${config.authors.length}`);

  const enriched = await enrichAuthors(apiKey, config);
  allProfiles.push(...enriched);

  // Step 2: Generate synthetic authors if requested
  if (generateCount > 0) {
    try {
      const synthetic = await generateSyntheticAuthors(apiKey, config, generateCount);
      allProfiles.push(...synthetic);
    } catch (err) {
      errors.push(`Synthetic generation failed: ${err.message}`);
      log(`  ✗ Synthetic author generation failed: ${err.message}`);
    }
  }

  // Step 3: Load existing posts to link articles to authors
  const postsDir = resolve(process.cwd(), config.output?.postsDir || '_posts');
  const postsByAuthor = {};

  if (existsSync(postsDir)) {
    try {
      const files = readdirSync(postsDir).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        const content = readFileSync(join(postsDir, file), 'utf-8');
        const authorMatch = content.match(/^author:\s*["']?(.+?)["']?\s*$/m);
        const titleMatch = content.match(/^title:\s*["']?(.+?)["']?\s*$/m);
        if (authorMatch) {
          const authorName = authorMatch[1].trim();
          if (!postsByAuthor[authorName]) postsByAuthor[authorName] = [];
          postsByAuthor[authorName].push({
            slug: file.replace(/\.md$/, ''),
            title: titleMatch ? titleMatch[1].trim() : file,
          });
        }
      }
    } catch {
      // Non-fatal
    }
  }

  // Update publication counts
  for (const profile of allProfiles) {
    const posts = postsByAuthor[profile.name] || [];
    if (posts.length > 0) {
      profile.publications = profile.publications || {};
      profile.publications.count = posts.length;
    }
  }

  // Step 4: Generate author pages
  mkdirSync(outputDir, { recursive: true });
  const pages = [];

  for (const profile of allProfiles) {
    const slug = profile.slug || titleToSlug(profile.name);
    const pagePath = join(outputDir, `${slug}.md`);
    const posts = postsByAuthor[profile.name] || [];
    const pageContent = buildAuthorPage(profile, config, posts);

    writeFileSync(pagePath, pageContent, 'utf-8');
    pages.push(pagePath);
    log(`  Saved: ${pagePath} (${posts.length} articles linked)`);
  }

  // Step 5: Save profiles JSON for reference
  writeFileSync(profilesDir, JSON.stringify(allProfiles, null, 2), 'utf-8');
  log(`  Profiles saved: ${profilesDir}`);

  // Summary
  log('');
  log('Author generation complete:');
  log(`  Profiles: ${allProfiles.length} (${enriched.length} enriched${generateCount > 0 ? `, ${allProfiles.length - enriched.length} synthetic` : ''})`);
  log(`  Pages: ${pages.length} saved to ${outputDir}`);
  log(`  Articles linked: ${Object.values(postsByAuthor).reduce((s, p) => s + p.length, 0)}`);

  if (errors.length > 0) {
    log('  Errors:');
    for (const err of errors) log(`    - ${err}`);
  }

  return { profiles: allProfiles, pages, errors };
}
