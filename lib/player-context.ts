import { format, subDays } from 'date-fns';
import { resolveCalendarOccurrence } from './calendar/events';
import { calculatePlayerReadinessForDate, type ReadinessResult } from './readiness';
import {
  generateRecommendation,
  type RecommendationContext,
  type RecommendationResult,
} from './recommendations';
import { calculateSessionLoad, type LoadResult } from './training-load';
import { shouldTreatPainAsInjury } from './injury-status';
import type { CalendarEvent, InjuryRecord, TrainingLog, UserProfile, WellnessLog } from './types';

export type WellnessLogInput = WellnessLog[] | Record<string, WellnessLog> | null | undefined;

export interface PlayerContextInput {
  profile?: UserProfile | null;
  wellnessLogs?: WellnessLogInput;
  trainingLogs?: TrainingLog[] | null;
  calendarEvents?: CalendarEvent[] | null;
  injuries?: InjuryRecord[] | null;
  asOfDate?: Date;
  recentDays?: number;
}

export interface PlayerWellnessContextSummary {
  todayLog: WellnessLog | null;
  latestLog: WellnessLog | null;
  loggedDays: number;
  missedDays: number;
  missingToday: boolean;
  averageSleepDuration: number | null;
  averageSleepQuality: number | null;
  averageEnergy: number | null;
  averageFatigue: number | null;
  averageStress: number | null;
  painDays: number;
  latestPain: {
    date: string;
    level: number | null;
    notes: string | null;
  } | null;
}

export interface PlayerTrainingContextSummary {
  sessions: number;
  totalDurationMinutes: number;
  averageIntensity: number | null;
  totalSessionLoad: number;
  sessionsWithPain: number;
  latestSession: TrainingLog | null;
  byType: Partial<Record<TrainingLog['sessionType'], number>>;
}

export interface PlayerReadinessLoadContextSummary {
  readiness: ReadinessResult;
  load: LoadResult;
  readinessScore: number;
  readinessZoneLabel: string;
  loadRisk: LoadResult['loadRisk'];
  loadRiskLabel: string;
  loadStage: ReadinessResult['loadStage'];
}

export interface PlayerPainInjuryContextSummary {
  hasPainToday: boolean;
  highestRecentPainLevel: number | null;
  activeInjuries: InjuryRecord[];
  recoveringInjuries: InjuryRecord[];
  hasActiveOrRecoveringInjury: boolean;
  hasAutoInjury: boolean;
}

export interface PlayerCalendarContextSummary {
  todaysEvents: CalendarEvent[];
  activityEventsToday: CalendarEvent[];
  highIntensityEventsToday: CalendarEvent[];
  upcomingEvents: CalendarEvent[];
  hasTrainingPlannedToday: boolean;
  hasHighIntensityPlannedToday: boolean;
}

export interface PlayerMissedLogContextSummary {
  missingWellnessToday: boolean;
  missingTrainingAfterRecentActivity: boolean;
  recentWellnessMissedDays: number;
}

export interface PlayerRecommendationContextResult {
  context: RecommendationContext;
  recommendation: RecommendationResult;
  todaysEvents: CalendarEvent[];
}

export interface PlayerDailyContext {
  date: string;
  profile: UserProfile | null;
  wellness: PlayerWellnessContextSummary;
  training: PlayerTrainingContextSummary;
  readinessLoad: PlayerReadinessLoadContextSummary;
  painInjury: PlayerPainInjuryContextSummary;
  calendar: PlayerCalendarContextSummary;
  missedLogs: PlayerMissedLogContextSummary;
  recommendation: RecommendationResult;
  explanationReady: {
    recommendedIntensity: RecommendationResult['recommendationLabel'];
    reason: string;
    limitingFactors: string[];
    shortContext: string;
  };
}

