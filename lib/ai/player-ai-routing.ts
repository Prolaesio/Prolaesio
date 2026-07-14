import 'server-only';

import { SupabaseClient } from '@supabase/supabase-js';

import {
  getAiLimitConfig,
  getAiModelConfig,
  getDefaultModelLabelForPlayerTier,
  getModelForPlayerTier,
  isPremiumSolModelEnabled,
  PlayerAiTier,
} from './model-config';
import { PlayerAiMessageRisk } from './player-ai-safety';

export type PlayerAiTaskComplexity = 'standard' | 'exceptional';
export type PlayerAiExceptionalReason =
  | 'long_term_programme'
  | 'multi_week_analysis'
  | 'deep_research';

export type PlayerAiModelRoute = {
  model: string;
  modelLabel: 'GPT-5 Nano' | 'GPT-5.6 Luna' | 'GPT-5.6 Terra' | 'GPT-5.6 Sol';
  reasoningEffort: 'low' | 'high';
  maxOutputTokens?: number;
  route: 'tier_default' | 'premium_exceptional' | 'premium_exceptional_fallback';
  taskComplexity: PlayerAiTaskComplexity;
  exceptionalReason?: PlayerAiExceptionalReason;
  premiumSolEnabled: boolean;
  premiumSolDailyLimit?: number;
  premiumSolUsedToday?: number;
  premiumSolRolling30DayLimit?: number;
  premiumSolUsedRolling30Days?: number;
};

type UsageRow = {
  usage_date: string;
  request_count: number | null;
};

const LONG_HORIZON_PATTERNS = [
  /\b(?:[6-9]|[1-9]\d+)\s*[- ]?(?:week|wk)s?\b/i,
  /\b(?:[2-9]|[1-9]\d+)\s*[- ]?months?\b/i,
  /\b(?:long[-\s]?term|season[-\s]?long|full\s+season|rest\s+of\s+the\s+season)\b/i,
];

const PROGRAMME_PATTERNS = [
  /\b(?:build|create|design|develop|make|periodi[sz]e|structure)\b.*\b(?:programme|program|training\s+plan|periodi[sz]ation|season\s+plan)\b/i,
  /\b(?:programme|program|training\s+plan|periodi[sz]ation|season\s+plan)\b.*\b(?:build|create|design|develop|make|periodi[sz]e|structure)\b/i,
];

const ANALYSIS_PATTERNS = [
  /\b(?:analy[sz]e|compare|correlate|evaluate|investigate|review)\b.*\b(?:data|logs?|trends?|patterns?|history|progress)\b/i,
  /\b(?:data|logs?|trends?|patterns?|history|progress)\b.*\b(?:analy[sz]e|compare|correlate|evaluate|investigate|review)\b/i,
];

const DEEP_RESEARCH_PATTERNS = [
  /\b(?:deep|extensive|comprehensive|thorough)\s+(?:research|evidence\s+review|literature\s+review)\b/i,
  /\b(?:research|review)\b.*\b(?:peer[-\s]?reviewed|scientific\s+studies|academic\s+sources|systematic\s+review|meta[-\s]?analysis)\b/i,
];

const ORDINARY_REQUEST_PATTERNS = [
  /^\s*(?:explain|summari[sz]e)\s+my\s+(?:readiness|week)\s*\??\s*$/i,
  /^\s*(?:should\s+i|can\s+i)\s+(?:train|run|lift|sprint|rest)(?:\s+hard)?\s+today\s*\??\s*$/i,
  /^\s*(?:give|make)\s+me\s+(?:a\s+)?(?:light|easy|hard|gym|running|recovery)\s+(?:session|workout)\s*\??\s*$/i,
  /^\s*why\s+am\s+i\s+(?:tired|sore|fatigued)\s*\??\s*$/i,
];

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function rolling30DayStartIsoDate(): string {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 29);
  return start.toISOString().slice(0, 10);
}

function matchesAny(message: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(message));
}

function countSourceTerms(message: string): number {
  const terms = [
    /\breadiness\b/i,
    /\bwellness\b/i,
    /\btraining\s+load\b|\bload\b/i,
    /\brpe\b|\bintensity\b/i,
    /\bsleep\b/i,
    /\bcalendar\b|\bschedule\b/i,
    /\bmatches?\b|\bfixtures?\b/i,
    /\bgym\b|\bstrength\b/i,
    /\bschool\b|\bwork\b/i,
    /\bsoreness\b|\bfatigue\b|\bpain\b|\binjur/i,
    /\bsprints?\b|\brunning\b|\bconditioning\b/i,
  ];

  return terms.filter(term => term.test(message)).length;
}

function countProgrammeConstraints(message: string): number {
  const terms = [
    /\bmatches?\b|\bfixtures?\b/i,
    /\bcalendar\b|\bschedule\b/i,
    /\bgym\b|\bstrength\b/i,
    /\bschool\b|\bwork\b/i,
    /\bsoreness\b|\bfatigue\b|\bpain\b|\binjur/i,
    /\btraining\s+load\b|\bload\b/i,
    /\brecovery\b|\brest\b/i,
    /\bprogress(?:ion|ive)?\b|\bperiodi[sz]ation\b/i,
    /\bposition\b|\bwinger\b|\bstriker\b|\bmidfielder\b|\bdefender\b|\bgoalkeeper\b/i,
  ];

  return terms.filter(term => term.test(message)).length;
}

