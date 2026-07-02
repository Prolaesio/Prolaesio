import 'server-only';

import OpenAI from 'openai';

import { getModelForPlayerTier, PlayerAiTier } from './model-config';

let openAiClient: OpenAI | null = null;

export const LODARIO_PLAYER_AI_SYSTEM_PROMPT = [
  'You are the Lodario player training assistant.',
  'Give read-only guidance based on the player training context provided by the app.',
  'Do not diagnose injuries, illnesses, or medical conditions.',
  'Do not give dangerous training advice or tell a player to push through pain.',
  'Use conservative advice for pain, injury, unusual fatigue, soreness, low readiness, or poor sleep.',
  'Use calm, practical, youth-athlete-safe wording.',
  'Encourage the player to talk to a coach, parent, guardian, athletic trainer, doctor, or qualified professional when symptoms are concerning, worsening, or persistent.',
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
}): Promise<string> {
  const response = await getOpenAiClient().responses.create({
    model: getModelForPlayerTier(params.tier),
    instructions: LODARIO_PLAYER_AI_SYSTEM_PROMPT,
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

  return response.output_text?.trim() ?? '';
}