export interface PlayerAiReadableContext {
  date: string;
  player: {
    age: number | null;
    positions: string[];
    priorities: string[];
    trainingResources: string[];
  };
  readiness: {
    score: number;
    zone: string;
    loadStage: ReadinessResult['loadStage'];
    breakdown: ReadinessResult['breakdown'];
  };
  load: {
    risk: LoadResult['loadRisk'];
    acuteLoad: number;
    sevenDayLoad: number;
    chronicLoad: number;
    acuteChronicRatio: number;
    loadScore: number;
    hasAcuteData: boolean;
    hasChronicData: boolean;
  };
  wellness: Omit<PlayerWellnessContextSummary, 'todayLog' | 'latestLog'> & {
    todayLogged: boolean;
    latestDate: string | null;
  };
  training: PlayerTrainingContextSummary;
  painAndInjury: PlayerPainInjuryContextSummary;
  calendar: Omit<PlayerCalendarContextSummary, 'todaysEvents' | 'activityEventsToday' | 'highIntensityEventsToday' | 'upcomingEvents'> & {
    todaysEventCount: number;
    highIntensityEventCount: number;
    upcomingEventCount: number;
  };
  recommendation: {
    intensity: RecommendationResult['recommendationLabel'];
    reason: string;
    limitingFactors: string[];
    focusAreas: string[];
  };
  missedLogs: PlayerMissedLogContextSummary;
  explanationReadyContext: string;
}

const LOAD_RISK_LABELS: Record<LoadResult['loadRisk'], string> = {
  low: 'Low',
  normal: 'Normal',
  elevated: 'Elevated',
  spike: 'Spike',
};

const ACTIVITY_EVENT_TYPE_IDS = new Set(['team-training', 'match', 'personal-training', 'gym']);

function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function normalizeRecentDays(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 7;
  return Math.max(1, Math.min(60, Math.floor(value)));
}

function normalizeWellnessLogs(logs: WellnessLogInput): WellnessLog[] {
  if (!logs) return [];
  return Array.isArray(logs) ? [...logs] : Object.values(logs);
}

function normalizeTrainingLogs(logs: TrainingLog[] | null | undefined): TrainingLog[] {
  return Array.isArray(logs) ? [...logs] : [];
}

function normalizeCalendarEvents(events: CalendarEvent[] | null | undefined): CalendarEvent[] {
  return Array.isArray(events) ? [...events] : [];
}

function normalizeInjuries(injuries: InjuryRecord[] | null | undefined): InjuryRecord[] {
  return Array.isArray(injuries) ? [...injuries] : [];
}

function isInDateWindow(dateKey: string, startKey: string, endKey: string): boolean {
  return dateKey >= startKey && dateKey <= endKey;
}

function isOnOrBefore(dateKey: string, endKey: string): boolean {
  return dateKey <= endKey;
}

function average(values: number[]): number | null {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) return null;
  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

function roundNullable(value: number | null, decimals = 1): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function sortByDateNewestFirst<T extends { date: string }>(items: T[]): T[] {
  return [...items].sort((first, second) => second.date.localeCompare(first.date));
}

function getLogsThroughDate<T extends { date: string }>(logs: T[], dateKey: string): T[] {
  return logs.filter((log) => isOnOrBefore(log.date, dateKey));
}

function getRecentLogs<T extends { date: string }>(logs: T[], startKey: string, endKey: string): T[] {
  return logs.filter((log) => isInDateWindow(log.date, startKey, endKey));
}

function hasPain(log: WellnessLog | TrainingLog): boolean {
  return Boolean(log.painActive || (log.painLevel ?? 0) > 0 || log.painNotes?.trim() || shouldTreatPainAsInjury(log));
}

function getHighestPainLevel(wellnessLogs: WellnessLog[], trainingLogs: TrainingLog[]): number | null {
  const levels = [
    ...wellnessLogs.map((log) => (hasPain(log) ? log.painLevel ?? 1 : 0)),
    ...trainingLogs.map((log) => (hasPain(log) ? log.painLevel ?? 1 : 0)),
  ].filter((level) => level > 0);

  return levels.length > 0 ? Math.max(...levels) : null;
}