export function getPlayerAiExceptionalReason(params: {
  message: string;
  messageRisk: PlayerAiMessageRisk;
}): PlayerAiExceptionalReason | null {
  const message = params.message.trim();

  if (!message || matchesAny(message, ORDINARY_REQUEST_PATTERNS)) {
    return null;
  }

  const hasLongHorizon = matchesAny(message, LONG_HORIZON_PATTERNS);
  const sourceTermCount = countSourceTerms(message);
  const programmeConstraintCount = countProgrammeConstraints(message);

  if (
    hasLongHorizon &&
    matchesAny(message, PROGRAMME_PATTERNS) &&
    programmeConstraintCount >= 3 &&
    params.messageRisk !== 'pain_or_injury'
  ) {
    return 'long_term_programme';
  }

  if (
    hasLongHorizon &&
    matchesAny(message, ANALYSIS_PATTERNS) &&
    sourceTermCount >= 3
  ) {
    return 'multi_week_analysis';
  }

  if (
    message.length >= 100 &&
    matchesAny(message, DEEP_RESEARCH_PATTERNS) &&
    /\b(?:compare|evidence|sources?|studies|trade[-\s]?offs?|recommendations?)\b/i.test(message)
  ) {
    return 'deep_research';
  }

  return null;
}

export function classifyPlayerAiTaskComplexity(params: {
  message: string;
  messageRisk: PlayerAiMessageRisk;
}): PlayerAiTaskComplexity {
  return getPlayerAiExceptionalReason(params) ? 'exceptional' : 'standard';
}

async function getPremiumSolUsage(params: {
  supabase: SupabaseClient;
  userId: string;
  premiumSolModel: string;
}): Promise<{ today: number; rolling30Days: number } | null> {
  const { data, error } = await params.supabase
    .from('ai_usage')
    .select('usage_date, request_count')
    .eq('user_id', params.userId)
    .eq('tier', 'premium')
    .eq('model_used', params.premiumSolModel)
    .gte('usage_date', rolling30DayStartIsoDate())
    .returns<UsageRow[]>();

  if (error) {
    console.error('[player-ai] Failed to load Premium Sol usage:', error);
    return null;
  }

  const today = todayIsoDate();
  return (data ?? []).reduce(
    (usage, row) => {
      const count = row.request_count ?? 0;
      usage.rolling30Days += count;
      if (row.usage_date === today) usage.today += count;
      return usage;
    },
    { today: 0, rolling30Days: 0 }
  );
}

export async function resolvePlayerAiModelRoute(params: {
  supabase: SupabaseClient;
  userId: string;
  tier: PlayerAiTier;
  message: string;
  messageRisk: PlayerAiMessageRisk;
}): Promise<PlayerAiModelRoute> {
  const exceptionalReason = getPlayerAiExceptionalReason({
    message: params.message,
    messageRisk: params.messageRisk,
  });
  const taskComplexity: PlayerAiTaskComplexity = exceptionalReason ? 'exceptional' : 'standard';
  const premiumSolEnabled = isPremiumSolModelEnabled();

  if (params.tier !== 'premium' || !premiumSolEnabled || !exceptionalReason) {
    return {
      model: getModelForPlayerTier(params.tier),
      modelLabel: getDefaultModelLabelForPlayerTier(params.tier),
      reasoningEffort: 'low',
      route: 'tier_default',
      taskComplexity,
      exceptionalReason: exceptionalReason ?? undefined,
      premiumSolEnabled,
    };
  }

  const limits = getAiLimitConfig();
  const { premiumExceptional } = getAiModelConfig();
  const usage = await getPremiumSolUsage({
    supabase: params.supabase,
    userId: params.userId,
    premiumSolModel: premiumExceptional,
  });
  const overDailyLimit = usage !== null && usage.today >= limits.premiumSolDailyLimit;
  const overRollingLimit =
    usage !== null && usage.rolling30Days >= limits.premiumSolRolling30DayLimit;

  if (usage === null || overDailyLimit || overRollingLimit) {
    return {
      model: getModelForPlayerTier(params.tier),
      modelLabel: getDefaultModelLabelForPlayerTier(params.tier),
      reasoningEffort: 'low',
      route: 'premium_exceptional_fallback',
      taskComplexity,
      exceptionalReason,
      premiumSolEnabled,
      premiumSolDailyLimit: limits.premiumSolDailyLimit,
      premiumSolUsedToday: usage?.today,
      premiumSolRolling30DayLimit: limits.premiumSolRolling30DayLimit,
      premiumSolUsedRolling30Days: usage?.rolling30Days,
    };
  }

  return {
    model: premiumExceptional,
    modelLabel: 'GPT-5.6 Sol',
    reasoningEffort: 'high',
    maxOutputTokens: limits.premiumSolMaxOutputTokens,
    route: 'premium_exceptional',
    taskComplexity,
    exceptionalReason,
    premiumSolEnabled,
    premiumSolDailyLimit: limits.premiumSolDailyLimit,
    premiumSolUsedToday: usage.today,
    premiumSolRolling30DayLimit: limits.premiumSolRolling30DayLimit,
    premiumSolUsedRolling30Days: usage.rolling30Days,
  };
}
