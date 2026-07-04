'use client';

import React from 'react';
import {
  Loader2,
  Menu,
  MessageSquare,
  RotateCcw,
  Send,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';

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
  tier?: unknown;
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

function formatHistoryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function getConversationTitle(conversation: ConversationSummary): string {
  return conversation.title?.trim() || 'Untitled chat';
}

export default function PlayerAiPage() {
  const { session } = useAuth();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [activeConversation, setActiveConversation] = React.useState<ConversationSummary | null>(null);
  const [history, setHistory] = React.useState<ConversationSummary[]>([]);
  const [input, setInput] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isSending, setIsSending] = React.useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = React.useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = React.useState(false);
  const [lastMeta, setLastMeta] = React.useState<{ tier: string; modelUsed: string } | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);

  const hasMessages = messages.length > 0;

  const authHeaders = React.useCallback((): HeadersInit | null => {
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
      setError(message);
      return [];
    } finally {
      setIsLoadingHistory(false);
    }
  }, [authHeaders]);

  React.useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isSending]);

  const resetChatState = React.useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setActiveConversation(null);
    setInput('');
    setError(null);
    setLastMeta(null);
  }, []);

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
      setIsHistoryOpen(false);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Unable to load that chat.';
      setError(message);
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
      setError(message);
    }
  }, [authHeaders]);

  const clearCurrentChat = React.useCallback(async () => {
    const headers = authHeaders();
    const currentConversationId = conversationId;

    resetChatState();

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
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Unable to clear chat.';
      setError(message);
      void loadHistory();
    }
  }, [authHeaders, conversationId, loadHistory, resetChatState]);

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
    setIsSending(true);

    try {
      const apiResponse = await fetch('/api/player-ai/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message,
          conversation_id: conversationId,
        }),
      });

      const payload = (await apiResponse.json()) as PlayerAiResponse;

      if (!apiResponse.ok) {
        const errorMessage = typeof payload.error === 'string'
          ? payload.error
          : 'Unable to reach the Lodario Assistant right now.';
        throw new Error(errorMessage);
      }

      const assistantResponse = typeof payload.response === 'string' ? payload.response.trim() : '';
      const nextConversationId = typeof payload.conversation_id === 'string' ? payload.conversation_id : null;
      const tier = typeof payload.tier === 'string' ? payload.tier : '';
      const modelUsed = typeof payload.model_used === 'string' ? payload.model_used : '';

      if (nextConversationId) {
        setConversationId(nextConversationId);
      }

      if (tier || modelUsed) {
        setLastMeta({ tier: tier || 'unknown', modelUsed: modelUsed || 'unknown' });
      }

      setMessages(prev => [
        ...prev,
        createMessage(
          'assistant',
          assistantResponse || 'I could not generate a useful response this time. Try asking again with a little more detail.'
        ),
      ]);

      const refreshedHistory = await loadHistory();
      if (nextConversationId) {
        const refreshedConversation = refreshedHistory.find(item => item.id === nextConversationId);
        if (refreshedConversation) setActiveConversation(refreshedConversation);
      }
    } catch (caughtError) {
      const errorMessage = caughtError instanceof Error
        ? caughtError.message
        : 'Unable to reach the Lodario Assistant right now.';
      setError(errorMessage);
      setMessages(prev => prev.filter(chatMessage => chatMessage.id !== userMessage.id));
      setInput(message);
    } finally {
      setIsSending(false);
    }
  }, [authHeaders, conversationId, isSending, loadHistory]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage(input);
  };

  const currentFavorite = activeConversation?.is_favorite ?? false;

  return (
    <div className="relative flex h-[calc(100vh-5.75rem)] flex-col overflow-hidden bg-[var(--background)]">
      {isHistoryOpen && (
        <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm" onClick={() => setIsHistoryOpen(false)}>
          <aside
            className="h-full w-[86%] max-w-xs border-r border-[var(--card-border)] bg-[rgba(16,18,27,0.98)] p-4 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Chat history</h2>
                <p className="mt-1 text-xs text-gray-500">Recent 3 days and favorites</p>
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
                resetChatState();
                setIsHistoryOpen(false);
              }}
              className="mb-4 flex w-full items-center gap-2 rounded-lg border border-[var(--card-border)] bg-[rgba(255,193,7,0.1)] px-3 py-3 text-left text-sm font-semibold text-[var(--accent-primary)]"
            >
              <MessageSquare size={17} />
              New chat
            </button>

            <div className="space-y-2 overflow-y-auto pb-8">
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
                    className={`rounded-lg border px-3 py-3 ${
                      conversation.id === conversationId
                        ? 'border-[var(--accent-primary)] bg-[rgba(255,193,7,0.12)]'
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
                        <p className="mt-1 text-[11px] uppercase tracking-wider text-gray-500">
                          {formatHistoryDate(conversation.updated_at)}
                        </p>
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

      <header className="z-10 flex items-center justify-between border-b border-[var(--card-border)] bg-[rgba(16,18,27,0.86)] px-4 py-3 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setIsHistoryOpen(true)}
          className="touch-target flex h-10 w-10 items-center justify-center rounded-full text-gray-300 hover:bg-white/10 hover:text-white"
          aria-label="Open chat history"
        >
          <Menu size={22} />
        </button>

        <div className="min-w-0 px-3 text-center">
          <h1 className="truncate text-base font-bold text-white">Lodario Assistant</h1>
          <p className="truncate text-[11px] font-medium text-[var(--accent-secondary)]">
            {activeConversation ? getConversationTitle(activeConversation) : 'Player training chat'}
          </p>
        </div>

        {hasMessages ? (
          <button
            type="button"
            onClick={() => void clearCurrentChat()}
            className="touch-target flex h-10 items-center gap-1 rounded-full px-3 text-xs font-semibold text-[#ffb3a7] hover:bg-[rgba(255,107,107,0.1)]"
          >
            <Trash2 size={16} />
            Clear
          </button>
        ) : (
          <div className="h-10 w-10" />
        )}
      </header>

      <main className="relative flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-32 pt-4">
          {!hasMessages ? (
            <div className="flex min-h-full flex-col justify-start pt-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(255,193,7,0.14)] text-[var(--accent-primary)]">
                <Sparkles size={26} />
              </div>
              <h2 className="text-xl font-bold text-white">Ask about your training</h2>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-gray-400">
                Get practical help understanding readiness, fatigue, soreness, training logs, and what to discuss with your coach.
              </p>

              <div className="mt-7 grid grid-cols-1 gap-2">
                {STARTER_PROMPTS.map(prompt => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendMessage(prompt)}
                    disabled={isSending || isLoadingConversation}
                    className="touch-target rounded-xl border border-[rgba(255,193,7,0.28)] bg-[rgba(255,193,7,0.08)] px-4 py-3 text-left text-sm font-semibold text-gray-100 shadow-lg backdrop-blur-xl transition hover:border-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <p className="mx-auto mt-6 max-w-xs text-xs leading-relaxed text-gray-500">
                The assistant cannot diagnose injuries or replace medical advice.
              </p>
            </div>
          ) : (
            messages.map(message => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-lg ${
                    message.role === 'user'
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'border border-[var(--card-border)] bg-[rgba(255,255,255,0.07)] text-gray-100'
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

        <div className="absolute bottom-0 left-0 right-0 border-t border-[var(--card-border)] bg-[rgba(16,18,27,0.94)] px-4 pb-4 pt-3 backdrop-blur-xl">
          {error && (
            <div className="mb-2 rounded-lg bg-[rgba(255,107,107,0.12)] px-3 py-2 text-xs font-medium text-[#ffb3a7]">
              {error}
            </div>
          )}

          <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-gray-500">
            <span>{lastMeta ? `${lastMeta.tier} / ${lastMeta.modelUsed}` : 'Read-only guidance'}</span>
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
                placeholder="Ask about readiness, fatigue, soreness, or training..."
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
              onClick={resetChatState}
              className="mx-auto mt-2 flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-300"
            >
              <RotateCcw size={13} />
              Start a new chat without deleting this one
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
