import { addDays, addWeeks, format, isSameDay, startOfWeek, subDays, subWeeks } from 'date-fns';
import { ChevronLeft, ChevronRight, Pencil, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { PlayerCalendarEvent } from '@/components/coach/players/types';
import { resolveCalendarOccurrence } from '@/lib/calendar/events';
import { usePersistedState } from '@/lib/usePersistedState';

interface PlayerCalendarProps {
  events: PlayerCalendarEvent[];
  eventTypeColors?: Record<string, string>;
  className?: string;
  onEditEvent?: (occurrence: SelectedOccurrence) => void;
}

interface ParsedEvent extends PlayerCalendarEvent {
  layoutId: string;
  instanceDate: string;
  renderedTitle: string;
  renderedDescription?: string;
  renderedEventTypeId: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

interface EventLayout {
  column: number;
  totalColumns: number;
}

export interface SelectedOccurrence {
  event: PlayerCalendarEvent;
  instanceDate: string;
  title: string;
  description?: string;
  eventTypeId: string;
  startTime: string;
  endTime: string;
}

const hours = Array.from({ length: 24 }).map((_, index) => index);

function parseTime(timeStr: string): { hour: number; minute: number } {
  const [hourValue = '0', minuteValue = '0'] = timeStr.split(':');
  return {
    hour: Number.parseInt(hourValue, 10),
    minute: Number.parseInt(minuteValue, 10),
  };
}

function formatHourLabel(hour: number) {
  if (hour === 0) return '12a';
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return '12p';
  return `${hour - 12}p`;
}

function getHourCellCoverage(
  cellHour: number,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number
): { top: number; height: number } | null {
  const cellStart = cellHour * 60;
  const cellEnd = (cellHour + 1) * 60;
  const eventStart = startHour * 60 + startMinute;
  const eventEnd = endHour * 60 + endMinute;

  if (eventEnd <= cellStart || eventStart >= cellEnd) return null;

  const overlapStart = Math.max(eventStart, cellStart);
  const overlapEnd = Math.min(eventEnd, cellEnd);
  const top = (overlapStart - cellStart) / 60;
  const height = (overlapEnd - overlapStart) / 60;

  return { top, height };
}

function computeOverlapGroups(events: ParsedEvent[], maxCols: number): Map<string, EventLayout> {
  const result = new Map<string, EventLayout>();
  if (!events.length) return result;

  const intervals = events
    .map((event) => ({
      id: event.layoutId,
      start: event.startHour * 60 + event.startMinute,
      end: event.endHour * 60 + event.endMinute,
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const clusters: typeof intervals[] = [];
  let currentCluster = [intervals[0]];
  let clusterEnd = intervals[0].end;

  for (let index = 1; index < intervals.length; index += 1) {
    const interval = intervals[index];
    if (interval.start < clusterEnd) {
      currentCluster.push(interval);
      clusterEnd = Math.max(clusterEnd, interval.end);
    } else {
      clusters.push(currentCluster);
      currentCluster = [interval];
      clusterEnd = interval.end;
    }
  }
  clusters.push(currentCluster);

  clusters.forEach((cluster) => {
    const totalColumns = Math.min(cluster.length, maxCols);
    cluster.forEach((interval, index) => {
      const column = Math.min(index, maxCols - 1);
      result.set(interval.id, { column, totalColumns });
    });
  });

  return result;
}

function getEventColor(type: PlayerCalendarEvent['type'], eventTypeId: string | undefined, eventTypeColors: Record<string, string>) {
  if (eventTypeId && eventTypeColors[eventTypeId]) return eventTypeColors[eventTypeId];
  if (type === 'training' || type === 'game' || type === 'cardio' || type === 'hiit' || type === 'gym') {
    return 'var(--accent-primary)';
  }
  return 'var(--accent-secondary)';
}

function parseDayEvents(events: PlayerCalendarEvent[], dateString: string): ParsedEvent[] {
  const parsedEvents: ParsedEvent[] = [];

  events.forEach((event) => {
    if (!event.visibleInCoachPlayerCalendar) return;
    if (event.isDraft && !event.coachManaged) return;

    const occurrence = resolveCalendarOccurrence(
      {
        date: event.date,
        startTime: event.startTime,
        endTime: event.endTime,
        startDate: event.startDate,
        endDate: event.endDate,
        kind: event.kind ?? 'event',
        title: event.title,
        description: event.description,
        eventTypeId: event.type,
        recurrence: event.recurrence,
        recurrenceConfig: event.recurrenceConfig,
        recurrenceEndDate: event.recurrenceEndDate,
        excludedDates: event.excludedDates,
        overrides: event.overrides,
        anticipatedIntensity: event.anticipatedIntensity,
      },
      dateString
    );

    if (!occurrence) return;

    const parsedStart = parseTime(occurrence.startTime);
    const parsedEnd = parseTime(occurrence.endTime);
    const startTotal = parsedStart.hour * 60 + parsedStart.minute;
    let endTotal = parsedEnd.hour * 60 + parsedEnd.minute;
    if (endTotal <= startTotal) {
      endTotal = startTotal + 60;
    }

    parsedEvents.push({
      ...event,
      layoutId: `${event.id}::${dateString}`,
      instanceDate: dateString,
      renderedTitle: occurrence.title,
      renderedDescription: occurrence.description,
      renderedEventTypeId: occurrence.eventTypeId,
      startHour: Math.floor(startTotal / 60),
      startMinute: startTotal % 60,
      endHour: Math.floor(endTotal / 60),
      endMinute: endTotal % 60,
    });
  });

  return parsedEvents;
}

function getRecurrenceLabel(event: PlayerCalendarEvent): string {
  const recurrence = event.recurrence ?? 'none';
  if (recurrence === 'none') return 'Once';
  if (recurrence === 'daily') return 'Daily';
  if (recurrence === 'weekly') return `Weekly (${(event.recurrenceConfig?.days ?? []).join(', ') || 'Custom'})`;
  return `Monthly (${(event.recurrenceConfig?.monthDays ?? []).join(', ') || 'Custom'})`;
}

function EventDetailsModal({
  occurrence,
  onClose,
  onEdit,
}: {
  occurrence: SelectedOccurrence;
  onClose: () => void;
  onEdit?: (occurrence: SelectedOccurrence) => void;
}) {
  const event = occurrence.event;
  const canEdit = event.coachManaged === true;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[var(--background)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-4 py-3">
          <h3 className="text-sm font-semibold text-white">Event Details</h3>
          <div className="flex items-center gap-2">
            {canEdit ? (
              <button
                type="button"
                onClick={() => onEdit?.(occurrence)}
                className="rounded-full bg-[rgba(255,255,255,0.05)] p-1.5 text-gray-300 transition-colors hover:text-white"
                aria-label="Edit event"
              >
                <Pencil size={16} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-[rgba(255,255,255,0.05)] p-1.5 text-gray-300 transition-colors hover:text-white"
              aria-label="Close event details"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-3 px-4 py-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Title</p>
            <p className="mt-1 font-semibold text-white">{occurrence.title}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Type</p>
              <p className="mt-1 capitalize text-white">{event.type}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Assignment</p>
              <p className="mt-1 capitalize text-white">{event.assignmentScope === 'team' ? 'Team' : 'Individual'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Date</p>
              <p className="mt-1 text-white">{occurrence.instanceDate}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Time</p>
              <p className="mt-1 text-white">
                {occurrence.startTime} - {occurrence.endTime}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Recurrence</p>
              <p className="mt-1 text-white">{getRecurrenceLabel(event)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Intensity</p>
              <p className="mt-1 text-white">{event.anticipatedIntensity ?? '--'}</p>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Description</p>
            <p className="mt-1 whitespace-pre-wrap text-gray-200">{occurrence.description || 'No description provided.'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DaySchedule({
  date,
  events,
  onSelectOccurrence,
  eventTypeColors,
}: {
  date: Date;
  events: PlayerCalendarEvent[];
  onSelectOccurrence: (occurrence: SelectedOccurrence, click: { x: number; y: number }) => void;
  eventTypeColors: Record<string, string>;
}) {
  const scheduleRef = useRef<HTMLDivElement>(null);
  const dateKey = format(date, 'yyyy-MM-dd');
  const dayEvents = useMemo(() => parseDayEvents(events, dateKey), [dateKey, events]);
  const layout = useMemo(() => computeOverlapGroups(dayEvents, 4), [dayEvents]);

  useEffect(() => {
    const container = scheduleRef.current;
    if (!container) return;
    const sixAmRow = container.querySelector<HTMLElement>('[data-hour="6"]');
    if (sixAmRow) {
      container.scrollTop = sixAmRow.offsetTop;
    }
  }, [dateKey]);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)]">
      <div className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 py-2">
        <p className="text-xs uppercase tracking-wide text-gray-400">Day View</p>
        <p className="text-sm font-semibold text-white">{format(date, 'EEEE, MMM d')}</p>
      </div>

      {dayEvents.length === 0 ? (
        <p className="pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(var(--surface-shell-rgb),0.92)] px-3 py-2 text-center text-xs text-gray-300 shadow-lg">
          No activities scheduled for this day.
        </p>
      ) : null}

      <div ref={scheduleRef} className="min-h-0 flex-1 overflow-y-auto">
        {hours.map((hour) => {
          const eventsHere = dayEvents.filter((event) =>
            getHourCellCoverage(hour, event.startHour, event.startMinute, event.endHour, event.endMinute)
          );
          const startsHere = dayEvents.filter((event) => event.startHour === hour);
          return (
            <div key={hour} data-hour={hour} className="flex min-h-[44px] border-b border-[rgba(255,255,255,0.05)]">
              <div className="w-12 shrink-0 pr-2 pt-1 text-right text-[10px] font-medium text-gray-500">
                {formatHourLabel(hour)}
              </div>
              <div className="relative flex-1 border-l border-[rgba(255,255,255,0.06)]">
                {eventsHere.map((event) => {
                  const coverage = getHourCellCoverage(hour, event.startHour, event.startMinute, event.endHour, event.endMinute);
                  if (!coverage) return null;
                  const eventLayout = layout.get(event.layoutId);
                  const column = eventLayout?.column ?? 0;
                  const totalColumns = eventLayout?.totalColumns ?? 1;
                  const slotWidth = 100 / totalColumns;

                  return (
                    <div
                      key={`${event.layoutId}-${hour}`}
                      className={`absolute cursor-pointer rounded-r opacity-75 ${event.isDraft ? 'border border-amber-300/50' : ''}`}
                      style={{
                        backgroundColor: getEventColor(event.type, event.renderedEventTypeId, eventTypeColors),
                        top: `${coverage.top * 100}%`,
                        height: `${coverage.height * 100}%`,
                        left: totalColumns > 1 ? `${column * slotWidth}%` : '0',
                        width: totalColumns > 1 ? `${slotWidth}%` : '100%',
                      }}
                      onClick={(clickEvent) =>
                        onSelectOccurrence({
                          event,
                          instanceDate: event.instanceDate,
                          title: event.renderedTitle,
                          description: event.renderedDescription,
                          eventTypeId: event.renderedEventTypeId,
                          startTime: `${String(event.startHour).padStart(2, '0')}:${String(event.startMinute).padStart(2, '0')}`,
                          endTime: `${String(event.endHour).padStart(2, '0')}:${String(event.endMinute).padStart(2, '0')}`,
                        }, { x: clickEvent.clientX, y: clickEvent.clientY })
                      }
                    />
                  );
                })}

                {startsHere.map((event) => {
                  const coverage = getHourCellCoverage(hour, event.startHour, event.startMinute, event.endHour, event.endMinute);
                  if (!coverage) return null;
                  const eventLayout = layout.get(event.layoutId);
                  const column = eventLayout?.column ?? 0;
                  const totalColumns = eventLayout?.totalColumns ?? 1;
                  const slotWidth = 100 / totalColumns;

                  return (
                    <button
                      key={`${event.layoutId}-label`}
                      type="button"
                      className="absolute z-10 truncate px-1.5 text-left text-[10px] font-semibold text-white"
                      style={{
                        top: `${coverage.top * 100}%`,
                        left: totalColumns > 1 ? `${column * slotWidth}%` : '0',
                        width: totalColumns > 1 ? `${slotWidth}%` : '100%',
                      }}
                      onClick={(clickEvent) =>
                        onSelectOccurrence({
                          event,
                          instanceDate: event.instanceDate,
                          title: event.renderedTitle,
                          description: event.renderedDescription,
                          eventTypeId: event.renderedEventTypeId,
                          startTime: `${String(event.startHour).padStart(2, '0')}:${String(event.startMinute).padStart(2, '0')}`,
                          endTime: `${String(event.endHour).padStart(2, '0')}:${String(event.endMinute).padStart(2, '0')}`,
                        }, { x: clickEvent.clientX, y: clickEvent.clientY })
                      }
                    >
                      {event.renderedTitle}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekSchedule({
  currentDate,
  events,
  onSelectOccurrence,
  eventTypeColors,
}: {
  currentDate: Date;
  events: PlayerCalendarEvent[];
  onSelectOccurrence: (occurrence: SelectedOccurrence, click: { x: number; y: number }) => void;
  eventTypeColors: Record<string, string>;
}) {
  const scheduleRef = useRef<HTMLDivElement>(null);
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = useMemo(() => Array.from({ length: 7 }).map((_, index) => addDays(weekStart, index)), [weekStart]);

  const parsedByDay = useMemo(() => {
    return weekDays.map((day) => parseDayEvents(events, format(day, 'yyyy-MM-dd')));
  }, [events, weekDays]);

  const layoutsByDay = useMemo(() => parsedByDay.map((dayEvents) => computeOverlapGroups(dayEvents, 2)), [parsedByDay]);

  useEffect(() => {
    const container = scheduleRef.current;
    if (!container) return;
    const sixAmRow = container.querySelector<HTMLElement>('[data-hour="6"]');
    if (sixAmRow) {
      container.scrollTop = sixAmRow.offsetTop;
    }
  }, [currentDate]);

  return (
    <div className="hidden h-full min-h-0 md:block">
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)]">
        <div className="flex border-b border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)]">
          <div className="w-10 shrink-0" />
          <div className="grid flex-1 grid-cols-7">
            {weekDays.map((day) => {
              const today = isSameDay(day, new Date());
              return (
                <div key={day.toISOString()} className="border-l border-[rgba(255,255,255,0.08)] py-2 text-center">
                  <p className={`text-[10px] uppercase ${today ? 'text-[var(--accent-primary)]' : 'text-gray-400'}`}>
                    {format(day, 'EEE')}
                  </p>
                  <p className={`text-sm font-semibold ${today ? 'text-[var(--accent-primary)]' : 'text-white'}`}>
                    {format(day, 'd')}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {parsedByDay.every((dayEvents) => dayEvents.length === 0) ? (
          <p className="pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(var(--surface-shell-rgb),0.92)] px-3 py-2 text-center text-xs text-gray-300 shadow-lg">
            No activities scheduled for this week.
          </p>
        ) : null}

        <div ref={scheduleRef} className="min-h-0 flex-1 overflow-y-auto">
          {hours.map((hour) => (
            <div key={hour} data-hour={hour} className="flex min-h-[40px] border-b border-[rgba(255,255,255,0.05)]">
              <div className="w-10 shrink-0 pr-1 pt-1 text-right text-[10px] font-medium text-gray-500">
                {formatHourLabel(hour)}
              </div>
              <div className="grid flex-1 grid-cols-7">
                {weekDays.map((day, dayIndex) => {
                  const dayEvents = parsedByDay[dayIndex];
                  const layout = layoutsByDay[dayIndex];
                  const eventsHere = dayEvents.filter((event) =>
                    getHourCellCoverage(hour, event.startHour, event.startMinute, event.endHour, event.endMinute)
                  );
                  const startsHere = dayEvents.filter((event) => event.startHour === hour);

                  return (
                    <div key={`${day.toISOString()}-${hour}`} className="relative border-l border-[rgba(255,255,255,0.06)]">
                      {eventsHere.map((event) => {
                        const coverage = getHourCellCoverage(hour, event.startHour, event.startMinute, event.endHour, event.endMinute);
                        if (!coverage) return null;
                        const eventLayout = layout.get(event.layoutId);
                        const column = eventLayout?.column ?? 0;
                        const totalColumns = eventLayout?.totalColumns ?? 1;
                        const slotWidth = 100 / totalColumns;

                        return (
                          <div
                            key={`${event.layoutId}-${hour}`}
                            className={`absolute cursor-pointer opacity-75 ${event.isDraft ? 'border border-amber-300/50' : ''}`}
                            style={{
                              backgroundColor: getEventColor(event.type, event.renderedEventTypeId, eventTypeColors),
                              top: `${coverage.top * 100}%`,
                              height: `${coverage.height * 100}%`,
                              left: totalColumns > 1 ? `${column * slotWidth}%` : '0',
                              width: totalColumns > 1 ? `${slotWidth}%` : '100%',
                            }}
                            onClick={(clickEvent) =>
                              onSelectOccurrence({
                                event,
                                instanceDate: event.instanceDate,
                                title: event.renderedTitle,
                                description: event.renderedDescription,
                                eventTypeId: event.renderedEventTypeId,
                                startTime: `${String(event.startHour).padStart(2, '0')}:${String(event.startMinute).padStart(2, '0')}`,
                                endTime: `${String(event.endHour).padStart(2, '0')}:${String(event.endMinute).padStart(2, '0')}`,
                              }, { x: clickEvent.clientX, y: clickEvent.clientY })
                            }
                          />
                        );
                      })}

                      {startsHere.map((event, index) => {
                        const coverage = getHourCellCoverage(hour, event.startHour, event.startMinute, event.endHour, event.endMinute);
                        if (!coverage) return null;
                        const eventLayout = layout.get(event.layoutId);
                        const column = eventLayout?.column ?? 0;
                        const totalColumns = eventLayout?.totalColumns ?? 1;
                        const slotWidth = 100 / totalColumns;
                        const stackedTop = `calc(${coverage.top * 100}% + ${index * 9}px)`;

                        return (
                          <button
                            key={`${event.layoutId}-title`}
                            type="button"
                            className="absolute z-10 truncate px-1 text-left text-[8px] font-semibold text-white"
                            style={{
                              top: stackedTop,
                              left: totalColumns > 1 ? `${column * slotWidth}%` : '0',
                              width: totalColumns > 1 ? `${slotWidth}%` : '100%',
                            }}
                            onClick={(clickEvent) =>
                              onSelectOccurrence({
                                event,
                                instanceDate: event.instanceDate,
                                title: event.renderedTitle,
                                description: event.renderedDescription,
                                eventTypeId: event.renderedEventTypeId,
                                startTime: `${String(event.startHour).padStart(2, '0')}:${String(event.startMinute).padStart(2, '0')}`,
                                endTime: `${String(event.endHour).padStart(2, '0')}:${String(event.endMinute).padStart(2, '0')}`,
                              }, { x: clickEvent.clientX, y: clickEvent.clientY })
                            }
                          >
                            {event.renderedTitle}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PlayerCalendar({ events, eventTypeColors = {}, className, onEditEvent }: PlayerCalendarProps) {
  const [view, setView] = usePersistedState<'Day' | 'Week'>('lodario:coach-player-calendar:view', 'Week');
  const [currentDateKey, setCurrentDateKey] = usePersistedState('lodario:coach-player-calendar:date', format(new Date(), 'yyyy-MM-dd'));
  const currentDate = useMemo(() => new Date(`${currentDateKey}T00:00:00`), [currentDateKey]);
  const [selectedOccurrenceRef, setSelectedOccurrenceRef] = usePersistedState<{ eventId: string; instanceDate: string } | null>('lodario:coach-player-calendar:open-event', null);
  const selectedOccurrence = useMemo<SelectedOccurrence | null>(() => {
    if (!selectedOccurrenceRef) return null;
    const event = events.find((candidate) => candidate.id === selectedOccurrenceRef.eventId);
    if (!event) return null;
    const occurrence = resolveCalendarOccurrence(
      {
        date: event.date,
        startTime: event.startTime,
        endTime: event.endTime,
        startDate: event.startDate,
        endDate: event.endDate,
        kind: event.kind ?? 'event',
        title: event.title,
        description: event.description,
        eventTypeId: event.type,
        recurrence: event.recurrence,
        recurrenceConfig: event.recurrenceConfig,
        recurrenceEndDate: event.recurrenceEndDate,
        excludedDates: event.excludedDates,
        overrides: event.overrides,
        anticipatedIntensity: event.anticipatedIntensity,
      },
      selectedOccurrenceRef.instanceDate
    );
    if (!occurrence) return null;
    return {
      event,
      instanceDate: selectedOccurrenceRef.instanceDate,
      title: occurrence.title,
      description: occurrence.description,
      eventTypeId: occurrence.eventTypeId,
      startTime: occurrence.startTime,
      endTime: occurrence.endTime,
    };
  }, [events, selectedOccurrenceRef]);

  const viewLabel = view === 'Week' ? `Week of ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'MMM d')}` : format(currentDate, 'MMM d, yyyy');
  const handleSelectOccurrence = (occurrence: SelectedOccurrence) => {
    setSelectedOccurrenceRef({ eventId: occurrence.event.id, instanceDate: occurrence.instanceDate });
  };

  return (
    <section className={`glass-card flex min-h-[620px] flex-col p-4 sm:p-5 ${className ?? ''}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] p-1">
          {(['Day', 'Week'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === mode ? 'bg-[var(--card-bg)] text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-2 py-1">
          <button
            type="button"
            onClick={() => setCurrentDateKey(format(view === 'Week' ? subWeeks(currentDate, 1) : subDays(currentDate, 1), 'yyyy-MM-dd'))}
            className="rounded-full p-1.5 text-gray-300 transition-colors hover:bg-[rgba(255,255,255,0.08)] hover:text-white"
            aria-label="Previous period"
          >
            <ChevronLeft size={16} />
          </button>
          <p className="min-w-[148px] text-center text-xs font-semibold text-white">{viewLabel}</p>
          <button
            type="button"
            onClick={() => setCurrentDateKey(format(view === 'Week' ? addWeeks(currentDate, 1) : addDays(currentDate, 1), 'yyyy-MM-dd'))}
            className="rounded-full p-1.5 text-gray-300 transition-colors hover:bg-[rgba(255,255,255,0.08)] hover:text-white"
            aria-label="Next period"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {view === 'Day' ? (
          <DaySchedule
            date={currentDate}
            events={events}
            onSelectOccurrence={handleSelectOccurrence}
            eventTypeColors={eventTypeColors}
          />
        ) : null}
        {view === 'Week' ? (
          <>
            <div className="md:hidden">
              <DaySchedule
                date={currentDate}
                events={events}
                onSelectOccurrence={handleSelectOccurrence}
                eventTypeColors={eventTypeColors}
              />
            </div>
            <WeekSchedule
              currentDate={currentDate}
              events={events}
              onSelectOccurrence={handleSelectOccurrence}
              eventTypeColors={eventTypeColors}
            />
          </>
        ) : null}
      </div>

      {selectedOccurrence ? (
        <EventDetailsModal
          occurrence={selectedOccurrence}
          onClose={() => setSelectedOccurrenceRef(null)}
          onEdit={(occurrence) => {
            setSelectedOccurrenceRef(null);
            onEditEvent?.(occurrence);
          }}
        />
      ) : null}
    </section>
  );
}
