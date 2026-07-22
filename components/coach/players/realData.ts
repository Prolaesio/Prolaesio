import { format, getDay, isBefore, parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { calculatePlayerReadinessForDate } from '@/lib/readiness';
import { generateRecommendation, type RecommendationResult } from '@/lib/recommendations';
import { analyzeTrainingLoad, calculateSessionLoad } from '@/lib/training-load';
import {
  describePainSignal,
  formatReportedAgo,
  getLatestPainStatus,
  shouldTreatPainAsInjury,
  type PainStatusSignal,
} from '@/lib/injury-status';
import { resolvePlayerDisplayName } from '@/lib/player-names';
import {
  dedupeCalendarEventsById,
  isBuiltInActivityEventType,
  parseCoachCalendarMeta,
  parseExcludedDates,
  parseOverrideMap,
  parseRecurrence,
  parseRecurrenceConfig,
  resolveCalendarOccurrence,
} from '@/lib/calendar/events';
import type { CalendarEvent, InjuryRecord, TrainingLog, UserProfile, WellnessLog } from '@/lib/types';
import type {
  CoachPlayer,
  PlayerInjuryStatus,
  PlayerNoteItem,
  PlayerSessionType,
  TeamPlayerDataset,
} from '@/components/coach/players/types';

interface TeamPlayerRpcRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  age: number | null;
  height_cm: number | string | null;
  weight_kg: number | string | null;
  positions: string[] | null;
  joined_at: string | null;
}

interface WellnessRow {
  user_id: string;
  date: string;
  created_at: string;
  energy: number;
  fatigue: number;
  stress: number;
  sleep_quality: number;
  sleep_duration: number | string;
  sleep_time: string;
  wake_time: string;
  notes: string | null;
  pain_notes: string | null;
  pain_active: boolean;
  pain_level: number | null;
  is_injury?: boolean | null;
}

interface TrainingRow {
  id: string;
  user_id: string;
  date: string;
  created_at: string;
  duration: number;
  intensity: number;
  session_type: string;
  sprinting: string;
  performance: number | null;
  pain_active: boolean;
  pain_level: number | null;
  is_injury?: boolean | null;
  notes: string | null;
  pain_notes: string | null;
}

export interface CalendarRow {
  id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  event_type_id: string;
  start_time: string;
  end_time: string;
  recurrence: string | null;
  recurrence_config: unknown;
  recurrence_end_date: string | null;
  excluded_dates: unknown;
  overrides: unknown;
  anticipated_intensity: 'Low' | 'Moderate' | 'High' | null;
}

interface InjuryRow {
  id: string;
  user_id: string;
  description: string;
  expected_return: string | null;
  status: string | null;
  created_at: string;
}

interface EventTypeActivityRow {
  id: string;
  user_id: string;
  is_activity: boolean | null;
  is_deleted: boolean | null;
}

