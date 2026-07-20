import { getReadinessZone, getReadinessZoneLabel, ReadinessResult, ReadinessZone } from './readiness';
import { LoadResult, LoadRisk } from './training-load';
import { CalendarEvent, InjuryRecord, TrainingLog, UserProfile, WellnessLog } from './types';
import { shouldTreatPainAsInjury } from './injury-status';

export type RecommendationKey = 'recovery' | 'light' | 'moderate' | 'intense';
export type RecommendationLabel = 'Recovery' | 'Light' | 'Moderate' | 'Intense';

export interface RecommendationContext {
  todayWellness?: WellnessLog;
  recentTrainingLogs?: TrainingLog[];
}

export interface RecommendationResult {
  score: number;
  readinessZone: ReadinessZone | 'no_data';
  readinessZoneLabel: string;
  loadRisk: LoadRisk;
  loadRiskLabel: string;
  recommendation: RecommendationKey;
  recommendationLabel: RecommendationLabel;
  intensity: RecommendationLabel;
  message: string;
  reason: string;
  limitingFactors: string[];
  focusAreas: string[];
}

type PainSeverity = 'none' | 'minor' | 'moderate' | 'serious';

const RECOMMENDATION_LABELS: Record<RecommendationKey, RecommendationLabel> = {
  recovery: 'Recovery',
  light: 'Light',
  moderate: 'Moderate',
  intense: 'Intense',
};

const LOAD_RISK_LABELS: Record<LoadRisk, string> = {
  low: 'Low',
  normal: 'Normal',
  elevated: 'Elevated',
  spike: 'Spike',
};

const RECOMMENDATION_RANK: Record<RecommendationKey, number> = {
  recovery: 0,
  light: 1,
  moderate: 2,
  intense: 3,
};

function capRecommendation(
  recommendation: RecommendationKey,
  cap: RecommendationKey
): RecommendationKey {
  return RECOMMENDATION_RANK[recommendation] > RECOMMENDATION_RANK[cap] ? cap : recommendation;
}

function getHighestPainLevel(context?: RecommendationContext): number {
  const wellnessPain = context?.todayWellness?.painActive ? context.todayWellness.painLevel ?? 1 : 0;
  const trainingPain = (context?.recentTrainingLogs ?? [])
    .filter((log) => log.painActive)
    .reduce((highest, log) => Math.max(highest, log.painLevel ?? 1), 0);

  return Math.max(wellnessPain, trainingPain);
}

function hasPainNotes(context?: RecommendationContext): boolean {
  const wellnessNotes = context?.todayWellness?.painNotes?.trim();
  const trainingNotes = (context?.recentTrainingLogs ?? []).some((log) => Boolean(log.painNotes?.trim()));
  return Boolean(wellnessNotes || trainingNotes);
}

function hasLogInjury(context?: RecommendationContext): boolean {
  return Boolean(
    (context?.todayWellness && shouldTreatPainAsInjury(context.todayWellness)) ||
      (context?.recentTrainingLogs ?? []).some(shouldTreatPainAsInjury)
  );
}

function getPainSeverity(
  activeInjuries: InjuryRecord[],
  load: LoadResult,
  context?: RecommendationContext
): PainSeverity {
  const hasActiveOrRecoveringInjury = activeInjuries.some(
    (injury) => injury.status === 'active' || injury.status === 'recovering'
  );
  const highestPain = getHighestPainLevel(context);

  if (hasActiveOrRecoveringInjury || load.hasAutoInjury || hasLogInjury(context)) return 'serious';
  if (highestPain > 0 || hasPainNotes(context)) return 'minor';
  return 'none';
}

function hasFatigueOrSorenessConcern(readiness: ReadinessResult, context?: RecommendationContext): boolean {
  const fatigueLevel = context?.todayWellness?.fatigue ?? 0;
  return fatigueLevel >= 7 || readiness.breakdown.fatigue < 45;
}

function hasSleepConcern(readiness: ReadinessResult, context?: RecommendationContext): boolean {
  const sleepDuration = context?.todayWellness?.sleepDuration ?? 10;
  return sleepDuration < 6 || readiness.breakdown.sleep < 55;
}

