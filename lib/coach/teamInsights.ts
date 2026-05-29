'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildTeamAnalyticsDataFromPlayers } from '@/components/coach/analytics/mockData';
import type { TeamAnalyticsDataset } from '@/components/coach/analytics/types';
import type { TeamCalendarDataset, TeamCalendarItem, TeamCalendarItemStatus, TeamEventType } from '@/components/coach/calendar/types';
import { loadRealTeamPlayerDatasets } from '@/components/coach/players/realData';
import type { TeamPlayerDataset } from '@/components/coach/players/types';
import { buildTeamOverviewData, type TeamOverviewData } from '@/components/coach/overview/mockData';
import { supabase } from '@/lib/supabase';

interface TeamMembershipRow {
  team_id: string | null;
  user_id: string | null;
}

interface PlayerProfileRow {
  id: string;
  date_of_birth: string | null;
  height_cm: number | string | null;
  weight_kg: number | string | null;
  positions: string[] | null;
}

interface WellnessSummaryRow {
  user_id: string;
  date: string;
  sleep_duration: number | string;
  sleep_quality: number;
  energy: number;
  fatigue: number;
  stress: number;
}

interface TrainingSummaryRow {
  user_id: string;
  date: string;
  duration: number | string;
  intensity: number | string;
}

interface CalendarEventRow {
  id: string;
  user_id: string;
  title: string | null;
  event_type_id: string;
  start_time: string;
  end_time: string;
}

interface TeamReference {
  id: string;
  name: string;
}

export interface CoachTeamProfileAverages {
  players: number;
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
      className: 'text-[var(--accent-primary)] border-[rgba(0,212,170,0.4)] bg-[rgba(0,212,170,0.12)]',
    },
  },
  keyMetrics: [],
  playersNeedingAttention: [],
  upcomingActivities: [],
  trends: [],
};

