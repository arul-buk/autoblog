/**
 * strategy-wizard.mjs
 * Interactive CLI wizard that collects user goals and calls Gemini
 * to recommend a content strategy (intent mix, format distribution,
 * category weights, local content config).
 *
 * Run via: npx autoblog --init-strategy
 * Uses Node built-in readline — zero npm dependencies.
 */

import { createInterface } from 'readline';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry } from './retry.mjs';

const GOAL_OPTIONS = [
  { key: 'organic_traffic', label: 'Organic traffic growth' },
  { key: 'lead_generation', label: 'Lead generation' },
  { key: 'brand_authority', label: 'Brand authority / thought leadership' },
  { key: 'product_education', label: 'Product education' },
  { key: 'competitor_differentiation', label: 'Competitor differentiation' },
  { key: 'community_building', label: 'Community building' },
  { key: 'local_market', label: 'Local market penetration' },
];

/**
 * Prompt the user for input via readline.
 */
function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

/**
 * Build the Gemini prompt for strategy recommendation.
 */
function buildStrategyPrompt(answers, config) {
  const clusterNames = (config.topics?.clusters || []).map((c) => c.name);

  return `You are a content strategy expert. A business is setting up an automated blog content pipeline and needs a content strategy recommendation.

BUSINESS CONTEXT:
Product: ${config.product?.name || 'Unknown'} — ${answers.description}
Target audience segments: ${answers.audience}
Blog maturity: ${answers.postCount} existing posts
Goals: ${answers.goals.map((g) => GOAL_OPTIONS.find((o) => o.key === g)?.label || g).join(', ')}
${answers.competitors ? `Competitors: ${answers.competitors}` : ''}
${answers.locations ? `Target locations for local content: ${answers.locations}` : ''}

EXISTING TOPIC CLUSTERS: ${clusterNames.join(', ') || '(none configured yet)'}

TASK: Recommend a content strategy as a JSON object. Consider the business goals to determine the right mix:

- For organic_traffic: bias toward informational (how-to, guides) + commercial (comparisons)
- For lead_generation: bias toward transactional (tutorials) + commercial (comparisons)
- For brand_authority: bias toward news-analysis + case-study
- For competitor_differentiation: bias toward comparison + listicle
- For product_education: bias toward tutorial + how-to-guide
- For local_market: include local-guide in format mix

Return ONLY this JSON object (no markdown fences):
{
  "intentMix": {
    "informational": <0-100>,
    "commercial": <0-100>,
    "transactional": <0-100>,
    "navigational": <0-100>
  },
  "formatMix": {
    "how-to-guide": <0-100>,
    "comparison": <0-100>,
    "listicle": <0-100>,
    "news-analysis": <0-100>,
    "tutorial": <0-100>,
    "local-guide": <0-100>,
    "case-study": <0-100>
  },
  "categoryWeights": {
    ${clusterNames.map((n) => `"${n}": <0.5-2.0 weight multiplier>`).join(',\n    ')}
  },
  "localContent": {
    "enabled": ${answers.locations ? 'true' : 'false'},
    "locations": [${answers.locations ? answers.locations.split(',').map((l) => `{ "city": "${l.trim()}", "region": "", "country": "" }`).join(', ') : ''}],
    "templates": ${answers.locations ? '["Best {product} in {city} ({year})", "{category} Guide for {city} Homeowners"]' : '[]'},
    "maxPerWeek": 1
  },
  "reasoning": "2-3 sentence explanation of WHY this specific mix was chosen based on the goals and business context"
}

RULES:
- intentMix values must sum to 100
- formatMix values must sum to 100
- categoryWeights are relative multipliers (1.0 = normal, 1.5 = 50% more, 0.5 = 50% less)
- Be specific in reasoning — reference the goals and business context`;
}

/**
 * Run the interactive strategy wizard.
 *
 * @param {object} config - Loaded autoblog config
 * @param {string} apiKey - Gemini API key
 */
