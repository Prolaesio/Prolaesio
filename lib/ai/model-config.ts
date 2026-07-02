import 'server-only';

export type PlayerAiTier = 'free' | 'low' | 'high';

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

export function isAiAssistantEnabled(): boolean {
  return process.env.AI_ASSISTANT_ENABLED === 'true';
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

export async function resolvePlayerAiTier(): Promise<PlayerAiTier> {
  // Subscription tiers are not implemented yet. Default every authenticated
  // player to the free tier until a real entitlement source exists.
  return 'free';
}

