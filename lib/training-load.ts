import { SessionType, SprintingOption, TrainingLog, WellnessLog } from './types';
import { differenceInDays, parseISO } from 'date-fns';

export interface LoadResult {
  acuteLoad: number;
  chronicLoad: number;
  acuteChronicRatio: number;
  loadScore: number;
  monotony: number;
  strain: number;
  isSpike: boolean;
  sustainedFatigue: boolean;
  isLowWorkload: boolean;
  hasAutoInjury: boolean;
  hasAcuteData: boolean;   // true when there are sessions in the last 7 days
  hasChronicData: boolean; // true when there are sessions spanning enough of the 28-day window
}

const SESSION_TYPE_MULTIPLIER: Record<SessionType, number> = {
  Match: 1.3,
  Team: 1.1,
  Gym: 1,
  Solo: 0.95,
  Partner: 0.95,
  Other: 1,
};

const SPRINT_MULTIPLIER: Record<SprintingOption, number> = {
  no: 1,
  'yes-90-95': 1.12,
  'yes-100': 1.25,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const interpolate = (
  value: number,
  inputMin: number,
  inputMax: number,
  outputMin: number,
  outputMax: number
) => {
  if (inputMax === inputMin) return outputMax;
  const progress = clamp((value - inputMin) / (inputMax - inputMin), 0, 1);
  return outputMin + (outputMax - outputMin) * progress;
};

export function calculateSessionLoad(log: TrainingLog): number {
  const baseLoad = log.duration * log.intensity;
  const sessionMultiplier = SESSION_TYPE_MULTIPLIER[log.sessionType] ?? 1;
  const sprintMultiplier = SPRINT_MULTIPLIER[log.sprinting] ?? 1;

  return baseLoad * sessionMultiplier * sprintMultiplier;
}

function calculateEwma(loadsNewestFirst: number[], timeConstantDays: number): number {
  if (loadsNewestFirst.length === 0) return 0;

  const alpha = 2 / (timeConstantDays + 1);
  const oldestFirst = [...loadsNewestFirst].reverse();

  return oldestFirst.reduce((ewma, load, index) => {
    if (index === 0) return load;
    return alpha * load + (1 - alpha) * ewma;
  }, 0);
}

function calculateRatioScore(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 70;
  if (ratio < 0.6) return 70;
  if (ratio < 0.8) return interpolate(ratio, 0.6, 0.8, 70, 100);
  if (ratio <= 1.25) return 100;
  if (ratio <= 1.5) return interpolate(ratio, 1.25, 1.5, 100, 55);
  if (ratio <= 1.8) return interpolate(ratio, 1.5, 1.8, 55, 20);
  return 10;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

export function analyzeTrainingLoad(
  trainingLogs: TrainingLog[],
  wellnessLogs: WellnessLog[]
): LoadResult {
  const today = new Date();

  let numSessionsLast7 = 0;
  let numSessionsLast14 = 0;
  let numSessionsBeyond7 = 0;
  const dailyLoads = Array.from({ length: 35 }, () => 0);

  trainingLogs.forEach((log) => {
    const daysAgo = differenceInDays(today, parseISO(log.date));
    if (daysAgo < 0 || daysAgo >= dailyLoads.length) return;

    const load = calculateSessionLoad(log);
    dailyLoads[daysAgo] += load;

    if (daysAgo < 7) {
      numSessionsLast7++;
    }
    if (daysAgo < 14) {
      numSessionsLast14++;
    }
    if (daysAgo >= 7 && daysAgo < 35) {
      numSessionsBeyond7++;
    }
  });

  const acuteLoad = calculateEwma(dailyLoads.slice(0, 7), 7) * 7;
  const chronicLoad = calculateEwma(dailyLoads.slice(7, 35), 28) * 7;
  const ratio = chronicLoad > 0 ? acuteLoad / chronicLoad : (acuteLoad > 0 ? 1 : 0);

  const isSpike = ratio > 1.5;

  // Low Workload: < 3.5 sessions/week for 2+ weeks (numSessionsLast14 < 7)
  const isLowWorkload = numSessionsLast14 < 7;

  // Sustained fatigue: avg fatigue > 7 for 3+ days
  const recentWellness = wellnessLogs
    .filter((l) => {
      const daysAgo = differenceInDays(today, parseISO(l.date));
      return daysAgo >= 0 && daysAgo <= 3;
    })
    .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());

  let sustainedFatigue = false;
  if (recentWellness.length >= 3) {
    const avgFatigue = (recentWellness[0].fatigue + recentWellness[1].fatigue + recentWellness[2].fatigue) / 3;
    if (avgFatigue > 7) {
      sustainedFatigue = true;
    }
  }

  // Pain-to-injury auto-detection: painLevel > 3.5 for > 1.5 days -> auto-injury
  // clear when painLevel < 2.5 for 2+ consecutive days
  let hasAutoInjury = false;

  // We look at the last few days in sequence
  // For simplicity, if the last 2 wellness logs both report painActive and painLevel > 3.5, it's flagged.
  // It unflags if the last 2 logs report painLevel < 2.5
  if (recentWellness.length >= 2) {
    const day1 = recentWellness[0];
    const day2 = recentWellness[1];

    if (day1.painActive && day2.painActive && (day1.painLevel || 0) > 3.5 && (day2.painLevel || 0) > 3.5) {
      hasAutoInjury = true;
    } else if ((day1.painLevel || 0) < 2.5 && (day2.painLevel || 0) < 2.5) {
      hasAutoInjury = false;
    }
  }

  const last7DailyLoads = dailyLoads.slice(0, 7);
  const weeklyLoad = last7DailyLoads.reduce((sum, load) => sum + load, 0);
  const weeklyMean = weeklyLoad / 7;
  const weeklyStandardDeviation = standardDeviation(last7DailyLoads);
  const monotony = weeklyMean > 0 ? weeklyMean / Math.max(weeklyStandardDeviation, weeklyMean * 0.25) : 0;
  const strain = weeklyLoad * monotony;

  const ratioScore = calculateRatioScore(ratio);
  const monotonyScore = monotony <= 1.5 ? 100 : clamp(interpolate(monotony, 1.5, 3, 100, 35), 35, 100);
  const strainReference = Math.max(chronicLoad * 1.5, 1);
  const strainRatio = strain / strainReference;
  const strainScore = strainRatio <= 1 ? 100 : clamp(interpolate(strainRatio, 1, 2.5, 100, 35), 35, 100);

  let wellnessModifier = 100;
  const latestWellness = recentWellness[0];
  if (latestWellness) {
    if (latestWellness.fatigue >= 8 && ratio > 1.25) wellnessModifier -= 18;
    else if (latestWellness.fatigue >= 7 && ratio > 1.25) wellnessModifier -= 10;

    if (latestWellness.painActive && (latestWellness.painLevel || 0) >= 4) wellnessModifier -= 20;
    if (latestWellness.sleepDuration < 6 && ratio > 1.25) wellnessModifier -= 10;
    if (latestWellness.stress >= 8 && ratio > 1.25) wellnessModifier -= 8;
  }

  const recentPainSession = trainingLogs.some((log) => {
    const daysAgo = differenceInDays(today, parseISO(log.date));
    return daysAgo >= 0 && daysAgo < 7 && log.painActive && (log.painLevel || 0) >= 4;
  });
  if (recentPainSession) wellnessModifier -= 10;

  wellnessModifier = clamp(wellnessModifier, 40, 100);
  const loadScore = clamp(
    ratioScore * 0.45 +
      monotonyScore * 0.2 +
      strainScore * 0.2 +
      wellnessModifier * 0.15,
    0,
    100
  );

  // Determine data availability for progressive load integration
  // Acute data: at least 1 session in the last 7 days
  const hasAcuteData = numSessionsLast7 > 0;
  // Chronic data: need sessions beyond the 7-day window to form a meaningful 28-day baseline
  const hasChronicData = hasAcuteData && numSessionsBeyond7 > 0;

  return {
    acuteLoad,
    chronicLoad,
    acuteChronicRatio: ratio,
    loadScore,
    monotony,
    strain,
    isSpike,
    sustainedFatigue,
    isLowWorkload,
    hasAutoInjury,
    hasAcuteData,
    hasChronicData,
  };
}
