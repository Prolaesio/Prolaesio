'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildTeamAnalyticsDataFromPlayers } from '@/components/coach/analytics/buildFromPlayers';
import type { TeamAnalyticsDataset } from '@/components/coach/analytics/types';
import type { TeamCalendarDataset, TeamCalendarItem, TeamCalendarItemStatus, TeamEventType } from '@/components/coach/calendar/types';
import { loadCalendarRowsForPlayers, loadRealTeamPlayerDatasets } from '@/components/coach/players/realData';
import type { PlayerCalendarEvent, TeamPlayerDataset } from '@/components/coach/players/types';
import { buildTeamOverviewData, type TeamOverviewData } from '@/components/coach/overview/buildFromInsights';
import {
  dedupeCalendarEventsById,
  parseCoachCalendarMeta,
  parseExcludedDates,
  parseOverrideMap,
  parseRecurrence,
  parseRecurrenceConfig,
} from '@/lib/calendar/events';
import { supabase } from '@/lib/supabase';
import { getTeamReadinessForDate, getTeamTrainingAverage } from '@/lib/coach/teamMetrics';
import {
  describePainSignal,
  formatReportedAgo,
  getLatestPainStatus,
  shouldTreatPainAsInjury,
  sortPainSignalsNewestFirst,
  type PainStatusSignal,
} from '@/lib/injury-status';
import { resolvePlayerDisplayName } from '@/lib/player-names';

interface TeamMembershipRow {
  team_id: string | null;
  user_id: string | null;
}

interface TeamReference {
  id: string;
  name: string;
}

interface InjuryAlertMembershipRow {
  team_id: string | null;
  user_id: string | null;
}

interface InjuryAlertRow {
  id: string;
  user_id: string;
  description: string;
  status: 'active' | 'recovering' | 'resolved';
  expected_return: string | null;
  created_at: string;
}

interface TeamPlayerNameRpcRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

export interface CoachTeamInjuryAlert {
  id: string;
  teamId: string;
  playerId: string;
  playerName: string;
  description: string;
  status: 'active' | 'recovering';
  source: 'injury-record' | 'wellness' | 'training';
  isCurrent: boolean;
  reportedDate: string;
  reportedAgo: string;
  expectedReturn: string | null;
  createdAt: string;
}

export interface CoachTeamProfileAverages {
  players: number;
  readinessPlayers: number;
  loadPlayers: number;
  averageAge: number | null;
  averageHeightCm: number | null;
  averageWeightKg: number | null;
  averageReadiness: number | null;
  averageLoad: number | null;
  positions: string[];
}

const emptyAnalyticsData: TeamAnalyticsDataset = {
  teamId: '',
  labels: [],
  averages: {
    readinessTrend: [],
    energyFatigueLoad: [],
    sleepQualityAndTiming: [],
    stressVsSleepScore: [],
    multiFactorReadiness: [],
  },
  teamAveragesMetrics: [],
  legendItems: [],
  individualsByLabel: {},
};

const emptyCalendarData: TeamCalendarDataset = {
  averages: [],
  items: [],
};

const emptyOverviewData: TeamOverviewData = {
  summary: {
    playerCount: 0,
    averageReadiness: null,
    averageLoad: null,
    status: {
      label: 'Stable',
      className: 'text-[var(--status-green)] border-[rgba(var(--status-green-rgb),0.4)] bg-[rgba(var(--status-green-rgb),0.12)]',
    },
  },
  dailyWellness: {
    completedCount: 0,
    totalCount: 0,
    completedPlayers: [],
    incompletePlayers: [],
  },
  keyMetrics: [],
  playersNeedingAttention: [],
  upcomingActivities: [],
  trends: [],
};

function round(value: number): number {
  return Math.round(value);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toDateAndTime(isoValue: string): { date: string; time: string } {
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) {
    const [datePart = '', timePart = '00:00'] = isoValue.split('T');
    return { date: datePart, time: timePart.slice(0, 5) };
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hour = String(parsed.getHours()).padStart(2, '0');
  const minute = String(parsed.getMinutes()).padStart(2, '0');

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
  };
}

function resolveCalendarStatus(date: string, endTime: string): TeamCalendarItemStatus {
  const parsedEnd = new Date(`${date}T${endTime}:00`);
  if (Number.isNaN(parsedEnd.getTime())) return 'upcoming';
  return parsedEnd.getTime() < Date.now() ? 'completed' : 'upcoming';
}

