import 'server-only';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

type RewardedAdProvider = 'google';

type RewardedAdPayload = {
  provider?: unknown;
  verification_token?: unknown;
  transaction_id?: unknown;
};

export type RewardedAdConfig = {
  enabled: boolean;
  provider: RewardedAdProvider;
  credits: number;
  googleAdUnitId: string | null;
  googleVerificationSecretConfigured: boolean;
};

export type RewardedAdAvailability = {
  enabled: boolean;
  provider: RewardedAdProvider;
  credits: number;
  status: 'disabled' | 'setup_required' | 'verification_not_connected';
  message: string;
};

export type RewardedAdVerificationResult =
  | {
      verified: true;
      provider: RewardedAdProvider;
      transactionId: string;
    }
  | {
      verified: false;
      status: 'disabled' | 'setup_required' | 'missing_verification' | 'verification_not_connected';
      message: string;
    };

type FreeCreditBalance = {
  rewarded_ad_credits: number | null;
};

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getProvider(value: string | undefined): RewardedAdProvider {
  return value?.trim().toLowerCase() === 'google' ? 'google' : 'google';
}

export function getRewardedAdConfig(): RewardedAdConfig {
  return {
    enabled: process.env.AI_REWARDED_ADS_ENABLED === 'true',
    provider: getProvider(process.env.AI_REWARDED_AD_PROVIDER),
    credits: readPositiveIntegerEnv('AI_REWARDED_AD_CREDITS', 10),
    googleAdUnitId: process.env.GOOGLE_REWARDED_AD_UNIT_ID?.trim() || null,
    googleVerificationSecretConfigured: Boolean(
      process.env.GOOGLE_REWARDED_AD_VERIFICATION_SECRET?.trim()
    ),
  };
}

export function getRewardedAdAvailability(): RewardedAdAvailability {
  const config = getRewardedAdConfig();

  if (!config.enabled) {
    return {
      enabled: false,
      provider: config.provider,
      credits: config.credits,
      status: 'disabled',
      message: 'Rewarded ads coming soon.',
    };
  }

  if (!config.googleAdUnitId || !config.googleVerificationSecretConfigured) {
    return {
      enabled: true,
      provider: config.provider,
      credits: config.credits,
      status: 'setup_required',
      message: 'Rewarded ads are not fully configured yet.',
    };
  }

  return {
    enabled: true,
    provider: config.provider,
    credits: config.credits,
    status: 'verification_not_connected',
    message: 'Rewarded ad verification is not connected yet.',
  };
}

export function verifyRewardedAdReward(payload: RewardedAdPayload): RewardedAdVerificationResult {
  const config = getRewardedAdConfig();
  const availability = getRewardedAdAvailability();

  if (!config.enabled) {
    return {
      verified: false,
      status: 'disabled',
      message: availability.message,
    };
  }

  if (availability.status === 'setup_required') {
    return {
      verified: false,
      status: 'setup_required',
      message: availability.message,
    };
  }

  const provider = typeof payload.provider === 'string' ? payload.provider : config.provider;
  if (provider !== 'google') {
    return {
      verified: false,
      status: 'setup_required',
      message: 'Unsupported rewarded ad provider.',
    };
  }

  if (typeof payload.verification_token !== 'string' || !payload.verification_token.trim()) {
    return {
      verified: false,
      status: 'missing_verification',
      message: 'A trusted rewarded ad verification payload is required before credits can be granted.',
    };
  }

  return {
    verified: false,
    status: 'verification_not_connected',
    message: 'Rewarded ad verification is not connected yet.',
  };
}

function getServiceRoleSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service role environment variables are not configured.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function ensureFreeCreditBalance(params: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<number> {
  const { data: existing, error: readError } = await params.supabase
    .from('ai_free_message_credits')
    .select('rewarded_ad_credits')
    .eq('user_id', params.userId)
    .maybeSingle<FreeCreditBalance>();

  if (readError) throw readError;

  if (existing) {
    return existing.rewarded_ad_credits ?? 0;
  }

  const { data, error } = await params.supabase
    .from('ai_free_message_credits')
    .insert({ user_id: params.userId })
    .select('rewarded_ad_credits')
    .single<FreeCreditBalance>();

  if (error) throw error;
  return data.rewarded_ad_credits ?? 0;
}

export async function grantRewardedAdCredits(params: {
  userId: string;
  credits: number;
}): Promise<void> {
  const supabase = getServiceRoleSupabaseClient();
  const currentCredits = await ensureFreeCreditBalance({ supabase, userId: params.userId });

  const { error: updateError } = await supabase
    .from('ai_free_message_credits')
    .update({
      rewarded_ad_credits: currentCredits + params.credits,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', params.userId);

  if (updateError) throw updateError;

  const { error: grantError } = await supabase
    .from('ai_rewarded_ad_grants')
    .insert({
      user_id: params.userId,
      credits_granted: params.credits,
    });

  if (grantError) throw grantError;
}
