import 'server-only';

import OpenAI from 'openai';

import { getAiLimitConfig, PlayerAiTier } from './model-config';
import {
  buildPlayerAiSafetyInstructions,
  PlayerAiMessageRisk,
} from './player-ai-safety';

let openAiClient: OpenAI | null = null;

export type PlayerAiTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type PlayerAiResponse = {
  content: string;
  modelUsed: string;
  usage: PlayerAiTokenUsage;
};

export type PlayerAiConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type PlayerAiResponseMode = 'short' | 'detailed';

export class PlayerAiEmptyResponseError extends Error {
  constructor() {
    super('OpenAI response did not include assistant text.');
    this.name = 'PlayerAiEmptyResponseError';
  }
}

type ResponseOutputContentPart = {
  text?: unknown;
  refusal?: unknown;
  type?: unknown;
};

type ResponseOutputItemSummary = {
  content?: unknown;
  type?: unknown;
};

export const LODARIO_PLAYER_AI_SYSTEM_PROMPT = [
  'You are the Lodario player training assistant.',
  'Give read-only guidance based on the Lodario player context provided by the app.',
  'Use the provided Lodario player context first, before giving general advice.',
  'Current Lodario context is the source of truth. If recent conversation history conflicts with current context, use current context.',
  'Never ignore logged wellness, readiness, training, calendar, pain, or injury data when it is provided.',
  'If useful logged data exists, give a helpful answer from that data and do not say you cannot generate a useful response.',
  'If some context categories are missing, mention only those missing categories and still use the categories that exist.',
  'For weekly summaries, summarize the available last-7-day wellness and training patterns when they are present.',
  'For readiness questions, use the actual readiness score and breakdown when present.',
  'For fatigue questions, consider sleep, fatigue, soreness, training load, RPE/intensity, and pain notes when present.',
  'For training intensity questions, consider readiness, soreness, fatigue, recent load, and upcoming calendar when present.',
  'Do not invent readiness scores, wellness entries, training logs, calendar events, pain notes, injuries, or profile details.',
  'Keep answers concise, supportive, and specific, especially for free/nano users.',
].join('\n');

export const LODARIO_PLAYER_AI_RESPONSE_STYLE_PROMPT = [
  'Response style rules for every Lodario Player AI answer:',
  '- Default to short mode unless the user clearly asks for more detail.',
  '- In short mode, answer in 80 to 120 words maximum for normal responses.',
  '- In short mode, the player should be able to read the answer in about 10 seconds.',
  '- Give the direct answer first.',
  '- Preserve clear spacing with blank lines between sections.',
  '- Put every heading on its own line, ending with a colon.',
  '- Put every bullet on its own line starting with "- ".',
  '- Use this exact short-mode structure for first responses:',
  'Quick take:',
  '1 short sentence.',
  '',
  'What your data says:',
  '- 2 to 4 short bullets max.',
  '',
  'Best move:',
  '- 1 to 3 short bullets max.',
  '',
  'Want a more detailed breakdown?',
  '- Avoid big walls of text.',
  '- Use no more than 3 sections in short mode.',
  '- Do not include every data point in short mode; save full detail for follow-up.',
  '- End short answers with one simple follow-up question, such as "Want a more detailed breakdown?"',
  '- Do not repeat generic safety disclaimers unless pain, injury, dizziness, sharp pain, or concerning symptoms are mentioned.',
  '- If the user asks for more detail, give a longer but still organized answer with: what the data shows, why it matters, practical guidance, watch-outs, and suggested next step.',
  '- For "Summarize my week", give a short weekly snapshot first, then ask if they want details.',
  '- For "Explain my readiness", explain the score in 3 to 5 bullets.',
  '- For "Should I train hard today?", start with a direct yes, no, or maybe.',
  '- For "Why am I tired?", list 2 to 4 likely reasons from logged data.',
  '- For "What should I focus on?", give 2 to 3 priorities.',
  '- Interpret readiness breakdown scores as positive readiness contribution scores, not raw symptoms.',
  '- When mentioning readiness components, say "Fatigue contribution: 70/100", "Stress contribution: 80/100", or "Load contribution: 85/100".',
  '- Never write "high fatigue influence", "high stress impact", or similar wording for readiness contribution scores.',
  '- Use raw wellness values for symptoms: stress 1-3/10 is low, 4-6/10 is moderate, 7-10/10 is high.',
  '- Use raw wellness values for symptoms: fatigue 1-3/10 is low, 4-6/10 is moderate, 7-10/10 is high.',
  '- Energy is different: low energy means the raw energy value is low, such as 1-4/10.',
  '- Use raw wellness values for symptom wording: fatigue 4/10 is moderate fatigue, stress 3/10 is low stress, energy 4/10 is low energy.',
  '- Never say "fatigue score 70 means high fatigue" or "stress score 80 means high stress"; those are readiness contribution scores.',
].join('\n');

export function resolvePlayerAiResponseMode(message: string): PlayerAiResponseMode {
  const normalized = message.trim().toLowerCase();

  if (
    normalized === 'yes' ||
    normalized === 'yeah' ||
    normalized === 'yep' ||
    normalized === 'sure' ||
    normalized === 'please' ||
    /\bmore\s+detail\b/.test(normalized) ||
    /\bdetailed\s+breakdown\b/.test(normalized) ||
    /\bexplain\s+more\b/.test(normalized) ||
    /\bfull\s+(version|breakdown|explanation)\b/.test(normalized) ||
    /\bgive\s+me\s+the\s+full\b/.test(normalized) ||
    /\btell\s+me\s+more\b/.test(normalized)
  ) {
    return 'detailed';
  }

  return 'short';
}

