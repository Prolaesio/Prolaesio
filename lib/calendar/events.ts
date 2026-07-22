import { getDate, getDay, isAfter, isBefore, lastDayOfMonth, parseISO } from 'date-fns';
import type { TeamCalendarEventOverride, TeamCalendarIntensity, TeamCalendarRecurrence, TeamCalendarRecurrenceConfig } from '@/components/coach/calendar/types';

export interface CoachCalendarEventMeta {
  coachManaged?: boolean;
  coachId?: string;
  teamId?: string;
  kind?: 'event' | 'task';
  assignmentScope?: 'team' | 'player';
  assignedPlayerId?: string | null;
  eventGroupId?: string | null;
  published?: boolean;
}

export interface CalendarOccurrenceInput {
  date: string;
  startTime: string;
  endTime: string;
  startDate?: string;
  endDate?: string;
  kind: 'event' | 'task';
  title: string;
  description?: string;
  eventTypeId: string;
  recurrence?: TeamCalendarRecurrence;
  recurrenceConfig?: TeamCalendarRecurrenceConfig;
  recurrenceEndDate?: string | null;
  excludedDates?: string[];
  overrides?: Record<string, TeamCalendarEventOverride>;
  anticipatedIntensity?: TeamCalendarIntensity | null;
}

export interface CalendarOccurrence {
  isRecurringInstance: boolean;
  title: string;
  description?: string;
  eventTypeId: string;
  startTime: string;
  endTime: string;
  anticipatedIntensity?: TeamCalendarIntensity | null;
}

const builtInActivityEventTypeIds = new Set([
  'training',
  'team-training',
  'game',
  'match',
  'personal-training',
  'cardio',
  'hiit',
  'gym',
  'recovery',
  'solo',
]);

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toRecurrence(value: string | null | undefined): TeamCalendarRecurrence {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'daily' || normalized === 'weekly' || normalized === 'monthly') {
    return normalized;
  }
  return 'none';
}

function toRecurrenceConfig(value: unknown): TeamCalendarRecurrenceConfig {
  const config = asObject(value);
  if (!config) {
    return {};
  }

  const days = Array.isArray(config.days)
    ? config.days.filter((entry): entry is number => typeof entry === 'number')
    : undefined;
  const monthDays = Array.isArray(config.monthDays)
    ? config.monthDays.filter((entry): entry is number => typeof entry === 'number')
    : undefined;

  return {
    ...(days ? { days } : {}),
    ...(monthDays ? { monthDays } : {}),
  };
}

function normalizeTime(value: string): string {
  const [hourPart = '00', minutePart = '00'] = value.split(':');
  const hour = Number.parseInt(hourPart, 10);
  const minute = Number.parseInt(minutePart, 10);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return '00:00';
  }

  const normalizedHour = Math.max(0, Math.min(23, hour));
  const normalizedMinute = Math.max(0, Math.min(59, minute));

  return `${String(normalizedHour).padStart(2, '0')}:${String(normalizedMinute).padStart(2, '0')}`;
}

function isDateWithinWindow(dateKey: string, startDateKey: string, endDateKey: string): boolean {
  const date = parseISO(dateKey);
  const startDate = parseISO(startDateKey);
  const endDate = parseISO(endDateKey);
  if (Number.isNaN(date.getTime()) || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return false;
  }

  return !isBefore(date, startDate) && !isAfter(date, endDate);
}

function getRecurrenceDay(dateValue: Date): number {
  const day = getDay(dateValue);
  return day === 0 ? 7 : day;
}

function matchesMonthDay(dateValue: Date, monthDays: number[]): boolean {
  const dayOfMonth = getDate(dateValue);
  const lastDay = getDate(lastDayOfMonth(dateValue));

  return monthDays.some((candidate) => {
    if (candidate > lastDay) {
      return dayOfMonth === lastDay;
    }

    return dayOfMonth === candidate;
  });
}

export function parseCoachCalendarMeta(value: unknown): CoachCalendarEventMeta | null {
  const config = asObject(value);
  if (!config) return null;

  const meta = asObject(config.meta);
  if (!meta) return null;

  const assignmentScopeValue = meta.assignmentScope;
  const assignmentScope =
    assignmentScopeValue === 'team' || assignmentScopeValue === 'player' ? assignmentScopeValue : undefined;

  return {
    coachManaged: meta.coachManaged === true,
    coachId: typeof meta.coachId === 'string' ? meta.coachId : undefined,
    teamId: typeof meta.teamId === 'string' ? meta.teamId : undefined,
    kind: meta.kind === 'event' || meta.kind === 'task' ? meta.kind : undefined,
    assignmentScope,
    assignedPlayerId: typeof meta.assignedPlayerId === 'string' ? meta.assignedPlayerId : null,
    eventGroupId: typeof meta.eventGroupId === 'string' ? meta.eventGroupId : null,
    published: typeof meta.published === 'boolean' ? meta.published : undefined,
  };
}

