'use client';

import React from 'react';
import {
  Loader2,
  Menu,
  MessageSquare,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';

import { AuthGate } from '@/components/AuthGate';
import { useAuth } from '@/lib/AuthContext';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type ConversationSummary = {
  id: string;
  title: string | null;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
};

type PlayerAiResponse = {
  response?: unknown;
  conversation_id?: unknown;
  model_used?: unknown;
  model_label?: unknown;
  tier?: unknown;
  tier_label?: unknown;
  code?: unknown;
  rewarded_ad_bonus?: unknown;
  rewarded_ad_available?: unknown;
  error?: unknown;
};

type ConversationListResponse = {
  conversations?: ConversationSummary[];
  error?: unknown;
};

type ConversationDetailResponse = {
  conversation?: ConversationSummary;
  messages?: Array<{
    id: string;
    role: string;
    content: string;
    created_at: string;
  }>;
  error?: unknown;
};

type LimitNotice = {
  code: 'free_limit_reached' | 'daily_limit_reached';
  message: string;
  rewardedAdBonus?: number;
};

type UsageStatus = {
  tier: string;
  limitType: 'lifetime' | 'daily';
  limit: number;
  used: number;
  remaining: number;
  rewardedAdCredits?: number;
  rewardedAdBonus?: number;
};

type UsageStatusResponse = {
  usage?: UsageStatus;
  error?: unknown;
};

type RewardedAdResponse = {
  ok?: unknown;
  credits_granted?: unknown;
  usage?: UsageStatus;
  error?: unknown;
  availability?: {
    message?: unknown;
  };
};

const STARTER_PROMPTS = [
  'Explain my readiness',
  'Should I train hard today?',
  'Summarize my week',
  'What should I focus on?',
  'Why am I tired?',
];

function createMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
  };
}

function formatHistoryDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const day = date.getDate();
  const month = date.toLocaleString(undefined, { month: 'short' }).toUpperCase();
  const time = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return `${day} ${month} - ${time}`;
}

function getConversationTitle(conversation: ConversationSummary): string {
  return conversation.title?.trim() || 'Untitled chat';
}