function isClearlySafeForIntensity(
  readiness: ReadinessResult,
  loadRisk: LoadRisk,
  painSeverity: PainSeverity,
  context?: RecommendationContext
): boolean {
  if ((loadRisk !== 'low' && loadRisk !== 'normal') || painSeverity !== 'none') return false;
  if (readiness.score < 75) return false;

  const wellness = context?.todayWellness;
  if (!wellness) return true;

  return wellness.energy >= 8 && wellness.fatigue <= 4 && wellness.stress <= 6;
}

function canUseControlledModerate(
  readiness: ReadinessResult,
  loadRisk: LoadRisk,
  painSeverity: PainSeverity,
  context?: RecommendationContext
): boolean {
  const wellness = context?.todayWellness;
  if (!wellness) return false;
  if ((loadRisk !== 'low' && loadRisk !== 'normal') || painSeverity !== 'none') return false;
  if (wellness.energy < 6 || wellness.fatigue > 5) return false;
  if (hasSleepConcern(readiness, context)) return false;

  return wellness.stress >= 7 || readiness.breakdown.stress < 45;
}

function getBaseRecommendation(
  readiness: ReadinessResult,
  loadRisk: LoadRisk,
  painSeverity: PainSeverity,
  context?: RecommendationContext
): RecommendationKey {
  const zone = readiness.zone === 'no_data' ? getReadinessZone(readiness.score) : readiness.zone;
  const loadIsSafe = loadRisk === 'low' || loadRisk === 'normal';

  if (zone === 'poor') return 'recovery';

  if (zone === 'very_ready') {
    return loadIsSafe && painSeverity === 'none' ? 'intense' : 'moderate';
  }

  if (zone === 'ready') {
    return isClearlySafeForIntensity(readiness, loadRisk, painSeverity, context) ? 'intense' : 'moderate';
  }

  if (zone === 'okay') {
    return loadIsSafe ? 'moderate' : 'light';
  }

  if (canUseControlledModerate(readiness, loadRisk, painSeverity, context)) {
    return 'moderate';
  }

  return 'light';
}

function buildLimitingFactors(
  readiness: ReadinessResult,
  loadRisk: LoadRisk,
  painSeverity: PainSeverity,
  context?: RecommendationContext
): string[] {
  const factors: string[] = [];

  if (painSeverity !== 'none') factors.push('Pain/injury concern');
  if (loadRisk === 'elevated') factors.push('Elevated load risk');
  if (loadRisk === 'spike') factors.push('Load spike');
  if (hasFatigueOrSorenessConcern(readiness, context)) factors.push('Fatigue/soreness');
  if (hasSleepConcern(readiness, context)) factors.push('Sleep');
  if ((context?.todayWellness?.stress ?? 0) >= 7 || readiness.breakdown.stress < 45) factors.push('Stress');

  return factors;
}

function buildReason(params: {
  readiness: ReadinessResult;
  loadRisk: LoadRisk;
  painSeverity: PainSeverity;
  recommendation: RecommendationKey;
  scheduledHigh: boolean;
  context?: RecommendationContext;
}): string {
  const { readiness, loadRisk, painSeverity, recommendation, scheduledHigh, context } = params;
  const zone = readiness.zone === 'no_data' ? getReadinessZone(readiness.score) : readiness.zone;

  if (painSeverity === 'serious') {
    return 'Pain or injury was reported, so recovery or modified activity is recommended today.';
  }

  if (painSeverity === 'moderate') {
    return 'Pain or injury was reported, so the recommendation is capped. Keep today light or modified.';
  }

  if (painSeverity === 'minor') {
    return 'Readiness may be good, but pain was reported. Keep the session controlled and avoid extra intensity.';
  }

  if (scheduledHigh && recommendation === 'light') {
    return 'If you already have high-intensity work planned today, keep any additional training light and avoid extra load.';
  }

  if (zone === 'poor') {
    return 'Readiness is poor today. Prioritize recovery and avoid extra training load.';
  }

  if (loadRisk === 'spike') {
    return readiness.score >= 80
      ? 'Readiness is high, but recent load has spiked. Keep today moderate instead of adding extra intensity.'
      : 'Recent load has spiked, so keep today light and avoid adding more high-intensity work.';
  }

  if (loadRisk === 'elevated') {
    return readiness.score >= 67
      ? 'You feel ready, but recent load is elevated. Keep today moderate instead of adding extra intensity.'
      : 'Readiness is okay, but recent load is elevated. Keep today light.';
  }

  if (zone === 'very_ready' && recommendation === 'intense') {
    return 'Readiness is high and recent load looks stable, so an intense session is appropriate if planned.';
  }

  if (zone === 'ready' && recommendation === 'intense') {
    return 'Readiness is strong, load risk is safe, and wellness inputs look clear for intensity if planned.';
  }

  if (zone === 'okay') {
    return 'Readiness is okay. Moderate training is appropriate if you choose to train today and symptoms stay normal.';
  }

  if (zone === 'low_moderate' && recommendation === 'moderate') {
    return 'Readiness is lower today, but load and soreness do not show major risk. If you train, keep it controlled and moderate.';
  }

  if (zone === 'low_moderate') {
    return hasFatigueOrSorenessConcern(readiness, context) || hasSleepConcern(readiness, context)
      ? 'Readiness is low with signs of fatigue or soreness. Keep today light.'
      : 'Readiness is lower today. Keep the session light and controlled.';
  }

  return 'Moderate training is appropriate if you choose to train today. Keep quality high and avoid unnecessary extra load.';
}

