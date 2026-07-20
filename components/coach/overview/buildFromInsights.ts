import type { TeamAnalyticsDataset } from '@/components/coach/analytics/types';
import type { TeamCalendarDataset } from '@/components/coach/calendar/types';
import type { TeamPlayerDataset } from '@/components/coach/players/types';
import { format } from 'date-fns';
import { getTeamReadinessForDate } from '@/lib/coach/teamMetrics';

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
  scoreValue: number | null;
  statusLabel: 'Injury' | 'Needs Attention' | 'Monitor';
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
  item: TeamCalendarDataset['items'][number];
}

export interface OverviewTrend {
  label: string;
  points: number[];
  latest: number;
  delta: number;
  toneClass: string;
}

export interface OverviewDailyWellnessPlayer {
  playerId: string;
  playerName: string;
}

export interface OverviewDailyWellnessStatus {
  completedCount: number;
  totalCount: number;
  completedPlayers: OverviewDailyWellnessPlayer[];
  incompletePlayers: OverviewDailyWellnessPlayer[];
}

export interface TeamOverviewData {
  summary: OverviewTeamSummary;
  dailyWellness: OverviewDailyWellnessStatus;
  keyMetrics: OverviewMetric[];
  playersNeedingAttention: OverviewAttentionItem[];
  upcomingActivities: OverviewUpcomingActivity[];
  trends: OverviewTrend[];
}

const STATUS_CLASS_BY_LABEL: Record<OverviewAttentionItem['statusLabel'], string> = {
  Injury: 'text-[var(--status-red)] border-[rgba(255,107,107,0.5)] bg-[rgba(255,107,107,0.16)]',
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
  hasElevatedLoad,
  hasData,
}: {
  averageReadiness: number | null;
  fatigue: number;
  stress: number;
  loadScore: number;
  hasElevatedLoad: boolean;
  hasData: boolean;
}): OverviewSummaryStatus {
  if (!hasData) {
    return {
      label: 'Stable',
      className: 'text-[var(--status-green)] border-[rgba(var(--status-green-rgb),0.4)] bg-[rgba(var(--status-green-rgb),0.12)]',
    };
  }

  if (averageReadiness != null && (averageReadiness < 70 || stress >= 58 || fatigue >= 7.2)) {
    return {
      label: 'Needs Attention',
      className: 'text-[var(--status-red)] border-[rgba(255,107,107,0.4)] bg-[rgba(255,107,107,0.12)]',
    };
  }

  if (hasElevatedLoad || loadScore < 70 || fatigue >= 6.5) {
    return {
      label: 'High Load',
      className: 'text-[var(--status-orange)] border-[rgba(255,146,43,0.4)] bg-[rgba(255,146,43,0.12)]',
    };
  }

  return {
    label: 'Stable',
    className: 'text-[var(--status-green)] border-[rgba(var(--status-green-rgb),0.4)] bg-[rgba(var(--status-green-rgb),0.12)]',
  };
}

