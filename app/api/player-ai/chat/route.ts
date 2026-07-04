import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';

import { createPlayerAiResponse } from '@/lib/ai/openai';
import { isAiAssistantEnabled } from '@/lib/ai/model-config';
import { buildPlayerAiContext } from '@/lib/ai/player-ai-context';
import {
  normalizeConversationId,
  requirePlayerAiContext,
  UUID_PATTERN,
} from '@/lib/ai/player-ai-auth';
import { resolvePlayerAiTier } from '@/lib/ai/player-ai-tier';

export const runtime = 'nodejs';

const MAX_MESSAGE_LENGTH = 2000;

type ChatPayload = {
  message?: unknown;
  conversation_id?: unknown;
};

type ConversationResult =
  | { ok: true; id: string }
  | { ok: false; response: NextResponse<{ error: string }> };

function buildConversationTitle(message: string): string {
  const normalized = message.replace(/\s+/g, ' ').trim();
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

async function getOrCreateConversation(params: {
  supabase: SupabaseClient;
  userId: string;
  conversationId: string | null;
  message: string;
}): Promise<ConversationResult> {
  if (params.conversationId) {
    if (!UUID_PATTERN.test(params.conversationId)) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Invalid conversation_id.' }, { status: 400 }),
      };
    }

    const { data, error } = await params.supabase
      .from('ai_conversations')
      .select('id')
      .eq('id', params.conversationId)
      .eq('user_id', params.userId)
      .maybeSingle();

    if (error) {
      console.error('[player-ai] Conversation lookup failed:', error);
      return {
        ok: false,
        response: NextResponse.json({ error: 'Unable to load conversation.' }, { status: 500 }),
      };
    }

    if (!data?.id) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Conversation not found.' }, { status: 404 }),
      };
    }

    return { ok: true, id: data.id };
  }

  const { data, error } = await params.supabase
    .from('ai_conversations')
    .insert({
      user_id: params.userId,
      title: buildConversationTitle(params.message),
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    console.error('[player-ai] Conversation creation failed:', error);
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unable to create conversation.' }, { status: 500 }),
    };
  }

  return { ok: true, id: data.id };
}

async function insertMessage(params: {
  supabase: SupabaseClient;
  conversationId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  modelUsed?: string;
}): Promise<boolean> {
  const { error } = await params.supabase.from('ai_messages').insert({
    conversation_id: params.conversationId,
    user_id: params.userId,
    role: params.role,
    content: params.content,
    model_used: params.modelUsed,
  });

  if (error) {
    console.error(`[player-ai] Failed to save ${params.role} message:`, error);
    return false;
  }

  return true;
}

async function updateConversationTimestamp(params: {
  supabase: SupabaseClient;
  conversationId: string;
  userId: string;
}): Promise<void> {
  const { error } = await params.supabase
    .from('ai_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', params.conversationId)
    .eq('user_id', params.userId);

  if (error) {
    console.error('[player-ai] Failed to update conversation timestamp:', error);
  }
}

async function insertUsage(params: {
  supabase: SupabaseClient;
  userId: string;
  tier: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}): Promise<boolean> {
  const { error } = await params.supabase.from('ai_usage').insert({
    user_id: params.userId,
    tier: params.tier,
    model_used: params.modelUsed,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    total_tokens: params.totalTokens,
    request_count: 1,
  });

  if (error) {
    console.error('[player-ai] Failed to save usage:', error);
    return false;
  }

  return true;
}

export async function POST(request: NextRequest) {
  if (!isAiAssistantEnabled()) {
    return NextResponse.json({ error: 'Player AI assistant is disabled.' }, { status: 404 });
  }

  let authResult: Awaited<ReturnType<typeof requirePlayerAiContext>>;
  try {
    authResult = await requirePlayerAiContext(request);
  } catch (error) {
    console.error('[player-ai] Authentication setup failed:', error);
    return NextResponse.json({ error: 'Authentication is not configured.' }, { status: 500 });
  }

  if (!authResult.ok) {
    return authResult.response;
  }

  const { supabase, user } = authResult.context;

  let payload: ChatPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  const conversationId = normalizeConversationId(payload.conversation_id);

  if (!message) {
    return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  const tier = await resolvePlayerAiTier({ supabase, userId: user.id });
  const playerContext = await buildPlayerAiContext({ supabase, userId: user.id, tier });
  const conversationResult = await getOrCreateConversation({
    supabase,
    userId: user.id,
    conversationId,
    message,
  });

  if (!conversationResult.ok) {
    return conversationResult.response;
  }

  const savedUserMessage = await insertMessage({
    supabase,
    conversationId: conversationResult.id,
    userId: user.id,
    role: 'user',
    content: message,
  });

  if (!savedUserMessage) {
    return NextResponse.json({ error: 'Unable to save message.' }, { status: 500 });
  }

  try {
    const aiResponse = await createPlayerAiResponse({ message, tier, playerContext });

    const savedAssistantMessage = await insertMessage({
      supabase,
      conversationId: conversationResult.id,
      userId: user.id,
      role: 'assistant',
      content: aiResponse.content,
      modelUsed: aiResponse.modelUsed,
    });

    if (!savedAssistantMessage) {
      return NextResponse.json({ error: 'Unable to save assistant response.' }, { status: 500 });
    }

    const savedUsage = await insertUsage({
      supabase,
      userId: user.id,
      tier,
      modelUsed: aiResponse.modelUsed,
      inputTokens: aiResponse.usage.inputTokens,
      outputTokens: aiResponse.usage.outputTokens,
      totalTokens: aiResponse.usage.totalTokens,
    });

    if (!savedUsage) {
      return NextResponse.json({ error: 'Unable to save AI usage.' }, { status: 500 });
    }

    await updateConversationTimestamp({
      supabase,
      conversationId: conversationResult.id,
      userId: user.id,
    });

    return NextResponse.json({
      response: aiResponse.content,
      conversation_id: conversationResult.id,
      model_used: aiResponse.modelUsed,
      tier,
    });
  } catch (error) {
    console.error('[player-ai] OpenAI response failed:', error);
    return NextResponse.json(
      { error: 'Unable to generate a response right now.' },
      { status: 502 }
    );
  }
}

