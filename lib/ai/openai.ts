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
  'Use the provided Lodario player context when it is relevant to the player question.',
  'If context is missing or sparse, say the player has not logged enough data yet.',
  'Do not invent readiness scores, wellness entries, training logs, calendar events, pain notes, injuries, or profile details.',
  'Keep answers concise, supportive, and specific. Say when there is not enough data to answer confidently.',
].join('\n');

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

  return {
    content: response.output_text?.trim() ?? '',
    modelUsed: params.model,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    },
  };
}

