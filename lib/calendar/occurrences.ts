import { addDays, format, startOfDay } from 'date-fns';
import { parseCoachCalendarMeta, resolveCalendarOccurrence } from '@/lib/calendar/events';
import type { CalendarEvent } from '@/lib/types';

export interface CalendarEventOccurrence {
  key: string;
  event: CalendarEvent;
  instanceDate: string;
  title: string;
  description?: string;
  eventTypeId: string;
  start: Date;
  end: Date;
  startTime: string;
  endTime: string;
  isRecurringInstance: boolean;
}

function dateKey(value: Date): string {
  return format(value, 'yyyy-MM-dd');
}

function addLocalDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function parseOccurrenceDateTime(instanceDate: string, time: string): Date {
  return new Date(`${instanceDate}T${time}:00`);
}

export function getCalendarOccurrencesInWindow(
  events: CalendarEvent[],
  windowStart: Date,
  windowEnd: Date
): CalendarEventOccurrence[] {
  const firstDay = addLocalDays(startOfDay(windowStart), -1);
  const lastDay = startOfDay(windowEnd);
  const occurrences = new Map<string, CalendarEventOccurrence>();

  for (const event of events) {
    const meta = parseCoachCalendarMeta(event.recurrenceConfig);
    const startDate = event.start.split('T')[0];
    const endDate = event.end.split('T')[0] || startDate;
    const startTime = event.start.split('T')[1]?.slice(0, 5) || '00:00';
    const endTime = event.end.split('T')[1]?.slice(0, 5) || '01:00';

    for (let cursor = firstDay; cursor <= lastDay; cursor = addDays(cursor, 1)) {
      const instanceDate = dateKey(cursor);
      const occurrence = resolveCalendarOccurrence(
        {
          date: startDate,
          startDate,
          endDate,
          startTime,
          endTime,
          kind: meta?.kind === 'task' ? 'task' : 'event',
          title: event.title || 'Event',
          description: event.description,
          eventTypeId: event.eventTypeId,
          recurrence: event.recurrence,
          recurrenceConfig: event.recurrenceConfig,
          recurrenceEndDate: event.recurrenceEndDate,
          excludedDates: event.excludedDates,
          overrides: event.overrides,
          anticipatedIntensity: event.anticipatedIntensity,
        },
        instanceDate
      );

      if (!occurrence) continue;

      const occurrenceStart = parseOccurrenceDateTime(instanceDate, occurrence.startTime);
      const occurrenceEnd = parseOccurrenceDateTime(instanceDate, occurrence.endTime);
      if (occurrenceEnd.getTime() <= occurrenceStart.getTime()) {
        occurrenceEnd.setDate(occurrenceEnd.getDate() + 1);
      }

      if (occurrenceEnd.getTime() <= windowStart.getTime() || occurrenceStart.getTime() >= windowEnd.getTime()) {
        continue;
      }

      const key = `${event.id}:${instanceDate}`;
      if (occurrences.has(key)) continue;

      occurrences.set(key, {
        key,
        event,
        instanceDate,
        title: occurrence.title || event.title || 'Event',
        description: occurrence.description,
        eventTypeId: occurrence.eventTypeId,
        start: occurrenceStart,
        end: occurrenceEnd,
        startTime: occurrence.startTime,
        endTime: occurrence.endTime,
        isRecurringInstance: occurrence.isRecurringInstance,
      });
    }
  }

  return Array.from(occurrences.values()).sort((first, second) => first.start.getTime() - second.start.getTime());
}
