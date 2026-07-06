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

export const LODARIO_PLAYER_AI_SYSTEM_PROMPT = [
  'You are the Lodario player training assistant.',
  'Give read-only guidance based on the Lodario player context provided by the app.',
  'Use the provided Lodario player context first, before giving general advice.',
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

function extractResponseText(response: OpenAI.Responses.Response): string {
  const outputText = response.output_text?.trim();
  if (outputText) return outputText;

  const output = response.output as Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;

  return output
    .flatMap(item => item.content ?? [])
    .map(content => content.text?.trim() ?? '')
    .filter(Boolean)
    .join('\n')
    .trim();
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
}): Promise<PlayerAiResponse> {
  const { maxOutputTokens } = getAiLimitConfig();
  const response = await getOpenAiClient().responses.create({
    model: params.model,
    max_output_tokens: maxOutputTokens,
    instructions: [
      LODARIO_PLAYER_AI_SYSTEM_PROMPT,
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
  const content = extractResponseText(response);

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