export function isCoachManagedCalendarConfig(value: unknown): boolean {
  return parseCoachCalendarMeta(value)?.coachManaged === true;
}

export function withCoachCalendarMeta(
  config: TeamCalendarRecurrenceConfig | undefined,
  meta: CoachCalendarEventMeta
): Record<string, unknown> {
  const normalizedConfig = config ?? {};
  return {
    ...normalizedConfig,
    meta,
  };
}

export function parseRecurrence(value: string | null | undefined): TeamCalendarRecurrence {
  return toRecurrence(value);
}

export function parseRecurrenceConfig(value: unknown): TeamCalendarRecurrenceConfig {
  return toRecurrenceConfig(value);
}

export function parseOverrideMap(value: unknown): Record<string, TeamCalendarEventOverride> {
  const overrides = asObject(value);
  if (!overrides) {
    return {};
  }

  const normalized: Record<string, TeamCalendarEventOverride> = {};

  Object.entries(overrides).forEach(([dateKey, rawOverride]) => {
    const override = asObject(rawOverride);
    if (!override) return;

    normalized[dateKey] = {
      title: typeof override.title === 'string' ? override.title : undefined,
      description: typeof override.description === 'string' ? override.description : undefined,
      eventTypeId: typeof override.eventTypeId === 'string' ? override.eventTypeId : undefined,
      start: typeof override.start === 'string' ? override.start : undefined,
      end: typeof override.end === 'string' ? override.end : undefined,
      anticipatedIntensity:
        override.anticipatedIntensity === 'Low' ||
        override.anticipatedIntensity === 'Moderate' ||
        override.anticipatedIntensity === 'High'
          ? override.anticipatedIntensity
          : undefined,
    };
  });

  return normalized;
}

export function parseExcludedDates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export function isBuiltInActivityEventType(eventTypeId: string): boolean {
  return builtInActivityEventTypeIds.has(eventTypeId.trim().toLowerCase());
}

export function dedupeCalendarEventsById<T extends { id: string }>(events: T[]): T[] {
  return Array.from(new Map(events.map((event) => [event.id, event])).values());
}

export function resolveCalendarOccurrence(input: CalendarOccurrenceInput, dateKey: string): CalendarOccurrence | null {
  if (input.excludedDates?.includes(dateKey)) {
    return null;
  }

  const startDateKey = input.startDate ?? input.date;
  const endDateKey = input.endDate ?? input.date;
  const recurrence = input.recurrence ?? 'none';
  const recurrenceConfig = input.recurrenceConfig ?? {};
  let matches = false;
  let isRecurringInstance = false;

  if (recurrence === 'none') {
    if (input.kind === 'task') {
      matches = isDateWithinWindow(dateKey, startDateKey, endDateKey);
    } else {
      matches = input.date === dateKey;
    }
  } else {
    const dateValue = parseISO(dateKey);
    const startDate = parseISO(startDateKey);
    if (!Number.isNaN(dateValue.getTime()) && !Number.isNaN(startDate.getTime()) && !isBefore(dateValue, startDate)) {
      const recurrenceEndDate = input.recurrenceEndDate ? parseISO(input.recurrenceEndDate) : null;
      const isPastEndDate = recurrenceEndDate && !Number.isNaN(recurrenceEndDate.getTime()) && isAfter(dateValue, recurrenceEndDate);

      if (!isPastEndDate) {
        if (recurrence === 'daily') {
          matches = true;
          isRecurringInstance = true;
        } else if (recurrence === 'weekly') {
          const days = recurrenceConfig.days ?? [];
          matches = days.includes(getRecurrenceDay(dateValue));
          isRecurringInstance = matches;
        } else if (recurrence === 'monthly') {
          const monthDays = recurrenceConfig.monthDays ?? [];
          matches = monthDays.length > 0 && matchesMonthDay(dateValue, monthDays);
          isRecurringInstance = matches;
        }
      }
    }
  }

  if (!matches) return null;

  const override = input.overrides?.[dateKey];
  const overrideStart = override?.start?.split('T')[1];
  const overrideEnd = override?.end?.split('T')[1];

  return {
    isRecurringInstance,
    title: override?.title ?? input.title,
    description: override?.description ?? input.description,
    eventTypeId: override?.eventTypeId ?? input.eventTypeId,
    startTime: normalizeTime(overrideStart ?? input.startTime),
    endTime: normalizeTime(overrideEnd ?? input.endTime),
    anticipatedIntensity: override?.anticipatedIntensity ?? input.anticipatedIntensity ?? undefined,
  };
}
