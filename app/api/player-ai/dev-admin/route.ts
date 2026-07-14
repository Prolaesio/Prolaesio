import { timingSafeEqual } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { PlayerAiTier } from '@/lib/ai/model-config';
import { getPlayerAiUsageStatus } from '@/lib/ai/player-ai-limits';
import { resolvePlayerAiTier } from '@/lib/ai/player-ai-tier';
import { UUID_PATTERN } from '@/lib/ai/player-ai-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DevAdminPayload = {
  action?: unknown;
  user_id?: unknown;
  tier?: unknown;
  credits?: unknown;
  reset_rewarded_ad_credits?: unknown;
};

type EntitlementRow = {
  tier: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type FreeCreditRow = {
  lifetime_free_used: number | null;
  rewarded_ad_credits: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type UsageRow = {
  id: string;
  usage_date: string;
  tier: string;
  model_used: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  request_count: number;
  created_at: string;
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function isPlayerAiTier(value: unknown): value is PlayerAiTier {
  return value === 'free' || value === 'pro' || value === 'premium';
}

function safeTokenEquals(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function forbidden(status = 404) {
  return NextResponse.json({ error: 'Not found.' }, { status });
}

function assertDevAdminAccess(request: NextRequest): NextResponse<{ error: string }> | null {
  if (process.env.NODE_ENV !== 'development') {
    return forbidden();
  }

  if (process.env.AI_DEV_ADMIN_ENABLED !== 'true') {
    return forbidden();
  }

  if (!LOCAL_HOSTS.has(request.nextUrl.hostname)) {
    return forbidden();
  }

  const expectedToken = process.env.AI_DEV_ADMIN_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json(
      { error: 'AI_DEV_ADMIN_TOKEN is not configured.' },
      { status: 500 }
    );
  }

  const actualToken =
    request.headers.get('x-ai-dev-admin-token')?.trim() ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();

  if (!actualToken || !safeTokenEquals(actualToken, expectedToken)) {
    return NextResponse.json({ error: 'Dev admin token required.' }, { status: 401 });
  }

  return null;
}

function getAdminSupabaseClient(): SupabaseClient {
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

function normalizeUserId(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function getCredits(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1000) return null;
  return parsed;
}

async function ensureFreeCreditRow(supabase: SupabaseClient, userId: string): Promise<FreeCreditRow | null> {
  const { data: existing, error: readError } = await supabase
    .from('ai_free_message_credits')
    .select('lifetime_free_used, rewarded_ad_credits, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle<FreeCreditRow>();

  if (readError) {
    throw readError;
  }

  if (existing) return existing;

  const { data, error } = await supabase
    .from('ai_free_message_credits')
    .insert({ user_id: userId })
    .select('lifetime_free_used, rewarded_ad_credits, created_at, updated_at')
    .single<FreeCreditRow>();

  if (error) {
    throw error;
  }

  return data;
}

async function getCount(
  supabase: SupabaseClient,
  table: string,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) throw error;
  return count ?? 0;
}

async function getFilteredConversationCount(params: {
  supabase: SupabaseClient;
  userId: string;
  favoriteOnly?: boolean;
  updatedAfter?: string;
}): Promise<number> {
  let query = params.supabase
    .from('ai_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', params.userId);

  if (params.favoriteOnly) {
    query = query.eq('is_favorite', true);
  }

  if (params.updatedAfter) {
    query = query.gte('updated_at', params.updatedAfter);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function buildUserAiAdminSummary(supabase: SupabaseClient, userId: string) {
  const tier = await resolvePlayerAiTier({ supabase, userId });
  const usageStatus = await getPlayerAiUsageStatus({ supabase, userId, tier });

  const { data: entitlement, error: entitlementError } = await supabase
    .from('ai_entitlements')
    .select('tier, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle<EntitlementRow>();

  if (entitlementError) throw entitlementError;

  const freeCredits = await ensureFreeCreditRow(supabase, userId);

  const { data: recentUsage, error: usageError } = await supabase
    .from('ai_usage')
    .select('id, usage_date, tier, model_used, input_tokens, output_tokens, total_tokens, request_count, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)
    .returns<UsageRow[]>();

  if (usageError) throw usageError;

  const recentCutoff = new Date();
  recentCutoff.setDate(recentCutoff.getDate() - 3);

  const [conversationCount, recentConversationCount, favoriteConversationCount] = await Promise.all([
    getCount(supabase, 'ai_conversations', userId),
    getFilteredConversationCount({
      supabase,
      userId,
      updatedAfter: recentCutoff.toISOString(),
    }),
    getFilteredConversationCount({
      supabase,
      userId,
      favoriteOnly: true,
    }),
  ]);

  return {
    user_id: userId,
    entitlement: {
      resolved_tier: tier,
      stored_tier: entitlement?.tier ?? null,
      created_at: entitlement?.created_at ?? null,
      updated_at: entitlement?.updated_at ?? null,
    },
    usage_status: usageStatus,
    free_credits: {
      lifetime_free_used: freeCredits?.lifetime_free_used ?? 0,
      rewarded_ad_credits: freeCredits?.rewarded_ad_credits ?? 0,
      created_at: freeCredits?.created_at ?? null,
      updated_at: freeCredits?.updated_at ?? null,
    },
    recent_usage_rows: recentUsage ?? [],
    conversations: {
      total_count: conversationCount,
      recent_3_day_count: recentConversationCount,
      favorite_count: favoriteConversationCount,
    },
  };
}

export async function GET(request: NextRequest) {
  const accessError = assertDevAdminAccess(request);
  if (accessError) return accessError;

  const userId = normalizeUserId(request.nextUrl.searchParams.get('user_id'));
  if (!userId) {
    return NextResponse.json({ error: 'Valid user_id query parameter is required.' }, { status: 400 });
  }

  try {
    const supabase = getAdminSupabaseClient();
    const summary = await buildUserAiAdminSummary(supabase, userId);
    return NextResponse.json(summary, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('[player-ai] Dev admin lookup failed:', error);
    return NextResponse.json({ error: 'Unable to load AI admin summary.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const accessError = assertDevAdminAccess(request);
  if (accessError) return accessError;

  let payload: DevAdminPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const userId = normalizeUserId(payload.user_id);
  if (!userId) {
    return NextResponse.json({ error: 'Valid user_id is required.' }, { status: 400 });
  }

  const action = typeof payload.action === 'string' ? payload.action : '';

  try {
    const supabase = getAdminSupabaseClient();

    if (action === 'set_tier') {
      if (!isPlayerAiTier(payload.tier)) {
        return NextResponse.json({ error: 'tier must be free, pro, or premium.' }, { status: 400 });
      }

      const { error } = await supabase
        .from('ai_entitlements')
        .upsert(
          {
            user_id: userId,
            tier: payload.tier,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      if (error) throw error;
    } else if (action === 'reset_free_usage') {
      await ensureFreeCreditRow(supabase, userId);

      const updatePayload: {
        lifetime_free_used: number;
        updated_at: string;
        rewarded_ad_credits?: number;
      } = {
        lifetime_free_used: 0,
        updated_at: new Date().toISOString(),
      };

      if (payload.reset_rewarded_ad_credits === true) {
        updatePayload.rewarded_ad_credits = 0;
      }

      const { error } = await supabase
        .from('ai_free_message_credits')
        .update(updatePayload)
        .eq('user_id', userId);

      if (error) throw error;
    } else if (action === 'add_rewarded_test_credits') {
      const credits = getCredits(payload.credits);
      if (!credits) {
        return NextResponse.json({ error: 'credits must be a positive integer up to 1000.' }, { status: 400 });
      }

      const balance = await ensureFreeCreditRow(supabase, userId);
      const nextCredits = (balance?.rewarded_ad_credits ?? 0) + credits;

      const { error: updateError } = await supabase
        .from('ai_free_message_credits')
        .update({
          rewarded_ad_credits: nextCredits,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (updateError) throw updateError;

      const { error: grantError } = await supabase
        .from('ai_rewarded_ad_grants')
        .insert({
          user_id: userId,
          credits_granted: credits,
        });

      if (grantError) throw grantError;
    } else {
      return NextResponse.json(
        { error: 'action must be set_tier, reset_free_usage, or add_rewarded_test_credits.' },
        { status: 400 }
      );
    }

    const summary = await buildUserAiAdminSummary(supabase, userId);
    return NextResponse.json(
      {
        ok: true,
        action,
        summary,
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('[player-ai] Dev admin action failed:', error);
    return NextResponse.json({ error: 'Unable to complete AI dev admin action.' }, { status: 500 });
  }
}
