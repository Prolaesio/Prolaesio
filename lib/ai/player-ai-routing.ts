import 'server-only';

import { SupabaseClient } from '@supabase/supabase-js';

import {
  getAiLimitConfig,
  getAiModelConfig,
  getModelForPlayerTier,
  isHighHardModelEnabled,
  PlayerAiTier,
} from './model-config';
import { PlayerAiMessageRisk } from './player-ai-safety';

export type PlayerAiTaskComplexity = 'standard' | 'hard';

export type PlayerAiModelRoute = {
  model: string;
  route: 'tier_default' | 'high_hard' | 'high_hard_fallback';
  taskComplexity: PlayerAiTaskComplexity;
  highHardEnabled: boolean;
  highHardLimit?: number;
  highHardUsedToday?: number;
};

type UsageRow = {
  request_count: number | null;
};

const MULTI_WEEK_PATTERNS = [
  /\bmulti[-\s]?week\b/i,
  /\b(?:last|past)\s+(?:[2-9]|[1-9]\d)\s+weeks?\b/i,
  /\b(?:last|past)\s+(?:month|28\s+days)\b/i,
  /\b(?:analy[sz]e|review|compare)\s+(?:my\s+)?(?:last|past)\s+4\s+weeks?\b/i,
];

const TREND_ANALYSIS_PATTERNS = [
  /\b(?:compare|correlate|trend|patterns?|analy[sz]e)\b.*\b(?:readiness|wellness|training\s+load|load|rpe|sleep)\b/i,
  /\b(?:readiness|wellness|training\s+load|load|rpe|sleep)\b.*\b(?:compare|correlate|trend|patterns?|analy[sz]e)\b/i,
];

const PLAN_PATTERNS = [
  /\b(?:build|create|make|design|plan)\b.*\b(?:matches?|calendar|schedule|gym|school|soreness|training\s+load|sessions?)\b/i,
  /\b(?:matches?|calendar|schedule|gym|school|soreness|training\s+load|sessions?)\b.*\b(?:build|create|make|design|plan)\b/i,
];

const RETURN_TO_TRAINING_PATTERNS = [
  /\breturn[-\s]?to[-\s]?training\b/i,
  /\bback\s+to\s+(?:training|playing|football|practice)\b/i,
  /\bcome\s+back\s+from\b.*\b(?:pain|injur|sore|hamstring|knee|ankle|groin)\b/i,
];

const COMPLEX_FATIGUE_PATTERNS = [
  /\b(?:why|explain|analy[sz]e|figure\s+out)\b.*\b(?:fatigue|tired|exhausted|drained|low\s+energy)\b/i,
  /\b(?:fatigue|tired|exhausted|drained|low\s+energy)\b.*\b(?:readiness|wellness|load|training|sleep|calendar|schedule|logs?)\b/i,
];

const SIMPLE_STANDARD_PATTERNS = [
  /^\s*explain\s+my\s+readiness\s*$/i,
  /^\s*should\s+i\s+train\s+hard\s+today\??\s*$/i,
  /^\s*summarize\s+my\s+week\s*$/i,
  /^\s*why\s+am\s+i\s+tired\??\s*$/i,
  /^\s*give\s+me\s+a\s+light\s+session\s*$/i,
  /^\s*explain\s+rpe\s*$/i,
];

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function matchesAny(message: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(message));
}

function countSourceTerms(message: string): number {
  const terms = [
    /\breadiness\b/i,
    /\bwellness\b/i,
    /\btraining\s+load\b|\bload\b/i,
    /\brpe\b/i,
    /\bsleep\b/i,
    /\bcalendar\b|\bschedule\b/i,
    /\bmatches?\b/i,
    /\bgym\b/i,
    /\bschool\b/i,
    /\bsoreness\b|\bpain\b|\binjur/i,
  ];

  return terms.filter((term) => term.test(message)).length;
}

function countPlanningTerms(message: string): number {
  const terms = [
    /\bmatches?\b/i,
    /\bcalendar\b|\bschedule\b/i,
    /\bgym\b/i,
    /\bschool\b/i,
    /\bsoreness\b|\bpain\b|\binjur/i,
    /\btraining\s+load\b|\bload\b/i,
  ];

  return terms.filter((term) => term.test(message)).length;
}

export function classifyPlayerAiTaskComplexity(params: {
  message: string;
  messageRisk: PlayerAiMessageRisk;
}): PlayerAiTaskComplexity {
  const message = params.message.trim();

  if (matchesAny(message, SIMPLE_STANDARD_PATTERNS)) {
    return 'standard';
  }

  if (matchesAny(message, MULTI_WEEK_PATTERNS)) {
    return 'hard';
  }

  if (matchesAny(message, TREND_ANALYSIS_PATTERNS) && countSourceTerms(message) >= 2) {
    return 'hard';
  }

  if (matchesAny(message, PLAN_PATTERNS) && countPlanningTerms(message) >= 2) {
    return 'hard';
  }

  if (
    params.messageRisk === 'pain_or_injury' &&
    matchesAny(message, RETURN_TO_TRAINING_PATTERNS)
  ) {
    return 'hard';
  }

  if (matchesAny(message, COMPLEX_FATIGUE_PATTERNS) && countSourceTerms(message) >= 2) {
    return 'hard';
  }

  return 'standard';
}

async function getHighHardUsageToday(params: {
  supabase: SupabaseClient;
  userId: string;
  highHardModel: string;
}): Promise<number | null> {
  const { data, error } = await params.supabase
    .from('ai_usage')
    .select('request_count')
    .eq('user_id', params.userId)
    .eq('usage_date', todayIsoDate())
    .eq('tier', 'high')
    .eq('model_used', params.highHardModel)
    .returns<UsageRow[]>();

  if (error) {
    console.error('[player-ai] Failed to load high-hard AI usage:', error);
    return null;
  }

  return (data ?? []).reduce((total, row) => total + (row.request_count ?? 0), 0);
}

export async function resolvePlayerAiModelRoute(params: {
  supabase: SupabaseClient;
  userId: string;
  tier: PlayerAiTier;
  message: string;
  messageRisk: PlayerAiMessageRisk;
}): Promise<PlayerAiModelRoute> {
  const taskComplexity = classifyPlayerAiTaskComplexity({
    message: params.message,
    messageRisk: params.messageRisk,
  });
  const highHardEnabled = isHighHardModelEnabled();

  if (params.tier !== 'high' || !highHardEnabled || taskComplexity !== 'hard') {
    return {
      model: getModelForPlayerTier(params.tier),
      route: 'tier_default',
      taskComplexity,
      highHardEnabled,
    };
  }

  const config = getAiLimitConfig();
  const { highHard } = getAiModelConfig();
  const usedToday = await getHighHardUsageToday({
    supabase: params.supabase,
    userId: params.userId,
    highHardModel: highHard,
  });

  if (usedToday === null || usedToday >= config.highHardDailyLimit) {
    return {
      model: getModelForPlayerTier(params.tier),
      route: 'high_hard_fallback',
      taskComplexity,
      highHardEnabled,
      highHardLimit: config.highHardDailyLimit,
      highHardUsedToday: usedToday ?? undefined,
    };
  }

  return {
    model: highHard,
    route: 'high_hard',
    taskComplexity,
    highHardEnabled,
    highHardLimit: config.highHardDailyLimit,
    highHardUsedToday: usedToday,
  };
}
