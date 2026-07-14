import 'server-only';

import { SupabaseClient } from '@supabase/supabase-js';
import { format, subDays } from 'date-fns';

import { PlayerAiTier } from './model-config';
import { calculatePlayerReadinessForDate } from '@/lib/readiness';
import { analyzeTrainingLoad } from '@/lib/training-load';
import { TrainingLog, WellnessLog } from '@/lib/types';

type ProfileRow = {
  age: number | null;
  date_of_birth: string | null;
  positions: string[] | null;
  priorities: string[] | null;
  height_cm: number | string | null;
  weight_kg: number | string | null;
};

type WellnessRow = {
  date: string;
  sleep_time: string | null;
  wake_time: string | null;
  sleep_duration: number | string | null;
  sleep_quality: number | null;
  energy: number | null;
  fatigue: number | null;
  stress: number | null;
  pain_active: boolean | null;
  pain_level: number | null;
  pain_notes: string | null;
  notes: string | null;
};

type TrainingRow = {
  id: string;
  date: string;
  session_type: string | null;
  duration: number | null;
  distance: number | string | null;
  intensity: number | null;
  sprinting: string | null;
  performance: number | null;
  pain_active: boolean | null;
  pain_level: number | null;
  pain_notes: string | null;
  notes: string | null;
};

type CalendarRow = {
  event_type_id: string;
  title: string | null;
  description: string | null;
  start_time: string;
  end_time: string;
  recurrence: string | null;
  recurrence_config: unknown;
  anticipated_intensity: string | null;
};

type InjuryRow = {
  description: string;
  doctor_notes: string | null;
  expected_return: string | null;
  status: string | null;
  auto_tracked: boolean | null;
  created_at: string;
};

type ContextWindows = {
  wellnessDays: number;
  wellnessLimit?: number;
  trainingDays: number;
  trainingLimit?: number;
  calendarDays: number;
  includeProfile: boolean;
  includeInjuries: boolean;
  includeLoad: boolean;
};

const TIER_WINDOWS: Record<PlayerAiTier, ContextWindows> = {
  free: {
    wellnessDays: 7,
    wellnessLimit: 7,
    trainingDays: 7,
    trainingLimit: 7,
    calendarDays: 7,
    includeProfile: true,
    includeInjuries: false,
    includeLoad: false,
  },
  pro: {
    wellnessDays: 7,
    trainingDays: 7,
    calendarDays: 7,
    includeProfile: true,
    includeInjuries: true,
    includeLoad: false,
  },
  premium: {
    wellnessDays: 14,
    trainingDays: 28,
    calendarDays: 14,
    includeProfile: true,
    includeInjuries: true,
    includeLoad: true,
  },
};

const READINESS_LOOKBACK_DAYS = 35;

export type PlayerAiContextDebugSummary = {
  userId: string;
  tier: PlayerAiTier;
  wellnessRowCount: number;
  trainingLogRowCount: number;
  calendarRowCount: number;
  readinessFound: boolean;
  readinessValue: number | null;
  readinessBreakdown: {
    sleep: number;
    energy: number;
    fatigue: number;
    stress: number;
    load: number;
  } | null;
  latestWellnessDate: string | null;
  latestTrainingLogDate: string | null;
  contextDateRange: {
    asOfDate: string;
    wellnessStart: string;
    trainingStart: string;
    readinessStart: string;
  };
  profileFound: boolean;
  heightFound: boolean;
  weightFound: boolean;
  ageFound: boolean;
  positionsFound: boolean;
  contextCharacterLength: number;
};

export type PlayerAiContextResult = {
  context: string;
  debugSummary: PlayerAiContextDebugSummary;
};