function getLocalDateKey(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getFriendlyError(message: string): string {
  if (message.includes('free Lodario AI messages')) {
    return 'You have used your free AI messages. Extra message rewards are coming soon.';
  }

  if (message.includes('daily') && message.includes('limit')) {
    return 'You have used today\'s AI messages. Try again tomorrow.';
  }

  if (message.includes('did not return any text') || message.includes('generate a response')) {
    return 'The assistant had trouble replying. Try again in a moment.';
  }

  if (message.includes('Authentication') || message.includes('Sign in')) {
    return 'Sign in as a player to use the assistant.';
  }

  return message || 'Something went wrong. Please try again.';
}

export default function PlayerAiPage() {
  const { session } = useAuth();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [activeConversation, setActiveConversation] = React.useState<ConversationSummary | null>(null);
  const [history, setHistory] = React.useState<ConversationSummary[]>([]);
  const [input, setInput] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [limitNotice, setLimitNotice] = React.useState<LimitNotice | null>(null);
  const [isSending, setIsSending] = React.useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = React.useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = React.useState(false);
  const [lastMeta, setLastMeta] = React.useState<{ tierLabel: string; modelLabel: string } | null>(null);
  const [usageStatus, setUsageStatus] = React.useState<UsageStatus | null>(null);
  const [isLoadingUsage, setIsLoadingUsage] = React.useState(false);
  const [isRewardModalOpen, setIsRewardModalOpen] = React.useState(false);
  const [rewardModalMessage, setRewardModalMessage] = React.useState<string | null>(null);
  const [isRewardAdLoading, setIsRewardAdLoading] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);
  const usageRequestIdRef = React.useRef(0);

  const hasMessages = messages.length > 0;

  const authHeaders = React.useCallback((): Record<string, string> | null => {
    if (!session?.access_token) return null;

    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    };
  }, [session?.access_token]);

  const loadHistory = React.useCallback(async (): Promise<ConversationSummary[]> => {
    const headers = authHeaders();
    if (!headers) return [];

    setIsLoadingHistory(true);
    try {
      const response = await fetch('/api/player-ai/conversations', { headers });
      const payload = (await response.json()) as ConversationListResponse;

      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to load chat history.');
      }

      const conversations = Array.isArray(payload.conversations) ? payload.conversations : [];
      setHistory(conversations);
      return conversations;
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Unable to load chat history.';
      setError(getFriendlyError(message));
      return [];
    } finally {
      setIsLoadingHistory(false);
    }
  }, [authHeaders]);

  const loadUsageStatus = React.useCallback(async (): Promise<void> => {
    const headers = authHeaders();
    if (!headers) return;

    const requestId = usageRequestIdRef.current + 1;
    usageRequestIdRef.current = requestId;
    setIsLoadingUsage(true);
    try {
      const response = await fetch('/api/player-ai/usage', {
        headers: {
          ...headers,
          'Cache-Control': 'no-cache',
        },
        cache: 'no-store',
      });
      const payload = (await response.json()) as UsageStatusResponse;

      if (!response.ok || !payload.usage) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to load message balance.');
      }

      if (requestId === usageRequestIdRef.current) {
        setUsageStatus(payload.usage);
      }
    } catch {
      if (requestId === usageRequestIdRef.current) {
        setUsageStatus(prev => prev);
      }
    } finally {
      if (requestId === usageRequestIdRef.current) {
        setIsLoadingUsage(false);
      }
    }
  }, [authHeaders]);

  React.useEffect(() => {
    void loadHistory();
    void loadUsageStatus();
  }, [loadHistory, loadUsageStatus]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isSending]);

  const resetChatState = React.useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setActiveConversation(null);
    setInput('');
    setError(null);
    setLimitNotice(null);
    setLastMeta(null);
  }, []);

  const startNewChat = React.useCallback(() => {
    resetChatState();
    void loadUsageStatus();
  }, [loadUsageStatus, resetChatState]);

  const optimisticallyConsumeMessage = React.useCallback(() => {
    setUsageStatus(prev => {
      if (!prev) return prev;

      return {
        ...prev,
        used: prev.used + 1,
        remaining: Math.max(prev.remaining - 1, 0),
      };
    });
  }, []);

  const requestRewardedAdReward = React.useCallback(async () => {
    const headers = authHeaders();
    if (!headers) {
      setRewardModalMessage('Sign in as a player to use rewarded AI messages.');
      return;
    }

    setIsRewardAdLoading(true);
    setRewardModalMessage(null);

    try {
      const response = await fetch('/api/player-ai/rewarded-ad', {
        method: 'POST',
        headers,
        cache: 'no-store',
        body: JSON.stringify({ provider: 'google' }),
      });
      const payload = (await response.json()) as RewardedAdResponse;
      const message = typeof payload.error === 'string'
        ? payload.error
        : typeof payload.availability?.message === 'string'
          ? payload.availability.message
          : 'Rewarded ads are not available yet.';

      if (!response.ok) {
        setRewardModalMessage(message);
        return;
      }

      if (typeof payload.credits_granted === 'number' && payload.credits_granted > 0) {
        setRewardModalMessage(`Added ${payload.credits_granted} AI messages.`);
        if (payload.usage) setUsageStatus(payload.usage);
        await loadUsageStatus();
        return;
      }

      setRewardModalMessage(message);
    } catch {
      setRewardModalMessage('Rewarded ads are not available yet.');
    } finally {
      setIsRewardAdLoading(false);
    }
  }, [authHeaders, loadUsageStatus]);

  const loadConversation = React.useCallback(async (nextConversationId: string) => {
    const headers = authHeaders();
    if (!headers) {
      setError('Sign in as a player to load chat history.');
      return;
    }

    setIsLoadingConversation(true);
    setError(null);

    try {
      const response = await fetch(`/api/player-ai/conversations/${nextConversationId}`, { headers });
      const payload = (await response.json()) as ConversationDetailResponse;

      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to load that chat.');
      }

      const loadedMessages = (payload.messages ?? [])
        .filter(message => message.role === 'user' || message.role === 'assistant')
        .map(message => ({
          id: message.id,
          role: message.role as ChatRole,
          content: message.content,
        }));

      setMessages(loadedMessages);
      setConversationId(nextConversationId);
      setActiveConversation(payload.conversation ?? null);
      setLastMeta(null);
      setLimitNotice(null);
      setIsHistoryOpen(false);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Unable to load that chat.';
      setError(getFriendlyError(message));
    } finally {
      setIsLoadingConversation(false);
    }
  }, [authHeaders]);

  const toggleFavorite = React.useCallback(async (target: ConversationSummary, nextFavorite: boolean) => {
    const headers = authHeaders();
    if (!headers) return;

    try {
      const response = await fetch(`/api/player-ai/conversations/${target.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ is_favorite: nextFavorite }),
      });
      const payload = (await response.json()) as { conversation?: ConversationSummary; error?: unknown };

      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to update favorite.');
      }

      const updated = payload.conversation;
      if (!updated) return;

      setHistory(prev => prev.map(item => item.id === updated.id ? updated : item));
      setActiveConversation(prev => prev?.id === updated.id ? updated : prev);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Unable to update favorite.';
      setError(getFriendlyError(message));
    }
  }, [authHeaders]);

  const clearCurrentChat = React.useCallback(async () => {
    const headers = authHeaders();
    const currentConversationId = conversationId;

    resetChatState();
    void loadUsageStatus();

    if (!headers || !currentConversationId) {
      return;
    }

    try {
      const response = await fetch(`/api/player-ai/conversations/${currentConversationId}`, {
        method: 'DELETE',
        headers,
      });
      const payload = (await response.json()) as { error?: unknown };

      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to clear chat.');
      }

      setHistory(prev => prev.filter(conversation => conversation.id !== currentConversationId));
      void loadUsageStatus();
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Unable to clear chat.';
      setError(getFriendlyError(message));
      void loadHistory();
    }
  }, [authHeaders, conversationId, loadHistory, loadUsageStatus, resetChatState]);

  const sendMessage = React.useCallback(async (rawMessage: string) => {
    const message = rawMessage.trim();
    if (!message || isSending) return;

    const headers = authHeaders();
    if (!headers) {
      setError('Sign in as a player to use the Lodario Assistant.');
      return;
    }

    const userMessage = createMessage('user', message);
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setError(null);
    setLimitNotice(null);
    setIsSending(true);
    void loadUsageStatus();

    try {
      const apiResponse = await fetch('/api/player-ai/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message,
          conversation_id: conversationId,
          local_date: getLocalDateKey(),
        }),
      });

      const payload = (await apiResponse.json()) as PlayerAiResponse;

      if (!apiResponse.ok) {
        const errorMessage = typeof payload.error === 'string'
          ? payload.error
          : 'Unable to reach the Lodario Assistant right now.';
        const errorCode = typeof payload.code === 'string' ? payload.code : '';

        if (apiResponse.status === 429 && (errorCode === 'free_limit_reached' || errorCode === 'daily_limit_reached')) {
          const rewardedAdBonus = typeof payload.rewarded_ad_bonus === 'number'
            ? payload.rewarded_ad_bonus
            : undefined;

          setLimitNotice({
            code: errorCode,
            message: getFriendlyError(errorMessage),
            rewardedAdBonus,
          });
          setMessages(prev => [
            ...prev.filter(chatMessage => chatMessage.id !== userMessage.id),
            createMessage('assistant', getFriendlyError(errorMessage)),
          ]);
          void loadUsageStatus();
          return;
        }

        throw new Error(errorMessage);
      }

      const assistantResponse = typeof payload.response === 'string' ? payload.response.trim() : '';
      const nextConversationId = typeof payload.conversation_id === 'string' ? payload.conversation_id : null;
      const tierLabel = typeof payload.tier_label === 'string' ? payload.tier_label : '';
      const modelLabel = typeof payload.model_label === 'string' ? payload.model_label : '';

      if (nextConversationId) {
        setConversationId(nextConversationId);
      }

      if (tierLabel || modelLabel) {
        setLastMeta({
          tierLabel: tierLabel || 'Unknown tier',
          modelLabel: modelLabel || 'Lodario AI',
        });
      }

      setLimitNotice(null);
      optimisticallyConsumeMessage();

      setMessages(prev => [
        ...prev,
        createMessage(
          'assistant',
          assistantResponse || 'I could not generate a useful response this time. Try asking again with a little more detail.'
        ),
      ]);

      const refreshedHistory = await loadHistory();
      await loadUsageStatus();
      if (nextConversationId) {
        const refreshedConversation = refreshedHistory.find(item => item.id === nextConversationId);
        if (refreshedConversation) setActiveConversation(refreshedConversation);
      }
    } catch (caughtError) {
      const errorMessage = caughtError instanceof Error
        ? caughtError.message
        : 'Unable to reach the Lodario Assistant right now.';
      setError(getFriendlyError(errorMessage));
      setMessages(prev => prev.filter(chatMessage => chatMessage.id !== userMessage.id));
      setInput(message);
    } finally {
      setIsSending(false);
    }
  }, [authHeaders, conversationId, isSending, loadHistory, loadUsageStatus, optimisticallyConsumeMessage]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage(input);
  };

  const currentFavorite = activeConversation?.is_favorite ?? false;

  return (
    <AuthGate requiredRole="player">
    <div className="relative flex h-[calc(100vh-5.75rem)] flex-col overflow-hidden bg-[var(--background)]">
      {isHistoryOpen && (
        <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm" onClick={() => setIsHistoryOpen(false)}>
          <aside
            className="flex h-full w-[88%] max-w-xs flex-col border-r border-[var(--card-border)] bg-[rgba(16,18,27,0.98)] p-4 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="mb-4 flex shrink-0 items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Chat history</h2>
                <p className="mt-1 text-xs text-gray-500">Recent chats and favorites</p>
              </div>
              <button
                type="button"
                onClick={() => setIsHistoryOpen(false)}
                className="touch-target flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white"
                aria-label="Close history"
              >
                <X size={20} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                startNewChat();
                setIsHistoryOpen(false);
              }}
              className="mb-4 flex w-full shrink-0 items-center gap-2 rounded-lg border border-[rgba(255,193,7,0.25)] bg-[rgba(255,193,7,0.09)] px-3 py-3 text-left text-sm font-semibold text-[var(--accent-primary)]"
            >
              <MessageSquare size={17} />
              New chat
            </button>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-8 pr-1">
              {isLoadingHistory ? (
                <div className="flex items-center gap-2 px-2 py-4 text-sm text-gray-400">
                  <Loader2 size={16} className="animate-spin" />
                  Loading chats...
                </div>
              ) : history.length === 0 ? (
                <p className="px-2 py-4 text-sm leading-relaxed text-gray-500">
                  No saved chats yet. Your recent chats will appear here after you send a message.
                </p>
              ) : (
                history.map(conversation => (
                  <div
                    key={conversation.id}
                    className={`rounded-xl border px-3 py-3 ${
                      conversation.id === conversationId
                        ? 'border-[var(--accent-primary)] bg-[rgba(255,193,7,0.12)]'
                        : conversation.is_favorite
                          ? 'border-[rgba(255,193,7,0.28)] bg-[rgba(255,193,7,0.07)]'
                        : 'border-[var(--card-border)] bg-[rgba(255,255,255,0.04)]'
                    }`}
                  >
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void loadConversation(conversation.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm font-semibold text-white">{getConversationTitle(conversation)}</p>
                        <div className="mt-2 flex min-w-0 items-center gap-2">
                          <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                            {formatHistoryDateTime(conversation.updated_at)}
                          </p>
                          {conversation.is_favorite ? (
                            <span className="rounded-full bg-[rgba(255,193,7,0.14)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-primary)]">
                              Favorite
                            </span>
                          ) : null}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleFavorite(conversation, !conversation.is_favorite)}
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          conversation.is_favorite
                            ? 'text-[var(--accent-primary)]'
                            : 'text-gray-500 hover:text-gray-200'
                        }`}
                        aria-label={conversation.is_favorite ? 'Remove favorite' : 'Mark favorite'}
                      >
                        <Star size={17} fill={conversation.is_favorite ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      )}

      {isRewardModalOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 px-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--card-border)] bg-[rgba(22,24,34,0.98)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white">More AI messages</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-300">
                  Watch a full 30 second ad for 10 more AI messages?
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsRewardModalOpen(false);
                  setRewardModalMessage(null);
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-white/10 hover:text-white"
                aria-label="Close reward message dialog"
              >
                <X size={18} />
              </button>
            </div>

            {rewardModalMessage ? (
              <div className="mt-4 rounded-xl border border-[rgba(255,193,7,0.25)] bg-[rgba(255,193,7,0.09)] px-3 py-2 text-sm font-medium text-[var(--accent-primary)]">
                {rewardModalMessage}
              </div>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsRewardModalOpen(false);
                  setRewardModalMessage(null);
                }}
                className="rounded-xl border border-[var(--card-border)] px-4 py-3 text-sm font-semibold text-gray-200 hover:bg-white/10"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => void requestRewardedAdReward()}
                disabled={isRewardAdLoading}
                className="rounded-xl bg-[var(--accent-primary)] px-4 py-3 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRewardAdLoading ? 'Checking...' : 'Yes'}
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="z-10 flex items-center justify-between border-b border-[var(--card-border)] bg-[rgba(16,18,27,0.9)] px-4 py-3 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setIsHistoryOpen(true)}
          className="touch-target flex h-10 w-10 items-center justify-center rounded-full text-gray-300 hover:bg-white/10 hover:text-white"
          aria-label="Open chat history"
        >
          <Menu size={22} />
        </button>

        <div className="min-w-0 flex-1 px-3 text-center">
          <h1 className="truncate text-base font-bold text-white">Lodario Assistant</h1>
          <p className="truncate text-[11px] font-medium text-[var(--accent-secondary)]">
            {activeConversation ? getConversationTitle(activeConversation) : 'Player training chat'}
          </p>
        </div>

        <div className="flex min-w-[7.4rem] items-center justify-end gap-1">
          {hasMessages ? (
            <button
              type="button"
              onClick={() => void clearCurrentChat()}
              className="touch-target flex h-9 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-[#ffb3a7] hover:bg-[rgba(255,107,107,0.1)]"
            >
              <Trash2 size={14} />
              Clear
            </button>
          ) : null}

          <div className="flex items-center rounded-full border border-[rgba(255,193,7,0.22)] bg-[rgba(255,193,7,0.08)]">
            <span className="min-w-12 px-2.5 py-1.5 text-center text-[11px] font-bold text-[var(--accent-primary)]">
              {isLoadingUsage
                ? '...'
                : usageStatus
                  ? `${Math.max(usageStatus.remaining, 0)} left`
                  : '-- left'}
            </span>
            <button
              type="button"
              onClick={() => {
                setRewardModalMessage(null);
                setIsRewardModalOpen(true);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--accent-primary)] hover:bg-[rgba(255,193,7,0.14)]"
              aria-label="Get more AI messages"
            >
              <Plus size={15} />
            </button>
          </div>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-32 pt-4">
          {!hasMessages ? (
            <div className="flex min-h-full flex-col justify-start pt-7 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(255,193,7,0.12)] text-[var(--accent-primary)]">
                <Sparkles size={23} />
              </div>
              <h2 className="text-xl font-bold text-white">What do you need today?</h2>
              <p className="mx-auto mt-2 max-w-[16rem] text-sm leading-relaxed text-gray-400">
                Ask about readiness, fatigue, soreness, or your next session.
              </p>

              <div className="mt-6 grid grid-cols-1 gap-2">
                {STARTER_PROMPTS.map(prompt => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendMessage(prompt)}
                    disabled={isSending || isLoadingConversation}
                    className="touch-target rounded-xl border border-[rgba(255,193,7,0.2)] bg-[rgba(255,255,255,0.045)] px-4 py-3 text-left text-sm font-semibold text-gray-100 backdrop-blur-xl transition hover:border-[var(--accent-primary)] hover:bg-[rgba(255,193,7,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <p className="mx-auto mt-5 max-w-xs text-xs text-gray-600">Guidance only. For injury concerns, speak to a trusted adult or professional.</p>
            </div>
          ) : (
            messages.map(message => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[86%] break-words rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-lg ${
                    message.role === 'user'
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'whitespace-pre-wrap border border-[var(--card-border)] bg-[rgba(255,255,255,0.065)] text-gray-100'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))
          )}

          {(isSending || isLoadingConversation) && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl border border-[var(--card-border)] bg-[rgba(255,255,255,0.07)] px-4 py-3 text-sm text-gray-300">
                <Loader2 size={16} className="animate-spin" />
                {isLoadingConversation ? 'Opening chat...' : 'Thinking...'}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="absolute bottom-0 left-0 right-0 border-t border-[var(--card-border)] bg-[rgba(16,18,27,0.95)] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
          {error && (
            <div className="mb-2 rounded-lg bg-[rgba(255,107,107,0.12)] px-3 py-2 text-xs font-medium text-[#ffb3a7]">
              {error}
            </div>
          )}

          {limitNotice && (
            <div className="mb-2 rounded-lg border border-[rgba(255,193,7,0.25)] bg-[rgba(255,193,7,0.1)] px-3 py-2 text-xs font-medium text-gray-100">
              <p>{limitNotice.message}</p>
              {limitNotice.code === 'free_limit_reached' ? (
                <button
                  type="button"
                  onClick={() => {
                    setRewardModalMessage(null);
                    setIsRewardModalOpen(true);
                  }}
                  className="mt-2 rounded-full border border-[rgba(255,193,7,0.24)] px-3 py-1.5 text-[11px] font-semibold text-[var(--accent-primary)] hover:bg-[rgba(255,193,7,0.1)]"
                >
                  Watch ad for {limitNotice.rewardedAdBonus ?? 10} more
                </button>
              ) : null}
            </div>
          )}

          <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-gray-500">
            <span>{lastMeta ? `${lastMeta.tierLabel} / ${lastMeta.modelLabel}` : 'Read-only guidance'}</span>
            {activeConversation && (
              <button
                type="button"
                onClick={() => void toggleFavorite(activeConversation, !currentFavorite)}
                className={`flex items-center gap-1 font-semibold ${
                  currentFavorite ? 'text-[var(--accent-primary)]' : 'text-gray-500'
                }`}
              >
                <Star size={13} fill={currentFavorite ? 'currentColor' : 'none'} />
                {currentFavorite ? 'Favorited' : 'Favorite'}
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="flex items-end gap-2 rounded-2xl border border-[var(--card-border)] bg-[rgba(255,255,255,0.06)] p-2">
              <textarea
                value={input}
                onChange={event => setInput(event.target.value)}
                placeholder="Ask about your training..."
                rows={1}
                disabled={isSending || isLoadingConversation}
                className="max-h-28 min-h-11 flex-1 resize-none bg-transparent px-2 py-3 text-sm text-white outline-none placeholder:text-gray-500 disabled:opacity-60"
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage(input);
                  }
                }}
              />
              <button
                type="submit"
                disabled={isSending || isLoadingConversation || !input.trim()}
                className="touch-target flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-primary)] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send message"
              >
                {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
          </form>

          {hasMessages && (
            <button
              type="button"
              onClick={startNewChat}
              className="mx-auto mt-2 flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-300"
            >
              <RotateCcw size={13} />
              Start a new chat without deleting this one
            </button>
          )}
        </div>
      </main>
    </div>
    </AuthGate>
  );
}
