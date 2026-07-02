export type TeamEventType = string;

export type TeamCalendarItemKind = 'event' | 'task';

export type TeamCalendarItemStatus = 'upcoming' | 'completed';

export type TeamCalendarRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';

export type TeamCalendarIntensity = 'Low' | 'Moderate' | 'High';

export type TeamCalendarAssignmentScope = 'team' | 'player';

export interface TeamCalendarRecurrenceConfig {
  days?: number[];
  monthDays?: number[];
}

export interface TeamCalendarEventOverride {
  title?: string;
  description?: string;
  eventTypeId?: string;
  start?: string;
  end?: string;
  anticipatedIntensity?: TeamCalendarIntensity;
}

export interface TeamCalendarItem {
  id: string;
  teamId: string;
  title: string;
  eventTypeId?: string;
  type: TeamEventType;
  description: string;
  kind: TeamCalendarItemKind;
  status: TeamCalendarItemStatus;
  assignmentScope?: TeamCalendarAssignmentScope;
  assignedPlayerId?: string | null;
  assignedPlayerName?: string | null;
  recurrence?: TeamCalendarRecurrence;
  recurrenceConfig?: TeamCalendarRecurrenceConfig;
  recurrenceEndDate?: string | null;
  anticipatedIntensity?: TeamCalendarIntensity | null;
  overrides?: Record<string, TeamCalendarEventOverride>;
  excludedDates?: string[];
  isDraft?: boolean;
  sourceEventIds?: string[];
  sourceEventGroupId?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  startDate?: string;
  endDate?: string;
}

export interface TeamAverageMetric {
  label: string;
  value: string;
}

export interface TeamCalendarDataset {
  averages: TeamAverageMetric[];
  items: TeamCalendarItem[];
}
