import 'server-only';

import { SupabaseClient } from '@supabase/supabase-js';

import { PlayerAiTier } from './model-config';

function isPlayerAiTier(value: unknown): value is PlayerAiTier {
  return value === 'free' || value === 'low' || value === 'high';
}

export async function resolvePlayerAiTier(params: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<PlayerAiTier> {
  const { data, error } = await params.supabase
    .from('ai_entitlements')
    .select('tier')
    .eq('user_id', params.userId)
    .maybeSingle();

  if (error) {
    console.error('[player-ai] Entitlement lookup failed:', error);
    return 'free';
  }

  return isPlayerAiTier(data?.tier) ? data.tier : 'free';
}

