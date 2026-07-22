import { format } from 'date-fns';
import type { TeamPlayerDataset } from '@/components/coach/players/types';
import {
  getTeamReadinessForDate,
  getTeamTrainingLoadForDate,
} from '@/lib/coach/teamMetrics';
import {
  analyticsLegendItems,
  type TeamAnalyticsDataset,
  type TeamAveragesAnalyticsData,
  type TeamPlayerComparisonPoint,
} from '@/components/coach/analytics/types';

interface BuildTeamAnalyticsDataFromPlayersParams {
  teamId: string;
  players: TeamPlayerDataset[];
  teamAveragesMetrics: TeamAnalyticsDataset['teamAveragesMetrics'];
}

interface DateLabelPoint {
  date: string;
  label: string;
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

function meanDefined(values: Array<number | undefined>) {
  const defined = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return mean(defined);
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

function defaultLabelForDate(dateValue: string): string {
  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateValue;
  return format(parsed, 'MMM d');
}

function getSortedDatePoints(players: TeamPlayerDataset[]): DateLabelPoint[] {
  const labelByDate = new Map<string, string>();

  players.forEach((dataset) => {
    [
      ...dataset.analytics.readinessTrend,
      ...dataset.analytics.energyFatigueLoad,
      ...dataset.analytics.sleepQualityAndTiming,
      ...dataset.analytics.stressVsSleepScore,
      ...dataset.analytics.multiFactorReadiness,
    ].forEach((point) => {
      if (!point.date) return;
      if (!labelByDate.has(point.date)) {
        labelByDate.set(point.date, point.label || defaultLabelForDate(point.date));
      }
    });
  });

  return Array.from(labelByDate.entries())
    .sort((first, second) => first[0].localeCompare(second[0]))
    .map(([date, label]) => ({ date, label }));
}

function buildTeamAverageSeries(players: TeamPlayerDataset[]) {
  const datePoints = getSortedDatePoints(players);

  const energyFatigueLoadByPlayer = players.map((player) => new Map(player.analytics.energyFatigueLoad.map((point) => [point.date, point])));
  const sleepByPlayer = players.map((player) => new Map(player.analytics.sleepQualityAndTiming.map((point) => [point.date, point])));
  const stressByPlayer = players.map((player) => new Map(player.analytics.stressVsSleepScore.map((point) => [point.date, point])));
  const multifactorByPlayer = players.map((player) => new Map(player.analytics.multiFactorReadiness.map((point) => [point.date, point])));

  const averages: TeamAveragesAnalyticsData = {
    readinessTrend: datePoints.flatMap(({ date, label }) => {
      const readiness = getTeamReadinessForDate(players, date).average;
      return readiness == null ? [] : [{
        date,
        label,
        readinessScore: roundTo(readiness, 0),
      }];
    }),
    energyFatigueLoad: datePoints.map(({ date, label }) => ({
      date,
      label,
      energy: roundTo(meanDefined(energyFatigueLoadByPlayer.map((map) => map.get(date)?.energy)), 1),
      fatigue: roundTo(meanDefined(energyFatigueLoadByPlayer.map((map) => map.get(date)?.fatigue)), 1),
      acuteTrainingLoad: roundTo(getTeamTrainingLoadForDate(players, date) ?? 0, 0),
    })),
    sleepQualityAndTiming: datePoints.flatMap(({ date, label }) => {
      const points = sleepByPlayer.map((map) => map.get(date)).filter((point): point is NonNullable<typeof point> => Boolean(point));
      return points.length === 0 ? [] : [{
        date,
        label,
        sleepHours: roundTo(mean(points.map((point) => point.sleepHours)), 1),
        sleepQualityScore: roundTo(mean(points.map((point) => point.sleepQualityScore)), 0),
        sleepScore: roundTo(mean(points.map((point) => point.sleepScore)), 0),
        bedTime: minutesToHHmm(mean(points.map((point) => hhmmToMinutes(point.bedTime)))),
        wakeTime: minutesToHHmm(mean(points.map((point) => hhmmToMinutes(point.wakeTime)))),
      }];
    }),
    stressVsSleepScore: datePoints.flatMap(({ date, label }) => {
      const points = stressByPlayer.map((map) => map.get(date)).filter((point): point is NonNullable<typeof point> => Boolean(point));
      return points.length === 0 ? [] : [{
        date,
        label,
        stress: roundTo(mean(points.map((point) => point.stress)), 0),
        sleepScore: roundTo(mean(points.map((point) => point.sleepScore)), 0),
      }];
    }),
    multiFactorReadiness: datePoints.flatMap(({ date, label }) => {
      const points = multifactorByPlayer.map((map) => map.get(date)).filter((point): point is NonNullable<typeof point> => Boolean(point));
      const readiness = getTeamReadinessForDate(players, date).average;
      return points.length === 0 || readiness == null ? [] : [{
        date,
        label,
        readinessScore: roundTo(readiness, 0),
        sleepScore: roundTo(mean(points.map((point) => point.sleepScore)), 0),
        energyScore: roundTo(mean(points.map((point) => point.energyScore)), 0),
        fatigueScore: roundTo(mean(points.map((point) => point.fatigueScore)), 0),
        stressScore: roundTo(mean(points.map((point) => point.stressScore)), 0),
        acuteTrainingLoad: roundTo(mean(points.map((point) => point.acuteTrainingLoad)), 0),
        loadScore: roundTo(mean(points.map((point) => point.loadScore)), 0),
      }];
    }),
  };

  return { labels: datePoints.map((point) => point.label), datePoints, averages };
}

function buildIndividualsByLabel(players: TeamPlayerDataset[], datePoints: DateLabelPoint[]) {
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const readinessByPlayer = players.map((player) => new Map(player.analytics.readinessTrend.map((point) => [point.date, point])));
  const energyFatigueLoadByPlayer = players.map((player) => new Map(player.analytics.energyFatigueLoad.map((point) => [point.date, point])));
  const sleepByPlayer = players.map((player) => new Map(player.analytics.sleepQualityAndTiming.map((point) => [point.date, point])));
  const stressByPlayer = players.map((player) => new Map(player.analytics.stressVsSleepScore.map((point) => [point.date, point])));
  const multifactorByPlayer = players.map((player) => new Map(player.analytics.multiFactorReadiness.map((point) => [point.date, point])));

  return datePoints.reduce<Record<string, TeamPlayerComparisonPoint[]>>((accumulator, point) => {
    accumulator[point.label] = players.flatMap((dataset, playerIndex) => {
      const readinessPoint = readinessByPlayer[playerIndex].get(point.date);
      if (!readinessPoint) {
        return [];
      }

      const readinessScore = readinessPoint.readinessScore;
      const fatigue = energyFatigueLoadByPlayer[playerIndex].get(point.date)?.fatigue ?? 0;
      const energy = energyFatigueLoadByPlayer[playerIndex].get(point.date)?.energy ?? 0;
      const stress = stressByPlayer[playerIndex].get(point.date)?.stress ?? 0;
      const sleepScore = sleepByPlayer[playerIndex].get(point.date)?.sleepScore ?? 0;
      const acuteTrainingLoad = energyFatigueLoadByPlayer[playerIndex].get(point.date)?.acuteTrainingLoad ?? 0;
      const loadScore = multifactorByPlayer[playerIndex].get(point.date)?.loadScore ?? 0;

      return [{
        playerId: dataset.player.id,
        playerName: dataset.player.name,
        label: point.label,
        readinessScore: clamp(roundTo(readinessScore, 0), 0, 100),
        fatigue: clamp(roundTo(fatigue, 1), 0, 10),
        energy: clamp(roundTo(energy, 1), 0, 10),
        stress: clamp(roundTo(stress, 0), 0, 100),
        sleepScore: clamp(roundTo(sleepScore, 0), 0, 100),
        acuteTrainingLoad: roundTo(acuteTrainingLoad, 0),
        loadScore: clamp(roundTo(loadScore, 0), 0, 100),
        loadRiskLabel: point.date === todayKey ? dataset.todaysRecommendation?.loadRiskLabel : undefined,
        recommendationLabel: point.date === todayKey ? dataset.todaysRecommendation?.recommendationLabel : undefined,
      }];
    });
    return accumulator;
  }, {});
}

export function buildTeamAnalyticsDataFromPlayers({
  teamId,
  players,
  teamAveragesMetrics,
}: BuildTeamAnalyticsDataFromPlayersParams): TeamAnalyticsDataset {
  const { labels, datePoints, averages } = buildTeamAverageSeries(players);
  const individualsByLabel = buildIndividualsByLabel(players, datePoints);

  return {
    teamId,
    labels,
    averages,
    teamAveragesMetrics,
    legendItems: analyticsLegendItems,
    individualsByLabel,
  };
}