export async function runStrategyWizard(config, apiKey) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\n═══ Content Strategy Wizard ═══\n');
  console.log('Answer a few questions about your business and goals.');
  console.log('AI will recommend an optimal content mix.\n');

  const answers = {};

  // Q1: Business description
  const defaultDesc = config.product?.description || '';
  answers.description = await ask(
    rl,
    `1. Describe your product and target audience${defaultDesc ? ` [${defaultDesc}]` : ''}:\n   > `
  ) || defaultDesc;

  if (!answers.description) {
    console.log('Error: Product description is required.');
    rl.close();
    return;
  }

  // Q2: Goals
  console.log('\n2. What are your top 2-3 goals for this blog?');
  GOAL_OPTIONS.forEach((g, i) => console.log(`   ${i + 1}. ${g.label}`));
  const goalInput = await ask(rl, '   Enter numbers (e.g., 1,3,5): > ');
  answers.goals = goalInput
    .split(',')
    .map((n) => parseInt(n.trim()) - 1)
    .filter((i) => i >= 0 && i < GOAL_OPTIONS.length)
    .map((i) => GOAL_OPTIONS[i].key);

  if (answers.goals.length === 0) {
    console.log('Error: At least one goal is required.');
    rl.close();
    return;
  }

  // Q3: Audience
  answers.audience = await ask(
    rl,
    '\n3. Who are your readers? List 1-3 audience segments:\n   > '
  );

  // Q4: Post count
  const postCountInput = await ask(
    rl,
    '\n4. How many blog posts do you have currently? [0]: > '
  );
  answers.postCount = parseInt(postCountInput) || 0;

  // Q5: Locations
  answers.locations = await ask(
    rl,
    '\n5. Target cities/regions for local content? (comma-separated, or Enter to skip):\n   > '
  ) || null;

  // Q6: Competitors
  answers.competitors = await ask(
    rl,
    '\n6. Name 1-3 competitors (comma-separated, or Enter to skip):\n   > '
  ) || null;

  rl.close();

  // Call Gemini
  console.log('\n⏳ Generating strategy recommendation...\n');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: config.models?.text || 'gemini-2.5-flash',
    generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
  });

  const prompt = buildStrategyPrompt(answers, config);

  const result = await withRetry(
    () => model.generateContent(prompt),
    { maxAttempts: 2, baseDelayMs: 2000, label: 'strategy-wizard' }
  );

  const text = result.response.text().trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  let strategy;
  try {
    strategy = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      console.log('Error: Could not parse AI recommendation. Raw response:');
      console.log(text);
      return;
    }
    strategy = JSON.parse(match[0]);
  }

  // Display recommendation
  console.log('═══ Recommended Content Strategy ═══\n');

  if (strategy.reasoning) {
    console.log(`Reasoning: ${strategy.reasoning}\n`);
  }

  console.log('Intent Mix:');
  for (const [intent, pct] of Object.entries(strategy.intentMix || {})) {
    console.log(`  ${intent.padEnd(16)} ${pct}%`);
  }

  console.log('\nFormat Mix:');
  for (const [format, pct] of Object.entries(strategy.formatMix || {})) {
    console.log(`  ${format.padEnd(16)} ${pct}%`);
  }

  if (strategy.categoryWeights) {
    console.log('\nCategory Weights:');
    for (const [cat, weight] of Object.entries(strategy.categoryWeights)) {
      console.log(`  ${cat.padEnd(24)} ${weight}x`);
    }
  }

  if (strategy.localContent?.enabled) {
    console.log('\nLocal Content: ENABLED');
    console.log(`  Locations: ${strategy.localContent.locations.map((l) => l.city).join(', ')}`);
    console.log(`  Templates: ${strategy.localContent.templates.length}`);
  }

  // Save
  const strategyObj = {
    generatedAt: new Date().toISOString(),
    goals: answers.goals,
    audienceSegments: answers.audience ? answers.audience.split(',').map((s) => s.trim()) : [],
    competitors: answers.competitors ? answers.competitors.split(',').map((s) => s.trim()) : [],
    ...strategy,
    balanceTolerance: 10,
    minPostsBeforeBalancing: Math.max(10, answers.postCount > 0 ? 5 : 10),
  };

  // Remove reasoning from saved config (it was just for display)
  delete strategyObj.reasoning;

  const outPath = resolve(process.cwd(), '.autoblog-strategy.json');
  writeFileSync(outPath, JSON.stringify(strategyObj, null, 2), 'utf-8');
  console.log(`\n✓ Strategy saved to ${outPath}`);
  console.log('  The pipeline will use this strategy to balance content diversity.');
  console.log('  Re-run --init-strategy anytime to update.\n');
}