function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function numberOrZero(value: number | string | null): number {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function maybeNumber(value: number | string | null): number | undefined {
  if (value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sanitizeText(value: string | null | undefined, maxLength = 180): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function calculateAge(dateOfBirth: string | null, asOfDate: Date): number | null {
  if (!dateOfBirth) return null;

  const birthDate = new Date(`${dateOfBirth}T12:00:00`);
  if (Number.isNaN(birthDate.getTime())) return null;

  let age = asOfDate.getFullYear() - birthDate.getFullYear();
  const monthDelta = asOfDate.getMonth() - birthDate.getMonth();
  const hasBirthdayPassed =
    monthDelta > 0 || (monthDelta === 0 && asOfDate.getDate() >= birthDate.getDate());

  if (!hasBirthdayPassed) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

function mapWellness(row: WellnessRow): WellnessLog {
  return {
    date: row.date,
    sleepTime: row.sleep_time ?? '',
    wakeTime: row.wake_time ?? '',
    sleepDuration: numberOrZero(row.sleep_duration),
    sleepQuality: row.sleep_quality ?? 0,
    energy: row.energy ?? 0,
    fatigue: row.fatigue ?? 0,
    stress: row.stress ?? 0,
    painActive: row.pain_active ?? false,
    painLevel: row.pain_level ?? undefined,
    painNotes: row.pain_notes ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function mapTraining(row: TrainingRow): TrainingLog {
  return {
    id: row.id,
    date: row.date,
    sessionType: (row.session_type ?? 'Other') as TrainingLog['sessionType'],
    duration: row.duration ?? 0,
    distance: maybeNumber(row.distance),
    intensity: row.intensity ?? 0,
    sprinting: (row.sprinting ?? 'no') as TrainingLog['sprinting'],
    performance: row.performance ?? undefined,
    painActive: row.pain_active ?? false,
    painLevel: row.pain_level ?? undefined,
    painNotes: row.pain_notes ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function isCoachDraftEvent(recurrenceConfig: unknown): boolean {
  if (!recurrenceConfig || typeof recurrenceConfig !== 'object' || Array.isArray(recurrenceConfig)) {
    return false;
  }

  const meta = (recurrenceConfig as Record<string, unknown>).meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return false;
  }

  const normalizedMeta = meta as Record<string, unknown>;
  return normalizedMeta.coachManaged === true && normalizedMeta.published === false;
}

function getProfileDebugSummary(profile: ProfileRow | null, asOfDate: Date) {
  const calculatedAge = calculateAge(profile?.date_of_birth ?? null, asOfDate);

  return {
    profileFound: Boolean(profile),
    heightFound: profile?.height_cm != null,
    weightFound: profile?.weight_kg != null,
    ageFound: calculatedAge != null || profile?.age != null,
    positionsFound: Boolean(profile?.positions?.length),
  };
}

function summarizeProfile(profile: ProfileRow | null, asOfDate: Date): string[] {
  if (!profile) return ['Profile: not available.'];

  const age = calculateAge(profile.date_of_birth, asOfDate) ?? profile.age;
  const parts = [
    profile.height_cm != null ? `Height: ${Number(profile.height_cm)} cm` : null,
    profile.weight_kg != null ? `Weight: ${Number(profile.weight_kg)} kg` : null,
    age != null ? `Age: ${age}` : null,
    profile.date_of_birth ? `Date of birth: ${profile.date_of_birth}` : null,
    profile.positions?.length ? `Positions: ${profile.positions.join(', ')}` : null,
    profile.priorities?.length ? `Priorities/goals: ${profile.priorities.join(', ')}` : null,
  ].filter(Boolean);

  return [
    `Player profile: ${parts.length ? parts.join('; ') : 'limited profile data available'}.`,
  ];
}

function getLatestReadinessSummary(
  wellnessLogs: WellnessLog[],
  trainingLogs: TrainingLog[],
  asOfDate: Date
): {
  found: boolean;
  value: number | null;
  breakdown: PlayerAiContextDebugSummary['readinessBreakdown'];
  lines: string[];
} {
  const asOfDateKey = toDateKey(asOfDate);
  const todayWellness = wellnessLogs.find(log => log.date === asOfDateKey);
  if (!todayWellness) {
    return {
      found: false,
      value: null,
      breakdown: null,
      lines: [`Readiness: not available for ${asOfDateKey} because no wellness entry was found for the dashboard date.`],
    };
  }

  const { readiness, load } = calculatePlayerReadinessForDate(wellnessLogs, trainingLogs, asOfDate);

  if (readiness.zone === 'no_data') {
    return {
      found: false,
      value: null,
      breakdown: null,
      lines: [`Readiness: not available for ${asOfDateKey}.`],
    };
  }

  return {
    found: true,
    value: readiness.score,
    breakdown: readiness.breakdown,
    lines: [
      `Current dashboard readiness (${asOfDateKey}): ${readiness.score}/100, ${readiness.zoneLabel}. This must match the player dashboard Daily Readiness.`,
      `Readiness contribution scores: sleep contribution ${readiness.breakdown.sleep}/100, energy contribution ${readiness.breakdown.energy}/100, fatigue contribution ${readiness.breakdown.fatigue}/100, stress contribution ${readiness.breakdown.stress}/100, load contribution ${readiness.breakdown.load}/100. These are positive readiness contribution scores, not raw symptom severity.`,
      `Load status: ${load.loadRisk}; 7-day load ${Math.round(load.sevenDayLoad)}; acute:chronic ratio ${load.acuteChronicRatio.toFixed(2)}.`,
    ],
  };
}

function summarizeWellness(wellnessLogs: WellnessLog[], tier: PlayerAiTier): string[] {
  if (wellnessLogs.length === 0) return ['Wellness: no recent wellness entries found.'];

  const latest = wellnessLogs[0];
  const lines = [
    `Latest wellness (${latest.date}): sleep ${latest.sleepDuration}h, sleep quality ${latest.sleepQuality}/10, energy ${latest.energy}/10, fatigue ${latest.fatigue}/10, stress ${latest.stress}/10${latest.painActive ? `, pain ${latest.painLevel ?? 'logged'}/10` : ', no active pain logged'}.`,
  ];

  if (wellnessLogs.length > 1) {
    const avg = wellnessLogs.reduce(
      (acc, log) => ({
        sleep: acc.sleep + log.sleepDuration,
        energy: acc.energy + log.energy,
        fatigue: acc.fatigue + log.fatigue,
        stress: acc.stress + log.stress,
      }),
      { sleep: 0, energy: 0, fatigue: 0, stress: 0 }
    );
    const count = wellnessLogs.length;
    lines.push(
      `Wellness average (${count} entries): sleep ${(avg.sleep / count).toFixed(1)}h, energy ${(avg.energy / count).toFixed(1)}/10, fatigue ${(avg.fatigue / count).toFixed(1)}/10, stress ${(avg.stress / count).toFixed(1)}/10.`
    );
  }

  const painNotes = wellnessLogs
    .filter(log => log.painActive || log.painNotes)
    .slice(0, 3)
    .map(log => `${log.date}: pain ${log.painLevel ?? 'logged'}/10${sanitizeText(log.painNotes) ? ` (${sanitizeText(log.painNotes)})` : ''}`);

  if (painNotes.length > 0) {
    lines.push(`Recent wellness pain notes: ${painNotes.join('; ')}.`);
  }

  return lines;
}

function summarizeTraining(trainingLogs: TrainingLog[], tier: PlayerAiTier): string[] {
  if (trainingLogs.length === 0) return ['Training logs: no recent training logs found.'];

  const lines = trainingLogs.map(log => {
    const notes = sanitizeText(log.notes, 100);
    const pain = log.painActive ? `, pain ${log.painLevel ?? 'logged'}/10` : '';
    return `${log.date}: ${log.sessionType}, ${log.duration} min, intensity ${log.intensity}/10${log.distance != null ? `, ${log.distance} km` : ''}${log.performance != null ? `, performance ${log.performance}/10` : ''}${pain}${notes ? `, note: ${notes}` : ''}`;
  });

  return [
    tier === 'free' ? `Last ${trainingLogs.length} training logs:` : `Recent training logs (${trainingLogs.length}):`,
    ...lines.map(line => `- ${line}`),
  ];
}

function summarizeLoad(trainingLogs: TrainingLog[], wellnessLogs: WellnessLog[]): string[] {
  const load = analyzeTrainingLoad(trainingLogs, wellnessLogs);
  return [
    `Training load: risk ${load.loadRisk}; 7-day load ${Math.round(load.sevenDayLoad)}; acute load ${Math.round(load.acuteLoad)}; chronic load ${Math.round(load.chronicLoad)}; acute:chronic ratio ${load.acuteChronicRatio.toFixed(2)}; monotony ${load.monotony.toFixed(2)}; strain ${Math.round(load.strain)}.`,
  ];
}

function summarizeCalendar(events: CalendarRow[]): string[] {
  const visibleEvents = events.filter(event => !isCoachDraftEvent(event.recurrence_config));
  if (visibleEvents.length === 0) return ['Calendar: no upcoming events found in the tier window.'];

  return [
    `Upcoming calendar events (${visibleEvents.length}):`,
    ...visibleEvents.slice(0, 10).map(event => {
      const title = sanitizeText(event.title) ?? event.event_type_id;
      const description = sanitizeText(event.description, 100);
      return `- ${event.start_time}: ${title}${event.anticipated_intensity ? `, anticipated intensity ${event.anticipated_intensity}` : ''}${event.recurrence && event.recurrence !== 'none' ? `, repeats ${event.recurrence}` : ''}${description ? `, note: ${description}` : ''}`;
    }),
  ];
}

function summarizeInjuries(injuries: InjuryRow[], wellnessLogs: WellnessLog[], trainingLogs: TrainingLog[]): string[] {
  const lines: string[] = [];
  const relevantInjuries = injuries.filter(injury => injury.status === 'active' || injury.status === 'recovering').slice(0, 5);

  if (relevantInjuries.length > 0) {
    lines.push('Pain/injury records:');
    relevantInjuries.forEach(injury => {
      const note = sanitizeText(injury.doctor_notes, 120);
      lines.push(`- ${injury.status ?? 'logged'}: ${sanitizeText(injury.description, 140) ?? 'No description'}${injury.expected_return ? `, expected return ${injury.expected_return}` : ''}${injury.auto_tracked ? ', auto-tracked' : ''}${note ? `, note: ${note}` : ''}.`);
    });
  }

  const trainingPain = trainingLogs
    .filter(log => log.painActive || log.painNotes)
    .slice(0, 3)
    .map(log => `${log.date}: ${log.sessionType}, pain ${log.painLevel ?? 'logged'}/10${sanitizeText(log.painNotes) ? ` (${sanitizeText(log.painNotes)})` : ''}`);

  if (trainingPain.length > 0) {
    lines.push(`Training pain notes: ${trainingPain.join('; ')}.`);
  }

  const wellnessPain = wellnessLogs
    .filter(log => log.painActive || log.painNotes)
    .slice(0, 3)
    .map(log => `${log.date}: pain ${log.painLevel ?? 'logged'}/10${sanitizeText(log.painNotes) ? ` (${sanitizeText(log.painNotes)})` : ''}`);

  if (wellnessPain.length > 0) {
    lines.push(`Wellness pain notes: ${wellnessPain.join('; ')}.`);
  }

  if (lines.length === 0) return ['Pain/injury context: no active injury records or recent pain notes found.'];
  return lines;
}

async function safeQuery<T>(
  label: string,
  query: PromiseLike<{ data: T | null; error: { message?: string } | null }>
): Promise<T | null> {
  const { data, error } = await query;
  if (error) {
    console.error(`[player-ai] ${label} context lookup failed:`, error);
    return null;
  }
  return data;
}

export async function buildPlayerAiContextResult(params: {
  supabase: SupabaseClient;
  userId: string;
  tier: PlayerAiTier;
  asOfDate?: Date;
}): Promise<PlayerAiContextResult> {
  const windows = TIER_WINDOWS[params.tier];
  const now = params.asOfDate ?? new Date();
  const wellnessStart = toDateKey(subDays(now, windows.wellnessDays - 1));
  const trainingStart = toDateKey(subDays(now, windows.trainingDays - 1));
  const readinessStart = toDateKey(subDays(now, READINESS_LOOKBACK_DAYS - 1));
  const calendarEnd = new Date(now);
  calendarEnd.setDate(calendarEnd.getDate() + windows.calendarDays);

  const [profile, wellnessRows, trainingRows, readinessWellnessRows, readinessTrainingRows, calendarRows, injuryRows] = await Promise.all([
    windows.includeProfile
      ? safeQuery<ProfileRow>('profile', params.supabase
        .from('profiles')
        .select('age, date_of_birth, positions, priorities, height_cm, weight_kg')
        .eq('id', params.userId)
        .maybeSingle())
      : Promise.resolve(null),
    safeQuery<WellnessRow[]>('wellness', params.supabase
      .from('wellness_logs')
      .select('date, sleep_time, wake_time, sleep_duration, sleep_quality, energy, fatigue, stress, pain_active, pain_level, pain_notes, notes')
      .eq('user_id', params.userId)
      .gte('date', wellnessStart)
      .order('date', { ascending: false })
      .limit(windows.wellnessLimit ?? 20)),
    safeQuery<TrainingRow[]>('training', params.supabase
      .from('training_logs')
      .select('id, date, session_type, duration, distance, intensity, sprinting, performance, pain_active, pain_level, pain_notes, notes')
      .eq('user_id', params.userId)
      .gte('date', trainingStart)
      .order('date', { ascending: false })
      .limit(windows.trainingLimit ?? 50)),
    safeQuery<WellnessRow[]>('readiness wellness', params.supabase
      .from('wellness_logs')
      .select('date, sleep_time, wake_time, sleep_duration, sleep_quality, energy, fatigue, stress, pain_active, pain_level, pain_notes, notes')
      .eq('user_id', params.userId)
      .gte('date', readinessStart)
      .order('date', { ascending: false })
      .limit(READINESS_LOOKBACK_DAYS)),
    safeQuery<TrainingRow[]>('readiness training', params.supabase
      .from('training_logs')
      .select('id, date, session_type, duration, distance, intensity, sprinting, performance, pain_active, pain_level, pain_notes, notes')
      .eq('user_id', params.userId)
      .gte('date', readinessStart)
      .order('date', { ascending: false })
      .limit(120)),
    windows.calendarDays > 0
      ? safeQuery<CalendarRow[]>('calendar', params.supabase
        .from('calendar_events')
        .select('event_type_id, title, description, start_time, end_time, recurrence, recurrence_config, anticipated_intensity')
        .eq('user_id', params.userId)
        .gte('start_time', now.toISOString())
        .lte('start_time', calendarEnd.toISOString())
        .order('start_time', { ascending: true })
        .limit(20))
      : Promise.resolve(null),
    windows.includeInjuries
      ? safeQuery<InjuryRow[]>('injuries', params.supabase
        .from('injuries')
        .select('description, doctor_notes, expected_return, status, auto_tracked, created_at')
        .eq('user_id', params.userId)
        .order('created_at', { ascending: false })
        .limit(10))
      : Promise.resolve(null),
  ]);

  const wellnessLogs = (wellnessRows ?? []).map(mapWellness);
  const trainingLogs = (trainingRows ?? []).map(mapTraining);
  const readinessWellnessLogs = (readinessWellnessRows ?? []).map(mapWellness);
  const readinessTrainingLogs = (readinessTrainingRows ?? []).map(mapTraining);
  const readinessSummary = getLatestReadinessSummary(readinessWellnessLogs, readinessTrainingLogs, now);
  const lines: string[] = [
    `Context tier: ${params.tier}.`,
    `Context generated at: ${now.toISOString()}.`,
    `Current dashboard date: ${toDateKey(now)}. Current Lodario context is the source of truth.`,
    `Context coverage: ${wellnessLogs.length} wellness entr${wellnessLogs.length === 1 ? 'y' : 'ies'}, ${trainingLogs.length} training log${trainingLogs.length === 1 ? '' : 's'}, ${(calendarRows ?? []).length} upcoming calendar event${(calendarRows ?? []).length === 1 ? '' : 's'}.`,
    'Use the logged data below first. If conversation history conflicts with current Lodario context, ignore the old conversation value and use current Lodario context.',
    'Use player profile facts when the player asks about their height, weight, age, positions, priorities, or goals. If a profile field is present below, answer with that exact profile value.',
    'If one category is missing, mention only that category is missing and still use the data that exists.',
  ];

  if (windows.includeProfile) {
    lines.push(...summarizeProfile(profile, now));
  }

  lines.push(...readinessSummary.lines);
  lines.push(...summarizeWellness(wellnessLogs, params.tier));
  lines.push(...summarizeTraining(trainingLogs, params.tier));

  if (windows.includeLoad) {
    lines.push(...summarizeLoad(trainingLogs, wellnessLogs));
  }

  if (calendarRows) {
    lines.push(...summarizeCalendar(calendarRows));
  }

  if (windows.includeInjuries) {
    lines.push(...summarizeInjuries(injuryRows ?? [], wellnessLogs, trainingLogs));
  }

  const context = lines
    .filter(Boolean)
    .join('\n')
    .slice(0, params.tier === 'free' ? 2600 : params.tier === 'pro' ? 4200 : 6500);

  const profileDebugSummary = getProfileDebugSummary(profile, now);

  return {
    context,
    debugSummary: {
      userId: params.userId,
      tier: params.tier,
      wellnessRowCount: wellnessLogs.length,
      trainingLogRowCount: trainingLogs.length,
      calendarRowCount: (calendarRows ?? []).length,
      readinessFound: readinessSummary.found,
      readinessValue: readinessSummary.value,
      readinessBreakdown: readinessSummary.breakdown,
      latestWellnessDate: readinessWellnessLogs[0]?.date ?? null,
      latestTrainingLogDate: readinessTrainingLogs[0]?.date ?? null,
      contextDateRange: {
        asOfDate: toDateKey(now),
        wellnessStart,
        trainingStart,
        readinessStart,
      },
      ...profileDebugSummary,
      contextCharacterLength: context.length,
    },
  };
}

export async function buildPlayerAiContext(params: {
  supabase: SupabaseClient;
  userId: string;
  tier: PlayerAiTier;
}): Promise<string> {
  const result = await buildPlayerAiContextResult(params);
  return result.context;
}
