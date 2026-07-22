import type { TeamAverageMetric } from '@/components/coach/calendar/types';

export type AnalyticsViewMode = 'averages' | 'individuals';

export interface TeamReadinessTrendPoint {
  [key: string]: string | number;
  date: string;
  label: string;
  readinessScore: number;
}

export interface TeamEnergyFatigueLoadPoint {
  [key: string]: string | number;
  date: string;
  label: string;
  energy: number;
  fatigue: number;
  acuteTrainingLoad: number;
}

export interface TeamSleepQualityAndTimingPoint {
  [key: string]: string | number;
  date: string;
  label: string;
  sleepHours: number;
  sleepQualityScore: number;
  sleepScore: number;
  bedTime: string;
  wakeTime: string;
}

export interface TeamStressVsSleepScorePoint {
  [key: string]: string | number;
  date: string;
  label: string;
  stress: number;
  sleepScore: number;
}

export interface TeamMultiFactorReadinessPoint {
  [key: string]: string | number;
  date: string;
  label: string;
  readinessScore: number;
  sleepScore: number;
  energyScore: number;
  fatigueScore: number;
  stressScore: number;
  acuteTrainingLoad: number;
  loadScore: number;
}

export interface TeamAveragesAnalyticsData {
  readinessTrend: TeamReadinessTrendPoint[];
  energyFatigueLoad: TeamEnergyFatigueLoadPoint[];
  sleepQualityAndTiming: TeamSleepQualityAndTimingPoint[];
  stressVsSleepScore: TeamStressVsSleepScorePoint[];
  multiFactorReadiness: TeamMultiFactorReadinessPoint[];
}

export type ComparisonMetricKey =
  | 'readinessScore'
  | 'fatigue'
  | 'energy'
  | 'stress'
  | 'sleepScore'
  | 'acuteTrainingLoad'
  | 'loadScore';

export interface TeamPlayerComparisonPoint {
  playerId: string;
  playerName: string;
  label: string;
  readinessScore: number;
  fatigue: number;
  energy: number;
  stress: number;
  sleepScore: number;
  acuteTrainingLoad: number;
  loadScore: number;
  loadRiskLabel?: string;
  recommendationLabel?: 'Recovery' | 'Light' | 'Moderate' | 'Intense';
}

export interface ComparisonMetricDefinition {
  key: ComparisonMetricKey;
  label: string;
  shortLabel: string;
  color: string;
  goodDirection: 'higher' | 'lower';
  domain?: [number, number];
}

export interface TeamAnalyticsDataset {
  teamId: string;
  labels: string[];
  averages: TeamAveragesAnalyticsData;
  teamAveragesMetrics: TeamAverageMetric[];
  legendItems: string[];
  individualsByLabel: Record<string, TeamPlayerComparisonPoint[]>;
}

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
    color: 'var(--metric-readiness)',
    goodDirection: 'higher',
    domain: [0, 100],
  },
  {
    key: 'fatigue',
    label: 'Fatigue',
    shortLabel: 'Fatigue',
    color: 'var(--metric-fatigue)',
    goodDirection: 'lower',
    domain: [0, 10],
  },
  {
    key: 'energy',
    label: 'Energy',
    shortLabel: 'Energy',
    color: 'var(--metric-energy)',
    goodDirection: 'higher',
    domain: [0, 10],
  },
  {
    key: 'stress',
    label: 'Stress',
    shortLabel: 'Stress',
    color: 'var(--metric-stress)',
    goodDirection: 'lower',
    domain: [0, 100],
  },
  {
    key: 'sleepScore',
    label: 'Sleep Score',
    shortLabel: 'Sleep',
    color: 'var(--metric-sleep-score)',
    goodDirection: 'higher',
    domain: [0, 100],
  },
  {
    key: 'acuteTrainingLoad',
    label: 'Acute Training Load',
    shortLabel: 'Acute Load',
    color: 'var(--metric-load)',
    goodDirection: 'lower',
  },
  {
    key: 'loadScore',
    label: 'Load Score',
    shortLabel: 'Load',
    color: 'var(--metric-load-score)',
    goodDirection: 'lower',
    domain: [0, 100],
  },
];
