import 'server-only';

export type PlayerAiMessageRisk = 'normal' | 'pain_or_injury' | 'unsafe_training';

const PAIN_OR_INJURY_PATTERNS = [
  /\bhamstring\b/i,
  /\bknee\b/i,
  /\bankle\b/i,
  /\bgroin\b/i,
  /\bconcussion\b/i,
  /\bdizz(?:y|iness)\b/i,
  /\bfaint(?:ing)?\b/i,
  /\bchest\s+pain\b/i,
  /\bsharp\s+pain\b/i,
  /\bswelling\b/i,
  /\b(?:can't|cant|cannot|can not)\s+walk\b/i,
  /\bsevere\s+pain\b/i,
  /\binjur(?:y|ed|ies)\b/i,
  /\bpain(?:ful)?\b/i,
  /\bsore(?:ness)?\b/i,
];

const UNSAFE_TRAINING_PATTERNS = [
  /\b(?:train|play|run|sprint)\s+through\b/i,
  /\bpush\s+through\b/i,
  /\bignore\s+(?:the\s+)?pain\b/i,
  /\bhide\s+(?:my\s+)?(?:pain|injury)\b/i,
  /\bcut\s+weight\b/i,
  /\blose\s+weight\s+fast\b/i,
  /\bdehydrat(?:e|ion)\b/i,
  /\b(?:no|without)\s+water\b/i,
  /\bskip\s+meals?\b/i,
  /\bovertrain(?:ing)?\b/i,
  /\btrain\s+all\s+day\b/i,
];

export const BASE_PLAYER_AI_SAFETY_PROMPT = [
  'Safety rules:',
  '- Clearly frame responses as training guidance, not medical advice.',
  '- Do not diagnose injuries, illnesses, or medical conditions.',
  '- Do not claim the player has a specific injury or illness.',
  '- Do not recommend training through sharp pain, worsening pain, chest pain, dizziness, fainting, severe pain, swelling, inability to walk, or other serious symptoms.',
  '- Use conservative advice for pain, injury, unusual fatigue, soreness, low readiness, or poor sleep.',
  '- For injury, pain, or concerning symptoms, encourage the player to speak with a coach, parent or guardian, doctor, physio, or qualified professional.',
  '- Avoid extreme training plans, unsafe weight cuts, dehydration, skipped meals, and overtraining.',
  '- Keep wording youth-athlete-safe, calm, and practical.',
  '- If serious symptoms are mentioned, advise the player to stop training and seek urgent help from a trusted adult or medical professional. Do not give detailed emergency medical instructions.',
  '- Do not invent player data when Lodario context is missing or sparse.',
].join('\n');

const PAIN_OR_INJURY_SAFETY_PROMPT = [
  'This request mentions pain, injury, or concerning symptoms.',
  'Be extra conservative: recommend reducing or stopping training when symptoms are sharp, worsening, unusual, or serious.',
  'Do not identify a specific injury. Suggest involving a coach, parent or guardian, doctor, or physio before returning to hard training.',
].join('\n');

const UNSAFE_TRAINING_SAFETY_PROMPT = [
  'This request may involve unsafe training, overtraining, dehydration, unsafe weight loss, or training through pain.',
  'Do not provide the unsafe plan. Give a safer alternative focused on recovery, hydration, nutrition, rest, and speaking with a trusted adult or qualified professional when needed.',
].join('\n');

function matchesAny(message: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(message));
}

export function classifyPlayerAiMessageRisk(message: string): PlayerAiMessageRisk {
  if (matchesAny(message, UNSAFE_TRAINING_PATTERNS)) {
    return 'unsafe_training';
  }

  if (matchesAny(message, PAIN_OR_INJURY_PATTERNS)) {
    return 'pain_or_injury';
  }

  return 'normal';
}

export function buildPlayerAiSafetyInstructions(risk: PlayerAiMessageRisk): string {
  if (risk === 'unsafe_training') {
    return [BASE_PLAYER_AI_SAFETY_PROMPT, UNSAFE_TRAINING_SAFETY_PROMPT].join('\n\n');
  }

  if (risk === 'pain_or_injury') {
    return [BASE_PLAYER_AI_SAFETY_PROMPT, PAIN_OR_INJURY_SAFETY_PROMPT].join('\n\n');
  }

  return BASE_PLAYER_AI_SAFETY_PROMPT;
}
