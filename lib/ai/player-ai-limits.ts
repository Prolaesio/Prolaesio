import 'server-only';

import { SupabaseClient } from '@supabase/supabase-js';

import { getAiLimitConfig, PlayerAiTier } from './model-config';

export type PlayerAiLimitStatus =
  | {
      allowed: true;
      tier: PlayerAiTier;
      limit: number;
      used: number;
      remaining: number;
      rewardedAdCredits?: number;
    }
  | {
      allowed: false;
      tier: PlayerAiTier;
      status: number;
      error: string;
      code: 'free_limit_reached' | 'daily_limit_reached' | 'limit_check_failed';
      limit?: number;
      used?: number;
      remaining?: number;
      rewardedAdCredits?: number;
      rewardedAdBonus?: number;
    };

type FreeCreditBalance = {
  lifetime_free_used: number | null;
  rewarded_ad_credits: number | null;
};

type UsageRow = {
  request_count: number | null;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function sumRequestCount(rows: UsageRow[] | null): number {
  return (rows ?? []).reduce((total, row) => total + (row.request_count ?? 0), 0);
}

async function getFreeCreditBalance(params: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<{ lifetimeFreeUsed: number; rewardedAdCredits: number } | null> {
  const { data, error } = await params.supabase
    .from('ai_free_message_credits')
    .select('lifetime_free_used, rewarded_ad_credits')
    .eq('user_id', params.userId)
    .maybeSingle<FreeCreditBalance>();

  if (error) {
    console.error('[player-ai] Failed to load free AI credit balance:', error);
    return null;
  }

  return {
    lifetimeFreeUsed: data?.lifetime_free_used ?? 0,
    rewardedAdCredits: data?.rewarded_ad_credits ?? 0,
  };
}

async function getDailyUsageCount(params: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<number | null> {
  const { data, error } = await params.supabase
    .from('ai_usage')
    .select('request_count')
    .eq('user_id', params.userId)
    .eq('usage_date', todayIsoDate())
    .returns<UsageRow[]>();

  if (error) {
    console.error('[player-ai] Failed to load daily AI usage:', error);
    return null;
  }

  return sumRequestCount(data);
}

export async function checkPlayerAiLimit(params: {
  supabase: SupabaseClient;
  userId: string;
  tier: PlayerAiTier;
}): Promise<PlayerAiLimitStatus> {
  const config = getAiLimitConfig();

  if (params.tier === 'free') {
    const balance = await getFreeCreditBalance(params);

    if (!balance) {
      return {
        allowed: false,
        tier: params.tier,
        status: 503,
        error: 'Unable to check your AI message balance right now. Please try again soon.',
        code: 'limit_check_failed',
      };
    }

    const includedRemaining = Math.max(
      config.freeLifetimeMessageLimit - balance.lifetimeFreeUsed,
      0
    );
    const remaining = includedRemaining + balance.rewardedAdCredits;

    if (remaining <= 0) {
      return {
        allowed: false,
        tier: params.tier,
        status: 429,
        error:
          'You have used your free Lodario AI messages. Watch ad rewards for extra messages are coming soon.',
        code: 'free_limit_reached',
        limit: config.freeLifetimeMessageLimit,
        used: balance.lifetimeFreeUsed,
        remaining: 0,
        rewardedAdCredits: balance.rewardedAdCredits,
        rewardedAdBonus: config.freeRewardedAdMessageBonus,
      };
    }

    return {
      allowed: true,
      tier: params.tier,
      limit: config.freeLifetimeMessageLimit,
      used: balance.lifetimeFreeUsed,
      remaining,
      rewardedAdCredits: balance.rewardedAdCredits,
    };
  }

  const dailyUsage = await getDailyUsageCount(params);

  if (dailyUsage === null) {
    return {
      allowed: false,
      tier: params.tier,
      status: 503,
      error: 'Unable to check today\'s AI usage right now. Please try again soon.',
      code: 'limit_check_failed',
    };
  }

  const limit =
    params.tier === 'high' ? config.highDailyMessageLimit : config.lowDailyMessageLimit;
  const remaining = Math.max(limit - dailyUsage, 0);

  if (remaining <= 0) {
    return {
      allowed: false,
      tier: params.tier,
      status: 429,
      error: 'You have reached today\'s Lodario AI message limit. Try again tomorrow.',
      code: 'daily_limit_reached',
      limit,
      used: dailyUsage,
      remaining: 0,
    };
  }

  return {
    allowed: true,
    tier: params.tier,
    limit,
    used: dailyUsage,
    remaining,
  };
}

export async function consumePlayerAiMessage(params: {
  supabase: SupabaseClient;
  userId: string;
  tier: PlayerAiTier;
}): Promise<boolean> {
  if (params.tier !== 'free') {
    return true;
  }

  const config = getAiLimitConfig();
  const { data, error } = await params.supabase.rpc('consume_player_ai_free_message', {
    p_user_id: params.userId,
    p_lifetime_limit: config.freeLifetimeMessageLimit,
  });

  if (error) {
    console.error('[player-ai] Failed to consume free AI message credit:', error);
    return false;
  }

  return data === true;
}