export function generateRecommendation(
  readiness: ReadinessResult,
  load: LoadResult,
  activeInjuries: InjuryRecord[],
  profile: UserProfile | null,
  todaysEvents?: CalendarEvent[],
  context?: RecommendationContext
): RecommendationResult {
  const loadRisk = load.loadRisk;
  const painSeverity = getPainSeverity(activeInjuries, load, context);
  const scheduledHigh = todaysEvents?.some((event) => event.anticipatedIntensity === 'High') ?? false;

  let recommendation = getBaseRecommendation(readiness, loadRisk, painSeverity, context);

  if (loadRisk === 'spike') {
    recommendation = capRecommendation(recommendation, readiness.score >= 80 ? 'moderate' : 'light');
  } else if (loadRisk === 'elevated' && readiness.score < 67) {
    recommendation = capRecommendation(recommendation, 'light');
  }

  if (painSeverity === 'serious') {
    recommendation = 'recovery';
  } else if (painSeverity === 'moderate') {
    recommendation = capRecommendation(recommendation, 'light');
  } else if (painSeverity === 'minor') {
    recommendation = capRecommendation(recommendation, 'moderate');
  }

  if (painSeverity === 'none') {
    if (scheduledHigh) {
      recommendation = capRecommendation(recommendation, 'light');
    }
  }

  const recommendationLabel = RECOMMENDATION_LABELS[recommendation];
  const reason = buildReason({
    readiness,
    loadRisk,
    painSeverity,
    recommendation,
    scheduledHigh,
    context,
  });

  const isInjured = painSeverity === 'serious' || painSeverity === 'moderate';
  const focusAreas: string[] = [];
  if (profile && !isInjured && recommendation !== 'recovery') {
    if (profile.positions.includes('CM') || profile.positions.includes('AM')) {
      focusAreas.push('Scanning & Awareness');
    } else if (profile.positions.includes('W') || profile.positions.includes('FB')) {
      focusAreas.push('Crossing & Wide Play');
    } else if (profile.positions.includes('GK')) {
      focusAreas.push('Distribution & Reflexes');
    }

    if (profile.priorities.includes('Decision-making')) {
      focusAreas.push('Small-sided games or rapid decision drills');
    }
    if (profile.priorities.includes('Finishing') && recommendation === 'intense') {
      focusAreas.push('High-intensity shooting drills');
    }
  }

  return {
    score: readiness.score,
    readinessZone: readiness.zone,
    readinessZoneLabel: readiness.zoneLabel || getReadinessZoneLabel(getReadinessZone(readiness.score)),
    loadRisk,
    loadRiskLabel: LOAD_RISK_LABELS[loadRisk],
    recommendation,
    recommendationLabel,
    intensity: recommendationLabel,
    message: reason,
    reason,
    limitingFactors: buildLimitingFactors(readiness, loadRisk, painSeverity, context),
    focusAreas,
  };
}
