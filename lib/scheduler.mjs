/**
 * scheduler.mjs
 * Resolves what the pipeline should write about today based on schedule config.
 *
 * Called at the very start of the pipeline, before Research.
 *
 * HOW IT WORKS:
 *   1. Loads calendar entries (inline config OR external calendarFile)
 *   2. Finds entry matching today's date (ISO YYYY-MM-DD)
 *   3. If match → returns constraints for downstream steps
 *   4. If no match → returns null (pipeline does normal trending research)
 *
 * The pipeline ALWAYS produces content. Calendar entries steer topic selection
 * but the pipeline falls back to trending research when no entry matches.
 *
 * CALENDAR ENTRY FIELDS:
 *   date       (required) — ISO 'YYYY-MM-DD'
 *   category   (optional) — restrict research to this topic cluster
 *   topic      (optional) — specific topic title (skips research)
 *   keywords   (optional) — seed keywords (skips DataForSEO extraction)
 *   notes      (optional) — free-text guidance for the writer prompt
 *   priority   (optional) — 'high' | 'normal' (default: 'normal')
 *                           'high' skips dedupe (for intentional refreshes)
 */

import { pathToFileURL } from 'url';
import path from 'path';

/**
 * @typedef {Object} CalendarEntry
 * @property {string} date - ISO date string 'YYYY-MM-DD'
 * @property {string} [category] - Topic cluster name to constrain research
 * @property {string} [topic] - Specific topic title (skips research)
 * @property {string[]} [keywords] - Seed keywords (skips DataForSEO extraction)
 * @property {string} [notes] - Extra guidance injected into writer prompt
 * @property {'high'|'normal'} [priority='normal'] - 'high' skips dedupe
 */

/**
 * @typedef {Object} ScheduleResult
 * @property {'calendar'|'trending'} mode - How the topic was selected
 * @property {CalendarEntry|null} calendarEntry - The matched entry, if any
 * @property {string|null} topicOverride - Specific topic title (skips research)
 * @property {string|null} categoryConstraint - Restrict research to this cluster
 * @property {string[]|null} seedKeywords - Pre-set keywords (skips DataForSEO extraction)
 * @property {string|null} writerNotes - Extra guidance for the writer prompt
 * @property {boolean} skipDedupe - true if priority === 'high'
 */

/**
 * Load calendar entries from config (inline or external file).
 *
 * @param {object} scheduleConfig - The schedule section of autoblog config
 * @returns {Promise<CalendarEntry[]>}
 */
async function loadCalendar(scheduleConfig) {
  // External file takes precedence
  if (scheduleConfig.calendarFile) {
    const calendarPath = path.resolve(process.cwd(), scheduleConfig.calendarFile);
    try {
      const fileUrl = pathToFileURL(calendarPath).href;
      const mod = await import(fileUrl);
      const entries = mod.default || mod;
      if (!Array.isArray(entries)) {
        console.log(`  [scheduler] Warning: ${calendarPath} does not export an array. Ignoring.`);
        return [];
      }
      return entries;
    } catch (err) {
      console.log(`  [scheduler] Warning: Could not load calendar file ${calendarPath}: ${err.message}`);
      return [];
    }
  }

  // Inline calendar entries
  if (Array.isArray(scheduleConfig.calendar)) {
    return scheduleConfig.calendar;
  }

  return [];
}

/**
 * Resolve schedule for today. Checks the content calendar for a matching entry
 * and returns constraints for downstream pipeline steps.
 *
 * @param {object} config - Full autoblog config
 * @returns {Promise<ScheduleResult>}
 */
export async function resolveSchedule(config) {
  const scheduleConfig = config.schedule || {};
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Default: no calendar match, use trending research
  const defaultResult = {
    mode: 'trending',
    calendarEntry: null,
    topicOverride: null,
    categoryConstraint: null,
    seedKeywords: null,
    writerNotes: null,
    skipDedupe: false,
  };

  if (!config.steps?.calendar) {
    return defaultResult;
  }

  const entries = await loadCalendar(scheduleConfig);

  if (entries.length === 0) {
    return defaultResult;
  }

  // Find entries matching today's date
  const matches = entries.filter((e) => e.date === today);

  if (matches.length === 0) {
    console.log(`  [scheduler] No calendar entry for ${today}. Using trending research.`);
    return defaultResult;
  }

  if (matches.length > 1) {
    console.log(
      `  [scheduler] Warning: ${matches.length} calendar entries for ${today}. Using first match.`
    );
  }

  const entry = matches[0];

  // Validate category if provided
  if (entry.category && config.topics?.clusters) {
    const clusterNames = config.topics.clusters.map((c) => c.name);
    if (!clusterNames.includes(entry.category)) {
      console.log(
        `  [scheduler] Warning: Calendar category "${entry.category}" doesn't match any cluster (${clusterNames.join(', ')}). Falling back to trending.`
      );
      return defaultResult;
    }
  }

  const result = {
    mode: 'calendar',
    calendarEntry: entry,
    topicOverride: entry.topic || null,
    categoryConstraint: entry.category || null,
    seedKeywords: Array.isArray(entry.keywords) ? entry.keywords : null,
    writerNotes: entry.notes || null,
    skipDedupe: entry.priority === 'high',
  };

  console.log(`  [scheduler] Calendar match for ${today}:`);
  if (result.topicOverride) console.log(`    Topic: "${result.topicOverride}"`);
  if (result.categoryConstraint) console.log(`    Category: ${result.categoryConstraint}`);
  if (result.seedKeywords) console.log(`    Keywords: ${result.seedKeywords.join(', ')}`);
  if (result.writerNotes) console.log(`    Notes: ${result.writerNotes.slice(0, 80)}...`);
  if (result.skipDedupe) console.log(`    Priority: HIGH (skipping dedupe)`);

  return result;
}
