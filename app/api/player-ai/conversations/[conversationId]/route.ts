import { NextRequest, NextResponse } from 'next/server';

import { requirePlayerAiContext, UUID_PATTERN } from '@/lib/ai/player-ai-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: {
    conversationId: string;
  };
};

function validateConversationId(conversationId: string): NextResponse<{ error: string }> | null {
  if (!UUID_PATTERN.test(conversationId)) {
    return NextResponse.json({ error: 'Invalid conversation_id.' }, { status: 400 });
  }

  return null;
}

async function getPlayerContext(request: NextRequest) {
  try {
    return await requirePlayerAiContext(request);
  } catch (error) {
    console.error('[player-ai] Conversation auth setup failed:', error);
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Authentication is not configured.' }, { status: 500 }),
    };
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const invalidResponse = validateConversationId(context.params.conversationId);
  if (invalidResponse) return invalidResponse;

  const authResult = await getPlayerContext(request);
  if (!authResult.ok) return authResult.response;

  const { data: conversation, error: conversationError } = await authResult.context.supabase
    .from('ai_conversations')
    .select('id, title, is_favorite, created_at, updated_at')
    .eq('id', context.params.conversationId)
    .eq('user_id', authResult.context.user.id)
    .maybeSingle();

  if (conversationError) {
    console.error('[player-ai] Conversation lookup failed:', conversationError);
    return NextResponse.json({ error: 'Unable to load conversation.' }, { status: 500 });
  }

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  const { data: messages, error: messagesError } = await authResult.context.supabase
    .from('ai_messages')
    .select('id, role, content, model_used, created_at')
    .eq('conversation_id', context.params.conversationId)
    .eq('user_id', authResult.context.user.id)
    .order('created_at', { ascending: true });

  if (messagesError) {
    console.error('[player-ai] Conversation messages lookup failed:', messagesError);
    return NextResponse.json({ error: 'Unable to load messages.' }, { status: 500 });
  }

  return NextResponse.json({ conversation, messages: messages ?? [] });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const invalidResponse = validateConversationId(context.params.conversationId);
  if (invalidResponse) return invalidResponse;

  const authResult = await getPlayerContext(request);
  if (!authResult.ok) return authResult.response;

  let payload: { is_favorite?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (typeof payload.is_favorite !== 'boolean') {
    return NextResponse.json({ error: 'is_favorite is required.' }, { status: 400 });
  }

  const { data, error } = await authResult.context.supabase
    .from('ai_conversations')
    .update({ is_favorite: payload.is_favorite })
    .eq('id', context.params.conversationId)
    .eq('user_id', authResult.context.user.id)
    .select('id, title, is_favorite, created_at, updated_at')
    .maybeSingle();

  if (error) {
    console.error('[player-ai] Favorite update failed:', error);
    return NextResponse.json({ error: 'Unable to update favorite.' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  return NextResponse.json({ conversation: data });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const invalidResponse = validateConversationId(context.params.conversationId);
  if (invalidResponse) return invalidResponse;

  const authResult = await getPlayerContext(request);
  if (!authResult.ok) return authResult.response;

  const { error } = await authResult.context.supabase
    .from('ai_conversations')
    .delete()
    .eq('id', context.params.conversationId)
    .eq('user_id', authResult.context.user.id);

  if (error) {
    console.error('[player-ai] Conversation delete failed:', error);
    return NextResponse.json({ error: 'Unable to clear conversation.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
