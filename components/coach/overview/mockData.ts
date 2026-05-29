import { getTeamAnalyticsData } from '@/components/coach/analytics/mockData';
import { getTeamCalendarData } from '@/components/coach/calendar/mockData';
import { getTeamPlayers } from '@/components/coach/players/mockData';
import type { TeamAnalyticsDataset } from '@/components/coach/analytics/types';
import type { TeamCalendarDataset } from '@/components/coach/calendar/types';
import type { TeamPlayerDataset } from '@/components/coach/players/types';

export interface OverviewSummaryStatus {
  label: 'Stable' | 'High Load' | 'Needs Attention';
  className: string;
}

export interface OverviewTeamSummary {
  playerCount: number;
  averageReadiness: number | null;
  averageLoad: number | null;
  status: OverviewSummaryStatus;
}

export interface OverviewMetric {
  label: string;
  value: number | null;
  toneClass: string;
}

export interface OverviewAttentionItem {
  playerId: string;
  playerName: string;
  issue: string;
  scoreLabel: string;
  scoreValue: number;
  statusLabel: 'Needs Attention' | 'Monitor';
  statusClassName: string;
}

export interface OverviewUpcomingActivity {
  id: string;
  title: string;
  kind: 'event' | 'task';
  type: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface OverviewTrend {
  label: string;
  points: number[];
  latest: number;
  delta: number;
  toneClass: string;
}

export interface TeamOverviewData {
  summary: OverviewTeamSummary;
  keyMetrics: OverviewMetric[];
  playersNeedingAttention: OverviewAttentionItem[];
  upcomingActivities: OverviewUpcomingActivity[];
  trends: OverviewTrend[];
}

const STATUS_CLASS_BY_LABEL: Record<OverviewAttentionItem['statusLabel'], string> = {
  'Needs Attention': 'text-[var(--status-red)] border-[rgba(255,107,107,0.4)] bg-[rgba(255,107,107,0.12)]',
  Monitor: 'text-[var(--status-yellow)] border-[rgba(255,212,59,0.4)] bg-[rgba(255,212,59,0.12)]',
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function rounded(value: number) {
  return Math.round(value);
}

function toRange100From10(value: number) {
  return clamp(rounded(value * 10), 0, 100);
}

function getSummaryStatus({
  averageReadiness,
  fatigue,
  stress,
  loadScore,
  hasData,
}: {
  averageReadiness: number | null;
  fatigue: number;
  stress: number;
  loadScore: number;
  hasData: boolean;
}): OverviewSummaryStatus {
  if (!hasData) {
    return {
      label: 'Stable',
      className: 'text-[var(--accent-primary)] border-[rgba(0,212,170,0.4)] bg-[rgba(0,212,170,0.12)]',
    };
  }

  if (averageReadiness != null && (averageReadiness < 78 || stress >= 58 || fatigue >= 7.2)) {
    return {
      label: 'Needs Attention',
      className: 'text-[var(--status-red)] border-[rgba(255,107,107,0.4)] bg-[rgba(255,107,107,0.12)]',
    };
  }

  if (loadScore >= 84 || fatigue >= 6.5) {
    return {
      label: 'High Load',
      className: 'text-[var(--status-orange)] border-[rgba(255,146,43,0.4)] bg-[rgba(255,146,43,0.12)]',
    };
  }

  return {
    label: 'Stable',
    className: 'text-[var(--accent-primary)] border-[rgba(0,212,170,0.4)] bg-[rgba(0,212,170,0.12)]',
  };
}

function buildAttentionIssue({
  readiness,
  fatigue,
  loadScore,
  sleepScore,
  stress,
}: {
  readiness: number;
  fatigue: number;
  loadScore: number;
  sleepScore: number;
  stress: number;
}) {
  const checks = [
    {
      issue: 'Low readiness',
      scoreLabel: 'Readiness',
      scoreValue: readiness,
      triggered: readiness < 78,
      severity: 78 - readiness,
    },
    {
      issue: 'High fatigue',
      scoreLabel: 'Fatigue',
      scoreValue: toRange100From10(fatigue),
      triggered: fatigue >= 7,
      severity: (fatigue - 7) * 10,
    },
    {
      issue: 'High load',
      scoreLabel: 'Load score',
      scoreValue: loadScore,
      triggered: loadScore >= 82,
      severity: loadScore - 82,
    },
    {
      issue: 'Poor sleep',
      scoreLabel: 'Sleep score',
      scoreValue: sleepScore,
      triggered: sleepScore < 76,
      severity: 76 - sleepScore,
    },
    {
      issue: 'High stress',
      scoreLabel: 'Stress',
      scoreValue: stress,
      triggered: stress >= 56,
      severity: stress - 56,
    },
  ].filter((check) => check.triggered);

  if (checks.length === 0) {
    return null;
  }

  const primary = checks.sort((a, b) => b.severity - a.severity)[0];
  const statusLabel: OverviewAttentionItem['statusLabel'] = primary.severity >= 10 ? 'Needs Attention' : 'Monitor';

  return {
    issue: primary.issue,
    scoreLabel: primary.scoreLabel,
    scoreValue: rounded(primary.scoreValue),
    statusLabel,
    statusClassName: STATUS_CLASS_BY_LABEL[statusLabel],
    severity: primary.severity,
  };
}

function parseMetricNumber(value: string): number | null {
  const numeric = Number.parseFloat(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

interface BuildTeamOverviewDataParams {
  analyticsData: TeamAnalyticsDataset;
  calendarData: TeamCalendarDataset;
  players: TeamPlayerDataset[];
}

export function buildTeamOverviewData({
  analyticsData,
  calendarData,
  players,
}: BuildTeamOverviewDataParams): TeamOverviewData {
  const hasAnalyticsData = analyticsData.labels.length > 0;
  const hasPlayerData = players.length > 0;
  const hasCalendarData = calendarData.items.length > 0 || calendarData.averages.length > 0;
  const hasData = hasAnalyticsData || hasPlayerData || hasCalendarData;

  const latestReadiness = analyticsData.averages.readinessTrend[analyticsData.averages.readinessTrend.length - 1];
  const latestEnergyFatigueLoad = analyticsData.averages.energyFatigueLoad[analyticsData.averages.energyFatigueLoad.length - 1];
  const latestSleep = analyticsData.averages.sleepQualityAndTiming[analyticsData.averages.sleepQualityAndTiming.length - 1];
  const latestStressSleep = analyticsData.averages.stressVsSleepScore[analyticsData.averages.stressVsSleepScore.length - 1];
  const latestMultiFactor = analyticsData.averages.multiFactorReadiness[analyticsData.averages.multiFactorReadiness.length - 1];
  const averageLoadMetric = calendarData.averages.find((metric) => metric.label === 'Acute Training Load');

  const averageReadiness = latestReadiness ? rounded(latestReadiness.readinessScore) : null;
  const averageLoad = averageLoadMetric
    ? (() => {
        const parsed = parseMetricNumber(averageLoadMetric.value);
        return parsed == null ? null : rounded(parsed);
      })()
    : latestEnergyFatigueLoad
      ? rounded(latestEnergyFatigueLoad.acuteTrainingLoad)
      : null;
  const hasSignalData = Boolean(latestReadiness || latestEnergyFatigueLoad || latestSleep || latestStressSleep || latestMultiFactor);

  const summaryStatus = getSummaryStatus({
    averageReadiness,
    fatigue: latestEnergyFatigueLoad?.fatigue ?? 0,
    stress: latestStressSleep?.stress ?? 0,
    loadScore: latestMultiFactor?.loadScore ?? 0,
    hasData: hasData && hasSignalData,
  });

  const keyMetrics: OverviewMetric[] = hasAnalyticsData ? [
    {
      label: 'Readiness Score',
      value: latestReadiness ? rounded(latestReadiness.readinessScore) : null,
      toneClass: 'text-[var(--accent-primary)]',
    },
    {
      label: 'Fatigue',
      value: latestEnergyFatigueLoad ? toRange100From10(latestEnergyFatigueLoad.fatigue) : null,
      toneClass: 'text-[var(--status-red)]',
    },
    {
      label: 'Load Score',
      value: latestMultiFactor ? rounded(latestMultiFactor.loadScore) : null,
      toneClass: 'text-[var(--accent-secondary)]',
    },
    {
      label: 'Sleep Score',
      value: latestSleep ? rounded(latestSleep.sleepScore) : null,
      toneClass: 'text-[var(--status-yellow)]',
    },
    {
      label: 'Stress',
      value: latestStressSleep ? rounded(latestStressSleep.stress) : null,
      toneClass: 'text-[var(--status-orange)]',
    },
    {
      label: 'Energy',
      value: latestEnergyFatigueLoad ? toRange100From10(latestEnergyFatigueLoad.energy) : null,
      toneClass: 'text-white',
    },
  ] : [];

  const playersNeedingAttention = players
    .map((dataset) => {
      if (dataset.analytics.readinessTrend.length === 0 || dataset.analytics.energyFatigueLoad.length === 0) {
        return null;
      }

      const readiness = dataset.analytics.readinessTrend[dataset.analytics.readinessTrend.length - 1]?.readinessScore ?? 0;
      const fatigue = dataset.analytics.energyFatigueLoad[dataset.analytics.energyFatigueLoad.length - 1]?.fatigue ?? 0;
      const sleepScore = dataset.analytics.sleepQualityAndTiming[dataset.analytics.sleepQualityAndTiming.length - 1]?.sleepScore ?? 0;
      const stress = dataset.analytics.stressVsSleepScore[dataset.analytics.stressVsSleepScore.length - 1]?.stress ?? 0;
      const loadScore = dataset.analytics.multiFactorReadiness[dataset.analytics.multiFactorReadiness.length - 1]?.loadScore ?? 0;

      const issue = buildAttentionIssue({ readiness, fatigue, loadScore, sleepScore, stress });
      if (!issue) return null;

      return {
        playerId: dataset.player.id,
        playerName: dataset.player.name,
        issue: issue.issue,
        scoreLabel: issue.scoreLabel,
        scoreValue: issue.scoreValue,
        statusLabel: issue.statusLabel,
        statusClassName: issue.statusClassName,
        severity: issue.severity,
      };
    })
    .filter((player): player is NonNullable<typeof player> => Boolean(player))
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 5)
    .map(({ severity, ...player }) => player);

  const upcomingActivities = calendarData.items
    .filter((item) => item.status === 'upcoming')
    .sort((a, b) => {
      const aDate = `${a.date}T${a.startTime}`;
      const bDate = `${b.date}T${b.startTime}`;
      return aDate.localeCompare(bDate);
    })
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
      type: item.type,
      date: item.date,
      startTime: item.startTime,
      endTime: item.endTime,
    }));

