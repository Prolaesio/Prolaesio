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
  role?: 'player' | 'coach' | 'guardian';
  displayName?: string;
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

export type TeamMembershipRole = 'coach' | 'player';
export type TeamMembershipStatus = 'active' | 'pending' | 'removed';

export interface Team {
  id: string;
  name: string;
  inviteCode: string;
  coachId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMembership {
  id: string;
  teamId: string;
  userId: string;
  role: TeamMembershipRole;
  status: TeamMembershipStatus;
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamRow {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TeamMembershipRow {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamMembershipRole;
  status: TeamMembershipStatus;
  joined_at: string;
  created_at: string;
  updated_at: string;
}

export interface CoachTeam {
  id: string;
  name: string;
  code: string;
  createdBy: string;
}

export type SelectedTeam = CoachTeam;

export function toCoachTeam(team: Team): CoachTeam {
  return {
    id: team.id,
    name: team.name,
    code: team.inviteCode,
    createdBy: team.coachId,
  };
}

export function toTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
    coachId: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toTeamMembership(row: TeamMembershipRow): TeamMembership {
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    joinedAt: row.joined_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
  isInjury?: boolean;
  notes?: string;
}

export const SESSION_TYPES = ['Solo', 'Partner', 'Team', 'Match', 'Cardio', 'HIIT', 'Gym', 'Other'] as const;
export type SessionType = (typeof SESSION_TYPES)[number];
export type SprintingOption = 'no' | 'yes-90-95' | 'yes-100';

export interface TrainingLog {
  id: string; // UUID
  date: string; // YYYY-MM-DD
  sessionType: SessionType;
  duration: number; // minutes
  distance?: number; // KM
  intensity: number; // 1-10
  sprinting: SprintingOption;
  performance?: number; // 1-10 when performance was assessed
  painActive: boolean;
  painLevel?: number; // 1-10
  painNotes?: string;
  isInjury?: boolean;
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

export type CalendarEventColorOverrideScope = 'event' | 'event_type' | 'coach';

export interface CalendarEventColorOverride {
  id?: string;
  scope: CalendarEventColorOverrideScope;
  eventId?: string | null;
  eventTypeId?: string | null;
  coachId?: string | null;
  color: string;
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
