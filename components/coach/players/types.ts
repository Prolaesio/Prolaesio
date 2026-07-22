export type PlayerViewMode = 'sheet' | 'analytics' | 'calendar';

export type PlayerSessionType = string;
export type PlayerCalendarRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';
export type PlayerCalendarIntensity = 'Low' | 'Moderate' | 'High';
export type PlayerCalendarAssignmentScope = 'team' | 'player';

export interface PlayerCalendarRecurrenceConfig {
  days?: number[];
  monthDays?: number[];
}

export interface PlayerCalendarEventOverride {
  title?: string;
  description?: string;
  eventTypeId?: string;
  start?: string;
  end?: string;
  anticipatedIntensity?: PlayerCalendarIntensity;
}

export interface CoachPlayer {
  id: string;
  teamId: string;
  name: string;
  jerseyNumber: number;
  positions: string[];
  age: number;
  heightCm: number;
  weightKg: number;
}

export interface PlayerWellnessMetrics {
  readinessScore: number;
  fatigue: number;
  loadScore: number;
  loadRisk: 'low' | 'normal' | 'elevated' | 'spike';
  loadRiskLabel: string;
  recommendationLabel: 'Recovery' | 'Light' | 'Moderate' | 'Intense' | null;
  acuteTrainingLoad: number;
  sevenDayTrainingLoad: number;
  hasAcuteTrainingData: boolean;
}

export interface PlayerCalendarEvent {
  id: string;
  playerId: string;
  teamId: string;
  title: string;
  type: PlayerSessionType;
  kind?: 'event' | 'task';
  description?: string;
  assignmentScope?: PlayerCalendarAssignmentScope;
  coachManaged?: boolean;
  visibleInCoachPlayerCalendar?: boolean;
  recurrence?: PlayerCalendarRecurrence;
  recurrenceConfig?: PlayerCalendarRecurrenceConfig;
  recurrenceEndDate?: string | null;
  anticipatedIntensity?: PlayerCalendarIntensity | null;
  overrides?: Record<string, PlayerCalendarEventOverride>;
  excludedDates?: string[];
  isDraft?: boolean;
  sourceEventGroupId?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  startDate?: string;
  endDate?: string;
}

export interface PlayerNoteItem {
  id: string;
  date: string;
  note: string;
}

export interface PlayerInjuryStatus {
  state: 'healthy' | 'active' | 'recovering' | 'resolved' | 'unavailable';
  description?: string;
  expectedReturn?: string;
  reportedDate?: string;
  reportedAgo?: string;
  message?: string;
}

export interface PlayerAnalyticsData {
  readinessTrend: Array<{ date: string; label: string; readinessScore: number }>;
  energyFatigueLoad: Array<{
    date: string;
    label: string;
    energy: number;
    fatigue: number;
    acuteTrainingLoad: number;
  }>;
  sleepQualityAndTiming: Array<{
    date: string;
    label: string;
    sleepHours: number;
    sleepQualityScore: number;
    sleepScore: number;
    bedTime: string;
    wakeTime: string;
  }>;
  stressVsSleepScore: Array<{
    date: string;
    label: string;
    stress: number;
    sleepScore: number;
  }>;
  multiFactorReadiness: Array<{
    date: string;
    label: string;
    readinessScore: number;
    sleepScore: number;
    energyScore: number;
    fatigueScore: number;
    stressScore: number;
    acuteTrainingLoad: number;
    loadScore: number;
  }>;
}

export interface PlayerSheetCoachSession {
  id: string;
  name: string;
  type: string;
  scheduledAt: string;
  scope: 'Team' | 'Individual';
  logged: boolean;
  details: PlayerSheetSessionDetails;
}

export interface PlayerSheetSessionDetails {
  event: PlayerCalendarEvent;
  instanceDate: string;
  title: string;
  description?: string;
  eventTypeId: string;
  startTime: string;
  endTime: string;
}

export interface PlayerSheetAttendanceItem {
  date: string;
  eventGroupId: string;
  name: string;
  type: string;
  scheduledAt: string;
  scope: 'Team' | 'Individual';
  attended: boolean;
  details: PlayerSheetSessionDetails;
}

export interface PlayerSheetData {
  coachSessionsLast24Hours: PlayerSheetCoachSession[];
  attendanceHistory: PlayerSheetAttendanceItem[];
}

export interface TeamPlayerDataset {
  player: CoachPlayer;
  dailyWellness: {
    date: string;
    completedToday: boolean;
  };
  wellness: PlayerWellnessMetrics;
  analytics: PlayerAnalyticsData;
  calendarEvents: PlayerCalendarEvent[];
  wellnessNotes: PlayerNoteItem[];
  trainingNotes: PlayerNoteItem[];
  injuryStatus: PlayerInjuryStatus;
  sheet: PlayerSheetData;
  todaysGuidance: string | null;
  todaysRecommendation: {
    score: number;
    readinessZoneLabel: string;
    loadRisk: 'low' | 'normal' | 'elevated' | 'spike';
    loadRiskLabel: string;
    recommendationLabel: 'Recovery' | 'Light' | 'Moderate' | 'Intense';
    reason: string;
    limitingFactors: string[];
  } | null;
}
