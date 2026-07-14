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

export type PlayerAiUsageStatus = {
  tier: PlayerAiTier;
  limitType: 'lifetime' | 'daily';
  limit: number;
  used: number;
  remaining: number;
  rewardedAdCredits?: number;
  rewardedAdBonus?: number;
};

export type PlayerAiMessageReservation =
  | {
      allowed: true;
      reservationId: string;
      tier: PlayerAiTier;
      limit: number;
      used: number;
      remaining: number;
      rewardedAdCredits?: number;
      freeCreditSource?: 'lifetime' | 'rewarded';
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

type ReservationRow = {
  id: string;
};

type ReservationRpcRow = {
  reservation_id: string | null;
  allowed: boolean | null;
  code: string | null;
  limit_value: number | null;
  used_count: number | null;
  remaining_count: number | null;
  rewarded_ad_credits: number | null;
  free_credit_source: string | null;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
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

async function getDailyReservationCount(params: {
  supabase: SupabaseClient;
  userId: string;
  tier: PlayerAiTier;
}): Promise<number | null> {
  const { data, error } = await params.supabase
    .from('ai_usage_reservations')
    .select('id')
    .eq('user_id', params.userId)
    .eq('usage_date', todayIsoDate())
    .eq('tier', params.tier)
    .in('status', ['reserved', 'succeeded'])
    .returns<ReservationRow[]>();

  if (error) {
    console.error('[player-ai] Failed to load daily AI reservations:', error);
    return null;
  }

  return (data ?? []).length;
}

function getDailyLimitForTier(tier: PlayerAiTier): number {
  const config = getAiLimitConfig();
  return tier === 'premium' ? config.premiumDailyMessageLimit : config.proDailyMessageLimit;
}

function getReservationErrorForTier(tier: PlayerAiTier): string {
  if (tier === 'free') {
    return 'You have used your free Lodario AI messages. Watch ad rewards for extra messages are coming soon.';
  }

  return 'You have reached today\'s Lodario AI message limit. Try again tomorrow.';
}

function normalizeFreeCreditSource(value: string | null): 'lifetime' | 'rewarded' | undefined {
  if (value === 'lifetime' || value === 'rewarded') return value;
  return undefined;
}

function logReservationEvent(params: {
  tier: PlayerAiTier;
  limit?: number;
  used?: number;
  remaining?: number;
  reserved?: boolean;
  refundedOrReleased?: boolean;
  reservationId?: string;
}): void {
  if (process.env.NODE_ENV !== 'development') return;

  console.info('[player-ai] Usage reservation:', params);
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
        error: getReservationErrorForTier(params.tier),
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

  const dailyUsage = await getDailyReservationCount(params);

  if (dailyUsage === null) {
    return {
      allowed: false,
      tier: params.tier,
      status: 503,
      error: 'Unable to check today\'s AI usage right now. Please try again soon.',
      code: 'limit_check_failed',
    };
  }

  const limit = getDailyLimitForTier(params.tier);
  const remaining = Math.max(limit - dailyUsage, 0);

  if (remaining <= 0) {
    return {
      allowed: false,
      tier: params.tier,
      status: 429,
      error: getReservationErrorForTier(params.tier),
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

export async function getPlayerAiUsageStatus(params: {
  supabase: SupabaseClient;
  userId: string;
  tier: PlayerAiTier;
}): Promise<PlayerAiUsageStatus | null> {
  const config = getAiLimitConfig();

  if (params.tier === 'free') {
    const balance = await getFreeCreditBalance(params);
    if (!balance) return null;

    const includedRemaining = Math.max(
      config.freeLifetimeMessageLimit - balance.lifetimeFreeUsed,
      0
    );
    const remaining = includedRemaining + balance.rewardedAdCredits;

    return {
      tier: params.tier,
      limitType: 'lifetime',
      limit: config.freeLifetimeMessageLimit,
      used: balance.lifetimeFreeUsed,
      remaining,
      rewardedAdCredits: balance.rewardedAdCredits,
      rewardedAdBonus: config.freeRewardedAdMessageBonus,
    };
  }

  const dailyUsage = await getDailyReservationCount(params);
  if (dailyUsage === null) return null;

  const limit = getDailyLimitForTier(params.tier);

  return {
    tier: params.tier,
    limitType: 'daily',
    limit,
    used: dailyUsage,
    remaining: Math.max(limit - dailyUsage, 0),
  };
}

export async function reservePlayerAiMessage(params: {
  supabase: SupabaseClient;
  userId: string;
  tier: PlayerAiTier;
}): Promise<PlayerAiMessageReservation> {
  const config = getAiLimitConfig();
  const dailyLimit = params.tier === 'free' ? 0 : getDailyLimitForTier(params.tier);
  const { data, error } = await params.supabase
    .rpc('reserve_player_ai_message', {
      p_user_id: params.userId,
      p_tier: params.tier,
      p_free_lifetime_limit: config.freeLifetimeMessageLimit,
      p_daily_limit: dailyLimit,
    })
    .returns<ReservationRpcRow[]>();

  if (error) {
    console.error('[player-ai] Failed to reserve AI message usage:', error);
    return {
      allowed: false,
      tier: params.tier,
      status: 503,
      error: 'Unable to reserve your AI message allowance right now. Please try again soon.',
      code: 'limit_check_failed',
    };
  }

  const rows = Array.isArray(data) ? (data as ReservationRpcRow[]) : [];
  const result = rows[0];
  const code = result?.code === 'daily_limit_reached' || result?.code === 'free_limit_reached'
    ? result.code
    : 'limit_check_failed';
  const limit = result?.limit_value ?? undefined;
  const used = result?.used_count ?? undefined;
  const remaining = result?.remaining_count ?? undefined;
  const rewardedAdCredits = result?.rewarded_ad_credits ?? undefined;

  if (!result?.allowed || !result.reservation_id) {
    return {
      allowed: false,
      tier: params.tier,
      status: code === 'limit_check_failed' ? 503 : 429,
      error: code === 'limit_check_failed'
        ? 'Unable to reserve your AI message allowance right now. Please try again soon.'
        : getReservationErrorForTier(params.tier),
      code,
      limit,
      used,
      remaining,
      rewardedAdCredits,
      rewardedAdBonus: params.tier === 'free' ? config.freeRewardedAdMessageBonus : undefined,
    };
  }

  logReservationEvent({
    tier: params.tier,
    limit,
    used,
    remaining,
    reserved: true,
    reservationId: result.reservation_id,
  });

  return {
    allowed: true,
    reservationId: result.reservation_id,
    tier: params.tier,
    limit: limit ?? (params.tier === 'free' ? config.freeLifetimeMessageLimit : dailyLimit),
    used: used ?? 0,
    remaining: remaining ?? 0,
    rewardedAdCredits,
    freeCreditSource: normalizeFreeCreditSource(result.free_credit_source),
  };
}

export async function completePlayerAiReservation(params: {
  supabase: SupabaseClient;
  userId: string;
  tier: PlayerAiTier;
  reservationId: string;
  success: boolean;
}): Promise<boolean> {
  const { data, error } = await params.supabase.rpc('complete_player_ai_message_reservation', {
    p_user_id: params.userId,
    p_reservation_id: params.reservationId,
    p_success: params.success,
  });

  if (error) {
    console.error('[player-ai] Failed to complete AI usage reservation:', error);
    return false;
  }

  logReservationEvent({
    tier: params.tier,
    refundedOrReleased: !params.success,
    reserved: params.success,
    reservationId: params.reservationId,
  });

  return data === true;
}
