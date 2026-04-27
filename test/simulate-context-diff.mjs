#!/usr/bin/env node
/**
 * simulate-context-diff.mjs
 *
 * Simulates pipeline prompt generation under different context scenarios
 * and shows how the output differs.
 *
 * Usage:
 *   node test/simulate-context-diff.mjs                     # all scenarios
 *   node test/simulate-context-diff.mjs --prompt research    # research prompt only
 *   node test/simulate-context-diff.mjs --prompt keyword     # keyword prompt only
 *   node test/simulate-context-diff.mjs --scenario 1,3       # specific scenarios only
 *   node test/simulate-context-diff.mjs --diff               # highlight only the differences
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { computePostInsights, buildContextSummary } from '../lib/context.mjs';
import { buildResearchPrompt, buildKeywordStrategyPrompt } from '../lib/prompts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── CLI args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const promptFilter = args.includes('--prompt') ? args[args.indexOf('--prompt') + 1] : null;
const scenarioFilter = args.includes('--scenario')
  ? args[args.indexOf('--scenario') + 1].split(',').map(Number)
  : null;
const diffOnly = args.includes('--diff');

// ─── Shared config (mimics a real autoblog.config.mjs) ────────���──────────

const config = {
  product: {
    name: 'AcmeSaaS',
    description: 'Project management tool for remote engineering teams',
  },
  topics: {
    clusters: [
      { name: 'Remote Work', queries: ['async communication best practices'] },
      { name: 'Competitor', queries: ['best project management tool review 2026'] },
      { name: 'Engineering Culture', queries: ['sprint retrospective techniques'] },
    ],
    recencyDays: 7,
  },
  seo: {
    maxDifficulty: 60,
    minSearchVolume: 100,
    location: 2840,
  },
};

const topic = {
  title: 'How Async Standups Save 5 Hours Per Week',
  summary: 'Analysis of time savings from replacing daily standups with async alternatives.',
  category: 'Remote Work',
  searchIntent: 'informational',
  sources: ['HBR study 2026', 'GitLab async handbook'],
};

const existingPostMeta = [
  { title: 'Remote Team Productivity', slug: 'remote-team-productivity', keywords: ['remote productivity', 'async work'] },
  { title: 'Jira Alternatives Compared', slug: 'jira-alternative-comparison', keywords: ['jira alternative', 'project management'] },
];

// ─── Context scenarios ───────────────────────────────────────────────────

const scenarios = [
  {
    id: 1,
    name: 'No context (context.enabled = false)',
    description: 'Pipeline runs without context persistence — current default behavior.',
    contextInsights: null,
  },
  {
    id: 2,
    name: 'Cold start (no performance data yet)',
    description: 'Context enabled but first few runs — no analytics data collected yet.',
    contextInsights: computePostInsights({
      version: 1,
      posts: [
        { slug: 'post-1', title: 'First Post', date: '2026-04-20', category: 'Remote Work', primaryKeyword: 'remote work', secondaryKeywords: [], performance: null },
        { slug: 'post-2', title: 'Second Post', date: '2026-04-22', category: 'Competitor', primaryKeyword: 'jira alternative', secondaryKeywords: [], performance: null },
      ],
      topicHistory: ['Remote Work', 'Competitor'],
    }),
  },
  {
    id: 3,
    name: 'Healthy blog (all categories performing well)',
    description: 'All posts have strong positions, no declining keywords.',
    contextInsights: computePostInsights({
      version: 1,
      posts: [
        { slug: 'remote-prod', title: 'Remote Productivity', date: '2026-01-10', category: 'Remote Work', primaryKeyword: 'remote productivity', secondaryKeywords: ['async work'], performance: { lastChecked: '2026-04-20', clicks: 200, impressions: 5000, position: 4.2, pageviews: 600, engagement: 0.7 } },
        { slug: 'jira-alt', title: 'Jira Alternatives', date: '2026-01-20', category: 'Competitor', primaryKeyword: 'jira alternative', secondaryKeywords: ['pm tool'], performance: { lastChecked: '2026-04-20', clicks: 300, impressions: 8000, position: 3.1, pageviews: 900, engagement: 0.75 } },
        { slug: 'sprint-retro', title: 'Sprint Retro Guide', date: '2026-02-01', category: 'Engineering Culture', primaryKeyword: 'sprint retrospective', secondaryKeywords: ['agile retro'], performance: { lastChecked: '2026-04-20', clicks: 150, impressions: 4000, position: 6.8, pageviews: 500, engagement: 0.65 } },
      ],
      topicHistory: ['Remote Work', 'Competitor', 'Engineering Culture'],
    }),
  },
  {
    id: 4,
    name: 'Mixed performance (some declining)',
    description: 'Realistic scenario — some categories thrive, others decline.',
    contextInsights: computePostInsights(
      JSON.parse(readFileSync(resolve(__dirname, 'fixtures/context-with-performance.json'), 'utf-8'))
    ),
  },
  {
    id: 5,
    name: 'Heavily declining blog',
    description: 'Most keywords losing position — pipeline should pivot hard.',
    contextInsights: computePostInsights({
      version: 1,
      posts: [
        { slug: 'remote-prod', title: 'Remote Productivity', date: '2026-01-10', category: 'Remote Work', primaryKeyword: 'remote team productivity', secondaryKeywords: ['async work'], performance: { lastChecked: '2026-04-20', clicks: 5, impressions: 400, position: 28.5, pageviews: 15, engagement: 0.2 } },
        { slug: 'async-standups', title: 'Async Standup Guide', date: '2026-02-01', category: 'Remote Work', primaryKeyword: 'async standup tools', secondaryKeywords: ['daily standup'], performance: { lastChecked: '2026-04-20', clicks: 3, impressions: 250, position: 32.1, pageviews: 10, engagement: 0.15 } },
        { slug: 'jira-alt', title: 'Jira Alternatives', date: '2026-01-20', category: 'Competitor', primaryKeyword: 'jira alternative remote', secondaryKeywords: ['pm tool'], performance: { lastChecked: '2026-04-20', clicks: 8, impressions: 600, position: 19.4, pageviews: 25, engagement: 0.18 } },
        { slug: 'sprint-retro', title: 'Sprint Retro', date: '2026-02-15', category: 'Engineering Culture', primaryKeyword: 'sprint retrospective techniques', secondaryKeywords: ['agile retro'], performance: { lastChecked: '2026-04-20', clicks: 2, impressions: 150, position: 35.0, pageviews: 8, engagement: 0.12 } },
        { slug: 'burnout', title: 'Burnout Prevention', date: '2026-03-01', category: 'Engineering Culture', primaryKeyword: 'developer burnout prevention', secondaryKeywords: ['eng wellbeing'], performance: { lastChecked: '2026-04-20', clicks: 4, impressions: 300, position: 24.8, pageviews: 12, engagement: 0.2 } },
      ],
      topicHistory: ['Remote Work', 'Competitor', 'Engineering Culture'],
    }),
  },
];

// ─── Output helpers ──────────────────────────────────────────────────────

const DIVIDER = '═'.repeat(80);
const THIN_DIVIDER = '─'.repeat(80);
const BLUE = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function header(text) {
  console.log(`\n${BLUE}${DIVIDER}${RESET}`);
  console.log(`${BOLD}${text}${RESET}`);
  console.log(`${BLUE}${DIVIDER}${RESET}`);
}

function subheader(text) {
  console.log(`\n${YELLOW}${THIN_DIVIDER}${RESET}`);
  console.log(`${BOLD}${text}${RESET}`);
  console.log(`${YELLOW}${THIN_DIVIDER}${RESET}`);
}

/**
 * Extract only the context-injected portion from a prompt.
 * Returns the full prompt if diffOnly is false.
 */
