import { NextRequest, NextResponse } from 'next/server';

import { requirePlayerAiContext } from '@/lib/ai/player-ai-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HISTORY_WINDOW_DAYS = 3;

export async function GET(request: NextRequest) {
  let authResult: Awaited<ReturnType<typeof requirePlayerAiContext>>;
  try {
    authResult = await requirePlayerAiContext(request);
  } catch (error) {
    console.error('[player-ai] Conversation auth setup failed:', error);
    return NextResponse.json({ error: 'Authentication is not configured.' }, { status: 500 });
  }

  if (!authResult.ok) {
    return authResult.response;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HISTORY_WINDOW_DAYS);

  const { data, error } = await authResult.context.supabase
    .from('ai_conversations')
    .select('id, title, is_favorite, created_at, updated_at')
    .eq('user_id', authResult.context.user.id)
    .or(`updated_at.gte.${cutoff.toISOString()},is_favorite.eq.true`)
    .order('is_favorite', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[player-ai] Conversation history lookup failed:', error);
    return NextResponse.json({ error: 'Unable to load chat history.' }, { status: 500 });
  }

  return NextResponse.json({ conversations: data ?? [] });
}