type SupabaseErrorLike = {
  message?: string | null;
  details?: string | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isMissingCalendarDescriptionError(error: SupabaseErrorLike | null | undefined): boolean {
  const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase();
  return message.includes('column calendar_events.description does not exist');
}

function isMissingCalendarColumnError(error: SupabaseErrorLike | null | undefined): boolean {
  const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase();
  return message.includes('column calendar_events.') && message.includes('does not exist');
}

export async function loadCalendarRowsForPlayers(playerIds: string[]): Promise<{ rows: CalendarRow[]; error: string | null }> {
  const selectWithDescription =
    'id, user_id, title, description, event_type_id, start_time, end_time, recurrence, recurrence_config, recurrence_end_date, excluded_dates, overrides, anticipated_intensity';
  const selectCoreOnly = 'id, user_id, title, event_type_id, start_time, end_time';

  const firstAttempt = await supabase
    .from('calendar_events')
    .select(selectWithDescription)
    .in('user_id', playerIds)
    .order('start_time', { ascending: true });

  if (!firstAttempt.error) {
    return { rows: (firstAttempt.data ?? []) as CalendarRow[], error: null };
  }

  if (!isMissingCalendarDescriptionError(firstAttempt.error) && !isMissingCalendarColumnError(firstAttempt.error)) {
    return { rows: [], error: firstAttempt.error.message || 'Unable to load calendar events.' };
  }

  const fallbackAttempt = await supabase
    .from('calendar_events')
    .select(selectCoreOnly)
    .in('user_id', playerIds)
    .order('start_time', { ascending: true });

  if (fallbackAttempt.error) {
    return { rows: [], error: fallbackAttempt.error.message || 'Unable to load calendar events.' };
  }

  const rows = ((fallbackAttempt.data ?? []) as Array<Pick<CalendarRow, 'id' | 'user_id' | 'title' | 'event_type_id' | 'start_time' | 'end_time'>>).map((row) => ({
    ...row,
    description: null,
    recurrence: null,
    recurrence_config: {},
    recurrence_end_date: null,
    excluded_dates: [],
    overrides: {},
    anticipated_intensity: null,
  }));

  return { rows, error: null };
}

async function loadEventTypeActivityForPlayers(playerIds: string[]): Promise<{
  activityByPlayerAndType: Map<string, boolean>;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('custom_event_types')
    .select('id, user_id, is_activity, is_deleted')
    .in('user_id', playerIds);

  if (error) {
    return {
      activityByPlayerAndType: new Map(),
      error: error.message || 'Unable to load player event type activity settings.',
    };
  }

  const activityByPlayerAndType = new Map<string, boolean>();
  for (const row of (data ?? []) as EventTypeActivityRow[]) {
    activityByPlayerAndType.set(
      `${row.user_id}:${row.id}`,
      row.is_deleted !== true && row.is_activity === true
    );
  }

  return { activityByPlayerAndType, error: null };
}

function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function formatLabel(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00`);
  return Number.isNaN(date.getTime()) ? dateString : format(date, 'MMM d');
}

function toDateAndTime(isoValue: string): { date: string; time: string } {
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) {
    const [datePart = '', timePart = '00:00'] = isoValue.split('T');
    return { date: datePart, time: timePart.slice(0, 5) };
  }

  return {
    date: format(parsed, 'yyyy-MM-dd'),
    time: format(parsed, 'HH:mm'),
  };
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getLocalDateKey(now = new Date()): string {
  return format(now, 'yyyy-MM-dd');
}

function normalizeInjuryState(status: string | null | undefined): 'active' | 'recovering' | 'resolved' | 'unknown' {
  const normalized = (status ?? '').trim().toLowerCase();
  if (normalized === 'active' || normalized === 'injured') return 'active';
  if (normalized === 'recovering') return 'recovering';
  if (normalized === 'resolved' || normalized === 'healthy') return 'resolved';
  return 'unknown';
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {}
  }

  return null;
}

function mapEventTypeIdToPlayerSessionType(rawType: string): PlayerSessionType {
  const normalized = rawType.trim().toLowerCase();
  if (normalized.includes('match') || normalized.includes('game')) return 'game';
  if (normalized.includes('hiit') || normalized.includes('interval') || normalized.includes('conditioning')) return 'hiit';
  if (normalized.includes('cardio') || normalized.includes('run') || normalized.includes('cycle') || normalized.includes('bike')) return 'cardio';
  if (normalized.includes('train')) return 'training';
  if (normalized.includes('recover')) return 'recovery';
  if (normalized.includes('gym') || normalized.includes('lift')) return 'gym';
  if (normalized.includes('meeting')) return 'meeting';
  if (normalized.includes('solo') || normalized.includes('individual')) return 'solo';
  return 'other';
}

function isPlayerCreatedActivityEvent(
  row: CalendarRow,
  activityByPlayerAndType: Map<string, boolean>
): boolean {
  const activityKey = `${row.user_id}:${row.event_type_id}`;
  if (activityByPlayerAndType.has(activityKey)) {
    return activityByPlayerAndType.get(activityKey) === true;
  }

  return isBuiltInActivityEventType(row.event_type_id);
}

function isVisibleInCoachPlayerCalendar(
  row: CalendarRow,
  player: CoachPlayer,
  activityByPlayerAndType: Map<string, boolean>
): boolean {
  const meta = parseCoachCalendarMeta(row.recurrence_config);
  if (meta?.coachManaged) {
    if (meta.published === false) return false;
    if (meta.teamId && meta.teamId !== player.teamId) return false;
    if (meta.assignmentScope === 'team') return true;

    return !meta.assignedPlayerId || meta.assignedPlayerId === player.id;
  }

  return isPlayerCreatedActivityEvent(row, activityByPlayerAndType);
}

function buildWellnessNotes(wellnessRows: WellnessRow[]): PlayerNoteItem[] {
  const notes: PlayerNoteItem[] = [];

  wellnessRows.forEach((row) => {
    const generalNote = normalizeText(row.notes);
    if (generalNote) {
      notes.push({
        id: `wellness-note-${row.user_id}-${row.date}`,
        date: row.date,
        note: generalNote,
      });
    }

    const painNote = normalizeText(row.pain_notes);
    if (painNote) {
      notes.push({
        id: `wellness-pain-note-${row.user_id}-${row.date}`,
        date: row.date,
        note: `Pain note: ${painNote}`,
      });
    }
  });

  return notes
    .sort((first, second) => second.date.localeCompare(first.date))
    .slice(0, 6);
}

function buildTrainingNotes(trainingRows: TrainingRow[]): PlayerNoteItem[] {
  const notes: PlayerNoteItem[] = [];

  trainingRows.forEach((row) => {
    const generalNote = normalizeText(row.notes);
    if (generalNote) {
      notes.push({
        id: `training-note-${row.id}`,
        date: row.date,
        note: generalNote,
      });
    }

    const painNote = normalizeText(row.pain_notes);
    if (painNote) {
      notes.push({
        id: `training-pain-note-${row.id}`,
        date: row.date,
        note: `Pain note: ${painNote}`,
      });
    }
  });

  return notes
    .sort((first, second) => second.date.localeCompare(first.date))
    .slice(0, 6);
}

function buildPainSignals(
  wellnessRows: WellnessRow[],
  trainingRows: TrainingRow[]
): PainStatusSignal[] {
  return [
    ...wellnessRows.map((row) => ({
      id: `wellness-${row.user_id}-${row.date}`,
      date: row.date,
      createdAt: row.created_at,
      source: 'wellness' as const,
      painActive: Boolean(row.pain_active),
      painLevel: row.pain_level,
      painNotes: row.pain_notes,
      isInjury: row.is_injury ?? false,
    })),
    ...trainingRows.map((row) => ({
      id: `training-${row.id}`,
      date: row.date,
      createdAt: row.created_at,
      source: 'training' as const,
      painActive: Boolean(row.pain_active),
      painLevel: row.pain_level,
      painNotes: row.pain_notes,
      isInjury: row.is_injury ?? false,
    })),
  ];
}

async function loadCoachEventTypeActivity(coachIds: string[], eventTypeIds: string[]): Promise<{
  activityByCoachAndType: Map<string, boolean>;
  error: string | null;
}> {
  if (coachIds.length === 0 || eventTypeIds.length === 0) {
    return { activityByCoachAndType: new Map(), error: null };
  }

  const { data, error } = await supabase
    .from('custom_event_types')
    .select('id, user_id, is_activity, is_deleted')
    .in('user_id', coachIds)
    .in('id', eventTypeIds);

  if (error) {
    return {
      activityByCoachAndType: new Map(),
      error: error.message || 'Unable to load coach event type activity settings.',
    };
  }

  const activityByCoachAndType = new Map<string, boolean>();
  for (const row of (data ?? []) as EventTypeActivityRow[]) {
    activityByCoachAndType.set(
      `${row.user_id}:${row.id}`,
      row.is_deleted !== true && row.is_activity === true
    );
  }

  return { activityByCoachAndType, error: null };
}

interface AttendanceRow {
  player_id: string;
  event_group_id: string;
  occurrence_date: string;
  rsvp_status: 'going' | 'not_going' | null;
  attendance_status: 'did' | 'did_not' | null;
}

function resolveInjuryStatus(
  rows: InjuryRow[] | undefined,
  injuryQueryError: string | null,
  wellnessRows: WellnessRow[],
  trainingRows: TrainingRow[]
): PlayerInjuryStatus {
  const injuries = [...(rows ?? [])].sort((first, second) => second.created_at.localeCompare(first.created_at));
  const activeOrRecovering = injuries.filter((row) => {
    const state = normalizeInjuryState(row.status);
    return state === 'active' || state === 'recovering' || state === 'unknown';
  });

  if (activeOrRecovering.length > 0) {
    const latest = activeOrRecovering[0];
    const normalizedState = normalizeInjuryState(latest.status);
    return {
      state: normalizedState === 'recovering' ? 'recovering' : 'active',
      description: latest.description,
      expectedReturn: latest.expected_return ?? undefined,
      reportedDate: latest.created_at.slice(0, 10),
      reportedAgo: formatReportedAgo(latest.created_at.slice(0, 10)),
    };
  }

  const latestPainStatus = getLatestPainStatus(buildPainSignals(wellnessRows, trainingRows));
  if (latestPainStatus && shouldTreatPainAsInjury(latestPainStatus)) {
    return {
      state: 'active',
      description: describePainSignal(latestPainStatus),
      reportedDate: latestPainStatus.date,
      reportedAgo: formatReportedAgo(latestPainStatus.date),
    };
  }

  if (injuryQueryError) {
    return {
      state: 'unavailable',
      message: injuryQueryError,
    };
  }

  return {
    state: 'healthy',
  };
}

function toSessionType(value: string): TrainingLog['sessionType'] {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'team') return 'Team';
  if (normalized === 'match') return 'Match';
  if (normalized === 'gym') return 'Gym';
  if (normalized === 'solo') return 'Solo';
  if (normalized === 'partner') return 'Partner';
  if (normalized === 'cardio') return 'Cardio';
  if (normalized === 'hiit') return 'HIIT';
  return 'Other';
}

function toSprintingOption(value: string): TrainingLog['sprinting'] {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'yes-90-95') return 'yes-90-95';
  if (normalized === 'yes-100') return 'yes-100';
  return 'no';
}

function mapWellnessRowsToWellnessLogs(rows: WellnessRow[]): WellnessLog[] {
  return rows.map((row) => ({
    date: row.date,
    sleepTime: row.sleep_time,
    wakeTime: row.wake_time,
    sleepDuration: toNumber(row.sleep_duration),
    sleepQuality: row.sleep_quality,
    energy: row.energy,
    fatigue: row.fatigue,
    stress: row.stress,
    painActive: Boolean(row.pain_active),
    painLevel: row.pain_level == null ? undefined : toNumber(row.pain_level),
    painNotes: row.pain_notes ?? undefined,
    isInjury: shouldTreatPainAsInjury({
      painActive: Boolean(row.pain_active),
      painLevel: row.pain_level == null ? undefined : toNumber(row.pain_level),
      isInjury: row.is_injury ?? false,
    }),
    notes: row.notes ?? undefined,
  }));
}

function mapTrainingRowsToTrainingLogs(rows: TrainingRow[]): TrainingLog[] {
  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    sessionType: toSessionType(row.session_type),
    duration: toNumber(row.duration),
    intensity: toNumber(row.intensity),
    sprinting: toSprintingOption(row.sprinting),
    performance: row.performance == null ? undefined : toNumber(row.performance),
    painActive: Boolean(row.pain_active),
    painLevel: row.pain_level == null ? undefined : toNumber(row.pain_level),
    painNotes: row.pain_notes ?? undefined,
    isInjury: shouldTreatPainAsInjury({
      painActive: Boolean(row.pain_active),
      painLevel: row.pain_level == null ? undefined : toNumber(row.pain_level),
      isInjury: row.is_injury ?? false,
    }),
    notes: row.notes ?? undefined,
  }));
}

function mapInjuryRowsToInjuryRecords(rows: InjuryRow[]): InjuryRecord[] {
  return rows
    .filter((row) => {
      const state = normalizeInjuryState(row.status);
      return state === 'active' || state === 'recovering' || state === 'resolved';
    })
    .map((row) => {
      const state = normalizeInjuryState(row.status);
      return {
        id: row.id,
        description: row.description,
        expectedReturn: row.expected_return ?? undefined,
        status: state === 'recovering' ? 'recovering' : state === 'resolved' ? 'resolved' : 'active',
        createdAt: row.created_at,
      };
    });
}

function buildTodaysCalendarEventsForRecommendation(rows: CalendarRow[]): CalendarEvent[] {
  const today = new Date();
  const todayKey = getLocalDateKey(today);
  const dayOfWeek = getDay(today) === 0 ? 7 : getDay(today);

  const events: CalendarEvent[] = [];

  rows.forEach((row) => {
    const meta = parseCoachCalendarMeta(row.recurrence_config);
    if (meta?.coachManaged && meta.published === false) {
      return;
    }

    const start = row.start_time;
    const end = row.end_time;
    const recurrence = parseRecurrence(row.recurrence);
    const recurrenceConfig = parseRecurrenceConfig(row.recurrence_config);
    const excludedDates = parseExcludedDates(row.excluded_dates);
    const overrides = parseOverrideMap(row.overrides);
    const eventStartDate = start.split('T')[0];
    const parsedStart = parseISO(eventStartDate);
    const hasValidStart = !Number.isNaN(parsedStart.getTime());

    if (excludedDates.includes(todayKey)) return;

    let matches = false;
    if (recurrence === 'none') {
      matches = eventStartDate === todayKey;
    } else if (recurrence === 'daily') {
      matches = hasValidStart && !isBefore(today, parsedStart);
    } else if (recurrence === 'weekly') {
      const days = Array.isArray((recurrenceConfig as { days?: unknown }).days)
        ? ((recurrenceConfig as { days?: unknown }).days as unknown[]).filter((value): value is number => typeof value === 'number')
        : [];
      matches = hasValidStart && !isBefore(today, parsedStart) && days.includes(dayOfWeek);
    }

    if (!matches) return;

    const override = asObject(overrides[todayKey]);
    const anticipatedIntensity =
      (override?.anticipatedIntensity as CalendarEvent['anticipatedIntensity'] | undefined) ??
      row.anticipated_intensity ??
      undefined;

    events.push({
      id: row.id,
      eventTypeId: row.event_type_id,
      title: row.title ?? undefined,
      description: row.description ?? undefined,
      start,
      end,
      recurrence,
      recurrenceConfig,
      excludedDates,
      overrides: undefined,
      anticipatedIntensity,
    });
  });

  return events;
}

function resolveTodaysRecommendation(params: {
  player: CoachPlayer;
  wellnessRows: WellnessRow[];
  trainingRows: TrainingRow[];
  calendarRows: CalendarRow[];
  injuryRows: InjuryRow[];
}): RecommendationResult | null {
  const { player, wellnessRows, trainingRows, calendarRows, injuryRows } = params;
  const todayKey = getLocalDateKey();
  const wellnessLogs = mapWellnessRowsToWellnessLogs(wellnessRows);
  const trainingLogs = mapTrainingRowsToTrainingLogs(trainingRows);
  const todaysLog = wellnessLogs.find((log) => log.date === todayKey);

  if (!todaysLog) {
    return null;
  }

  const { load, readiness } = calculatePlayerReadinessForDate(wellnessLogs, trainingLogs);

  const activeInjuries = mapInjuryRowsToInjuryRecords(injuryRows).filter(
    (injury) => injury.status === 'active' || injury.status === 'recovering'
  );
  const playerProfile: UserProfile = {
    age: player.age > 0 ? player.age : 18,
    positions: [],
    priorities: [],
  };

  return generateRecommendation(
    readiness,
    load,
    activeInjuries,
    playerProfile,
    buildTodaysCalendarEventsForRecommendation(calendarRows),
    {
      todayWellness: todaysLog,
      recentTrainingLogs: trainingLogs.filter((log) => log.date === todayKey),
    }
  );
}

function formatTodaysGuidance(recommendation: RecommendationResult | null): string | null {
  if (!recommendation) return null;
  if (recommendation.recommendationLabel === 'Intense') return 'Intense recommendation';
  if (recommendation.recommendationLabel === 'Moderate') return 'Moderate recommendation';
  if (recommendation.recommendationLabel === 'Light') return 'Light or modified recommendation';
  return 'Recovery or modified activity';
}

function buildDatasetForPlayer(params: {
  player: CoachPlayer;
  wellnessRows: WellnessRow[];
  trainingRows: TrainingRow[];
  calendarRows: CalendarRow[];
  teamCalendarRows: CalendarRow[];
  activityByPlayerAndType: Map<string, boolean>;
  activityByCoachAndType: Map<string, boolean>;
  injuryRows: InjuryRow[] | undefined;
  injuryQueryError: string | null;
  attendanceRows: AttendanceRow[];
}): TeamPlayerDataset {
  const { player, wellnessRows, trainingRows, calendarRows, teamCalendarRows, activityByPlayerAndType, activityByCoachAndType, injuryRows, injuryQueryError, attendanceRows } = params;
  const wellnessLogs = mapWellnessRowsToWellnessLogs(wellnessRows);
  const trainingLogs = mapTrainingRowsToTrainingLogs(trainingRows);
  const currentLoad = analyzeTrainingLoad(trainingLogs, wellnessLogs);
  const todayKey = getLocalDateKey();
  const todayWellness = wellnessRows.find((row) => row.date === todayKey);

  const analyticsDates = Array.from(new Set([
    ...wellnessRows.map((row) => row.date),
    ...trainingRows.map((row) => row.date),
  ]))
    .sort((a, b) => a.localeCompare(b));

  const analyticsRows = analyticsDates.map((dateValue) => {
    const wellness = wellnessRows.find((row) => row.date === dateValue);
    const energy = wellness?.energy ?? 0;
    const fatigue = wellness?.fatigue ?? 0;
    const stress = wellness?.stress ?? 0;
    const sleepHours = toNumber(wellness?.sleep_duration);
    const sleepQuality = wellness?.sleep_quality ?? 0;
    const { readiness, load } = calculatePlayerReadinessForDate(
      wellnessLogs,
      trainingLogs,
      parseISO(dateValue)
    );
    const dailyTrainingLoad = trainingLogs
      .filter((log) => log.date === dateValue)
      .reduce((sum, log) => sum + calculateSessionLoad(log), 0);
    const sleepScore = readiness.breakdown.sleep;
    const readinessScore = readiness.score;

    return {
      dateValue,
      label: formatLabel(dateValue),
      energy,
      fatigue,
      stress,
      sleepHours,
      sleepQuality,
      sleepScore,
      hasWellness: Boolean(wellness),
      acuteTrainingLoad: Math.round(dailyTrainingLoad),
      loadScore: Math.round(load.loadScore),
      readinessScore,
      energyScore: readiness.breakdown.energy,
      fatigueScore: readiness.breakdown.fatigue,
      stressScore: readiness.breakdown.stress,
      bedTime: wellness?.sleep_time ?? '--:--',
      wakeTime: wellness?.wake_time ?? '--:--',
    };
  });

  const todaysRecommendation = resolveTodaysRecommendation({
    player,
    wellnessRows,
    trainingRows,
    calendarRows,
    injuryRows: injuryRows ?? [],
  });
  const sortedCalendarRows = dedupeCalendarEventsById(calendarRows)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const nowTime = Date.now();
  const last24HoursTime = nowTime - 24 * 60 * 60 * 1000;
  const trainingSessionsLast24Hours = trainingRows
    .filter((row) => {
      const loggedTime = new Date(row.created_at).getTime();
      return Number.isFinite(loggedTime) && loggedTime >= last24HoursTime && loggedTime <= nowTime;
    })
    .sort((first, second) => second.created_at.localeCompare(first.created_at))
    .map((row) => ({
      id: row.id,
      name: row.session_type || 'Training session',
      type: row.session_type || 'Training',
      date: row.date,
      scope: 'Individual' as const,
    }));
  const today = new Date();
  const sessionHistoryDates = Array.from({ length: 30 }, (_, dayOffset) => {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);
    return format(date, 'yyyy-MM-dd');
  });
  const coachSessionRows = Array.from(teamCalendarRows.reduce<Map<string, CalendarRow>>((rowsByGroup, row) => {
    const meta = parseCoachCalendarMeta(row.recurrence_config);
    if (!meta?.coachManaged || meta.kind === 'task' || meta.published === false) return rowsByGroup;
    if (meta.teamId && meta.teamId !== player.teamId) return rowsByGroup;

    const assignmentScope = meta.assignmentScope === 'team' ? 'team' : 'player';
    const assignedPlayerId = meta.assignedPlayerId ?? row.user_id;
    if (assignmentScope === 'player' && assignedPlayerId !== player.id) return rowsByGroup;

    const groupKey = meta.eventGroupId
      ? `${assignmentScope}:${meta.eventGroupId}`
      : `${assignmentScope}:${row.id}`;
    if (!rowsByGroup.has(groupKey)) rowsByGroup.set(groupKey, row);
    return rowsByGroup;
  }, new Map()).values());
  const coachSessionOccurrences = coachSessionRows.flatMap((row) => {
    const start = toDateAndTime(row.start_time);
    const end = toDateAndTime(row.end_time);
    const meta = parseCoachCalendarMeta(row.recurrence_config);
    const recurrence = parseRecurrence(row.recurrence);
    const recurrenceConfig = parseRecurrenceConfig(row.recurrence_config);
    const excludedDates = parseExcludedDates(row.excluded_dates);
    const overrides = parseOverrideMap(row.overrides);
    const assignmentScope = meta?.assignmentScope === 'team' ? 'team' as const : 'player' as const;
    const calendarEvent = {
      id: row.id,
      playerId: player.id,
      teamId: meta?.teamId ?? player.teamId,
      title: row.title || row.event_type_id || 'Session',
      type: mapEventTypeIdToPlayerSessionType(row.event_type_id),
      kind: 'event' as const,
      description: row.description ?? undefined,
      assignmentScope,
      coachManaged: true,
      visibleInCoachPlayerCalendar: true,
      recurrence,
      recurrenceConfig,
      recurrenceEndDate: row.recurrence_end_date,
      anticipatedIntensity: row.anticipated_intensity ?? undefined,
      overrides,
      excludedDates,
      isDraft: false,
      sourceEventGroupId: meta?.eventGroupId ?? null,
      date: start.date,
      startTime: start.time,
      endTime: end.time,
      startDate: start.date,
      endDate: end.date,
    };
    const configuredActivity = meta?.coachId
      ? activityByCoachAndType.get(`${meta.coachId}:${row.event_type_id}`)
      : undefined;
    const isActivity = configuredActivity
      ?? (isBuiltInActivityEventType(row.event_type_id) || row.anticipated_intensity != null);
    return sessionHistoryDates.flatMap((dateKey) => {
      const occurrence = resolveCalendarOccurrence({
        date: start.date,
        startDate: start.date,
        endDate: end.date,
        startTime: start.time,
        endTime: end.time,
        kind: 'event',
        title: row.title || row.event_type_id || 'Session',
        description: row.description ?? undefined,
        eventTypeId: row.event_type_id,
        recurrence,
        recurrenceConfig,
        recurrenceEndDate: row.recurrence_end_date,
        excludedDates,
        overrides,
        anticipatedIntensity: row.anticipated_intensity,
      }, dateKey);
      if (!occurrence) return [];
      const occurrenceStart = new Date(`${dateKey}T${occurrence.startTime}:00`);
      const occurrenceEnd = new Date(`${dateKey}T${occurrence.endTime}:00`);
      if (occurrenceEnd.getTime() <= occurrenceStart.getTime()) {
        occurrenceEnd.setDate(occurrenceEnd.getDate() + 1);
      }
      if (!Number.isFinite(occurrenceStart.getTime()) || !Number.isFinite(occurrenceEnd.getTime())) return [];

      return [{
        id: `${meta?.eventGroupId ?? row.id}:${dateKey}`,
        eventGroupId: meta?.eventGroupId ?? row.id,
        date: dateKey,
        name: occurrence.title,
        type: occurrence.eventTypeId,
        scheduledAt: occurrenceStart.toISOString(),
        scope: meta?.assignmentScope === 'team' ? 'Team' as const : 'Individual' as const,
        isActivity,
        startTime: occurrenceStart.getTime(),
        endTime: occurrenceEnd.getTime(),
        details: {
          event: calendarEvent,
          instanceDate: dateKey,
          title: occurrence.title,
          description: occurrence.description,
          eventTypeId: occurrence.eventTypeId,
          startTime: occurrence.startTime,
          endTime: occurrence.endTime,
        },
      }];
    });
  });
  const coachOccurrencesLast24Hours = coachSessionOccurrences.filter(
    (occurrence) => occurrence.isActivity
      && occurrence.startTime >= last24HoursTime
      && occurrence.startTime <= nowTime
  );
  const unmatchedTrainingSessions = [...trainingSessionsLast24Hours];
  const normalizeSessionLabel = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const coachSessionsLast24Hours = coachOccurrencesLast24Hours.map((occurrence) => {
    const occurrenceDate = format(new Date(occurrence.startTime), 'yyyy-MM-dd');
    const normalizedType = normalizeSessionLabel(occurrence.type);
    const normalizedName = normalizeSessionLabel(occurrence.name);
    let matchingLogIndex = unmatchedTrainingSessions.findIndex((session) => {
      if (session.date !== occurrenceDate) return false;
      const loggedType = normalizeSessionLabel(session.type);
      return loggedType === normalizedType
        || normalizedType.includes(loggedType)
        || loggedType.includes(normalizedType)
        || normalizedName.includes(loggedType);
    });
    if (matchingLogIndex < 0) {
      matchingLogIndex = unmatchedTrainingSessions.findIndex(
        (session) => session.date === occurrenceDate
      );
    }
    const logged = matchingLogIndex >= 0;
    if (logged) unmatchedTrainingSessions.splice(matchingLogIndex, 1);
    return {
      id: occurrence.id,
      name: occurrence.name,
      type: occurrence.type,
      scheduledAt: occurrence.scheduledAt,
      scope: occurrence.scope,
      logged,
      details: occurrence.details,
    };
  });
  const attendanceHistory = coachSessionOccurrences
    .filter((occurrence) => occurrence.endTime <= nowTime)
    .map((occurrence) => {
      const attendance = attendanceRows.find((row) => (
        row.event_group_id === occurrence.eventGroupId && row.occurrence_date === occurrence.date
      ));
      const attended = attendance?.attendance_status === 'did'
        || (attendance?.attendance_status == null && attendance?.rsvp_status === 'going');
      return {
        date: occurrence.date,
        eventGroupId: occurrence.eventGroupId,
        name: occurrence.name,
        type: occurrence.type,
        scheduledAt: occurrence.scheduledAt,
        scope: occurrence.scope,
        attended,
        details: occurrence.details,
      };
    });

  return {
    player,
    dailyWellness: {
      date: todayKey,
      completedToday: Boolean(todayWellness),
    },
    wellness: {
      readinessScore: analyticsRows.find((row) => row.dateValue === todayKey && row.hasWellness)?.readinessScore ?? 0,
      fatigue: toNumber(todayWellness?.fatigue) * 10,
      loadScore: currentLoad.hasAcuteData ? Math.round(currentLoad.loadScore) : 0,
      loadRisk: todaysRecommendation?.loadRisk ?? currentLoad.loadRisk,
      loadRiskLabel: todaysRecommendation?.loadRiskLabel ?? (currentLoad.loadRisk === 'low' ? 'Low' : currentLoad.loadRisk === 'normal' ? 'Normal' : currentLoad.loadRisk === 'elevated' ? 'Elevated' : 'Spike'),
      recommendationLabel: todaysRecommendation?.recommendationLabel ?? null,
      acuteTrainingLoad: Math.round(currentLoad.acuteLoad),
      sevenDayTrainingLoad: Math.round(currentLoad.sevenDayLoad),
      hasAcuteTrainingData: currentLoad.hasAcuteData,
    },
    analytics: {
      readinessTrend: analyticsRows.filter((row) => row.hasWellness).map((row) => ({
        date: row.dateValue,
        label: row.label,
        readinessScore: row.readinessScore,
      })),
      energyFatigueLoad: analyticsRows.map((row) => ({
        date: row.dateValue,
        label: row.label,
        energy: row.energy,
        fatigue: row.fatigue,
        acuteTrainingLoad: row.acuteTrainingLoad,
      })),
      sleepQualityAndTiming: analyticsRows.filter((row) => row.hasWellness).map((row) => ({
        date: row.dateValue,
        label: row.label,
        sleepHours: row.sleepHours,
        sleepQualityScore: row.sleepQuality * 10,
        sleepScore: row.sleepScore,
        bedTime: row.bedTime,
        wakeTime: row.wakeTime,
      })),
      stressVsSleepScore: analyticsRows.filter((row) => row.hasWellness).map((row) => ({
        date: row.dateValue,
        label: row.label,
        stress: row.stress * 10,
        sleepScore: row.sleepScore,
      })),
      multiFactorReadiness: analyticsRows.filter((row) => row.hasWellness).map((row) => ({
        date: row.dateValue,
        label: row.label,
        readinessScore: row.readinessScore,
        sleepScore: row.sleepScore,
        energyScore: row.energyScore,
        fatigueScore: row.fatigueScore,
        stressScore: row.stressScore,
        acuteTrainingLoad: row.acuteTrainingLoad,
        loadScore: row.loadScore,
      })),
    },
    calendarEvents: sortedCalendarRows.map((row) => {
      const start = toDateAndTime(row.start_time);
      const end = toDateAndTime(row.end_time);
      const sessionType = mapEventTypeIdToPlayerSessionType(row.event_type_id);
      const recurrenceConfig = parseRecurrenceConfig(row.recurrence_config);
      const meta = parseCoachCalendarMeta(row.recurrence_config);
      const assignmentScope = meta?.assignmentScope === 'team' || meta?.assignmentScope === 'player' ? meta.assignmentScope : 'player';

      return {
        id: row.id,
        playerId: row.user_id,
        teamId: meta?.teamId ?? player.teamId,
        title: row.title || row.event_type_id || 'Session',
        type: sessionType,
        kind: meta?.kind === 'task' ? 'task' : 'event',
        description: row.description ?? undefined,
        assignmentScope,
        coachManaged: meta?.coachManaged === true,
        visibleInCoachPlayerCalendar: isVisibleInCoachPlayerCalendar(row, player, activityByPlayerAndType),
        recurrence: parseRecurrence(row.recurrence),
        recurrenceConfig,
        recurrenceEndDate: row.recurrence_end_date ?? null,
        anticipatedIntensity: row.anticipated_intensity ?? undefined,
        overrides: parseOverrideMap(row.overrides),
        excludedDates: parseExcludedDates(row.excluded_dates),
        isDraft: meta?.published === false,
        sourceEventGroupId: meta?.eventGroupId ?? null,
        date: start.date,
        startTime: start.time,
        endTime: end.time,
        startDate: start.date,
        endDate: end.date,
      } as const;
    }),
    wellnessNotes: buildWellnessNotes(wellnessRows),
    trainingNotes: buildTrainingNotes(trainingRows),
    injuryStatus: resolveInjuryStatus(injuryRows, injuryQueryError, wellnessRows, trainingRows),
    sheet: {
      coachSessionsLast24Hours,
      attendanceHistory,
    },
    todaysGuidance: formatTodaysGuidance(todaysRecommendation),
    todaysRecommendation: todaysRecommendation
      ? {
          score: todaysRecommendation.score,
          readinessZoneLabel: todaysRecommendation.readinessZoneLabel,
          loadRisk: todaysRecommendation.loadRisk,
          loadRiskLabel: todaysRecommendation.loadRiskLabel,
          recommendationLabel: todaysRecommendation.recommendationLabel,
          reason: todaysRecommendation.reason,
          limitingFactors: todaysRecommendation.limitingFactors,
        }
      : null,
  };
}

export async function loadRealTeamPlayerDatasets(teamId: string): Promise<{ data: TeamPlayerDataset[]; error: string | null }> {
  const { data: rawPlayers, error: playersError } = await supabase.rpc('get_team_players', {
    p_team_id: teamId,
  });

  if (playersError) {
    console.error('[players/realData:loadRealTeamPlayerDatasets] Error loading team players via get_team_players RPC:', playersError, { teamId });
    return { data: [], error: playersError.message || 'Unable to load players.' };
  }

  const playerRows = (rawPlayers ?? []) as TeamPlayerRpcRow[];
  if (playerRows.length === 0) {
    return { data: [], error: null };
  }

  const playerIds = playerRows.map((row) => row.user_id);

  const attendanceStartDate = format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
  const [wellnessResult, trainingResult, calendarResult, eventTypeActivityResult, injuriesResult, attendanceResult] = await Promise.all([
    supabase
      .from('wellness_logs')
      .select('user_id, date, created_at, energy, fatigue, stress, sleep_quality, sleep_duration, sleep_time, wake_time, notes, pain_notes, pain_active, pain_level, is_injury')
      .in('user_id', playerIds)
      .order('date', { ascending: true }),
    supabase
      .from('training_logs')
      .select('id, user_id, date, created_at, duration, intensity, session_type, sprinting, performance, pain_active, pain_level, is_injury, notes, pain_notes')
      .in('user_id', playerIds)
      .order('date', { ascending: true }),
    loadCalendarRowsForPlayers(playerIds),
    loadEventTypeActivityForPlayers(playerIds),
    supabase
      .from('injuries')
      .select('id, user_id, description, expected_return, status, created_at')
      .in('user_id', playerIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('calendar_event_attendance')
      .select('player_id, event_group_id, occurrence_date, rsvp_status, attendance_status')
      .eq('team_id', teamId)
      .in('player_id', playerIds)
      .gte('occurrence_date', attendanceStartDate)
      .order('occurrence_date', { ascending: false }),
  ]);

  if (wellnessResult.error) {
    console.error('[players/realData:loadRealTeamPlayerDatasets] Error loading wellness logs for team players:', wellnessResult.error, { teamId, playerCount: playerIds.length });
    return { data: [], error: wellnessResult.error.message || 'Unable to load wellness logs.' };
  }

  if (trainingResult.error) {
    console.error('[players/realData:loadRealTeamPlayerDatasets] Error loading training logs for team players:', trainingResult.error, { teamId, playerCount: playerIds.length });
    return { data: [], error: trainingResult.error.message || 'Unable to load training logs.' };
  }

  let calendarRows: CalendarRow[] = [];
  if (calendarResult.error) {
    console.error('[players/realData:loadRealTeamPlayerDatasets] Error loading calendar events for team players:', calendarResult.error, { teamId, playerCount: playerIds.length });
  } else {
    calendarRows = calendarResult.rows;
  }

  if (eventTypeActivityResult.error) {
    console.error('[players/realData:loadRealTeamPlayerDatasets] Error loading player event type activity settings:', eventTypeActivityResult.error, {
      teamId,
      playerCount: playerIds.length,
    });
  }

  const coachManagedCalendarRows = calendarRows.filter((row) => parseCoachCalendarMeta(row.recurrence_config)?.coachManaged === true);
  const coachIds = Array.from(new Set(coachManagedCalendarRows
    .map((row) => parseCoachCalendarMeta(row.recurrence_config)?.coachId)
    .filter((coachId): coachId is string => Boolean(coachId))));
  const coachEventTypeIds = Array.from(new Set(coachManagedCalendarRows.map((row) => row.event_type_id)));
  const coachEventTypeActivityResult = await loadCoachEventTypeActivity(coachIds, coachEventTypeIds);
  if (coachEventTypeActivityResult.error) {
    console.error('[players/realData:loadRealTeamPlayerDatasets] Error loading coach event type activity settings:', coachEventTypeActivityResult.error, {
      teamId,
      coachCount: coachIds.length,
    });
  }

  let injuryQueryError: string | null = null;
  if (injuriesResult.error) {
    console.error('[players/realData:loadRealTeamPlayerDatasets] Error loading injuries for team players:', injuriesResult.error, { teamId, playerCount: playerIds.length });
    injuryQueryError = injuriesResult.error.message || 'Unable to load injury records.';
  }

  const wellnessRows = (wellnessResult.data ?? []) as WellnessRow[];
  const trainingRows = (trainingResult.data ?? []) as TrainingRow[];
  const injuryRows = ((injuriesResult.data ?? []) as InjuryRow[]);
  if (attendanceResult.error) {
    console.warn('[players/realData:loadRealTeamPlayerDatasets] Attendance history is unavailable for the sheet view:', attendanceResult.error, { teamId });
  }
  const attendanceRows = attendanceResult.error ? [] : ((attendanceResult.data ?? []) as AttendanceRow[]);

  const injuryRowsByUserId = injuryRows.reduce<Record<string, InjuryRow[]>>((accumulator, row) => {
    if (!accumulator[row.user_id]) {
      accumulator[row.user_id] = [];
    }
    accumulator[row.user_id].push(row);
    return accumulator;
  }, {});

  const teamPlayers = playerRows.map((row, index) => {
    const coachPlayer: CoachPlayer = {
      id: row.user_id,
      teamId,
      name: resolvePlayerDisplayName({
        displayName: row.display_name,
        email: row.email,
        userId: row.user_id,
        fallbackLabel: `Player ${index + 1}`,
      }),
      jerseyNumber: index + 1,
      positions: row.positions ?? [],
      age: toNumber(row.age, 0),
      heightCm: toNumber(row.height_cm, 0),
      weightKg: toNumber(row.weight_kg, 0),
    };

    return buildDatasetForPlayer({
      player: coachPlayer,
      wellnessRows: wellnessRows.filter((wellnessRow) => wellnessRow.user_id === row.user_id),
      trainingRows: trainingRows.filter((trainingRow) => trainingRow.user_id === row.user_id),
      calendarRows: calendarRows.filter((calendarRow) => calendarRow.user_id === row.user_id),
      teamCalendarRows: calendarRows,
      activityByPlayerAndType: eventTypeActivityResult.activityByPlayerAndType,
      activityByCoachAndType: coachEventTypeActivityResult.activityByCoachAndType,
      injuryRows: injuryRowsByUserId[row.user_id],
      injuryQueryError,
      attendanceRows: attendanceRows.filter((attendanceRow) => attendanceRow.player_id === row.user_id),
    });
  });

  return { data: teamPlayers, error: null };
}
