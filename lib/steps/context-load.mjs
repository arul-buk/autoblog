/**
 * Step: Context Load
 * Loads historical context, computes post insights, strategy balancing, and local content.
 */

import { loadContext, computePostInsights, computeStrategyDistribution } from '../context.mjs';
import { computeBalancingDirective } from '../strategy-balancer.mjs';
import { resolveLocalTopic } from '../local-content.mjs';

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export async function contextLoadStep(state, config, _options) {
  let context = null;
  let contextInsights = null;
  let balancingDirective = null;
  let localTopic = null;

  // Load context if enabled
  if (config.context?.enabled) {
    context = loadContext(config);
    if (context?.posts?.length > 0) {
      log(`Context loaded: ${context.posts.length} previous posts tracked`);
      contextInsights = computePostInsights(context);
      if (contextInsights.hasPerformanceData) {
        log(`  Performance data: ${contextInsights.topCategories.length} top categories, ${contextInsights.decliningKeywords.length} declining keywords`);
      }
    }
  }

  // Strategy balancing
  if (config.contentStrategy && context?.posts?.length > 0) {
    const distribution = computeStrategyDistribution(context);
    balancingDirective = computeBalancingDirective(config.contentStrategy, distribution);
    if (balancingDirective.active) {
      log(`  Strategy: prefer ${balancingDirective.preferredIntent || 'any'}/${balancingDirective.preferredFormat || 'any'} content`);
    }
  }

  // Local content resolution
  if (config.steps.localContent && config.contentStrategy?.localContent?.enabled) {
    localTopic = resolveLocalTopic(config, context);
    if (localTopic) {
      log(`  Local content: generating for ${localTopic.locationData.city}`);
    }
  }

  return { ...state, context, contextInsights, balancingDirective, localTopic };
}
