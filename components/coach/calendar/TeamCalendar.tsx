import { addDays, addWeeks, format, isSameDay, startOfWeek, subDays, subWeeks } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import type { TeamCalendarItem } from '@/components/coach/calendar/types';
import { resolveCalendarOccurrence } from '@/lib/calendar/events';
import { usePersistedState } from '@/lib/usePersistedState';

interface TeamCalendarProps {
  items: TeamCalendarItem[];
  eventTypeColors?: Record<string, string>;
  className?: string;
  style?: CSSProperties;
  selectedItemId?: string | null;
  onSelectItem?: (item: TeamCalendarItem, instanceDate: string) => void;
  onSelectEmptySlot?: (date: string, hour: number) => void;
}

interface ParsedCalendarItem extends TeamCalendarItem {
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

const hours = Array.from({ length: 24 }).map((_, index) => index);
const initialVisibleHour = 6;
const visibleHourCount = 18;
const dayHourRowHeight = 44;
const weekHourRowHeight = 40;

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

function computeOverlapGroups(events: ParsedCalendarItem[], maxCols: number): Map<string, EventLayout> {
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

function getItemColor(type: TeamCalendarItem['type'], eventTypeId: string | undefined, eventTypeColors: Record<string, string>) {
  if (eventTypeId && eventTypeColors[eventTypeId]) return eventTypeColors[eventTypeId];
  if (type === 'training' || type === 'game' || type === 'cardio' || type === 'hiit' || type === 'gym') {
    return 'var(--accent-primary)';
  }
  return 'var(--accent-secondary)';
}

function parseDayItems(items: TeamCalendarItem[], dateString: string): ParsedCalendarItem[] {
  const parsedItems: ParsedCalendarItem[] = [];

  items.forEach((item) => {
    const occurrence = resolveCalendarOccurrence(
      {
        date: item.date,
        startTime: item.startTime,
        endTime: item.endTime,
        startDate: item.startDate,
        endDate: item.endDate,
        kind: item.kind,
        title: item.title,
        description: item.description,
        eventTypeId: item.eventTypeId ?? item.type,
        recurrence: item.recurrence,
        recurrenceConfig: item.recurrenceConfig,
        recurrenceEndDate: item.recurrenceEndDate,
        excludedDates: item.excludedDates,
        overrides: item.overrides,
        anticipatedIntensity: item.anticipatedIntensity,
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

    parsedItems.push({
      ...item,
      layoutId: `${item.id}::${dateString}`,
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

  return parsedItems;
}

function DaySchedule({
  date,
  items,
  selectedItemId,
  onSelectItem,
  onSelectEmptySlot,
  eventTypeColors,
}: {
  date: Date;
  items: TeamCalendarItem[];
  selectedItemId?: string | null;
  onSelectItem?: (item: TeamCalendarItem, instanceDate: string) => void;
  onSelectEmptySlot?: (date: string, hour: number) => void;
  eventTypeColors: Record<string, string>;
}) {
  const scheduleRef = useRef<HTMLDivElement>(null);
  const dateKey = format(date, 'yyyy-MM-dd');
  const dayItems = useMemo(() => parseDayItems(items, dateKey), [dateKey, items]);
  const layout = useMemo(() => computeOverlapGroups(dayItems, 4), [dayItems]);

  useEffect(() => {
    const container = scheduleRef.current;
    if (!container) return;
    const initialVisibleRow = container.querySelector<HTMLElement>(`[data-hour="${initialVisibleHour}"]`);
    if (initialVisibleRow) {
      container.scrollTop = initialVisibleRow.offsetTop;
    }
  }, [dateKey]);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)]">
      <div className="border-b border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-4 py-2">
        <p className="text-xs uppercase tracking-wide text-gray-400">Day View</p>
        <p className="text-sm font-semibold text-white">{format(date, 'EEEE, MMM d')}</p>
      </div>

      {dayItems.length === 0 ? (
        <p className="pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(var(--surface-shell-rgb),0.92)] px-3 py-2 text-center text-xs text-gray-300 shadow-lg">
          No activities scheduled for this day.
        </p>
      ) : null}

      <div
        ref={scheduleRef}
        className="min-h-0 overflow-y-auto"
        style={{ height: `${visibleHourCount * dayHourRowHeight}px` }}
      >
        {hours.map((hour) => {
          const itemsHere = dayItems.filter((item) =>
            getHourCellCoverage(hour, item.startHour, item.startMinute, item.endHour, item.endMinute)
          );
          const startsHere = dayItems.filter((item) => item.startHour === hour);
          const isCellEmpty = itemsHere.length === 0;

          return (
            <div key={hour} data-hour={hour} className="flex min-h-[44px] border-b border-[rgba(255,255,255,0.05)]">
              <div className="w-12 shrink-0 pr-2 pt-1 text-right text-[10px] font-medium text-gray-500">
                {formatHourLabel(hour)}
              </div>
              <div
                className="relative flex-1 border-l border-[rgba(255,255,255,0.06)]"
                role={isCellEmpty && onSelectEmptySlot ? 'button' : undefined}
                onClick={isCellEmpty && onSelectEmptySlot ? () => onSelectEmptySlot(dateKey, hour) : undefined}
              >
                {itemsHere.map((item) => {
                  const coverage = getHourCellCoverage(hour, item.startHour, item.startMinute, item.endHour, item.endMinute);
                  if (!coverage) return null;
                  const itemLayout = layout.get(item.layoutId);
                  const column = itemLayout?.column ?? 0;
                  const totalColumns = itemLayout?.totalColumns ?? 1;
                  const slotWidth = 100 / totalColumns;
                  const isSelected = selectedItemId === item.id;

                  return (
                    <div
                      key={`${item.layoutId}-${hour}`}
                      className={`absolute cursor-pointer rounded-r ${
                        item.kind === 'task' ? 'border border-dashed border-white/30' : ''
                      } ${item.status === 'completed' ? 'opacity-45' : 'opacity-75'} ${item.isDraft ? 'border border-amber-300/50' : ''} ${isSelected ? 'ring-2 ring-[var(--accent-secondary)]' : ''}`}
                      style={{
                        backgroundColor: getItemColor(item.type, item.renderedEventTypeId, eventTypeColors),
                        top: `${coverage.top * 100}%`,
                        height: `${coverage.height * 100}%`,
                        left: totalColumns > 1 ? `${column * slotWidth}%` : '0',
                        width: totalColumns > 1 ? `${slotWidth}%` : '100%',
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectItem?.(item, item.instanceDate);
                      }}
                    />
                  );
                })}

                {startsHere.map((item) => {
                  const coverage = getHourCellCoverage(hour, item.startHour, item.startMinute, item.endHour, item.endMinute);
                  if (!coverage) return null;
                  const itemLayout = layout.get(item.layoutId);
                  const column = itemLayout?.column ?? 0;
                  const totalColumns = itemLayout?.totalColumns ?? 1;
                  const slotWidth = 100 / totalColumns;

                  return (
                    <button
                      key={`${item.layoutId}-label`}
                      type="button"
                      className="absolute z-10 truncate px-1.5 text-left text-[10px] font-semibold text-white"
                      style={{
                        top: `${coverage.top * 100}%`,
                        left: totalColumns > 1 ? `${column * slotWidth}%` : '0',
                        width: totalColumns > 1 ? `${slotWidth}%` : '100%',
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectItem?.(item, item.instanceDate);
                      }}
                    >
                      {item.kind === 'task' ? `Task: ${item.renderedTitle}` : item.renderedTitle}
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
  items,
  selectedItemId,
  onSelectItem,
  onSelectEmptySlot,
  eventTypeColors,
}: {
  currentDate: Date;
  items: TeamCalendarItem[];
  selectedItemId?: string | null;
  onSelectItem?: (item: TeamCalendarItem, instanceDate: string) => void;
  onSelectEmptySlot?: (date: string, hour: number) => void;
  eventTypeColors: Record<string, string>;
}) {
  const scheduleRef = useRef<HTMLDivElement>(null);
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = useMemo(() => Array.from({ length: 7 }).map((_, index) => addDays(weekStart, index)), [weekStart]);

  const parsedByDay = useMemo(() => {
    return weekDays.map((day) => parseDayItems(items, format(day, 'yyyy-MM-dd')));
  }, [items, weekDays]);

  const layoutsByDay = useMemo(() => parsedByDay.map((dayItems) => computeOverlapGroups(dayItems, 2)), [parsedByDay]);

  useEffect(() => {
    const container = scheduleRef.current;
    if (!container) return;
    const initialVisibleRow = container.querySelector<HTMLElement>(`[data-hour="${initialVisibleHour}"]`);
    if (initialVisibleRow) {
      container.scrollTop = initialVisibleRow.offsetTop;
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

        {parsedByDay.every((dayItems) => dayItems.length === 0) ? (
          <p className="pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(var(--surface-shell-rgb),0.92)] px-3 py-2 text-center text-xs text-gray-300 shadow-lg">
            No activities scheduled for this week.
          </p>
        ) : null}

        <div
          ref={scheduleRef}
          className="min-h-0 overflow-y-auto"
          style={{ height: `${visibleHourCount * weekHourRowHeight}px` }}
        >
          {hours.map((hour) => (
            <div key={hour} data-hour={hour} className="flex min-h-[40px] border-b border-[rgba(255,255,255,0.05)]">
              <div className="w-10 shrink-0 pr-1 pt-1 text-right text-[10px] font-medium text-gray-500">
                {formatHourLabel(hour)}
              </div>
              <div className="grid flex-1 grid-cols-7">
                {weekDays.map((day, dayIndex) => {
                  const dayItems = parsedByDay[dayIndex];
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const layout = layoutsByDay[dayIndex];
                  const itemsHere = dayItems.filter((item) =>
                    getHourCellCoverage(hour, item.startHour, item.startMinute, item.endHour, item.endMinute)
                  );
                  const startsHere = dayItems.filter((item) => item.startHour === hour);
                  const isCellEmpty = itemsHere.length === 0;

                  return (
                    <div
                      key={`${day.toISOString()}-${hour}`}
                      className="relative border-l border-[rgba(255,255,255,0.06)]"
                      role={isCellEmpty && onSelectEmptySlot ? 'button' : undefined}
                      onClick={isCellEmpty && onSelectEmptySlot ? () => onSelectEmptySlot(dateKey, hour) : undefined}
                    >
                      {itemsHere.map((item) => {
                        const coverage = getHourCellCoverage(hour, item.startHour, item.startMinute, item.endHour, item.endMinute);
                        if (!coverage) return null;
                        const itemLayout = layout.get(item.layoutId);
                        const column = itemLayout?.column ?? 0;
                        const totalColumns = itemLayout?.totalColumns ?? 1;
                        const slotWidth = 100 / totalColumns;
                        const isSelected = selectedItemId === item.id;

                        return (
                          <div
                            key={`${item.layoutId}-${hour}`}
                            className={`absolute cursor-pointer ${
                              item.kind === 'task' ? 'border border-dashed border-white/30' : ''
                            } ${item.status === 'completed' ? 'opacity-45' : 'opacity-75'} ${item.isDraft ? 'border border-amber-300/50' : ''} ${isSelected ? 'ring-2 ring-[var(--accent-secondary)]' : ''}`}
                            style={{
                              backgroundColor: getItemColor(item.type, item.renderedEventTypeId, eventTypeColors),
                              top: `${coverage.top * 100}%`,
                              height: `${coverage.height * 100}%`,
                              left: totalColumns > 1 ? `${column * slotWidth}%` : '0',
                              width: totalColumns > 1 ? `${slotWidth}%` : '100%',
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelectItem?.(item, item.instanceDate);
                            }}
                          />
                        );
                      })}

                      {startsHere.map((item, index) => {
                        const coverage = getHourCellCoverage(hour, item.startHour, item.startMinute, item.endHour, item.endMinute);
                        if (!coverage) return null;
                        const itemLayout = layout.get(item.layoutId);
                        const column = itemLayout?.column ?? 0;
                        const totalColumns = itemLayout?.totalColumns ?? 1;
                        const slotWidth = 100 / totalColumns;
                        const stackedTop = `calc(${coverage.top * 100}% + ${index * 9}px)`;

                        return (
                          <button
                            key={`${item.layoutId}-title`}
                            type="button"
                            className="absolute z-10 truncate px-1 text-left text-[8px] font-semibold text-white"
                            style={{
                              top: stackedTop,
                              left: totalColumns > 1 ? `${column * slotWidth}%` : '0',
                              width: totalColumns > 1 ? `${slotWidth}%` : '100%',
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelectItem?.(item, item.instanceDate);
                            }}
                          >
                            {item.kind === 'task' ? `Task: ${item.renderedTitle}` : item.renderedTitle}
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

export function TeamCalendar({
  items,
  className,
  style,
  selectedItemId,
  onSelectItem,
  onSelectEmptySlot,
  eventTypeColors = {},
}: TeamCalendarProps) {
  const [view, setView] = usePersistedState<'Day' | 'Week'>('lodario:coach-team-calendar:view', 'Week');
  const [currentDateKey, setCurrentDateKey] = usePersistedState('lodario:coach-team-calendar:date', format(new Date(), 'yyyy-MM-dd'));
  const currentDate = useMemo(() => new Date(`${currentDateKey}T00:00:00`), [currentDateKey]);

  const viewLabel =
    view === 'Week'
      ? `Week of ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'MMM d')}`
      : format(currentDate, 'MMM d, yyyy');

  return (
    <section className={`glass-card flex min-h-[620px] flex-col p-4 sm:p-5 xl:min-h-0 ${className ?? ''}`} style={style}>
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
            onClick={() =>
              setCurrentDateKey(format(view === 'Week' ? subWeeks(currentDate, 1) : subDays(currentDate, 1), 'yyyy-MM-dd'))
            }
            className="rounded-full p-1.5 text-gray-300 transition-colors hover:bg-[rgba(255,255,255,0.08)] hover:text-white"
            aria-label="Previous period"
          >
            <ChevronLeft size={16} />
          </button>
          <p className="min-w-[148px] text-center text-xs font-semibold text-white">{viewLabel}</p>
          <button
            type="button"
            onClick={() =>
              setCurrentDateKey(format(view === 'Week' ? addWeeks(currentDate, 1) : addDays(currentDate, 1), 'yyyy-MM-dd'))
            }
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
            items={items}
            selectedItemId={selectedItemId}
            onSelectItem={onSelectItem}
            onSelectEmptySlot={onSelectEmptySlot}
            eventTypeColors={eventTypeColors}
          />
        ) : null}
        {view === 'Week' ? (
          <>
            <div className="md:hidden">
              <DaySchedule
                date={currentDate}
                items={items}
                selectedItemId={selectedItemId}
                onSelectItem={onSelectItem}
                onSelectEmptySlot={onSelectEmptySlot}
                eventTypeColors={eventTypeColors}
              />
            </div>
            <WeekSchedule
              currentDate={currentDate}
              items={items}
              selectedItemId={selectedItemId}
              onSelectItem={onSelectItem}
              onSelectEmptySlot={onSelectEmptySlot}
              eventTypeColors={eventTypeColors}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}
