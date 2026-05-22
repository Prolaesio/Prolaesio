export type Position = 'GK' | 'CB' | 'FB' | 'CM' | 'AM' | 'W' | 'ST';

export type Priority =
  | 'Speed'
  | 'Acceleration'
  | 'Finishing'
  | 'Dribbling'
  | 'Control'
  | 'Passing'
  | 'Reflexes'
  | 'Decision-making'
  | 'Stamina'
  | 'Strength';

// Resources/environments the player has access to for training recommendations.
export type TrainingResource =
  | 'gym'
  | 'soccer-field'
  | 'open-area'
  | 'wall'
  | 'treadmill-or-outdoor-runs';

// Weekly availability map: ISO weekday (1 = Monday … 7 = Sunday) -> selected hours (0-23).
export type WeeklyAvailability = Record<number, number[]>;

export interface UserProfile {
  age: number; // 1-99 (computed from dateOfBirth)
  dateOfBirth?: string; // YYYY-MM-DD
  positions: Position[];
  priorities: Priority[];
  // --- Onboarding additions (all optional so existing profiles keep working) ---
  heightCm?: number;
  weightKg?: number;
  teamCode?: string;
  availability?: WeeklyAvailability;
  trainingResources?: TrainingResource[];
  onboardingCompleted?: boolean;
}

export interface WellnessLog {
  date: string; // YYYY-MM-DD
  sleepTime: string; // HH:mm
  wakeTime: string; // HH:mm
  sleepDuration: number; // hours (auto-calculated)
  sleepQuality: number; // 1-10
  energy: number; // 1-10
  fatigue: number; // 1-10
  stress: number; // 1-10
  painActive: boolean;
  painLevel?: number; // 1-10
  painNotes?: string;
  notes?: string;
}

export type SessionType = 'Solo' | 'Partner' | 'Team' | 'Match' | 'Gym' | 'Other';
export type SprintingOption = 'no' | 'yes-90-95' | 'yes-100';

export interface TrainingLog {
  id: string; // UUID
  date: string; // YYYY-MM-DD
  sessionType: SessionType;
  duration: number; // minutes
  distance?: number; // KM
  intensity: number; // 1-10
  sprinting: SprintingOption;
  performance: number; // 1-10
  painActive: boolean;
  painLevel?: number; // 1-10
  painNotes?: string;
  notes?: string;
}

export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly';

export interface RecurrenceConfig {
  days?: number[]; // for weekly (1=Monday, 2=Tuesday, ..., 7=Sunday)
  monthDays?: number[]; // for monthly (1-31, max 4 days)
}

export interface CalendarEvent {
  id: string;
  eventTypeId: string;
  title?: string; // optional — user can leave blank
  description?: string; // optional — session summary, training plan, notes, etc.
  start: string; // ISO string or YYYY-MM-DDTHH:mm
  end: string;   // ISO string or YYYY-MM-DDTHH:mm
  color?: string; // override custom color
  recurrence: RecurrenceType;
  recurrenceConfig?: RecurrenceConfig;
  recurrenceEndDate?: string; // YYYY-MM-DD — recurring event stops after this date
  excludedDates?: string[]; // YYYY-MM-DD dates where this recurring event is suppressed
  overrides?: Record<string, Partial<CalendarEvent>>; // per-date overrides for single-instance edits keyed by YYYY-MM-DD
  anticipatedIntensity?: 'Low' | 'Moderate' | 'High'; // for training/gym sessions
}

export interface CustomEventType {
  id: string;
  name: string; // e.g., 'School', 'Team Training'
  color: string; // hex
  icon?: string; // name of lucide-react icon
  isBuiltIn?: boolean; // marks built-in/default types (still deletable per user)
  isActivity?: boolean; // when true, this event type represents physical activity and supports intensity
}

export type InjuryStatus = 'active' | 'recovering' | 'resolved';

export interface InjuryRecord {
  id: string;
  description: string;
  doctorNotes?: string;
  expectedReturn?: string; // YYYY-MM-DD
  status: InjuryStatus;
  createdAt: string; // ISO
  autoTracked?: boolean; // If generated from pain logs
}
