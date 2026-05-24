import { WellnessLog } from './types';
import { differenceInDays, parseISO, subDays } from 'date-fns';

export interface ReadinessResult {
  score: number;
  color: string;
  label: string;
  breakdown: {
    sleep: number;
    energy: number;
    fatigue: number;
    stress: number;
    load: number;
  };
  loadStage: 'none' | 'acute-only' | 'full'; // Indicates which load data stage is active
}

export function calculateReadiness(
  todayLog: WellnessLog | undefined,
  historicalLogs: WellnessLog[],
  trainingLoadScore: number, // From training-load.ts
  hasAcuteData: boolean,
  hasChronicData: boolean
): ReadinessResult {
  if (!todayLog) {
    return {
      score: 0,
      color: '#adb5bd',
      label: 'No Data',
      breakdown: { sleep: 0, energy: 0, fatigue: 0, stress: 0, load: 0 },
      loadStage: 'none',
    };
  }

  // Determine load stage based on available data
  let loadStage: 'none' | 'acute-only' | 'full' = 'none';
  if (hasAcuteData && hasChronicData) {
    loadStage = 'full';
  } else if (hasAcuteData) {
    loadStage = 'acute-only';
  }

  // Base weights (used when full load data is available — Stage 3)
  const baseWeights = {
    sleepQuantity: 0.14,
    sleepQuality: 0.14,
    sleepConsistency: 0.07,
    energy: 0.15,
    fatigue: 0.22,
    stress: 0.08,
    load: 0.20,
  };

  // Adjust weights based on load data availability
  let weights: typeof baseWeights;

  if (loadStage === 'none') {
    // Stage 1: No load data — redistribute load weight proportionally to other factors
    const nonLoadTotal = baseWeights.sleepQuantity + baseWeights.sleepQuality +
      baseWeights.sleepConsistency + baseWeights.energy + baseWeights.fatigue + baseWeights.stress;
    const scaleFactor = 1.0 / nonLoadTotal; // Scale up so remaining weights sum to 1.0
    weights = {
      sleepQuantity: baseWeights.sleepQuantity * scaleFactor,
      sleepQuality: baseWeights.sleepQuality * scaleFactor,
      sleepConsistency: baseWeights.sleepConsistency * scaleFactor,
      energy: baseWeights.energy * scaleFactor,
      fatigue: baseWeights.fatigue * scaleFactor,
      stress: baseWeights.stress * scaleFactor,
      load: 0, // Load completely removed
    };
  } else if (loadStage === 'acute-only') {
    // Stage 2: Only acute data — use a reduced load weight (half of full)
    // Redistribute the other half proportionally
    const reducedLoadWeight = baseWeights.load * 0.5;
    const redistributed = baseWeights.load * 0.5; // amount to redistribute
    const nonLoadTotal = baseWeights.sleepQuantity + baseWeights.sleepQuality +
      baseWeights.sleepConsistency + baseWeights.energy + baseWeights.fatigue + baseWeights.stress;
    const scaleFactor = redistributed / nonLoadTotal;
    weights = {
      sleepQuantity: baseWeights.sleepQuantity + baseWeights.sleepQuantity * scaleFactor,
      sleepQuality: baseWeights.sleepQuality + baseWeights.sleepQuality * scaleFactor,
      sleepConsistency: baseWeights.sleepConsistency + baseWeights.sleepConsistency * scaleFactor,
      energy: baseWeights.energy + baseWeights.energy * scaleFactor,
      fatigue: baseWeights.fatigue + baseWeights.fatigue * scaleFactor,
      stress: baseWeights.stress + baseWeights.stress * scaleFactor,
      load: reducedLoadWeight,
    };
  } else {
    // Stage 3: Full load data — use original weights exactly
    weights = { ...baseWeights };
  }

  // 1. Sleep Quantity (Max 100 points for >= 9 hours, scales down to 0 for <= 4 hours)
  let sleepQuantityScore = 0;
  if (todayLog.sleepDuration >= 9) sleepQuantityScore = 100;
  else if (todayLog.sleepDuration <= 4) sleepQuantityScore = 0;
  else sleepQuantityScore = ((todayLog.sleepDuration - 4) / 5) * 100;

  // 2. Sleep Quality (1-10 -> 0-100)
  const sleepQualityScore = (todayLog.sleepQuality / 10) * 100;

  // 3. Sleep Consistency (7 day stdev)
  let sleepConsistencyScore = 80; // Default if not enough data
  const last7Days = historicalLogs.filter(
    (l) => differenceInDays(new Date(), parseISO(l.date)) <= 7
  );
  if (last7Days.length >= 3) {
    const avgSleep = last7Days.reduce((sum, l) => sum + l.sleepDuration, 0) / last7Days.length;
    let variance = last7Days.reduce((sum, l) => sum + Math.pow(l.sleepDuration - avgSleep, 2), 0) / last7Days.length;
    const stdev = Math.sqrt(variance);
    // 0 hrs stdev = 100%, > 2 hrs stdev = 0%
    sleepConsistencyScore = Math.max(0, 100 - (stdev * 50));
  }

  // 4. Energy (1-10 -> 0-100)
  const energyScore = (todayLog.energy / 10) * 100;

  // 5. Fatigue (1-10 -> Inverted 0-100)
  const fatigueScore = ((10 - todayLog.fatigue + 1) / 10) * 100; // if fatigue 10 -> 10, if fatigue 1 -> 100

  // 6. Stress (1-10 -> Inverted 0-100)
  const stressScore = ((10 - todayLog.stress + 1) / 10) * 100;

  // 7. Load Score
  let loadScore = 100;
  if (loadStage === 'none') {
    // No load data: score is irrelevant since weight is 0, but set to 0 for display.
    loadScore = 0;
  } else if (loadStage === 'acute-only') {
    // Acute-only data is useful, but less trustworthy without a chronic baseline.
    loadScore = Math.round(trainingLoadScore * 0.75 + 20);
  } else {
    loadScore = trainingLoadScore;
  }

  let rawScore =
    sleepQuantityScore * weights.sleepQuantity +
    sleepQualityScore * weights.sleepQuality +
    sleepConsistencyScore * weights.sleepConsistency +
    energyScore * weights.energy +
    fatigueScore * weights.fatigue +
    stressScore * weights.stress +
    loadScore * weights.load;

  // Trend Adjustment: Calculate avg raw score past 3 days vs past 7 days
  let finalScore = Math.round(rawScore);

  if (last7Days.length >= 4) {
    // very simplistic trend: if fatigue is rising, subtract points
    const recentFatigue = last7Days.slice(0, 2).reduce((sum, l) => sum + l.fatigue, 0) / 2;
    const pastFatigue = last7Days.slice(2).reduce((sum, l) => sum + l.fatigue, 0) / last7Days.slice(2).length;
    if (recentFatigue > pastFatigue + 1) {
      finalScore -= 5;
    } else if (recentFatigue < pastFatigue - 1) {
      finalScore += 5;
    }
  }

  finalScore = Math.max(0, Math.min(100, finalScore));

  let color = '#ff6b6b'; // red
  let label = 'Low Readiness';

  if (finalScore >= 75) {
    color = '#00d4aa'; // green
    label = 'Optimal';
  } else if (finalScore >= 50) {
    color = '#ffd43b'; // yellow
    label = 'Moderate';
  } else if (finalScore >= 35) {
    color = '#ff922b'; // orange
    label = 'Caution';
  }

  return {
    score: finalScore,
    color,
    label,
    breakdown: {
      sleep: Math.round(sleepQuantityScore * 0.5 + sleepQualityScore * 0.5),
      energy: Math.round(energyScore),
      fatigue: Math.round(fatigueScore),
      stress: Math.round(stressScore),
      load: Math.round(loadScore),
    },
    loadStage,
  };
}
