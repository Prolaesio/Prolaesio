import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';

import {
  createPlayerAiResponse,
  PlayerAiConversationMessage,
  PlayerAiEmptyResponseError,
  resolvePlayerAiResponseMode,
} from '@/lib/ai/openai';
import {
  getAiLimitConfig,
  isAiAssistantEnabled,
  isGlobalAiAssistantDisabled,
} from '@/lib/ai/model-config';
import {
  buildPlayerAiContextResult,
  PlayerAiContextDebugSummary,
} from '@/lib/ai/player-ai-context';
import { checkPlayerAiLimit, consumePlayerAiMessage } from '@/lib/ai/player-ai-limits';
import { classifyPlayerAiMessageRisk } from '@/lib/ai/player-ai-safety';
import {
  normalizeConversationId,
  requirePlayerAiContext,
  UUID_PATTERN,
} from '@/lib/ai/player-ai-auth';
import { resolvePlayerAiModelRoute } from '@/lib/ai/player-ai-routing';
import { resolvePlayerAiTier } from '@/lib/ai/player-ai-tier';

export const runtime = 'nodejs';

type ChatPayload = {
  message?: unknown;
  conversation_id?: unknown;
  local_date?: unknown;
};

type ConversationResult =
  | { ok: true; id: string }
  | { ok: false; response: NextResponse<{ error: string }> };

type ConversationMessageRow = {
  role: string;
  content: string;
  created_at: string;
};

function logPlayerAiContextSummary(summary: PlayerAiContextDebugSummary): void {
  if (process.env.NODE_ENV !== 'development') return;

  console.info('[player-ai] Context summary:', {
    userId: summary.userId,
    tier: summary.tier,
    wellnessRowCount: summary.wellnessRowCount,
    trainingLogRowCount: summary.trainingLogRowCount,
    calendarRowCount: summary.calendarRowCount,
    readinessFound: summary.readinessFound,
    readinessValue: summary.readinessValue,
    readinessBreakdown: summary.readinessBreakdown,
    latestWellnessDate: summary.latestWellnessDate,
    latestTrainingLogDate: summary.latestTrainingLogDate,
    contextDateRange: summary.contextDateRange,
    contextCharacterLength: summary.contextCharacterLength,
  });
}

function parseLocalDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

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

async function getRecentConversationMessages(params: {
  supabase: SupabaseClient;
  conversationId: string;
  userId: string;
}): Promise<PlayerAiConversationMessage[]> {
  const { data, error } = await params.supabase
    .from('ai_messages')
    .select('role, content, created_at')
    .eq('conversation_id', params.conversationId)
    .eq('user_id', params.userId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(6)
    .returns<ConversationMessageRow[]>();

  if (error) {
    console.error('[player-ai] Failed to load recent conversation messages:', error);
    return [];
  }

  return (data ?? [])
    .reverse()
    .filter((message): message is ConversationMessageRow & { role: 'user' | 'assistant' } =>
      message.role === 'user' || message.role === 'assistant'
    )
    .map(message => ({
      role: message.role,
      content: message.content,
    }));
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
  if (isGlobalAiAssistantDisabled()) {
    return NextResponse.json(
      { error: 'The Lodario Assistant is temporarily paused. Please try again soon.' },
      { status: 503 }
    );
  }

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
  const localDate = parseLocalDate(payload.local_date);
  const { maxMessageChars } = getAiLimitConfig();

  if (!message) {
    return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  }

  if (message.length > maxMessageChars) {
    return NextResponse.json(
      { error: `Message must be ${maxMessageChars} characters or fewer.` },
      { status: 400 }
    );
  }

  const tier = await resolvePlayerAiTier({ supabase, userId: user.id });
  const limitStatus = await checkPlayerAiLimit({ supabase, userId: user.id, tier });

  if (!limitStatus.allowed) {
    return NextResponse.json(
      {
        error: limitStatus.error,
        code: limitStatus.code,
        tier: limitStatus.tier,
        limit: limitStatus.limit,
        used: limitStatus.used,
        remaining: limitStatus.remaining,
        rewarded_ad_credits: limitStatus.rewardedAdCredits,
        rewarded_ad_bonus: limitStatus.rewardedAdBonus,
        rewarded_ad_available: false,
      },
      { status: limitStatus.status }
    );
  }

  const messageRisk = classifyPlayerAiMessageRisk(message);
  const modelRoute = await resolvePlayerAiModelRoute({
    supabase,
    userId: user.id,
    tier,
    message,
    messageRisk,
  });
  const playerContextResult = await buildPlayerAiContextResult({
    supabase,
    userId: user.id,
    tier,
    asOfDate: localDate,
  });
  logPlayerAiContextSummary(playerContextResult.debugSummary);
  const conversationResult = await getOrCreateConversation({
    supabase,
    userId: user.id,
    conversationId,
    message,
  });

  if (!conversationResult.ok) {
    return conversationResult.response;
  }

  const responseMode = resolvePlayerAiResponseMode(message);
  const recentMessages = await getRecentConversationMessages({
    supabase,
    conversationId: conversationResult.id,
    userId: user.id,
  });

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
    const aiResponse = await createPlayerAiResponse({
      message,
      tier,
      playerContext: playerContextResult.context,
      messageRisk,
      model: modelRoute.model,
      responseMode,
      recentMessages,
    });
    const consumedMessage = await consumePlayerAiMessage({ supabase, userId: user.id, tier });

    if (!consumedMessage) {
      return NextResponse.json(
        {
          error:
            tier === 'free'
              ? 'You have used your free Lodario AI messages. Watch ad rewards for extra messages are coming soon.'
              : 'Unable to confirm your AI message allowance right now.',
          code: tier === 'free' ? 'free_limit_reached' : 'limit_check_failed',
          tier,
          rewarded_ad_available: false,
        },
        { status: tier === 'free' ? 429 : 503 }
      );
    }

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
      route: modelRoute.route,
    });
  } catch (error) {
    console.error('[player-ai] OpenAI response failed:', error);
    if (error instanceof PlayerAiEmptyResponseError) {
      return NextResponse.json(
        { error: 'The Lodario Assistant did not return any text. Please try again.' },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: 'Unable to generate a response right now.' },
      { status: 502 }
    );
  }
}

