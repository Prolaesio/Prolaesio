import { NextRequest, NextResponse } from 'next/server';

import { getPlayerAiUsageStatus } from '@/lib/ai/player-ai-limits';
import { requirePlayerAiContext } from '@/lib/ai/player-ai-auth';
import { resolvePlayerAiTier } from '@/lib/ai/player-ai-tier';
import {
  getRewardedAdAvailability,
  getRewardedAdConfig,
  grantRewardedAdCredits,
  verifyRewardedAdReward,
} from '@/lib/ai/rewarded-ads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RewardedAdPayload = {
  provider?: unknown;
  verification_token?: unknown;
  transaction_id?: unknown;
};

function statusForVerificationFailure(status: string): number {
  if (status === 'disabled') return 503;
  if (status === 'setup_required' || status === 'verification_not_connected') return 503;
  return 400;
}

export async function GET(request: NextRequest) {
  const authResult = await requirePlayerAiContext(request);
  if (!authResult.ok) return authResult.response;

  return NextResponse.json(
    {
      availability: getRewardedAdAvailability(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}

export async function POST(request: NextRequest) {
  const authResult = await requirePlayerAiContext(request);
  if (!authResult.ok) return authResult.response;

  let payload: RewardedAdPayload;
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const { supabase, user } = authResult.context;
  const tier = await resolvePlayerAiTier({ supabase, userId: user.id });

  if (tier !== 'free') {
    return NextResponse.json(
      {
        error: 'Rewarded AI message credits are only available for free players.',
        availability: getRewardedAdAvailability(),
      },
      { status: 403 }
    );
  }

  const verification = verifyRewardedAdReward(payload);
  if (!verification.verified) {
    return NextResponse.json(
      {
        error: verification.message,
        status: verification.status,
        availability: getRewardedAdAvailability(),
        credits_granted: 0,
      },
      { status: statusForVerificationFailure(verification.status) }
    );
  }

  const config = getRewardedAdConfig();

  try {
    await grantRewardedAdCredits({
      userId: user.id,
      credits: config.credits,
    });

    const usage = await getPlayerAiUsageStatus({ supabase, userId: user.id, tier });

    return NextResponse.json(
      {
        ok: true,
        credits_granted: config.credits,
        usage,
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('[player-ai] Failed to grant rewarded ad credits:', error);
    return NextResponse.json(
      { error: 'Unable to grant rewarded ad credits right now.' },
      { status: 500 }
    );
  }
}