function mapPlayerEventTypeToTeamEventType(type: string): TeamEventType {
  const normalized = type.trim().toLowerCase();
  if (normalized === 'training') return 'training';
  if (normalized === 'game') return 'game';
  if (normalized === 'gym') return 'gym';
  if (normalized === 'recovery') return 'recovery';
  if (normalized === 'solo') return 'solo';
  if (normalized === 'meeting') return 'meeting';
  return 'other';
}

function getLocalDateKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function hhmmToMinutes(value: string): number | null {
  const [hoursPart = '', minutesPart = ''] = value.split(':');
  const hours = Number(hoursPart);
  const minutes = Number(minutesPart);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function minutesToHHmm(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatDecimal(value: number | null, precision = 1): string {
  if (value == null || !Number.isFinite(value)) {
    return '--';
  }

  return value.toFixed(precision);
}

function mapEventTypeIdToTeamEventType(rawType: string): TeamEventType {
  const normalized = rawType.trim().toLowerCase();
  if (normalized.includes('match') || normalized.includes('game')) return 'game';
  if (normalized.includes('train')) return 'training';
  if (normalized.includes('recover')) return 'recovery';
  if (normalized.includes('gym') || normalized.includes('lift')) return 'gym';
  if (normalized.includes('meeting')) return 'meeting';
  if (normalized.includes('solo') || normalized.includes('individual')) return 'solo';
  return 'other';
}

function getTodayWellnessSnapshot(dataset: TeamPlayerDataset, todayDateKey: string): {
  readinessScore: number;
  energy: number;
  fatigue: number;
  sleepScore: number;
  sleepHours: number;
  sleepQualityScore: number;
  stress: number;
  bedTime: string;
  wakeTime: string;
  loadScore: number;
} | null {
  const readiness = dataset.analytics.readinessTrend.find((point) => point.date === todayDateKey);
  const energyFatigue = dataset.analytics.energyFatigueLoad.find((point) => point.date === todayDateKey);
  const sleep = dataset.analytics.sleepQualityAndTiming.find((point) => point.date === todayDateKey);
  const stress = dataset.analytics.stressVsSleepScore.find((point) => point.date === todayDateKey);
  const multiFactor = dataset.analytics.multiFactorReadiness.find((point) => point.date === todayDateKey);

  const hasWellnessSignal =
    Boolean(sleep && (sleep.sleepHours > 0 || sleep.sleepQualityScore > 0 || sleep.sleepScore > 0)) ||
    Boolean(energyFatigue && (energyFatigue.energy > 0 || energyFatigue.fatigue > 0)) ||
    Boolean(stress && stress.stress > 0);

  if (!hasWellnessSignal) {
    return null;
  }

  return {
    readinessScore: readiness?.readinessScore ?? 0,
    energy: (energyFatigue?.energy ?? 0) * 10,
    fatigue: energyFatigue?.fatigue ?? 0,
    sleepScore: sleep?.sleepScore ?? 0,
    sleepHours: sleep?.sleepHours ?? 0,
    sleepQualityScore: sleep?.sleepQualityScore ?? 0,
    stress: stress?.stress ?? 0,
    bedTime: sleep?.bedTime ?? '--:--',
    wakeTime: sleep?.wakeTime ?? '--:--',
    loadScore: multiFactor?.loadScore ?? 0,
  };
}

function getCurrentTrainingLoad(dataset: TeamPlayerDataset): number | null {
  return dataset.wellness.hasAcuteTrainingData ? dataset.wellness.acuteTrainingLoad : null;
}

function formatMetricValue(value: number | null, suffix = ''): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${round(value)}${suffix}`;
}

function buildCalendarAverages(players: TeamPlayerDataset[]): TeamCalendarDataset['averages'] {
  if (players.length === 0) {
    return [];
  }

  const todayDateKey = getLocalDateKey();
  const wellnessSnapshots = players
    .map((dataset) => getTodayWellnessSnapshot(dataset, todayDateKey))
    .filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot));
  const readinessSummary = getTeamReadinessForDate(players, todayDateKey);
  const energy = wellnessSnapshots.map((snapshot) => snapshot.energy).filter((value) => value > 0);
  const fatigue = wellnessSnapshots.map((snapshot) => snapshot.fatigue * 10).filter((value) => value > 0);
  const sleepScore = wellnessSnapshots.map((snapshot) => snapshot.sleepScore).filter((value) => value > 0);
  const sleepHours = wellnessSnapshots.map((snapshot) => snapshot.sleepHours).filter((value) => value > 0);
  const sleepQuality = wellnessSnapshots.map((snapshot) => snapshot.sleepQualityScore).filter((value) => value > 0);
  const stress = wellnessSnapshots.map((snapshot) => snapshot.stress).filter((value) => value > 0);
  const loadScore = getTeamTrainingAverage(players, (dataset) =>
    dataset.wellness.hasAcuteTrainingData ? dataset.wellness.loadScore : 0
  );
  const sleepTimes = wellnessSnapshots
    .map((snapshot) => hhmmToMinutes(snapshot.bedTime))
    .filter((value): value is number => value != null);
  const wakeTimes = wellnessSnapshots
    .map((snapshot) => hhmmToMinutes(snapshot.wakeTime))
    .filter((value): value is number => value != null);
  const load = getTeamTrainingAverage(players, getCurrentTrainingLoad);
  const sevenDayLoad = getTeamTrainingAverage(players, (dataset) => dataset.wellness.sevenDayTrainingLoad);

  const meanSleepTime = minutesToHHmm(averageOrNull(sleepTimes));
  const meanWakeTime = minutesToHHmm(averageOrNull(wakeTimes));

  return [
    { label: 'Players', value: String(players.length) },
    { label: 'Team Readiness', value: formatMetricValue(readinessSummary.average, '%') },
    { label: 'Team Energy', value: formatMetricValue(averageOrNull(energy)) },
    { label: 'Team Fatigue', value: formatMetricValue(averageOrNull(fatigue)) },
    { label: 'Team Stress', value: formatMetricValue(averageOrNull(stress)) },
    { label: 'Team Sleep Score', value: formatMetricValue(averageOrNull(sleepScore)) },
    {
      label: 'Team Sleep Quantity',
      value: averageOrNull(sleepHours) == null ? '--' : `${formatDecimal(averageOrNull(sleepHours), 1)} h`,
    },
    { label: 'Team Sleep Quality', value: formatMetricValue(averageOrNull(sleepQuality)) },
    { label: 'Acute Training Load', value: formatMetricValue(load) },
    { label: 'Load Score', value: formatMetricValue(loadScore) },
    { label: 'Average Load', value: formatMetricValue(sevenDayLoad) },
    { label: 'Average Sleep Time', value: meanSleepTime ?? '--' },
    { label: 'Average Wake Time', value: meanWakeTime ?? '--' },
  ];
}

interface TeamCalendarEventSource {
  event: PlayerCalendarEvent;
  fallbackDescription: string;
}

function buildTeamCalendarItems(teamId: string, sources: TeamCalendarEventSource[]): TeamCalendarItem[] {
  const groupedItems = new Map<string, TeamCalendarItem>();
  const uniqueSources = Array.from(new Map(sources.map((source) => [source.event.id, source])).values());

  uniqueSources.forEach(({ event, fallbackDescription }) => {
    if (!event.coachManaged || event.assignmentScope !== 'team' || event.teamId !== teamId) {
      return;
    }

    const groupKey = `team:${event.sourceEventGroupId ?? event.id}`;
    const existing = groupedItems.get(groupKey);

    if (existing) {
      const eventIds = new Set([...(existing.sourceEventIds ?? []), event.id]);
      existing.sourceEventIds = Array.from(eventIds);
      return;
    }

    const isRecurring = event.recurrence && event.recurrence !== 'none';
    const status = isRecurring ? 'upcoming' : resolveCalendarStatus(event.date, event.endTime);

    groupedItems.set(groupKey, {
      id: groupKey,
      teamId,
      title: event.title,
      eventTypeId: event.type,
      type: mapPlayerEventTypeToTeamEventType(event.type),
      description: event.description ?? fallbackDescription ?? `${event.type} session`,
      kind: event.kind === 'task' ? 'task' : 'event',
      status,
      assignmentScope: 'team',
      assignedPlayerId: null,
      assignedPlayerName: null,
      recurrence: event.recurrence ?? 'none',
      recurrenceConfig: event.recurrenceConfig,
      recurrenceEndDate: event.recurrenceEndDate ?? null,
      anticipatedIntensity: event.anticipatedIntensity ?? null,
      overrides: event.overrides,
      excludedDates: event.excludedDates,
      isDraft: event.isDraft ?? false,
      sourceEventIds: [event.id],
      sourceEventGroupId: event.sourceEventGroupId ?? null,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      startDate: event.startDate ?? event.date,
      endDate: event.endDate ?? event.date,
    });
  });

  return Array.from(groupedItems.values()).sort((first, second) =>
    `${first.date}T${first.startTime}`.localeCompare(`${second.date}T${second.startTime}`)
  );
}

export function buildTeamCalendarDataFromPlayers(teamId: string, players: TeamPlayerDataset[]): TeamCalendarDataset {
  return {
    averages: buildCalendarAverages(players),
    items: buildTeamCalendarItems(
      teamId,
      players.flatMap((dataset) =>
        dataset.calendarEvents.map((event) => ({
          event,
          fallbackDescription: `${dataset.player.name} ${event.type} session`,
        }))
      )
    ),
  };
}

export async function loadActivePlayerCountsByTeamIds(teamIds: string[]): Promise<{
  countsByTeamId: Record<string, number>;
  error: string | null;
}> {
  const normalizedTeamIds = Array.from(new Set(teamIds.filter((teamId) => teamId.length > 0)));
  if (normalizedTeamIds.length === 0) {
    return { countsByTeamId: {}, error: null };
  }

  const { data, error } = await supabase
    .from('team_memberships')
    .select('team_id')
    .in('team_id', normalizedTeamIds)
    .eq('role', 'player')
    .eq('status', 'active');

  if (error) {
    console.error('[teamInsights/loadActivePlayerCountsByTeamIds] Error loading active player membership counts:', error, { teamIds: normalizedTeamIds });
    return { countsByTeamId: {}, error: error.message || 'Unable to load team player counts.' };
  }

  const countsByTeamId = normalizedTeamIds.reduce<Record<string, number>>((accumulator, teamId) => {
    accumulator[teamId] = 0;
    return accumulator;
  }, {});

  for (const row of data ?? []) {
    const teamId = row.team_id;
    if (typeof teamId === 'string' && teamId in countsByTeamId) {
      countsByTeamId[teamId] += 1;
    }
  }

  return { countsByTeamId, error: null };
}

export async function loadTeamProfileAveragesByTeamIds(teamIds: string[]): Promise<{
  averagesByTeamId: Record<string, CoachTeamProfileAverages>;
  error: string | null;
}> {
  const normalizedTeamIds = Array.from(new Set(teamIds.filter((teamId) => teamId.length > 0)));
  const emptyAveragesByTeamId = normalizedTeamIds.reduce<Record<string, CoachTeamProfileAverages>>((accumulator, teamId) => {
    accumulator[teamId] = {
      players: 0,
      readinessPlayers: 0,
      loadPlayers: 0,
      averageAge: null,
      averageHeightCm: null,
      averageWeightKg: null,
      averageReadiness: null,
      averageLoad: null,
      positions: [],
    };
    return accumulator;
  }, {});

  if (normalizedTeamIds.length === 0) {
    return { averagesByTeamId: {}, error: null };
  }

  const todayDateKey = getLocalDateKey();
  const results = await Promise.all(
    normalizedTeamIds.map(async (teamId) => ({
      teamId,
      result: await loadRealTeamPlayerDatasets(teamId),
    }))
  );

  const averagesByTeamId = { ...emptyAveragesByTeamId };
  const errors: string[] = [];

  for (const { teamId, result } of results) {
    if (result.error) {
      errors.push(result.error);
      continue;
    }

    const readinessSummary = getTeamReadinessForDate(result.data, todayDateKey);
    const averageSevenDayLoad = getTeamTrainingAverage(result.data, (dataset) => dataset.wellness.sevenDayTrainingLoad);
    const ages = result.data.map((dataset) => dataset.player.age).filter((value) => value > 0);
    const heights = result.data.map((dataset) => dataset.player.heightCm).filter((value) => value > 0);
    const weights = result.data.map((dataset) => dataset.player.weightKg).filter((value) => value > 0);
    const positions = new Set(result.data.flatMap((dataset) => dataset.player.positions).filter(Boolean));

    averagesByTeamId[teamId] = {
      players: result.data.length,
      readinessPlayers: readinessSummary.reportingPlayers,
      loadPlayers: result.data.length,
      averageAge: averageOrNull(ages),
      averageHeightCm: averageOrNull(heights),
      averageWeightKg: averageOrNull(weights),
      averageReadiness: readinessSummary.average,
      averageLoad: averageSevenDayLoad,
      positions: Array.from(positions).sort((first, second) => first.localeCompare(second)),
    };
  }

  return {
    averagesByTeamId,
    error: errors.length > 0 ? Array.from(new Set(errors)).join(' ') : null,
  };
}

export async function loadCoachCalendarItemsForTeams(teams: TeamReference[]): Promise<{
  items: TeamCalendarItem[];
  error: string | null;
}> {
  const normalizedTeams = teams.filter((team) => team.id.length > 0);
  if (normalizedTeams.length === 0) {
    return { items: [], error: null };
  }

  const teamIds = normalizedTeams.map((team) => team.id);
  const teamNameById = new Map(normalizedTeams.map((team) => [team.id, team.name]));

  const { data: membershipRows, error: membershipError } = await supabase
    .from('team_memberships')
    .select('team_id, user_id')
    .in('team_id', teamIds)
    .eq('role', 'player')
    .eq('status', 'active');

  if (membershipError) {
    console.error('[teamInsights/loadCoachCalendarItemsForTeams] Error loading team memberships:', membershipError, { teamIds });
    return { items: [], error: membershipError.message || 'Unable to load team memberships for calendar items.' };
  }

  const memberships = (membershipRows ?? []) as TeamMembershipRow[];
  if (memberships.length === 0) {
    return { items: [], error: null };
  }

  const userIds = Array.from(new Set(memberships.map((row) => row.user_id).filter((userId): userId is string => Boolean(userId))));
  const activeMemberships = new Set(
    memberships
      .filter((row): row is { team_id: string; user_id: string } => Boolean(row.team_id) && Boolean(row.user_id))
      .map((row) => `${row.team_id}:${row.user_id}`)
  );

  if (userIds.length === 0) {
    return { items: [], error: null };
  }

  const calendarResult = await loadCalendarRowsForPlayers(userIds);
  if (calendarResult.error) {
    console.error('[teamInsights/loadCoachCalendarItemsForTeams] Error loading calendar events:', calendarResult.error, { teamIds, userCount: userIds.length });
    return { items: [], error: calendarResult.error };
  }

  const sourcesByTeamId = new Map<string, TeamCalendarEventSource[]>();
  for (const row of dedupeCalendarEventsById(calendarResult.rows)) {
    const meta = parseCoachCalendarMeta(row.recurrence_config);
    if (!meta?.coachManaged || meta.assignmentScope !== 'team' || !meta.teamId) continue;
    if (!teamNameById.has(meta.teamId) || !activeMemberships.has(`${meta.teamId}:${row.user_id}`)) continue;

    const start = toDateAndTime(row.start_time);
    const end = toDateAndTime(row.end_time);
    const resolvedTitle = row.title?.trim() || row.event_type_id || 'Event';
    const source: TeamCalendarEventSource = {
      event: {
        id: row.id,
        playerId: row.user_id,
        teamId: meta.teamId,
        title: resolvedTitle,
        type: mapEventTypeIdToTeamEventType(row.event_type_id || ''),
        kind: meta.kind === 'task' ? 'task' : 'event',
        description: row.description ?? undefined,
        assignmentScope: 'team',
        coachManaged: true,
        recurrence: parseRecurrence(row.recurrence),
        recurrenceConfig: parseRecurrenceConfig(row.recurrence_config),
        recurrenceEndDate: row.recurrence_end_date ?? null,
        anticipatedIntensity: row.anticipated_intensity ?? null,
        overrides: parseOverrideMap(row.overrides),
        excludedDates: parseExcludedDates(row.excluded_dates),
        isDraft: meta.published === false,
        sourceEventGroupId: meta.eventGroupId ?? null,
        date: start.date,
        startTime: start.time,
        endTime: end.time,
        startDate: start.date,
        endDate: end.date,
      },
      fallbackDescription: `${teamNameById.get(meta.teamId) ?? 'Team'} activity`,
    };

    const teamSources = sourcesByTeamId.get(meta.teamId) ?? [];
    teamSources.push(source);
    sourcesByTeamId.set(meta.teamId, teamSources);
  }

  const items = normalizedTeams.flatMap((team) => buildTeamCalendarItems(team.id, sourcesByTeamId.get(team.id) ?? []));

  return { items, error: null };
}

export async function loadCoachTeamInjuryAlertsForTeams(teams: TeamReference[]): Promise<{
  alerts: CoachTeamInjuryAlert[];
  error: string | null;
}> {
  const normalizedTeams = teams.filter((team) => team.id.length > 0);
  if (normalizedTeams.length === 0) {
    return { alerts: [], error: null };
  }

  const teamIdsByUserId = new Map<string, string[]>();
  const playerNameByUserId = new Map<string, string>();
  let rpcErrorMessage: string | null = null;

  const teamPlayersResults = await Promise.all(
    normalizedTeams.map(async (team) => {
      const result = await supabase.rpc('get_team_players', {
        p_team_id: team.id,
      });
      return { teamId: team.id, result };
    })
  );

  for (const { teamId, result } of teamPlayersResults) {
    if (result.error) {
      console.error('[teamInsights/loadCoachTeamInjuryAlertsForTeams] Error loading team players for injury alerts:', result.error, { teamId });
      rpcErrorMessage = rpcErrorMessage ?? (result.error.message || 'Unable to load team players for injury alerts.');
      continue;
    }

    const rows = (result.data ?? []) as TeamPlayerNameRpcRow[];
    for (const row of rows) {
      if (!row.user_id) continue;
      const existingTeamIds = teamIdsByUserId.get(row.user_id) ?? [];
      if (!existingTeamIds.includes(teamId)) {
        existingTeamIds.push(teamId);
        teamIdsByUserId.set(row.user_id, existingTeamIds);
      }

      if (!playerNameByUserId.has(row.user_id)) {
        playerNameByUserId.set(
          row.user_id,
          resolvePlayerDisplayName({
            displayName: row.display_name,
            email: row.email,
            userId: row.user_id,
          })
        );
      }
    }
  }

  const userIds = Array.from(teamIdsByUserId.keys());
  if (userIds.length === 0) {
    return { alerts: [], error: rpcErrorMessage };
  }

  const recentDateKey = getLocalDateKey(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
  const [injuriesResult, wellnessResult, trainingResult] = await Promise.all([
    supabase
      .from('injuries')
      .select('id, user_id, description, status, expected_return, created_at')
      .in('user_id', userIds)
      .in('status', ['active', 'recovering'])
      .order('created_at', { ascending: false }),
    supabase
      .from('wellness_logs')
      .select('id, user_id, date, pain_active, pain_level, pain_notes, is_injury, created_at')
      .in('user_id', userIds)
      .gte('date', recentDateKey)
      .order('date', { ascending: false }),
    supabase
      .from('training_logs')
      .select('id, user_id, date, pain_active, pain_level, pain_notes, is_injury, created_at')
      .in('user_id', userIds)
      .gte('date', recentDateKey)
      .order('date', { ascending: false }),
  ]);

  const queryErrors = [injuriesResult.error, wellnessResult.error, trainingResult.error]
    .filter((error): error is NonNullable<typeof error> => Boolean(error));
  if (queryErrors.length > 0) {
    queryErrors.forEach((error) => {
      console.error('[teamInsights/loadCoachTeamInjuryAlertsForTeams] Error loading injury signals:', error, {
        teamCount: normalizedTeams.length,
        userCount: userIds.length,
      });
    });
  }

  const injuryAlerts = (((injuriesResult.data ?? []) as InjuryAlertRow[])).flatMap((injuryRow) => {
    if (injuryRow.status !== 'active' && injuryRow.status !== 'recovering') {
      return [];
    }

    const teamIds = teamIdsByUserId.get(injuryRow.user_id) ?? [];
    return teamIds.map((teamId) => ({
      id: `${injuryRow.id}-${teamId}`,
      teamId,
      playerId: injuryRow.user_id,
      playerName: playerNameByUserId.get(injuryRow.user_id) ?? `Player ${injuryRow.user_id.slice(0, 8)}`,
      description: injuryRow.description,
      status: injuryRow.status as 'active' | 'recovering',
      source: 'injury-record' as const,
      isCurrent: true,
      reportedDate: injuryRow.created_at.slice(0, 10),
      reportedAgo: formatReportedAgo(injuryRow.created_at.slice(0, 10)),
      expectedReturn: injuryRow.expected_return,
      createdAt: injuryRow.created_at,
    }));
  });

  type PainAlertRow = {
    id: string;
    user_id: string;
    date: string;
    pain_active: boolean;
    pain_level: number | null;
    pain_notes: string | null;
    is_injury?: boolean | null;
    created_at: string;
  };

  const painSignalsByUserId = new Map<string, PainStatusSignal[]>();
  const addPainRows = (rows: PainAlertRow[], source: 'wellness' | 'training') => {
    rows.forEach((row) => {
      const signals = painSignalsByUserId.get(row.user_id) ?? [];
      signals.push({
        id: row.id,
        date: row.date,
        createdAt: row.created_at,
        source,
        painActive: Boolean(row.pain_active),
        painLevel: row.pain_level,
        painNotes: row.pain_notes,
        isInjury: row.is_injury ?? false,
      });
      painSignalsByUserId.set(row.user_id, signals);
    });
  };

  addPainRows((wellnessResult.data ?? []) as PainAlertRow[], 'wellness');
  addPainRows((trainingResult.data ?? []) as PainAlertRow[], 'training');

  const reportedPainAlerts = Array.from(painSignalsByUserId.entries()).flatMap(([userId, signals]) => {
    const sortedSignals = sortPainSignalsNewestFirst(signals);
    const latestStatus = getLatestPainStatus(sortedSignals);
    const latestReport = sortedSignals.find(shouldTreatPainAsInjury);
    if (!latestReport) return [];

    const isCurrent = Boolean(latestStatus && shouldTreatPainAsInjury(latestStatus));
    return (teamIdsByUserId.get(userId) ?? []).map((teamId) => ({
      id: `${latestReport.source}-${latestReport.id}-${teamId}`,
      teamId,
      playerId: userId,
      playerName: playerNameByUserId.get(userId) ?? `Player ${userId.slice(0, 8)}`,
      description: describePainSignal(latestReport),
      status: 'active' as const,
      source: latestReport.source,
      isCurrent,
      reportedDate: latestReport.date,
      reportedAgo: formatReportedAgo(latestReport.date),
      expectedReturn: null,
      createdAt: latestReport.createdAt || `${latestReport.date}T00:00:00`,
    }));
  });

  const alerts = [
    ...injuryAlerts,
    ...reportedPainAlerts,
  ].sort((first, second) => second.createdAt.localeCompare(first.createdAt));

  const queryErrorMessage = queryErrors.length > 0
    ? 'Some injury signals could not be loaded.'
    : null;

  return { alerts, error: rpcErrorMessage ?? queryErrorMessage };
}

export function useCoachTeamPlayerCounts(teamIds: string[]) {
  const [countsByTeamId, setCountsByTeamId] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stableTeamIds = useMemo(
    () => Array.from(new Set(teamIds.filter((teamId) => teamId.length > 0))),
    [teamIds]
  );
  const teamIdsKey = stableTeamIds.join('|');

  useEffect(() => {
    let cancelled = false;

    const loadCounts = async () => {
      if (stableTeamIds.length === 0) {
        setCountsByTeamId({});
        setError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const result = await loadActivePlayerCountsByTeamIds(stableTeamIds);
      if (cancelled) return;

      setCountsByTeamId(result.countsByTeamId);
      setError(result.error);
      setIsLoading(false);
    };

    void loadCounts();

    return () => {
      cancelled = true;
    };
  }, [stableTeamIds, teamIdsKey]);

  return {
    countsByTeamId,
    isLoading,
    error,
  };
}

export function useCoachTeamProfileAverages(teamIds: string[]) {
  const [averagesByTeamId, setAveragesByTeamId] = useState<Record<string, CoachTeamProfileAverages>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stableTeamIds = useMemo(
    () => Array.from(new Set(teamIds.filter((teamId) => teamId.length > 0))),
    [teamIds]
  );
  const teamIdsKey = stableTeamIds.join('|');

  useEffect(() => {
    let cancelled = false;

    const loadAverages = async () => {
      if (stableTeamIds.length === 0) {
        setAveragesByTeamId({});
        setError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const result = await loadTeamProfileAveragesByTeamIds(stableTeamIds);
      if (cancelled) return;

      setAveragesByTeamId(result.averagesByTeamId);
      setError(result.error);
      setIsLoading(false);
    };

    void loadAverages();

    return () => {
      cancelled = true;
    };
  }, [stableTeamIds, teamIdsKey]);

  return {
    averagesByTeamId,
    isLoading,
    error,
  };
}

export function useCoachAllTeamsCalendarItems(teams: TeamReference[]) {
  const [items, setItems] = useState<TeamCalendarItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stableTeams = useMemo(
    () => teams.filter((team) => team.id.length > 0),
    [teams]
  );
  const teamsKey = stableTeams.map((team) => `${team.id}:${team.name}`).join('|');

  useEffect(() => {
    let cancelled = false;

    const loadItems = async () => {
      if (stableTeams.length === 0) {
        setItems([]);
        setError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const result = await loadCoachCalendarItemsForTeams(stableTeams);
      if (cancelled) return;

      setItems(result.items);
      setError(result.error);
      setIsLoading(false);
    };

    void loadItems();

    return () => {
      cancelled = true;
    };
  }, [stableTeams, teamsKey]);

  return {
    items,
    isLoading,
    error,
  };
}

export function useCoachTeamInjuryAlerts(teams: TeamReference[]) {
  const [alerts, setAlerts] = useState<CoachTeamInjuryAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stableTeams = useMemo(
    () => teams.filter((team) => team.id.length > 0),
    [teams]
  );
  const teamsKey = stableTeams.map((team) => `${team.id}:${team.name}`).join('|');

  useEffect(() => {
    let cancelled = false;

    const loadAlerts = async () => {
      if (stableTeams.length === 0) {
        setAlerts([]);
        setError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const result = await loadCoachTeamInjuryAlertsForTeams(stableTeams);
      if (cancelled) return;

      setAlerts(result.alerts);
      setError(result.error);
      setIsLoading(false);
    };

    void loadAlerts();

    return () => {
      cancelled = true;
    };
  }, [stableTeams, teamsKey]);

  return {
    alerts,
    isLoading,
    error,
  };
}

export function useCoachSelectedTeamInsights(teamId: string) {
  const [players, setPlayers] = useState<TeamPlayerDataset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [selectedTeamProfileAverages, setSelectedTeamProfileAverages] = useState<CoachTeamProfileAverages | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadPlayers = async () => {
      if (!teamId) {
        setPlayers([]);
        setPlayersError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const result = await loadRealTeamPlayerDatasets(teamId);
      if (cancelled) return;

      if (result.error) {
        console.error('[teamInsights/useCoachSelectedTeamInsights] Error loading selected team player datasets:', result.error, { teamId });
        setPlayers([]);
        setPlayersError(result.error);
        setIsLoading(false);
        return;
      }

      setPlayers(result.data);
      setPlayersError(null);
      setIsLoading(false);
    };

    void loadPlayers();

    return () => {
      cancelled = true;
    };
  }, [teamId, refreshVersion]);

  useEffect(() => {
    let cancelled = false;

    const loadSummaryAverages = async () => {
      if (!teamId) {
        setSelectedTeamProfileAverages(null);
        setSummaryError(null);
        return;
      }

      const result = await loadTeamProfileAveragesByTeamIds([teamId]);
      if (cancelled) return;

      setSelectedTeamProfileAverages(result.averagesByTeamId[teamId] ?? null);
      setSummaryError(result.error);
    };

    void loadSummaryAverages();

    return () => {
      cancelled = true;
    };
  }, [teamId, refreshVersion]);

  const calendarData = useMemo(() => {
    if (!teamId) return emptyCalendarData;
    const baseCalendarData = buildTeamCalendarDataFromPlayers(teamId, players);
    const summaryPlayers = selectedTeamProfileAverages?.players ?? players.length;
    const summaryReadiness = selectedTeamProfileAverages?.averageReadiness ?? null;
    const summaryLoad = selectedTeamProfileAverages?.averageLoad ?? null;

    const metricsByLabel = new Map(baseCalendarData.averages.map((metric) => [metric.label, metric.value]));
    metricsByLabel.set('Players', String(summaryPlayers));
    metricsByLabel.set('Team Readiness', formatMetricValue(summaryReadiness, '%'));
    metricsByLabel.set('Average Load', formatMetricValue(summaryLoad));

    const orderedLabels = [
      'Players',
      'Team Readiness',
      'Team Energy',
      'Team Fatigue',
      'Team Stress',
      'Team Sleep Score',
      'Team Sleep Quantity',
      'Team Sleep Quality',
      'Acute Training Load',
      'Load Score',
      'Average Load',
      'Average Sleep Time',
      'Average Wake Time',
    ];

    const metrics = orderedLabels
      .map((label) => {
        const value = metricsByLabel.get(label);
        return value != null ? { label, value } : null;
      })
      .filter((metric): metric is { label: string; value: string } => Boolean(metric));

    return {
      ...baseCalendarData,
      averages: metrics,
    };
  }, [teamId, players, selectedTeamProfileAverages]);

  const analyticsData = useMemo(() => {
    if (!teamId) return emptyAnalyticsData;
    return buildTeamAnalyticsDataFromPlayers({
      teamId,
      players,
      teamAveragesMetrics: calendarData.averages,
    });
  }, [teamId, players, calendarData.averages]);

  const overviewData = useMemo(() => {
    if (!teamId) return emptyOverviewData;
    const baseOverviewData = buildTeamOverviewData({
      analyticsData,
      calendarData,
      players,
    });
    return {
      ...baseOverviewData,
      summary: {
        ...baseOverviewData.summary,
        averageReadiness: selectedTeamProfileAverages?.averageReadiness ?? baseOverviewData.summary.averageReadiness,
        averageLoad: selectedTeamProfileAverages?.averageLoad ?? baseOverviewData.summary.averageLoad,
      },
    };
  }, [teamId, analyticsData, calendarData, players, selectedTeamProfileAverages]);

  const error = playersError || summaryError;

  return {
    players,
    calendarData,
    analyticsData,
    overviewData,
    isLoading,
    error,
    reload: () => setRefreshVersion((value) => value + 1),
  };
}
