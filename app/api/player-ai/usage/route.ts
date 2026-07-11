import { NextRequest, NextResponse } from 'next/server';

import { getPlayerAiUsageStatus } from '@/lib/ai/player-ai-limits';
import { requirePlayerAiContext } from '@/lib/ai/player-ai-auth';
import { resolvePlayerAiTier } from '@/lib/ai/player-ai-tier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function logUsageStatus(usage: NonNullable<Awaited<ReturnType<typeof getPlayerAiUsageStatus>>>): void {
  if (process.env.NODE_ENV !== 'development') return;

  console.info('[player-ai] Usage status:', {
    tier: usage.tier,
    limit: usage.limit,
    used: usage.used,
    rewardedAdCredits: usage.rewardedAdCredits,
    remaining: usage.remaining,
  });
}

export async function GET(request: NextRequest) {
  let authResult: Awaited<ReturnType<typeof requirePlayerAiContext>>;
  try {
    authResult = await requirePlayerAiContext(request);
  } catch (error) {
    console.error('[player-ai] Usage auth setup failed:', error);
    return NextResponse.json({ error: 'Authentication is not configured.' }, { status: 500 });
  }

  if (!authResult.ok) {
    return authResult.response;
  }

  const { supabase, user } = authResult.context;
  const tier = await resolvePlayerAiTier({ supabase, userId: user.id });
  const usage = await getPlayerAiUsageStatus({ supabase, userId: user.id, tier });

  if (!usage) {
    return NextResponse.json(
      { error: 'Unable to load your AI message balance right now.' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }

  logUsageStatus(usage);

  return NextResponse.json(
    { usage },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