function buildWellnessSummary(params: {
  wellnessLogs: WellnessLog[];
  dateKey: string;
  startKey: string;
  recentDays: number;
}): PlayerWellnessContextSummary {
  const { wellnessLogs, dateKey, startKey, recentDays } = params;
  const recentLogs = getRecentLogs(wellnessLogs, startKey, dateKey);
  const uniqueLoggedDays = new Set(recentLogs.map((log) => log.date));
  const latestLog = sortByDateNewestFirst(getLogsThroughDate(wellnessLogs, dateKey))[0] ?? null;
  const todayLog = wellnessLogs.find((log) => log.date === dateKey) ?? null;
  const painLogs = sortByDateNewestFirst(recentLogs.filter(hasPain));
  const latestPainLog = painLogs[0] ?? null;

  return {
    todayLog,
    latestLog,
    loggedDays: uniqueLoggedDays.size,
    missedDays: Math.max(0, recentDays - uniqueLoggedDays.size),
    missingToday: !todayLog,
    averageSleepDuration: roundNullable(average(recentLogs.map((log) => log.sleepDuration))),
    averageSleepQuality: roundNullable(average(recentLogs.map((log) => log.sleepQuality))),
    averageEnergy: roundNullable(average(recentLogs.map((log) => log.energy))),
    averageFatigue: roundNullable(average(recentLogs.map((log) => log.fatigue))),
    averageStress: roundNullable(average(recentLogs.map((log) => log.stress))),
    painDays: new Set(painLogs.map((log) => log.date)).size,
    latestPain: latestPainLog
      ? {
          date: latestPainLog.date,
          level: latestPainLog.painLevel ?? null,
          notes: latestPainLog.painNotes ?? null,
        }
      : null,
  };
}

function buildTrainingSummary(trainingLogs: TrainingLog[]): PlayerTrainingContextSummary {
  const byType = trainingLogs.reduce<Partial<Record<TrainingLog['sessionType'], number>>>((counts, log) => {
    counts[log.sessionType] = (counts[log.sessionType] ?? 0) + 1;
    return counts;
  }, {});
  const latestSession = sortByDateNewestFirst(trainingLogs)[0] ?? null;

  return {
    sessions: trainingLogs.length,
    totalDurationMinutes: trainingLogs.reduce((sum, log) => sum + log.duration, 0),
    averageIntensity: roundNullable(average(trainingLogs.map((log) => log.intensity))),
    totalSessionLoad: Math.round(trainingLogs.reduce((sum, log) => sum + calculateSessionLoad(log), 0)),
    sessionsWithPain: trainingLogs.filter(hasPain).length,
    latestSession,
    byType,
  };
}

function toCalendarOccurrenceInput(event: CalendarEvent) {
  const startDate = event.start.split('T')[0];
  const endDate = event.end.split('T')[0] || startDate;
  const startTime = event.start.split('T')[1]?.slice(0, 5) ?? '00:00';
  const endTime = event.end.split('T')[1]?.slice(0, 5) ?? '00:00';

  return {
    date: startDate,
    startDate,
    endDate,
    startTime,
    endTime,
    kind: 'event' as const,
    title: event.title ?? event.eventTypeId,
    description: event.description,
    eventTypeId: event.eventTypeId,
    recurrence: event.recurrence,
    recurrenceConfig: event.recurrenceConfig,
    recurrenceEndDate: event.recurrenceEndDate ?? null,
    excludedDates: event.excludedDates ?? [],
    overrides: event.overrides,
    anticipatedIntensity: event.anticipatedIntensity ?? null,
  };
}

function materializeEventForDate(event: CalendarEvent, dateKey: string): CalendarEvent | null {
  const occurrence = resolveCalendarOccurrence(toCalendarOccurrenceInput(event), dateKey);
  if (!occurrence) return null;

  return {
    ...event,
    title: occurrence.title,
    description: occurrence.description,
    eventTypeId: occurrence.eventTypeId,
    start: `${dateKey}T${occurrence.startTime}`,
    end: `${dateKey}T${occurrence.endTime}`,
    anticipatedIntensity: occurrence.anticipatedIntensity ?? undefined,
  };
}

