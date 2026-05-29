import { getTeamCalendarData } from '@/components/coach/calendar/mockData';
import { getTeamPlayers } from '@/components/coach/players/mockData';
import type { TeamPlayerDataset } from '@/components/coach/players/types';
import type {
  ComparisonMetricDefinition,
  TeamAnalyticsDataset,
  TeamAveragesAnalyticsData,
  TeamPlayerComparisonPoint,
} from '@/components/coach/analytics/types';

export const analyticsLegendItems = [
  'Team Readiness Score trend',
  'Team Energy vs Team Fatigue vs Team Acute Training Load',
  'Team Sleep Time vs Team Sleep Quality vs Team Sleep Score, including average sleep and wake times',
  'Team Stress vs Team Sleep Score',
  'Team Sleep Score + Team Energy + Team Fatigue + Team Stress + Team Load Score vs Team Readiness Score',
  'Team Averages Panel',
];

export const comparisonMetricDefinitions: ComparisonMetricDefinition[] = [
  {
    key: 'readinessScore',
    label: 'Readiness Score',
    shortLabel: 'Readiness',
    color: 'var(--accent-primary)',
    goodDirection: 'higher',
    domain: [0, 100],
  },
  {
    key: 'fatigue',
    label: 'Fatigue',
    shortLabel: 'Fatigue',
    color: '#ff6b6b',
    goodDirection: 'lower',
    domain: [0, 10],
  },
  {
    key: 'energy',
    label: 'Energy',
    shortLabel: 'Energy',
    color: '#ffd43b',
    goodDirection: 'higher',
    domain: [0, 10],
  },
  {
    key: 'stress',
    label: 'Stress',
    shortLabel: 'Stress',
    color: '#ff922b',
    goodDirection: 'lower',
    domain: [0, 100],
  },
  {
    key: 'sleepScore',
    label: 'Sleep Score',
    shortLabel: 'Sleep',
    color: 'var(--accent-secondary)',
    goodDirection: 'higher',
    domain: [0, 100],
  },
  {
    key: 'acuteTrainingLoad',
    label: 'Acute Training Load',
    shortLabel: 'Acute Load',
    color: '#b197fc',
    goodDirection: 'lower',
  },
  {
    key: 'loadScore',
    label: 'Load Score',
    shortLabel: 'Load',
    color: '#63e6be',
    goodDirection: 'lower',
    domain: [0, 100],
  },
];

interface BuildTeamAnalyticsDataFromPlayersParams {
  teamId: string;
  players: TeamPlayerDataset[];
  teamAveragesMetrics: TeamAnalyticsDataset['teamAveragesMetrics'];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, precision: number) {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function hhmmToMinutes(value: string): number {
  const [hoursRaw, minutesRaw] = value.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return 0;
  }

  return hours * 60 + minutes;
}

