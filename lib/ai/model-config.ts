import 'server-only';

export type PlayerAiTier = 'free' | 'low' | 'high';

export type AiLimitConfig = {
  freeLifetimeMessageLimit: number;
  freeRewardedAdMessageBonus: number;
  lowDailyMessageLimit: number;
  highDailyMessageLimit: number;
  highHardDailyLimit: number;
  maxMessageChars: number;
  maxOutputTokens: number;
};

type AiModelConfig = {
  free: string;
  low: string;
  highDefault: string;
  highHard: string;
};

const REQUIRED_MODEL_ENV_VARS = {
  free: 'AI_FREE_MODEL',
  low: 'AI_LOW_MODEL',
  highDefault: 'AI_HIGH_DEFAULT_MODEL',
  highHard: 'AI_HIGH_HARD_MODEL',
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

export function isHighHardModelEnabled(): boolean {
  return process.env.AI_HIGH_HARD_MODEL_ENABLED === 'true';
}

export function getAiModelConfig(): AiModelConfig {
  return {
    free: readRequiredEnv(REQUIRED_MODEL_ENV_VARS.free),
    low: readRequiredEnv(REQUIRED_MODEL_ENV_VARS.low),
    highDefault: readRequiredEnv(REQUIRED_MODEL_ENV_VARS.highDefault),
    highHard: readRequiredEnv(REQUIRED_MODEL_ENV_VARS.highHard),
  };
}

export function getModelForPlayerTier(tier: PlayerAiTier): string {
  const config = getAiModelConfig();

  if (tier === 'low') return config.low;
  if (tier === 'high') return config.highDefault;
  return config.free;
}

export function getAiLimitConfig(): AiLimitConfig {
  return {
    freeLifetimeMessageLimit: readPositiveIntegerEnv('AI_FREE_LIFETIME_MESSAGE_LIMIT', 10),
    freeRewardedAdMessageBonus: readPositiveIntegerEnv('AI_FREE_REWARDED_AD_MESSAGE_BONUS', 10),
    lowDailyMessageLimit: readPositiveIntegerEnv('AI_LOW_DAILY_MESSAGE_LIMIT', 50),
    highDailyMessageLimit: readPositiveIntegerEnv('AI_HIGH_DAILY_MESSAGE_LIMIT', 100),
    highHardDailyLimit: readPositiveIntegerEnv('AI_HIGH_HARD_DAILY_LIMIT', 5),
    maxMessageChars: readPositiveIntegerEnv('AI_MAX_MESSAGE_CHARS', 2000),
    maxOutputTokens: readPositiveIntegerEnv('AI_MAX_OUTPUT_TOKENS', 700),
  };
}