function buildCalendarSummary(params: {
  calendarEvents: CalendarEvent[];
  dateKey: string;
  asOfDate: Date;
}): PlayerCalendarContextSummary {
  const { calendarEvents, dateKey, asOfDate } = params;
  const todaysEvents = calendarEvents
    .map((event) => materializeEventForDate(event, dateKey))
    .filter((event): event is CalendarEvent => Boolean(event));
  const activityEventsToday = todaysEvents.filter((event) =>
    ACTIVITY_EVENT_TYPE_IDS.has(event.eventTypeId.trim().toLowerCase())
  );
  const highIntensityEventsToday = todaysEvents.filter((event) => event.anticipatedIntensity === 'High');
  const upcomingEvents = calendarEvents
    .filter((event) => new Date(event.start).getTime() >= asOfDate.getTime())
    .sort((first, second) => first.start.localeCompare(second.start))
    .slice(0, 5);

  return {
    todaysEvents,
    activityEventsToday,
    highIntensityEventsToday,
    upcomingEvents,
    hasTrainingPlannedToday: activityEventsToday.length > 0,
    hasHighIntensityPlannedToday: highIntensityEventsToday.length > 0,
  };
}

function buildPainInjurySummary(params: {
  wellnessLogs: WellnessLog[];
  trainingLogs: TrainingLog[];
  dateKey: string;
  load: LoadResult;
  injuries: InjuryRecord[];
}): PlayerPainInjuryContextSummary {
  const { wellnessLogs, trainingLogs, dateKey, load, injuries } = params;
  const todayWellness = wellnessLogs.find((log) => log.date === dateKey);
  const todayTrainingLogs = trainingLogs.filter((log) => log.date === dateKey);
  const activeInjuries = injuries.filter((injury) => injury.status === 'active');
  const recoveringInjuries = injuries.filter((injury) => injury.status === 'recovering');

  return {
    hasPainToday: Boolean((todayWellness && hasPain(todayWellness)) || todayTrainingLogs.some(hasPain)),
    highestRecentPainLevel: getHighestPainLevel(wellnessLogs, trainingLogs),
    activeInjuries,
    recoveringInjuries,
    hasActiveOrRecoveringInjury: activeInjuries.length > 0 || recoveringInjuries.length > 0,
    hasAutoInjury: load.hasAutoInjury,
  };
}

function buildShortContext(params: {
  readinessLoad: PlayerReadinessLoadContextSummary;
  wellness: PlayerWellnessContextSummary;
  training: PlayerTrainingContextSummary;
  painInjury: PlayerPainInjuryContextSummary;
  calendar: PlayerCalendarContextSummary;
  recommendation: RecommendationResult;
}): string {
  const { readinessLoad, wellness, training, painInjury, calendar, recommendation } = params;
  const parts = [
    `Readiness ${readinessLoad.readinessScore} (${readinessLoad.readinessZoneLabel})`,
    `load risk ${readinessLoad.loadRiskLabel}`,
    training.sessions > 0 ? `${training.sessions} recent training session${training.sessions === 1 ? '' : 's'}` : 'no recent training sessions',
    wellness.todayLog ? 'wellness logged today' : 'wellness missing today',
  ];

  if (painInjury.hasPainToday || painInjury.hasActiveOrRecoveringInjury || painInjury.hasAutoInjury) {
    parts.push('pain or injury signal present');
  }

  if (calendar.hasHighIntensityPlannedToday) {
    parts.push('high-intensity activity planned today');
  } else if (calendar.hasTrainingPlannedToday) {
    parts.push('activity planned today');
  }

  parts.push(`recommended intensity ${recommendation.recommendationLabel}`);
  return `${parts.join('; ')}.`;
}

