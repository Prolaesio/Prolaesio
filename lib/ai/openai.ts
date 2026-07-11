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

export type PlayerAiResponseMode =
  | 'factual'
  | 'training_decision'
  | 'summary'
  | 'complex'
  | 'weight_advice'
  | 'short'
  | 'detailed';

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
  '- Match the depth to the question. Simple factual questions should be answered directly, not with sections.',
  '- For simple profile facts or single data values, answer in 1 sentence.',
  '- For normal summaries, use the short structured format.',
  '- For direct training decisions, answer yes/no/maybe first, then 2 to 3 short bullets.',
  '- For complex planning/calendar questions, use a slightly more detailed organized answer with dates/times when available.',
  '- For weight/body composition advice, answer directly using profile, age, goals/priorities, readiness, and training context; do not give unsafe weight-cut advice.',
  '- Default to concise mode unless the user clearly asks for more detail.',
  '- In concise mode, answer in 80 to 120 words maximum for normal non-factual responses.',
  '- The player should usually be able to read the answer in about 10 seconds.',
  '- Give the direct answer first.',
  '- Preserve clear spacing with blank lines between sections.',
  '- Put every heading on its own line, ending with a colon.',
  '- Put every bullet on its own line starting with "- ".',
  '- Use this short structured format for data summary questions:',
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
  '- Use no more than 3 sections in short structured mode.',
  '- Do not include every data point in concise mode; save full detail for follow-up.',
  '- Only ask a follow-up question when it is useful. Do not ask for a detailed breakdown after a simple factual answer.',
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

  if (
    /\b(?:lose|gain|maintain|cut|bulk)\s+(?:weight|mass)\b/.test(normalized) ||
    /\b(?:should|do)\s+i\s+(?:lose|gain|maintain|cut|bulk)\b/.test(normalized) ||
    /\bbody\s+composition\b/.test(normalized)
  ) {
    return 'weight_advice';
  }

  if (
    /\bhow\s+(?:tall|heavy|old)\s+(?:am\s+i|i\s+am)\b/.test(normalized) ||
    /\bhow\s+much\s+do\s+i\s+weigh\b/.test(normalized) ||
    /\bwhat(?:'s| is)\s+my\s+(?:height|weight|age|position|positions|readiness(?:\s+score)?)\b/.test(normalized) ||
    /\bwhat\s+position\s+(?:am\s+i|do\s+i\s+play)\b/.test(normalized) ||
    /\bmy\s+readiness\s+score\b/.test(normalized)
  ) {
    return 'factual';
  }

  if (
    /\bshould\s+i\s+(?:train|rest|do\s+gym|go\s+to\s+gym|lift|sprint|run|play)\b/.test(normalized) ||
    /\b(?:train|rest|gym|lift|sprint|run|play)\s+(?:hard\s+)?today\b/.test(normalized)
  ) {
    return 'training_decision';
  }

  if (
    /\b(?:summari[sz]e|explain|why|focus)\b/.test(normalized) &&
    /\b(?:week|readiness|tired|fatigue|focus|data)\b/.test(normalized)
  ) {
    return 'summary';
  }

  if (
    /\b(?:coach|calendar|schedule|scheduled|activities|next\s+\d+\s+days?|plan|compare|trend|around\s+my\s+calendar)\b/.test(normalized)
  ) {
    return 'complex';
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

  if (mode === 'factual') {
    return [
      'Current response mode: simple factual.',
      'Answer directly in exactly 1 sentence when the requested fact is present in current Lodario context.',
      'Do not use headings, bullets, "Best move", or "Want a more detailed breakdown?".',
      'Use current Lodario context as the source of truth.',
      'For height, include centimeters and a helpful feet/inches conversion, for example: "You are 170 cm (5\'7\") according to your profile."',
      'For weight, answer in kilograms from the profile, for example: "You weigh 68.5 kg according to your profile."',
      'For age, answer using the provided age/date of birth.',
      'For positions, list the profile positions.',
      'For readiness score, answer with the current dashboard readiness score if provided.',
      'If the exact requested fact is missing, say only that it is not in the Lodario profile/context yet.',
    ].join('\n');
  }

  if (mode === 'training_decision') {
    return [
      'Current response mode: direct training decision.',
      'Start with a direct "Yes", "No", or "Maybe" answer in the first sentence.',
      'Then give 2 to 3 short bullets using the most relevant current readiness, wellness, training load, pain, and calendar context.',
      'Keep it short. Do not use the full Quick take / What your data says / Best move template.',
      'Ask one useful follow-up only if it naturally helps the player choose the next session.',
    ].join('\n');
  }

  if (mode === 'summary') {
    return [
      'Current response mode: data summary.',
      'Use exactly this short structured format:',
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
    ].join('\n');
  }

  if (mode === 'complex') {
    return [
      'Current response mode: complex planning or calendar.',
      'Give a slightly more detailed organized answer.',
      'Use bullets and dates/times when calendar or coach-scheduled activity context is available.',
      'Do not dump every log; include only the relevant items for the question.',
      'End with "Want the detailed breakdown?" only when a deeper plan would be useful.',
    ].join('\n');
  }

  if (mode === 'weight_advice') {
    return [
      'Current response mode: weight/body composition advice.',
      'Answer directly first: maintain, gain slowly, or avoid weight loss/gain for now when supported by context.',
      'Use height, weight, age, positions, priorities/goals, readiness, and recent training context when available.',
      'Do not just list random logs. Explain the practical reason in 2 to 4 short bullets.',
      'Avoid unsafe weight cuts, rapid weight loss, dehydration, skipped meals, or appearance-focused advice.',
      'For youth athletes, be conservative and suggest discussing body composition goals with a coach, parent/guardian, or qualified professional if relevant.',
      'Keep the first response short and offer detailed reasoning only at the end.',
    ].join('\n');
  }

  return [
    'Current response mode: short.',
    'Keep the answer about 50% shorter than a normal explanation.',
    'Use this structure for normal data summary questions unless the user asked a simple factual or direct decision question:',
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

