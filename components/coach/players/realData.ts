import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import type { CoachPlayer, TeamPlayerDataset } from '@/components/coach/players/types';

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
  energy: number;
  fatigue: number;
  stress: number;
  sleep_quality: number;
  sleep_duration: number | string;
  sleep_time: string;
  wake_time: string;
}

interface TrainingRow {
  user_id: string;
  date: string;
  duration: number;
  intensity: number;
}

interface CalendarRow {
  id: string;
  user_id: string;
  title: string | null;
  event_type_id: string;
  start_time: string;
  end_time: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

function buildDatasetForPlayer(params: {
  player: CoachPlayer;
  wellnessRows: WellnessRow[];
  trainingRows: TrainingRow[];
  calendarRows: CalendarRow[];
}): TeamPlayerDataset {
  const { player, wellnessRows, trainingRows, calendarRows } = params;
  const latestWellness = wellnessRows[wellnessRows.length - 1];

  const loadByDate = trainingRows.reduce<Record<string, number>>((accumulator, row) => {
    const dayLoad = row.duration * row.intensity;
    accumulator[row.date] = (accumulator[row.date] ?? 0) + dayLoad;
    return accumulator;
  }, {});

  const allDates = Array.from(
    new Set([
      ...wellnessRows.map((row) => row.date),
      ...trainingRows.map((row) => row.date),
    ])
  )
    .sort((a, b) => a.localeCompare(b))
    .slice(-14);

  const analyticsRows = allDates.map((dateValue) => {
    const wellness = wellnessRows.find((row) => row.date === dateValue);
    const energy = wellness?.energy ?? 0;
    const fatigue = wellness?.fatigue ?? 0;
    const stress = wellness?.stress ?? 0;
    const sleepHours = toNumber(wellness?.sleep_duration);
    const sleepQuality = wellness?.sleep_quality ?? 0;
    const load = loadByDate[dateValue] ?? 0;
    const loadScore = clamp(Math.round(load / 10), 0, 100);
    const sleepScore = clamp(Math.round(((sleepQuality * 10) + (sleepHours * 10)) / 2), 0, 100);
    const readinessScore = clamp(
      Math.round((energy * 10) * 0.35 + sleepScore * 0.35 + (100 - fatigue * 10) * 0.2 + (100 - stress * 1.2) * 0.1 - loadScore * 0.1),
      0,
      100
    );

    return {
      dateValue,
      label: formatLabel(dateValue),
      energy,
      fatigue,
      stress,
      sleepHours,
      sleepQuality,
      sleepScore,
      load,
      loadScore,
      readinessScore,
      bedTime: wellness?.sleep_time ?? '--:--',
      wakeTime: wellness?.wake_time ?? '--:--',
    };
  });

  const sortedCalendarRows = [...calendarRows].sort((a, b) => a.start_time.localeCompare(b.start_time));

  return {
    player,
    wellness: {
      readinessScore: analyticsRows[analyticsRows.length - 1]?.readinessScore ?? 0,
      fatigue: toNumber(latestWellness?.fatigue) * 10,
      loadScore: analyticsRows[analyticsRows.length - 1]?.loadScore ?? 0,
    },
    analytics: {
      readinessTrend: analyticsRows.map((row) => ({
        label: row.label,
        readinessScore: row.readinessScore,
      })),
      energyFatigueLoad: analyticsRows.map((row) => ({
        label: row.label,
        energy: row.energy,
        fatigue: row.fatigue,
        acuteTrainingLoad: Math.round(row.load),
      })),
      sleepQualityAndTiming: analyticsRows.map((row) => ({
        label: row.label,
        sleepHours: row.sleepHours,
        sleepQualityScore: row.sleepQuality * 10,
        sleepScore: row.sleepScore,
        bedTime: row.bedTime,
        wakeTime: row.wakeTime,
      })),
      stressVsSleepScore: analyticsRows.map((row) => ({
        label: row.label,
        stress: row.stress * 10,
        sleepScore: row.sleepScore,
      })),
      multiFactorReadiness: analyticsRows.map((row) => ({
        label: row.label,
        readinessScore: row.readinessScore,
        sleepScore: row.sleepScore,
        energyScore: row.energy * 10,
        fatigueScore: row.fatigue * 10,
        stressScore: row.stress * 10,
        loadScore: row.loadScore,
      })),
    },
    calendarEvents: sortedCalendarRows.map((row) => {
      const start = toDateAndTime(row.start_time);
      const end = toDateAndTime(row.end_time);
      const eventType = row.event_type_id.toLowerCase();

      return {
        id: row.id,
        playerId: row.user_id,
        teamId: player.teamId,
        title: row.title || row.event_type_id || 'Session',
        type: eventType.includes('gym') ? 'gym' : 'solo',
        date: start.date,
        startTime: start.time,
        endTime: end.time,
      } as const;
    }),
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

  const [wellnessResult, trainingResult, calendarResult] = await Promise.all([
    supabase
      .from('wellness_logs')
      .select('user_id, date, energy, fatigue, stress, sleep_quality, sleep_duration, sleep_time, wake_time')
      .in('user_id', playerIds)
      .order('date', { ascending: true }),
    supabase
      .from('training_logs')
      .select('user_id, date, duration, intensity')
      .in('user_id', playerIds)
      .order('date', { ascending: true }),
    supabase
      .from('calendar_events')
      .select('id, user_id, title, event_type_id, start_time, end_time')
      .in('user_id', playerIds)
      .order('start_time', { ascending: true }),
  ]);

  if (wellnessResult.error) {
    console.error('[players/realData:loadRealTeamPlayerDatasets] Error loading wellness logs for team players:', wellnessResult.error, { teamId, playerCount: playerIds.length });
    return { data: [], error: wellnessResult.error.message || 'Unable to load wellness logs.' };
  }

  if (trainingResult.error) {
    console.error('[players/realData:loadRealTeamPlayerDatasets] Error loading training logs for team players:', trainingResult.error, { teamId, playerCount: playerIds.length });
    return { data: [], error: trainingResult.error.message || 'Unable to load training logs.' };
  }

  if (calendarResult.error) {
    console.error('[players/realData:loadRealTeamPlayerDatasets] Error loading calendar events for team players:', calendarResult.error, { teamId, playerCount: playerIds.length });
    return { data: [], error: calendarResult.error.message || 'Unable to load calendar events.' };
  }

  const wellnessRows = (wellnessResult.data ?? []) as WellnessRow[];
  const trainingRows = (trainingResult.data ?? []) as TrainingRow[];
  const calendarRows = (calendarResult.data ?? []) as CalendarRow[];

  const teamPlayers = playerRows.map((row, index) => {
    const coachPlayer: CoachPlayer = {
      id: row.user_id,
      teamId,
      name: row.display_name || row.email || `Player ${index + 1}`,
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
    });
  });

  return { data: teamPlayers, error: null };
}