function extractContextBlock(prompt, marker) {
  if (!diffOnly) return prompt;

  const lines = prompt.split('\n');
  const start = lines.findIndex((l) => l.includes(marker));
  if (start === -1) return `${DIM}(no ${marker} block found — context not injected)${RESET}`;

  // Find the end of the block (next major section header or empty line after block)
  let end = start + 1;
  while (end < lines.length) {
    // Stop at next major section (all caps with colon, or ═══)
    if (
      (lines[end].match(/^[A-Z]{3,}/) && !lines[end].startsWith('IMPORTANT')) ||
      lines[end].includes('═══')
    ) break;
    end++;
  }

  return lines.slice(start, end).join('\n');
}

// ─── Run simulations ─────────────────────────────────────────────────────

const activeScenarios = scenarios.filter((s) =>
  scenarioFilter ? scenarioFilter.includes(s.id) : true
);

header('Context Feedback Loop — Prompt Simulation');
console.log(`\n${DIM}Showing how prompts change across ${activeScenarios.length} context scenarios.${RESET}`);
console.log(`${DIM}Topic: "${topic.title}"${RESET}`);
console.log(`${DIM}Mode: ${diffOnly ? 'diff only (showing injected blocks)' : 'full prompts'}${RESET}`);

for (const scenario of activeScenarios) {
  header(`Scenario ${scenario.id}: ${scenario.name}`);
  console.log(`${DIM}${scenario.description}${RESET}`);

  const insights = scenario.contextInsights;
  const contextSummary = insights ? buildContextSummary(insights) : '';

  // Stats
  if (insights) {
    console.log(`\n${GREEN}Insights:${RESET}`);
    console.log(`  hasPerformanceData: ${insights.hasPerformanceData}`);
    console.log(`  topCategories: ${insights.topCategories.map((c) => `${c.category} (avg ${c.avgClicks} clicks)`).join(', ') || '(none)'}`);
    console.log(`  decliningKeywords: ${insights.decliningKeywords.map((k) => `"${k.keyword}" @ pos ${k.position}`).join(', ') || '(none)'}`);
    console.log(`  underperformingCategories: ${insights.underperformingCategories.map((c) => c.category).join(', ') || '(none)'}`);
    if (contextSummary) {
      console.log(`  summaryLength: ${contextSummary.length} chars`);
    }
  } else {
    console.log(`\n${DIM}  (no context — null insights)${RESET}`);
  }

  // Research prompt
  if (!promptFilter || promptFilter === 'research') {
    subheader('Research Prompt');
    const researchPrompt = buildResearchPrompt({
      expandedQueries: config.topics.clusters.flatMap((c) =>
        c.queries.map((q) => `[${c.name}] ${q}`)
      ),
      config,
      regionalContexts: [],
      contextSummary,
    });

    const output = extractContextBlock(researchPrompt, 'CONTENT PERFORMANCE DATA');
    console.log(output);
  }

  // Keyword strategy prompt
  if (!promptFilter || promptFilter === 'keyword') {
    subheader('Keyword Strategy Prompt');
    const kwPrompt = buildKeywordStrategyPrompt({
      topic,
      existingPostMeta,
      config,
      contextInsights: insights,
    });

    const output = extractContextBlock(kwPrompt, 'KEYWORD PERFORMANCE DATA');
    console.log(output);
  }
}