export function buildPlayerRecommendationContext(input: PlayerContextInput): PlayerRecommendationContextResult {
  const asOfDate = input.asOfDate ?? new Date();
  const dateKey = toDateKey(asOfDate);
  const wellnessLogs = normalizeWellnessLogs(input.wellnessLogs);
  const trainingLogs = normalizeTrainingLogs(input.trainingLogs);
  const injuries = normalizeInjuries(input.injuries);
  const calendarSummary = buildCalendarSummary({
    calendarEvents: normalizeCalendarEvents(input.calendarEvents),
    dateKey,
    asOfDate,
  });
  const todayWellness = wellnessLogs.find((log) => log.date === dateKey);
  const recentTrainingLogs = trainingLogs.filter((log) => log.date === dateKey);
  const { readiness, load } = calculatePlayerReadinessForDate(wellnessLogs, trainingLogs, asOfDate);
  const recommendationContext: RecommendationContext = {
    todayWellness,
    recentTrainingLogs,
  };
  const recommendation = generateRecommendation(
    readiness,
    load,
    injuries.filter((injury) => injury.status === 'active' || injury.status === 'recovering'),
    input.profile ?? null,
    calendarSummary.todaysEvents,
    recommendationContext
  );

  return {
    context: recommendationContext,
    recommendation,
    todaysEvents: calendarSummary.todaysEvents,
  };
}

export function buildPlayerDailyContext(input: PlayerContextInput): PlayerDailyContext {
  const asOfDate = input.asOfDate ?? new Date();
  const recentDays = normalizeRecentDays(input.recentDays);
  const dateKey = toDateKey(asOfDate);
  const startKey = toDateKey(subDays(asOfDate, recentDays - 1));
  const wellnessLogs = normalizeWellnessLogs(input.wellnessLogs);
  const trainingLogs = normalizeTrainingLogs(input.trainingLogs);
  const calendarEvents = normalizeCalendarEvents(input.calendarEvents);
  const injuries = normalizeInjuries(input.injuries);
  const wellnessThroughDate = getLogsThroughDate(wellnessLogs, dateKey);
  const trainingThroughDate = getLogsThroughDate(trainingLogs, dateKey);
  const recentWellnessLogs = getRecentLogs(wellnessThroughDate, startKey, dateKey);
  const recentTrainingLogs = getRecentLogs(trainingThroughDate, startKey, dateKey);
  const { readiness, load } = calculatePlayerReadinessForDate(wellnessThroughDate, trainingThroughDate, asOfDate);
  const wellness = buildWellnessSummary({
    wellnessLogs: wellnessThroughDate,
    dateKey,
    startKey,
    recentDays,
  });
  const training = buildTrainingSummary(recentTrainingLogs);
  const readinessLoad: PlayerReadinessLoadContextSummary = {
    readiness,
    load,
    readinessScore: readiness.score,
    readinessZoneLabel: readiness.zoneLabel,
    loadRisk: load.loadRisk,
    loadRiskLabel: LOAD_RISK_LABELS[load.loadRisk],
    loadStage: readiness.loadStage,
  };
  const painInjury = buildPainInjurySummary({
    wellnessLogs: recentWellnessLogs,
    trainingLogs: recentTrainingLogs,
    dateKey,
    load,
    injuries,
  });
  const calendar = buildCalendarSummary({ calendarEvents, dateKey, asOfDate });
  const recommendationContext: RecommendationContext = {
    todayWellness: wellness.todayLog ?? undefined,
    recentTrainingLogs: trainingThroughDate.filter((log) => log.date === dateKey),
  };
  const recommendation = generateRecommendation(
    readiness,
    load,
    injuries.filter((injury) => injury.status === 'active' || injury.status === 'recovering'),
    input.profile ?? null,
    calendar.todaysEvents,
    recommendationContext
  );
  const missedLogs: PlayerMissedLogContextSummary = {
    missingWellnessToday: wellness.missingToday,
    missingTrainingAfterRecentActivity: calendar.hasTrainingPlannedToday && !trainingThroughDate.some((log) => log.date === dateKey),
    recentWellnessMissedDays: wellness.missedDays,
  };
  const shortContext = buildShortContext({
    readinessLoad,
    wellness,
    training,
    painInjury,
    calendar,
    recommendation,
  });

  return {
    date: dateKey,
    profile: input.profile ?? null,
    wellness,
    training,
    readinessLoad,
    painInjury,
    calendar,
    missedLogs,
    recommendation,
    explanationReady: {
      recommendedIntensity: recommendation.recommendationLabel,
      reason: recommendation.reason,
      limitingFactors: recommendation.limitingFactors,
      shortContext,
    },
  };
}