function buildAttentionIssue({
  readiness,
  fatigue,
  loadScore,
  loadRiskLabel,
  sleepScore,
  stress,
  injuryDescription,
  injuryReportedAgo,
}: {
  readiness: number;
  fatigue: number;
  loadScore: number;
  loadRiskLabel?: string;
  sleepScore: number;
  stress: number;
  injuryDescription?: string;
  injuryReportedAgo?: string;
}) {
  const checks = [
    {
      issue: 'Low readiness',
      scoreLabel: 'Readiness',
      scoreValue: readiness,
      triggered: readiness < 70,
      severity: 70 - readiness,
    },
    {
      issue: 'High fatigue',
      scoreLabel: 'Fatigue',
      scoreValue: toRange100From10(fatigue),
      triggered: fatigue >= 7,
      severity: (fatigue - 7) * 10,
    },
    {
      issue: loadRiskLabel === 'Spike' ? 'Load spike' : 'Elevated load',
      scoreLabel: 'Load score',
      scoreValue: loadScore,
      triggered: loadRiskLabel === 'Elevated' || loadRiskLabel === 'Spike',
      severity: loadRiskLabel === 'Spike' ? 24 : 14,
    },
    {
      issue: 'Poor sleep',
      scoreLabel: 'Sleep score',
      scoreValue: sleepScore,
      triggered: sleepScore < 70,
      severity: 70 - sleepScore,
    },
    {
      issue: 'High stress',
      scoreLabel: 'Stress',
      scoreValue: stress,
      triggered: stress >= 56,
      severity: stress - 56,
    },
  ].filter((check) => check.triggered);

  if (injuryDescription) {
    const secondaryIssue = checks.sort((a, b) => b.severity - a.severity)[0];
    const injuryIssue = injuryReportedAgo ? `Injury ${injuryReportedAgo}` : 'Reported injury';
    return {
      issue: secondaryIssue ? `${injuryIssue} • ${secondaryIssue.issue}` : injuryIssue,
      scoreLabel: secondaryIssue?.scoreLabel ?? 'Injury',
      scoreValue: secondaryIssue ? rounded(secondaryIssue.scoreValue) : null,
      statusLabel: 'Injury' as const,
      statusClassName: STATUS_CLASS_BY_LABEL.Injury,
      severity: 1000,
    };
  }

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

function getMetricToneClass(value: number | null, isInverse = false): string {
  if (value == null || !Number.isFinite(value)) {
    return 'text-gray-300';
  }

  const clamped = clamp(value, 0, 100);
  const effectiveScore = isInverse ? 100 - clamped : clamped;

  if (effectiveScore >= 85) return 'text-[#22c55e]';
  if (effectiveScore >= 70) return 'text-[#84cc16]';
  if (effectiveScore >= 60) return 'text-[#facc15]';
  if (effectiveScore >= 50) return 'text-[#f97316]';
  if (effectiveScore >= 40) return 'text-[#dc2626]';
  return 'text-[#991b1b]';
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

  const todayDateKey = format(new Date(), 'yyyy-MM-dd');
  const dailyWellnessPlayers = players.map((dataset) => ({
    playerId: dataset.player.id,
    playerName: dataset.player.name,
    completedToday: dataset.dailyWellness.date === todayDateKey && dataset.dailyWellness.completedToday,
  }));
  const completedPlayers = dailyWellnessPlayers
    .filter((player) => player.completedToday)
    .map(({ playerId, playerName }) => ({ playerId, playerName }));
  const incompletePlayers = dailyWellnessPlayers
    .filter((player) => !player.completedToday)
    .map(({ playerId, playerName }) => ({ playerId, playerName }));
  const todayReadinessSummary = getTeamReadinessForDate(players, todayDateKey);
  const latestReadiness = analyticsData.averages.readinessTrend.find((point) => point.date === todayDateKey);
  const latestEnergyFatigueLoad = analyticsData.averages.energyFatigueLoad[analyticsData.averages.energyFatigueLoad.length - 1];
  const latestSleep = analyticsData.averages.sleepQualityAndTiming[analyticsData.averages.sleepQualityAndTiming.length - 1];
  const latestStressSleep = analyticsData.averages.stressVsSleepScore[analyticsData.averages.stressVsSleepScore.length - 1];
  const latestMultiFactor = analyticsData.averages.multiFactorReadiness[analyticsData.averages.multiFactorReadiness.length - 1];
  const averageLoadMetric = calendarData.averages.find((metric) => metric.label === 'Average Load');

  const averageReadiness = todayReadinessSummary.average == null ? null : rounded(todayReadinessSummary.average);
  const averageLoad = averageLoadMetric
    ? (() => {
        const parsed = parseMetricNumber(averageLoadMetric.value);
        return parsed == null ? null : rounded(parsed);
      })()
    : latestEnergyFatigueLoad
      ? rounded(latestEnergyFatigueLoad.acuteTrainingLoad)
      : null;
  const hasSignalData = Boolean(latestReadiness || latestEnergyFatigueLoad || latestSleep || latestStressSleep || latestMultiFactor);
  const hasElevatedLoad = players.some((dataset) => dataset.wellness.loadRisk === 'elevated' || dataset.wellness.loadRisk === 'spike');

  const summaryStatus = getSummaryStatus({
    averageReadiness,
    fatigue: latestEnergyFatigueLoad?.fatigue ?? 0,
    stress: latestStressSleep?.stress ?? 0,
    loadScore: latestMultiFactor?.loadScore ?? 0,
    hasElevatedLoad,
    hasData: hasData && hasSignalData,
  });

  const keyMetrics: OverviewMetric[] = hasAnalyticsData ? [
    (() => {
      const value = latestReadiness ? rounded(latestReadiness.readinessScore) : null;
      return {
        label: 'Readiness Score',
        value,
        toneClass: getMetricToneClass(value),
      };
    })(),
    (() => {
      const value = latestEnergyFatigueLoad ? toRange100From10(latestEnergyFatigueLoad.fatigue) : null;
      return {
        label: 'Fatigue',
        value,
        toneClass: getMetricToneClass(value, true),
      };
    })(),
    (() => {
      const value = latestMultiFactor ? rounded(latestMultiFactor.loadScore) : null;
      return {
        label: 'Load Score',
        value,
        toneClass: getMetricToneClass(value, true),
      };
    })(),
    (() => {
      const value = latestSleep ? rounded(latestSleep.sleepScore) : null;
      return {
        label: 'Sleep Score',
        value,
        toneClass: getMetricToneClass(value),
      };
    })(),
    (() => {
      const value = latestStressSleep ? rounded(latestStressSleep.stress) : null;
      return {
        label: 'Stress',
        value,
        toneClass: getMetricToneClass(value, true),
      };
    })(),
    (() => {
      const value = latestEnergyFatigueLoad ? toRange100From10(latestEnergyFatigueLoad.energy) : null;
      return {
        label: 'Energy',
        value,
        toneClass: getMetricToneClass(value),
      };
    })(),
  ] : [];

  const playersNeedingAttention = players
    .map((dataset) => {
      const hasReportedInjury = dataset.injuryStatus.state === 'active' || dataset.injuryStatus.state === 'recovering';
      const todayReadiness = dataset.analytics.readinessTrend.find((point) => point.date === todayDateKey);
      const todayEnergyFatigueLoad = dataset.analytics.energyFatigueLoad.find((point) => point.date === todayDateKey);
      const todaySleep = dataset.analytics.sleepQualityAndTiming.find((point) => point.date === todayDateKey);
      const todayStress = dataset.analytics.stressVsSleepScore.find((point) => point.date === todayDateKey);
      const todayMultiFactor = dataset.analytics.multiFactorReadiness.find((point) => point.date === todayDateKey);

      if (!hasReportedInjury && !todayReadiness) {
        return null;
      }

      const readiness = todayReadiness?.readinessScore ?? 100;
      const fatigue = todayEnergyFatigueLoad?.fatigue ?? 0;
      const sleepScore = todaySleep?.sleepScore ?? 100;
      const stress = todayStress?.stress ?? 0;
      const loadScore = todayMultiFactor?.loadScore ?? 0;

      const issue = buildAttentionIssue({
        readiness,
        fatigue,
        loadScore,
        loadRiskLabel: dataset.wellness.loadRiskLabel,
        sleepScore,
        stress,
        injuryDescription: hasReportedInjury ? dataset.injuryStatus.description ?? 'Reported injury' : undefined,
        injuryReportedAgo: hasReportedInjury ? dataset.injuryStatus.reportedAgo : undefined,
      });
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
      item,
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
      toneClass: 'text-[var(--metric-readiness)]',
    },
    {
      label: 'Load Trend',
      points: loadTrendPoints,
      latest: rounded(loadTrendPoints[loadTrendPoints.length - 1] ?? 0),
      delta: rounded((loadTrendPoints[loadTrendPoints.length - 1] ?? 0) - (loadTrendPoints[0] ?? 0)),
      toneClass: 'text-[var(--metric-load)]',
    },
    {
      label: 'Fatigue Trend',
      points: fatigueTrendPoints,
      latest: rounded(fatigueTrendPoints[fatigueTrendPoints.length - 1] ?? 0),
      delta: rounded((fatigueTrendPoints[fatigueTrendPoints.length - 1] ?? 0) - (fatigueTrendPoints[0] ?? 0)),
      toneClass: 'text-[var(--metric-fatigue)]',
    },
  ] : [];

  return {
    summary: {
      playerCount: players.length,
      averageReadiness,
      averageLoad,
      status: summaryStatus,
    },
    dailyWellness: {
      completedCount: completedPlayers.length,
      totalCount: players.length,
      completedPlayers,
      incompletePlayers,
    },
    keyMetrics,
    playersNeedingAttention,
    upcomingActivities,
    trends,
  };
}