function minutesToHHmm(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function getChartLabels(players: TeamPlayerDataset[]) {
  const labels = players[0]?.analytics.readinessTrend.map((point) => point.label);
  return labels?.length ? labels : [];
}

function buildTeamAverageSeries(players: TeamPlayerDataset[]) {
  const labels = getChartLabels(players);

  const averages: TeamAveragesAnalyticsData = {
    readinessTrend: labels.map((label, index) => ({
      label,
      readinessScore: roundTo(
        mean(players.map((player) => player.analytics.readinessTrend[index]?.readinessScore ?? 0)),
        0
      ),
    })),
    energyFatigueLoad: labels.map((label, index) => ({
      label,
      energy: roundTo(mean(players.map((player) => player.analytics.energyFatigueLoad[index]?.energy ?? 0)), 1),
      fatigue: roundTo(mean(players.map((player) => player.analytics.energyFatigueLoad[index]?.fatigue ?? 0)), 1),
      acuteTrainingLoad: roundTo(
        mean(players.map((player) => player.analytics.energyFatigueLoad[index]?.acuteTrainingLoad ?? 0)),
        0
      ),
    })),
    sleepQualityAndTiming: labels.map((label, index) => ({
      label,
      sleepHours: roundTo(mean(players.map((player) => player.analytics.sleepQualityAndTiming[index]?.sleepHours ?? 0)), 1),
      sleepQualityScore: roundTo(
        mean(players.map((player) => player.analytics.sleepQualityAndTiming[index]?.sleepQualityScore ?? 0)),
        0
      ),
      sleepScore: roundTo(mean(players.map((player) => player.analytics.sleepQualityAndTiming[index]?.sleepScore ?? 0)), 0),
      bedTime: minutesToHHmm(
        mean(players.map((player) => hhmmToMinutes(player.analytics.sleepQualityAndTiming[index]?.bedTime ?? '22:30')))
      ),
      wakeTime: minutesToHHmm(
        mean(players.map((player) => hhmmToMinutes(player.analytics.sleepQualityAndTiming[index]?.wakeTime ?? '06:45')))
      ),
    })),
    stressVsSleepScore: labels.map((label, index) => ({
      label,
      stress: roundTo(mean(players.map((player) => player.analytics.stressVsSleepScore[index]?.stress ?? 0)), 0),
      sleepScore: roundTo(mean(players.map((player) => player.analytics.stressVsSleepScore[index]?.sleepScore ?? 0)), 0),
    })),
    multiFactorReadiness: labels.map((label, index) => ({
      label,
      readinessScore: roundTo(
        mean(players.map((player) => player.analytics.multiFactorReadiness[index]?.readinessScore ?? 0)),
        0
      ),
      sleepScore: roundTo(mean(players.map((player) => player.analytics.multiFactorReadiness[index]?.sleepScore ?? 0)), 0),
      energyScore: roundTo(mean(players.map((player) => player.analytics.multiFactorReadiness[index]?.energyScore ?? 0)), 0),
      fatigueScore: roundTo(mean(players.map((player) => player.analytics.multiFactorReadiness[index]?.fatigueScore ?? 0)), 0),
      stressScore: roundTo(mean(players.map((player) => player.analytics.multiFactorReadiness[index]?.stressScore ?? 0)), 0),
      loadScore: roundTo(mean(players.map((player) => player.analytics.multiFactorReadiness[index]?.loadScore ?? 0)), 0),
    })),
  };

  return { labels, averages };
}

function buildIndividualsByLabel(players: TeamPlayerDataset[]) {
  const labels = getChartLabels(players);

  return labels.reduce<Record<string, TeamPlayerComparisonPoint[]>>((accumulator, label, index) => {
    accumulator[label] = players.map((dataset) => {
      const readinessScore = dataset.analytics.readinessTrend[index]?.readinessScore ?? 0;
      const fatigue = dataset.analytics.energyFatigueLoad[index]?.fatigue ?? 0;
      const energy = dataset.analytics.energyFatigueLoad[index]?.energy ?? 0;
      const stress = dataset.analytics.stressVsSleepScore[index]?.stress ?? 0;
      const sleepScore = dataset.analytics.sleepQualityAndTiming[index]?.sleepScore ?? 0;
      const acuteTrainingLoad = dataset.analytics.energyFatigueLoad[index]?.acuteTrainingLoad ?? 0;
      const loadScore = dataset.analytics.multiFactorReadiness[index]?.loadScore ?? 0;

      return {
        playerId: dataset.player.id,
        playerName: dataset.player.name,
        label,
        readinessScore: clamp(roundTo(readinessScore, 0), 0, 100),
        fatigue: clamp(roundTo(fatigue, 1), 0, 10),
        energy: clamp(roundTo(energy, 1), 0, 10),
        stress: clamp(roundTo(stress, 0), 0, 100),
        sleepScore: clamp(roundTo(sleepScore, 0), 0, 100),
        acuteTrainingLoad: roundTo(acuteTrainingLoad, 0),
        loadScore: clamp(roundTo(loadScore, 0), 0, 100),
      };
    });
    return accumulator;
  }, {});
}

export function buildTeamAnalyticsDataFromPlayers({
  teamId,
  players,
  teamAveragesMetrics,
}: BuildTeamAnalyticsDataFromPlayersParams): TeamAnalyticsDataset {
  const { labels, averages } = buildTeamAverageSeries(players);
  const individualsByLabel = buildIndividualsByLabel(players);

  return {
    teamId,
    labels,
    averages,
    teamAveragesMetrics,
    legendItems: analyticsLegendItems,
    individualsByLabel,
  };
}

export function getTeamAnalyticsData(teamId: string): TeamAnalyticsDataset {
  const players = getTeamPlayers(teamId);
  const teamAveragesMetrics = getTeamCalendarData(teamId).averages;

  return buildTeamAnalyticsDataFromPlayers({
    teamId,
    players,
    teamAveragesMetrics,
  });
}