export function buildPlayerContextSeries(
  input: PlayerContextInput & { days?: number }
): PlayerDailyContext[] {
  const asOfDate = input.asOfDate ?? new Date();
  const days = normalizeRecentDays(input.days);

  return Array.from({ length: days }).map((_, index) =>
    buildPlayerDailyContext({
      ...input,
      asOfDate: subDays(asOfDate, days - 1 - index),
    })
  );
}

export function buildPlayerAiReadableContext(input: PlayerContextInput): PlayerAiReadableContext {
  const dailyContext = buildPlayerDailyContext(input);
  const profile = dailyContext.profile;

  return {
    date: dailyContext.date,
    player: {
      age: profile?.age ?? null,
      positions: profile?.positions ?? [],
      priorities: profile?.priorities ?? [],
      trainingResources: profile?.trainingResources ?? [],
    },
    readiness: {
      score: dailyContext.readinessLoad.readinessScore,
      zone: dailyContext.readinessLoad.readinessZoneLabel,
      loadStage: dailyContext.readinessLoad.loadStage,
      breakdown: dailyContext.readinessLoad.readiness.breakdown,
    },
    load: {
      risk: dailyContext.readinessLoad.loadRisk,
      acuteLoad: Math.round(dailyContext.readinessLoad.load.acuteLoad),
      sevenDayLoad: Math.round(dailyContext.readinessLoad.load.sevenDayLoad),
      chronicLoad: Math.round(dailyContext.readinessLoad.load.chronicLoad),
      acuteChronicRatio: roundNullable(dailyContext.readinessLoad.load.acuteChronicRatio, 2) ?? 0,
      loadScore: Math.round(dailyContext.readinessLoad.load.loadScore),
      hasAcuteData: dailyContext.readinessLoad.load.hasAcuteData,
      hasChronicData: dailyContext.readinessLoad.load.hasChronicData,
    },
    wellness: {
      loggedDays: dailyContext.wellness.loggedDays,
      missedDays: dailyContext.wellness.missedDays,
      missingToday: dailyContext.wellness.missingToday,
      averageSleepDuration: dailyContext.wellness.averageSleepDuration,
      averageSleepQuality: dailyContext.wellness.averageSleepQuality,
      averageEnergy: dailyContext.wellness.averageEnergy,
      averageFatigue: dailyContext.wellness.averageFatigue,
      averageStress: dailyContext.wellness.averageStress,
      painDays: dailyContext.wellness.painDays,
      latestPain: dailyContext.wellness.latestPain,
      todayLogged: Boolean(dailyContext.wellness.todayLog),
      latestDate: dailyContext.wellness.latestLog?.date ?? null,
    },
    training: dailyContext.training,
    painAndInjury: dailyContext.painInjury,
    calendar: {
      hasTrainingPlannedToday: dailyContext.calendar.hasTrainingPlannedToday,
      hasHighIntensityPlannedToday: dailyContext.calendar.hasHighIntensityPlannedToday,
      todaysEventCount: dailyContext.calendar.todaysEvents.length,
      highIntensityEventCount: dailyContext.calendar.highIntensityEventsToday.length,
      upcomingEventCount: dailyContext.calendar.upcomingEvents.length,
    },
    recommendation: {
      intensity: dailyContext.recommendation.recommendationLabel,
      reason: dailyContext.recommendation.reason,
      limitingFactors: dailyContext.recommendation.limitingFactors,
      focusAreas: dailyContext.recommendation.focusAreas,
    },
    missedLogs: dailyContext.missedLogs,
    explanationReadyContext: dailyContext.explanationReady.shortContext,
  };
}