// ─── Summary comparison ──────────────────────────────────────────────────

header('Summary: Context Injection Across Scenarios');

const rows = activeScenarios.map((s) => {
  const insights = s.contextInsights;
  const summary = insights ? buildContextSummary(insights) : '';
  return {
    id: s.id,
    name: s.name.padEnd(45),
    hasPerf: insights?.hasPerformanceData ? 'YES' : 'NO ',
    declining: String(insights?.decliningKeywords?.length || 0).padStart(2),
    summaryChars: String(summary.length).padStart(4),
    injected: summary.length > 0 ? `${GREEN}INJECTED${RESET}` : `${DIM}SKIPPED ${RESET}`,
  };
});

console.log(`\n  ${'#'.padStart(2)}  ${'Scenario'.padEnd(45)}  Perf?  Decl  Chars  Status`);
console.log(`  ${'-'.repeat(2)}  ${'-'.repeat(45)}  ${'-'.repeat(5)}  ${'-'.repeat(4)}  ${'-'.repeat(5)}  ${'-'.repeat(8)}`);
for (const r of rows) {
  console.log(`  ${String(r.id).padStart(2)}  ${r.name}  ${r.hasPerf}    ${r.declining}  ${r.summaryChars}  ${r.injected}`);
}

console.log(`\n${DIM}Run with --diff to see only injected context blocks.${RESET}`);
console.log(`${DIM}Run with --prompt research or --prompt keyword to filter.${RESET}`);
console.log(`${DIM}Run with --scenario 1,4 to compare specific scenarios.${RESET}\n`);
