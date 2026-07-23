export type GuardianRelationshipStatus = 'active' | 'pending' | 'suspended' | 'adult_authorised' | 'support_review' | 'revoked' | 'removed';
export type GuardianPermissionState = 'allowed' | 'not_allowed' | 'pending' | 'revoked' | 'required';
export type GuardianImportance = 'information' | 'attention' | 'important' | 'urgent';

export interface GuardianBillingSummary {
  enabled: boolean;
  available: boolean;
  message?: string;
  planName?: string | null;
  billingStatus?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  maskedCard?: string | null;
  cardExpMonth?: number | null;
  cardExpYear?: number | null;
  nextBillingDate?: string | null;
  updatedAt?: string | null;
}

export interface GuardianPlayerProfileSummary {
  dateOfBirth: string;
  age: number;
  countryCode: string;
}

export interface GuardianLinkedPlayer {
  relationship_id: string;
  player_id: string;
  player_name: string;
  positions: string[];
  team_id: string | null;
  team_name: string | null;
  coach_or_club: string | null;
  relationship_type: string;
  is_primary: boolean;
  relationship_status: GuardianRelationshipStatus;
  access_level: string;
  linked_at: string | null;
  wellness_completed_today: boolean;
  training_completed_today: boolean;
  readiness_category: string;
  active_safety_flag: boolean;
  upcoming_event_title: string | null;
  upcoming_event_time: string | null;
  attendance_summary: string;
  last_meaningful_update: string | null;
}

export interface GuardianPlayerOverview {
  player: {
    id: string;
    name: string;
    positions: string[];
    teamId: string | null;
    teamName: string | null;
    coachOrClub: string | null;
  };
  relationship: {
    id: string;
    type: string;
    isPrimary: boolean;
    status: GuardianRelationshipStatus;
    accessLevel: string;
    linkedAt: string | null;
  };
  readiness: null | {
    category: string;
    score: number | null;
    recommendation: string;
    latestWellnessDate: string | null;
  };
  wellness: null | {
    completedToday: boolean;
    completedLast7Days: number;
    safetyThresholdTriggered: boolean;
    summary: string | null;
  };
  training: null | {
    completedToday: boolean;
    sessionsLast7Days: number;
    minutesLast7Days: number;
    trend: string;
    recentSessions: Array<{ date: string; sessionType: string; duration: number; intensity: string }>;
  };
  attendance: null | Array<{ date: string; attendanceStatus: string | null; rsvpStatus: string | null }>;
  safety: null | Array<{
    id: string;
    status: string;
    dateReported: string;
    bodyArea: string | null;
    severity?: string | null;
    recommendation: string;
    professionalAttentionSuggested: boolean;
  }>;
}

export interface GuardianEvent {
  event_id: string;
  player_id: string;
  player_name: string;
  team_id: string | null;
  team_name: string | null;
  event_date: string;
  start_time: string;
  end_time: string;
  title: string;
  event_type_id: string;
  description: string | null;
  location: string | null;
  is_cancelled: boolean;
  is_changed: boolean;
  attendance_status: string | null;
  rsvp_status: string | null;
}

export interface GuardianPermission {
  relationship_id: string;
  player_id: string;
  player_name: string;
  relationship_status: GuardianRelationshipStatus;
  permission_key: string;
  category: string;
  label: string;
  description: string;
  state: GuardianPermissionState;
  controlled_by: 'platform' | 'player' | 'guardian' | 'club';
  sort_order: number;
}

export interface GuardianUpdate {
  id: string;
  update_type: string;
  title: string;
  message: string;
  related_player_id: string | null;
  related_team_id: string | null;
  related_event_id: string | null;
  importance: GuardianImportance;
  is_read: boolean;
  read_at: string | null;
  acknowledgement_required: boolean;
  acknowledged_at: string | null;
  created_at: string;
}

export interface GuardianProfileRow {
  user_id: string;
  display_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  preferred_language: string;
  time_zone: string;
  created_at: string;
  updated_at: string;
}

export interface GuardianNotificationPreferences {
  guardian_user_id: string;
  in_app: Record<string, boolean>;
  email: Record<string, boolean>;
  push: Record<string, boolean>;
}