function round(value: number): number {
  return Math.round(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toPositiveNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function ageFromDateOfBirth(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;

  const parsed = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - parsed.getFullYear();
  const birthdayPassedThisYear =
    now.getMonth() > parsed.getMonth() ||
    (now.getMonth() === parsed.getMonth() && now.getDate() >= parsed.getDate());

  if (!birthdayPassedThisYear) {
    age -= 1;
  }

  return age >= 0 && age <= 120 ? age : null;
}

function computeReadinessFromWellnessRow(row: WellnessSummaryRow): number {
  const sleepDuration = toFiniteNumber(row.sleep_duration) ?? 0;
  const sleepQuality = row.sleep_quality;
  const energy = row.energy;
  const fatigue = row.fatigue;
  const stress = row.stress;

  const sleepScore = clamp(Math.round(((sleepQuality * 10) + (sleepDuration * 10)) / 2), 0, 100);

  return clamp(
    Math.round(
      (energy * 10) * 0.35 +
      sleepScore * 0.35 +
      (100 - fatigue * 10) * 0.2 +
      (100 - stress * 10) * 0.1
    ),
    0,
    100
  );
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

function mapPlayerEventTypeToTeamEventType(type: 'gym' | 'solo'): TeamEventType {
  if (type === 'gym') return 'gym';
  return 'solo';
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

function getLatestWellnessSnapshot(dataset: TeamPlayerDataset): {
  readinessScore: number;
  fatigue: number;
  sleepScore: number;
  stress: number;
} | null {
  const { readinessTrend, energyFatigueLoad, sleepQualityAndTiming, stressVsSleepScore } = dataset.analytics;
  const maxLength = Math.max(
    readinessTrend.length,
    energyFatigueLoad.length,
    sleepQualityAndTiming.length,
    stressVsSleepScore.length
  );

  for (let index = maxLength - 1; index >= 0; index -= 1) {
    const readiness = readinessTrend[index];
    const energyFatigue = energyFatigueLoad[index];
    const sleep = sleepQualityAndTiming[index];
    const stress = stressVsSleepScore[index];

    const hasWellnessSignal =
      Boolean(sleep && (sleep.sleepHours > 0 || sleep.sleepQualityScore > 0 || sleep.sleepScore > 0)) ||
      Boolean(energyFatigue && (energyFatigue.energy > 0 || energyFatigue.fatigue > 0)) ||
      Boolean(stress && stress.stress > 0);

    if (!hasWellnessSignal) continue;

    return {
      readinessScore: readiness?.readinessScore ?? 0,
      fatigue: energyFatigue?.fatigue ?? 0,
      sleepScore: sleep?.sleepScore ?? 0,
      stress: stress?.stress ?? 0,
    };
  }

  return null;
}

function getLatestTrainingLoad(dataset: TeamPlayerDataset): number | null {
  for (let index = dataset.analytics.energyFatigueLoad.length - 1; index >= 0; index -= 1) {
    const load = dataset.analytics.energyFatigueLoad[index]?.acuteTrainingLoad ?? 0;
    if (load > 0) {
      return load;
    }
  }
  return null;
}

function formatMetricValue(value: number | null, suffix = ''): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${round(value)}${suffix}`;
}

function buildCalendarAverages(players: TeamPlayerDataset[]): TeamCalendarDataset['averages'] {
  if (players.length === 0) {
    return [];
  }

  const wellnessSnapshots = players
    .map((dataset) => getLatestWellnessSnapshot(dataset))
    .filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot));
  const readiness = wellnessSnapshots.map((snapshot) => snapshot.readinessScore);
  const fatigue = wellnessSnapshots.map((snapshot) => snapshot.fatigue);
  const sleepScore = wellnessSnapshots.map((snapshot) => snapshot.sleepScore);
  const stress = wellnessSnapshots.map((snapshot) => snapshot.stress);
  const load = players
    .map((dataset) => getLatestTrainingLoad(dataset))
    .filter((value): value is number => value != null && Number.isFinite(value));

  return [
    { label: 'Players', value: String(players.length) },
    { label: 'Readiness Score', value: formatMetricValue(averageOrNull(readiness), '%') },
    { label: 'Fatigue', value: formatMetricValue(averageOrNull(fatigue) == null ? null : average(fatigue) * 10) },
    { label: 'Sleep Score', value: formatMetricValue(averageOrNull(sleepScore)) },
    { label: 'Acute Training Load', value: formatMetricValue(averageOrNull(load)) },
    { label: 'Stress', value: formatMetricValue(averageOrNull(stress)) },
  ];
}

export function buildTeamCalendarDataFromPlayers(teamId: string, players: TeamPlayerDataset[]): TeamCalendarDataset {
  const items: TeamCalendarItem[] = players
    .flatMap((dataset) =>
      dataset.calendarEvents.map((event) => ({
        id: `${event.id}-${dataset.player.id}`,
        teamId,
        title: event.title,
        type: mapPlayerEventTypeToTeamEventType(event.type),
        description: `${dataset.player.name} ${event.type} session`,
        kind: 'event' as const,
        status: resolveCalendarStatus(event.date, event.endTime),
        date: event.date,
        startTime: event.startTime,
        endTime: event.endTime,
      }))
    )
    .sort((first, second) => `${first.date}T${first.startTime}`.localeCompare(`${second.date}T${second.startTime}`));

  return {
    averages: buildCalendarAverages(players),
    items,
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

  const { data: membershipRows, error: membershipError } = await supabase
    .from('team_memberships')
    .select('team_id, user_id')
    .in('team_id', normalizedTeamIds)
    .eq('role', 'player')
    .eq('status', 'active');

  if (membershipError) {
    console.error('[teamInsights/loadTeamProfileAveragesByTeamIds] Error loading active player memberships:', membershipError, { teamIds: normalizedTeamIds });
    return { averagesByTeamId: emptyAveragesByTeamId, error: membershipError.message || 'Unable to load team memberships.' };
  }

  const membershipPairs = (membershipRows ?? [])
    .filter((row): row is TeamMembershipRow => Boolean(row.team_id) && Boolean(row.user_id))
    .map((row) => ({ teamId: row.team_id as string, userId: row.user_id as string }));

  if (membershipPairs.length === 0) {
    return { averagesByTeamId: emptyAveragesByTeamId, error: null };
  }

  const uniqueMembershipPairs = Array.from(
    new Map(membershipPairs.map((pair) => [`${pair.teamId}:${pair.userId}`, pair])).values()
  );
  const userIds = Array.from(new Set(uniqueMembershipPairs.map((pair) => pair.userId)));

  const { data: profileRows, error: profilesError } = await supabase
    .from('profiles')
    .select('id, date_of_birth, height_cm, weight_kg, positions')
    .in('id', userIds);

  if (profilesError) {
    console.error('[teamInsights/loadTeamProfileAveragesByTeamIds] Error loading player profiles:', profilesError, { teamIds: normalizedTeamIds, userCount: userIds.length });
    return { averagesByTeamId: emptyAveragesByTeamId, error: profilesError.message || 'Unable to load player profiles.' };
  }

  const [wellnessResult, trainingResult] = await Promise.all([
    supabase
      .from('wellness_logs')
      .select('user_id, date, sleep_duration, sleep_quality, energy, fatigue, stress')
      .in('user_id', userIds)
      .order('date', { ascending: false }),
    supabase
      .from('training_logs')
      .select('user_id, date, duration, intensity')
      .in('user_id', userIds)
      .order('date', { ascending: false }),
  ]);

  let partialError: string | null = null;
  if (wellnessResult.error) {
    console.error('[teamInsights/loadTeamProfileAveragesByTeamIds] Error loading wellness logs for readiness averages:', wellnessResult.error, {
      teamIds: normalizedTeamIds,
      userCount: userIds.length,
    });
    partialError = 'Unable to load team wellness logs.';
  }

  if (trainingResult.error) {
    console.error('[teamInsights/loadTeamProfileAveragesByTeamIds] Error loading training logs for load averages:', trainingResult.error, {
      teamIds: normalizedTeamIds,
      userCount: userIds.length,
    });
    partialError = partialError ? `${partialError} Unable to load team training logs.` : 'Unable to load team training logs.';
  }

  const profileByUserId = new Map<string, PlayerProfileRow>(
    ((profileRows ?? []) as PlayerProfileRow[]).map((row) => [row.id, row])
  );

  const latestWellnessByUserId = new Map<string, WellnessSummaryRow>();
  if (!wellnessResult.error) {
    for (const row of (wellnessResult.data ?? []) as WellnessSummaryRow[]) {
      if (!latestWellnessByUserId.has(row.user_id)) {
        latestWellnessByUserId.set(row.user_id, row);
      }
    }
  }

  const latestTrainingLoadByUserId = new Map<string, number>();
  if (!trainingResult.error) {
    const latestTrainingDateByUserId = new Map<string, string>();
    for (const row of (trainingResult.data ?? []) as TrainingSummaryRow[]) {
      const latestDate = latestTrainingDateByUserId.get(row.user_id);
      if (!latestDate) {
        latestTrainingDateByUserId.set(row.user_id, row.date);
      }

      if (latestTrainingDateByUserId.get(row.user_id) !== row.date) {
        continue;
      }

      const duration = toFiniteNumber(row.duration) ?? 0;
      const intensity = toFiniteNumber(row.intensity) ?? 0;
      const computedLoad = duration > 0 && intensity > 0 ? duration * intensity : 0;
      latestTrainingLoadByUserId.set(
        row.user_id,
        (latestTrainingLoadByUserId.get(row.user_id) ?? 0) + computedLoad
      );
    }
  }

  const accumulators = normalizedTeamIds.reduce<Record<string, {
    players: number;
    ages: number[];
    heights: number[];
    weights: number[];
    readinessScores: number[];
    loadScores: number[];
    positions: Set<string>;
  }>>((accumulator, teamId) => {
    accumulator[teamId] = {
      players: 0,
      ages: [],
      heights: [],
      weights: [],
      readinessScores: [],
      loadScores: [],
      positions: new Set<string>(),
    };
    return accumulator;
  }, {});

  for (const pair of uniqueMembershipPairs) {
    const teamAccumulator = accumulators[pair.teamId];
    if (!teamAccumulator) continue;

    teamAccumulator.players += 1;

    const latestWellness = latestWellnessByUserId.get(pair.userId);
    if (latestWellness) {
      teamAccumulator.readinessScores.push(computeReadinessFromWellnessRow(latestWellness));
    }

    const latestLoad = latestTrainingLoadByUserId.get(pair.userId);
    if (typeof latestLoad === 'number' && Number.isFinite(latestLoad) && latestLoad > 0) {
      teamAccumulator.loadScores.push(latestLoad);
    }

    const profile = profileByUserId.get(pair.userId);
    if (!profile) continue;

    const age = ageFromDateOfBirth(profile.date_of_birth);
    if (age !== null) {
      teamAccumulator.ages.push(age);
    }

    const height = toPositiveNumber(profile.height_cm);
    if (height !== null) {
      teamAccumulator.heights.push(height);
    }

    const weight = toPositiveNumber(profile.weight_kg);
    if (weight !== null) {
      teamAccumulator.weights.push(weight);
    }

    for (const position of profile.positions ?? []) {
      const normalizedPosition = position.trim();
      if (normalizedPosition) {
        teamAccumulator.positions.add(normalizedPosition);
      }
    }
  }

  const averagesByTeamId = normalizedTeamIds.reduce<Record<string, CoachTeamProfileAverages>>((accumulator, teamId) => {
    const teamAccumulator = accumulators[teamId];

    accumulator[teamId] = {
      players: teamAccumulator.players,
      averageAge: averageOrNull(teamAccumulator.ages),
      averageHeightCm: averageOrNull(teamAccumulator.heights),
      averageWeightKg: averageOrNull(teamAccumulator.weights),
      averageReadiness: averageOrNull(teamAccumulator.readinessScores),
      averageLoad: averageOrNull(teamAccumulator.loadScores),
      positions: Array.from(teamAccumulator.positions).sort((first, second) => first.localeCompare(second)),
    };

    return accumulator;
  }, {});

  return { averagesByTeamId, error: partialError };
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
    return { items: [], error: membershipError.message || 'Unable to load team memberships.' };
  }

  const memberships = (membershipRows ?? []) as TeamMembershipRow[];
  if (memberships.length === 0) {
    return { items: [], error: null };
  }

  const userIds = Array.from(new Set(memberships.map((row) => row.user_id).filter((userId): userId is string => Boolean(userId))));
  const teamIdsByUserId = memberships.reduce<Record<string, string[]>>((accumulator, row) => {
    if (!row.user_id || !row.team_id) return accumulator;
    if (!accumulator[row.user_id]) {
      accumulator[row.user_id] = [];
    }
    if (!accumulator[row.user_id].includes(row.team_id)) {
      accumulator[row.user_id].push(row.team_id);
    }
    return accumulator;
  }, {});

  if (userIds.length === 0) {
    return { items: [], error: null };
  }

  const { data: calendarRows, error: calendarError } = await supabase
    .from('calendar_events')
    .select('id, user_id, title, event_type_id, start_time, end_time')
    .in('user_id', userIds)
    .order('start_time', { ascending: true });

  if (calendarError) {
    console.error('[teamInsights/loadCoachCalendarItemsForTeams] Error loading calendar events:', calendarError, { teamIds, userCount: userIds.length });
    return { items: [], error: calendarError.message || 'Unable to load team calendar events.' };
  }

  const items = ((calendarRows ?? []) as CalendarEventRow[]).flatMap((row) => {
    const userTeamIds = teamIdsByUserId[row.user_id] ?? [];
    const start = toDateAndTime(row.start_time);
    const end = toDateAndTime(row.end_time);
    const resolvedTitle = row.title?.trim() || row.event_type_id || 'Event';

    return userTeamIds.map((teamId) => ({
      id: `${row.id}-${teamId}`,
      teamId,
      title: resolvedTitle,
      type: mapEventTypeIdToTeamEventType(row.event_type_id || ''),
      description: `${teamNameById.get(teamId) ?? 'Team'} activity`,
      kind: 'event' as const,
      status: resolveCalendarStatus(start.date, end.time),
      date: start.date,
      startTime: start.time,
      endTime: end.time,
    }));
  });

  return { items, error: null };
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

export function useCoachSelectedTeamInsights(teamId: string) {
  const [players, setPlayers] = useState<TeamPlayerDataset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [selectedTeamProfileAverages, setSelectedTeamProfileAverages] = useState<CoachTeamProfileAverages | null>(null);

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
  }, [teamId]);

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
  }, [teamId]);

  const calendarData = useMemo(() => {
    if (!teamId) return emptyCalendarData;
    const baseCalendarData = buildTeamCalendarDataFromPlayers(teamId, players);
    const summaryPlayers = selectedTeamProfileAverages?.players ?? players.length;
    const summaryReadiness = selectedTeamProfileAverages?.averageReadiness ?? null;
    const summaryLoad = selectedTeamProfileAverages?.averageLoad ?? null;

    const metricsByLabel = new Map(baseCalendarData.averages.map((metric) => [metric.label, metric.value]));
    metricsByLabel.set('Players', String(summaryPlayers));
    metricsByLabel.set('Readiness Score', formatMetricValue(summaryReadiness, '%'));
    metricsByLabel.set('Acute Training Load', formatMetricValue(summaryLoad));

    const orderedLabels = [
      'Players',
      'Readiness Score',
      'Fatigue',
      'Sleep Score',
      'Acute Training Load',
      'Stress',
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
  };
}