function buildResponseModeInstructions(mode: PlayerAiResponseMode): string {
  if (mode === 'detailed') {
    return [
      'Current response mode: detailed.',
      'Expand on the previous answer if recent conversation history shows one.',
      'Use clear headings and spacing. Include what the data shows, why it matters, practical guidance, watch-outs, and a suggested next step.',
      'Stay readable on mobile: short paragraphs and bullets.',
    ].join('\n');
  }

  return [
    'Current response mode: short.',
    'Keep the answer about 50% shorter than a normal explanation.',
    'Use exactly this structure unless safety concerns require a small extra caution:',
    'Quick take:',
    'One short direct sentence.',
    '',
    'What your data says:',
    '- 2 to 4 short bullets.',
    '',
    'Best move:',
    '- 1 to 3 short bullets.',
    '',
    'Want a more detailed breakdown?',
    'End with one simple follow-up question asking whether the player wants more detail.',
  ].join('\n');
}

function buildRecentConversationInstructions(messages: PlayerAiConversationMessage[]): string {
  if (messages.length === 0) {
    return 'Recent conversation: none.';
  }

  return [
    'Recent conversation, for follow-up context only:',
    'If any previous score or data point conflicts with current Lodario context, ignore the old value.',
    ...messages.slice(-6).map(message => {
      const label = message.role === 'assistant' ? 'Assistant' : 'Player';
      const content = message.content.replace(/\s+/g, ' ').trim().slice(0, 700);
      return `${label}: ${content}`;
    }),
  ].join('\n');
}

function getOutputItems(response: OpenAI.Responses.Response): ResponseOutputItemSummary[] {
  return Array.isArray(response.output) ? (response.output as ResponseOutputItemSummary[]) : [];
}

function getContentParts(item: ResponseOutputItemSummary): ResponseOutputContentPart[] {
  return Array.isArray(item.content) ? (item.content as ResponseOutputContentPart[]) : [];
}

function findTextContent(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];

  if (Array.isArray(value)) {
    return value.flatMap(findTextContent);
  }

  const record = value as Record<string, unknown>;
  const texts: string[] = [];

  if (
    typeof record.text === 'string' &&
    record.text.trim() &&
    (record.type === 'output_text' || record.type === 'text' || record.type === 'message')
  ) {
    texts.push(record.text.trim());
  }

  if (Array.isArray(record.content)) {
    texts.push(...record.content.flatMap(findTextContent));
  }

  return texts;
}

function extractResponseText(response: OpenAI.Responses.Response): string {
  const outputText = response.output_text?.trim();
  if (outputText) return outputText;

  return findTextContent(response.output)
    .filter(Boolean)
    .join('\n')
    .trim();
}

function buildOpenAiResponseSummary(response: OpenAI.Responses.Response) {
  const outputItems = getOutputItems(response);
  const firstText = outputItems
    .flatMap(getContentParts)
    .find(part => typeof part.text === 'string' && part.text.trim());

  return {
    responseId: response.id,
    status: 'status' in response ? response.status : undefined,
    outputTextLength: response.output_text?.length ?? 0,
    outputItemCount: outputItems.length,
    outputItemTypes: outputItems.map(item => String(item.type ?? 'unknown')),
    firstTextContentLength: typeof firstText?.text === 'string' ? firstText.text.length : 0,
    incompleteReason: response.incomplete_details?.reason,
    errorCode: response.error?.code,
    errorMessage: response.error?.message,
  };
}

function logOpenAiResponseSummary(response: OpenAI.Responses.Response): void {
  if (process.env.NODE_ENV !== 'development') return;

  console.info('[player-ai] OpenAI response summary:', buildOpenAiResponseSummary(response));
}

export function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  if (!openAiClient) {
    openAiClient = new OpenAI({ apiKey });
  }

  return openAiClient;
}

export async function createPlayerAiResponse(params: {
  message: string;
  tier: PlayerAiTier;
  playerContext: string;
  messageRisk: PlayerAiMessageRisk;
  model: string;
  responseMode: PlayerAiResponseMode;
  recentMessages: PlayerAiConversationMessage[];
}): Promise<PlayerAiResponse> {
  const { maxOutputTokens } = getAiLimitConfig();
  const response = await getOpenAiClient().responses.create({
    model: params.model,
    max_output_tokens: maxOutputTokens,
    reasoning: {
      effort: 'minimal',
    },
    instructions: [
      LODARIO_PLAYER_AI_SYSTEM_PROMPT,
      '',
      LODARIO_PLAYER_AI_RESPONSE_STYLE_PROMPT,
      '',
      buildResponseModeInstructions(params.responseMode),
      '',
      buildRecentConversationInstructions(params.recentMessages),
      '',
      buildPlayerAiSafetyInstructions(params.messageRisk),
      '',
      'Lodario player context:',
      params.playerContext || 'No player context was available for this request.',
    ].join('\n'),
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: params.message,
          },
        ],
      },
    ],
  });
  logOpenAiResponseSummary(response);
  const content = extractResponseText(response);

  if (!content) {
    console.error('[player-ai] OpenAI returned no assistant text:', buildOpenAiResponseSummary(response));
    throw new PlayerAiEmptyResponseError();
  }

  return {
    content,
    modelUsed: params.model,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    },
  };
}

