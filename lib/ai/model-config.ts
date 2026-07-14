import 'server-only';

export type PlayerAiTier = 'free' | 'pro' | 'premium';

export type AiLimitConfig = {
  freeLifetimeMessageLimit: number;
  freeRewardedAdMessageBonus: number;
  proDailyMessageLimit: number;
  premiumDailyMessageLimit: number;
  premiumSolDailyLimit: number;
  premiumSolRolling30DayLimit: number;
  premiumSolMaxOutputTokens: number;
  maxMessageChars: number;
  maxOutputTokens: number;
};

type AiModelConfig = {
  free: string;
  pro: string;
  premium: string;
  premiumExceptional: string;
};

const REQUIRED_MODEL_ENV_VARS = {
  free: 'AI_FREE_MODEL',
  pro: 'AI_PRO_MODEL',
  premium: 'AI_PREMIUM_MODEL',
  premiumExceptional: 'AI_PREMIUM_EXCEPTIONAL_MODEL',
} as const;

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

export function isAiAssistantEnabled(): boolean {
  return process.env.AI_ASSISTANT_ENABLED === 'true' && !isGlobalAiAssistantDisabled();
}

export function isGlobalAiAssistantDisabled(): boolean {
  return process.env.AI_GLOBAL_ASSISTANT_DISABLED === 'true';
}

export function isPremiumSolModelEnabled(): boolean {
  return process.env.AI_PREMIUM_SOL_MODEL_ENABLED === 'true';
}

export function getAiModelConfig(): AiModelConfig {
  return {
    free: readRequiredEnv(REQUIRED_MODEL_ENV_VARS.free),
    pro: readRequiredEnv(REQUIRED_MODEL_ENV_VARS.pro),
    premium: readRequiredEnv(REQUIRED_MODEL_ENV_VARS.premium),
    premiumExceptional: readRequiredEnv(REQUIRED_MODEL_ENV_VARS.premiumExceptional),
  };
}

export function getModelForPlayerTier(tier: PlayerAiTier): string {
  const config = getAiModelConfig();

  if (tier === 'pro') return config.pro;
  if (tier === 'premium') return config.premium;
  return config.free;
}

export function getPlayerAiTierLabel(tier: PlayerAiTier): 'Free' | 'Pro' | 'Premium' {
  if (tier === 'pro') return 'Pro';
  if (tier === 'premium') return 'Premium';
  return 'Free';
}

export function getDefaultModelLabelForPlayerTier(
  tier: PlayerAiTier
): 'GPT-5 Nano' | 'GPT-5.6 Luna' | 'GPT-5.6 Terra' {
  if (tier === 'pro') return 'GPT-5.6 Luna';
  if (tier === 'premium') return 'GPT-5.6 Terra';
  return 'GPT-5 Nano';
}

export function getAiLimitConfig(): AiLimitConfig {
  return {
    freeLifetimeMessageLimit: readPositiveIntegerEnv('AI_FREE_LIFETIME_MESSAGE_LIMIT', 10),
    freeRewardedAdMessageBonus: readPositiveIntegerEnv('AI_FREE_REWARDED_AD_MESSAGE_BONUS', 10),
    proDailyMessageLimit: readPositiveIntegerEnv('AI_PRO_DAILY_MESSAGE_LIMIT', 50),
    premiumDailyMessageLimit: readPositiveIntegerEnv('AI_PREMIUM_DAILY_MESSAGE_LIMIT', 100),
    premiumSolDailyLimit: readPositiveIntegerEnv('AI_PREMIUM_SOL_DAILY_LIMIT', 1),
    premiumSolRolling30DayLimit: readPositiveIntegerEnv('AI_PREMIUM_SOL_ROLLING_30_DAY_LIMIT', 3),
    premiumSolMaxOutputTokens: readPositiveIntegerEnv('AI_PREMIUM_SOL_MAX_OUTPUT_TOKENS', 1800),
    maxMessageChars: readPositiveIntegerEnv('AI_MAX_MESSAGE_CHARS', 2000),
    maxOutputTokens: readPositiveIntegerEnv('AI_MAX_OUTPUT_TOKENS', 700),
  };
}