  const readinessTrendPoints = analyticsData.averages.readinessTrend.map((point) => point.readinessScore);
  const loadTrendPoints = analyticsData.averages.energyFatigueLoad.map((point) => point.acuteTrainingLoad);
  const fatigueTrendPoints = analyticsData.averages.energyFatigueLoad.map((point) => toRange100From10(point.fatigue));

  const trends: OverviewTrend[] = hasAnalyticsData ? [
    {
      label: 'Readiness Trend',
      points: readinessTrendPoints,
      latest: rounded(readinessTrendPoints[readinessTrendPoints.length - 1] ?? 0),
      delta: rounded((readinessTrendPoints[readinessTrendPoints.length - 1] ?? 0) - (readinessTrendPoints[0] ?? 0)),
      toneClass: 'text-[var(--accent-primary)]',
    },
    {
      label: 'Load Trend',
      points: loadTrendPoints,
      latest: rounded(loadTrendPoints[loadTrendPoints.length - 1] ?? 0),
      delta: rounded((loadTrendPoints[loadTrendPoints.length - 1] ?? 0) - (loadTrendPoints[0] ?? 0)),
      toneClass: 'text-[var(--accent-secondary)]',
    },
    {
      label: 'Fatigue Trend',
      points: fatigueTrendPoints,
      latest: rounded(fatigueTrendPoints[fatigueTrendPoints.length - 1] ?? 0),
      delta: rounded((fatigueTrendPoints[fatigueTrendPoints.length - 1] ?? 0) - (fatigueTrendPoints[0] ?? 0)),
      toneClass: 'text-[var(--status-red)]',
    },
  ] : [];

  return {
    summary: {
      playerCount: players.length,
      averageReadiness,
      averageLoad,
      status: summaryStatus,
    },
    keyMetrics,
    playersNeedingAttention,
    upcomingActivities,
    trends,
  };
}

export function getTeamOverviewData(teamId: string): TeamOverviewData {
  const analyticsData = getTeamAnalyticsData(teamId);
  const calendarData = getTeamCalendarData(teamId);
  const players = getTeamPlayers(teamId);

  return buildTeamOverviewData({
    analyticsData,
    calendarData,
    players,
  });
}
