'use client';

import React, { useEffect, useRef } from 'react';
import { format, addDays, startOfWeek, isSameDay, parseISO, getDay, getDate, isAfter, isBefore, lastDayOfMonth } from 'date-fns';
import { CalendarEvent, SessionType } from '../lib/types';
import { useData } from '../lib/DataContext';
import { Plus } from 'lucide-react';
import { computeDurationMinutes, mapCalendarEventToSessionType } from '../lib/calendarLogSession';

interface RenderedEvent {
  event: CalendarEvent;
  isRecurringInstance: boolean;
  instanceDate: string;
  eventTypeId: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  title?: string;
  color: string;
}

interface EventLayout {
  column: number;
  totalColumns: number;
}

interface CalendarWeekProps {
  currentDate: Date;
  onAddEvent: (dateStr: string, hour?: number) => void;
  onEditEvent: (event: CalendarEvent, isRecurringInstance: boolean, instanceDate: string) => void;
  onEventLongPress: (payload: { x: number; y: number; date: string; duration: number; sessionType: SessionType }) => void;
}

// Parse "HH:mm" into { hour, minute }
function parseTime(timeStr: string): { hour: number; minute: number } {
  const parts = timeStr.split(':');
  return { hour: parseInt(parts[0], 10), minute: parseInt(parts[1] || '0', 10) };
}

// Compute what fraction of an hour cell (0-23) this event covers
function getHourCellCoverage(
  cellHour: number,
  startHour: number, startMinute: number,
  endHour: number, endMinute: number
): { top: number; height: number } | null {
  const cellStart = cellHour * 60;
  const cellEnd = (cellHour + 1) * 60;
  const evStart = startHour * 60 + startMinute;
  const evEnd = endHour * 60 + endMinute;

  if (evEnd <= cellStart || evStart >= cellEnd) return null;

  const overlapStart = Math.max(evStart, cellStart);
  const overlapEnd = Math.min(evEnd, cellEnd);
  const top = (overlapStart - cellStart) / 60;
  const height = (overlapEnd - overlapStart) / 60;

  return { top, height };
}

/**
 * Sweep-line overlap detection + persistent column assignment.
 * Groups events into clusters of mutually-overlapping events,
 * then assigns each event a stable column index.
 *
 * Non-overlapping events (e.g. 9:00–9:30 and 9:30–10:30) get
 * separate clusters and render full-width independently.
 *
 * @param maxCols Cap the number of columns (2 for weekly, 4 for daily)
 */
function computeOverlapGroups(events: RenderedEvent[], maxCols: number): Map<string, EventLayout> {
  const result = new Map<string, EventLayout>();
  if (events.length === 0) return result;

  // Convert to intervals sorted by start, then by end descending
  const intervals = events.map(e => ({
    id: e.event.id,
    start: e.startHour * 60 + e.startMinute,
    end: e.endHour * 60 + e.endMinute,
    event: e,
  })).sort((a, b) => a.start - b.start || b.end - a.end);

  // Build clusters of overlapping events
  const clusters: typeof intervals[] = [];
  let currentCluster = [intervals[0]];
  let clusterEnd = intervals[0].end;

  for (let i = 1; i < intervals.length; i++) {
    const iv = intervals[i];
    if (iv.start < clusterEnd) {
      // Overlaps with current cluster
      currentCluster.push(iv);
      clusterEnd = Math.max(clusterEnd, iv.end);
    } else {
      // No overlap — start new cluster
      clusters.push(currentCluster);
      currentCluster = [iv];
      clusterEnd = iv.end;
    }
  }
  clusters.push(currentCluster);

  // Assign columns within each cluster
  for (const cluster of clusters) {
    const totalColumns = Math.min(cluster.length, maxCols);
    // Already sorted by start time — assign columns in order
    for (let i = 0; i < cluster.length; i++) {
      const col = Math.min(i, maxCols - 1); // cap at maxCols-1
      result.set(cluster[i].id, { column: col, totalColumns });
    }
  }

  return result;
}

export function CalendarWeek({ currentDate, onAddEvent, onEditEvent, onEventLongPress }: CalendarWeekProps) {
  const { calendarEvents, customEventTypes } = useData();
  const scheduleRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  useEffect(() => {
    const container = scheduleRef.current;
    if (!container) return;

    const sixAmRow = container.querySelector<HTMLElement>('[data-hour="6"]');
    if (sixAmRow) {
      container.scrollTop = sixAmRow.offsetTop;
    }
  }, [currentDate]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPressTimer = (e: React.PointerEvent, renderedEvent: RenderedEvent) => {
    clearLongPressTimer();
    longPressTriggeredRef.current = false;

    const x = e.clientX;
    const y = e.clientY;

    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      onEventLongPress({
        x,
        y,
        date: renderedEvent.instanceDate,
        duration: computeDurationMinutes(
          renderedEvent.startHour,
          renderedEvent.startMinute,
          renderedEvent.endHour,
          renderedEvent.endMinute
        ),
        sessionType: mapCalendarEventToSessionType(
          renderedEvent.eventTypeId,
          customEventTypes,
          renderedEvent.title
        ),
      });
    }, 500);
  };

  const startDate = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startDate, i));
  const hours = Array.from({ length: 24 }).map((_, i) => i); // 0-23 full day

  const getTypeColor = (typeId: string) => {
    return customEventTypes.find(t => t.id === typeId)?.color || 'var(--accent-primary)';
  };

  // Convert ISO day of week (0=Sun) to our system (1=Mon...7=Sun)
  const jsDateToRecurrenceDay = (jsDay: number): number => {
    return jsDay === 0 ? 7 : jsDay; // Sunday=0 -> 7
  };

  // Check if a day is past the recurrence end date
  const isPastRecurrenceEnd = (day: Date, endDateStr?: string): boolean => {
    if (!endDateStr) return false;
    return isAfter(day, parseISO(endDateStr));
  };

  // Check if day-of-month matches any of the monthDays config
  const matchesMonthDay = (day: Date, monthDays: number[]): boolean => {
    const dayOfMonth = getDate(day);
    const lastDay = getDate(lastDayOfMonth(day));
    return monthDays.some(md => {
      if (md > lastDay) return dayOfMonth === lastDay;
      return dayOfMonth === md;
    });
  };

  // Expand all events (including recurring) for a given day
  const getRenderedEventsForDay = (day: Date): RenderedEvent[] => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const dayOfWeek = jsDateToRecurrenceDay(getDay(day));
    const results: RenderedEvent[] = [];

    calendarEvents.forEach(event => {
      const eventStartDate = event.start.split('T')[0];
      const startTime = event.start.split('T')[1] || '00:00';
      const endTime = event.end.split('T')[1] || '01:00';
      const parsedStart = parseTime(startTime);
      const parsedEnd = parseTime(endTime);

      if (event.excludedDates?.includes(dateStr)) return;

      const override = event.overrides?.[dateStr];

      let matches = false;
      let isRecurringInstance = false;

      if (event.recurrence === 'none') {
        if (eventStartDate === dateStr) {
          matches = true;
        }
      } else if (event.recurrence === 'daily') {
        const originalDate = parseISO(eventStartDate);
        if (!isBefore(day, originalDate) && !isPastRecurrenceEnd(day, event.recurrenceEndDate)) {
          matches = true;
          isRecurringInstance = true;
        }
      } else if (event.recurrence === 'weekly') {
        const originalDate = parseISO(eventStartDate);
        if (!isBefore(day, originalDate) && event.recurrenceConfig?.days?.includes(dayOfWeek) && !isPastRecurrenceEnd(day, event.recurrenceEndDate)) {
          matches = true;
          isRecurringInstance = true;
        }
      } else if (event.recurrence === 'monthly') {
        const originalDate = parseISO(eventStartDate);
        if (!isBefore(day, originalDate) && event.recurrenceConfig?.monthDays && matchesMonthDay(day, event.recurrenceConfig.monthDays) && !isPastRecurrenceEnd(day, event.recurrenceEndDate)) {
          matches = true;
          isRecurringInstance = true;
        }
      }

      if (matches) {
        const finalTitle = override?.title !== undefined ? override.title : event.title;
        const finalStartTime = override?.start ? override.start.split('T')[1] || startTime : startTime;
        const finalEndTime = override?.end ? override.end.split('T')[1] || endTime : endTime;
        const finalParsedStart = parseTime(finalStartTime);
        const finalParsedEnd = parseTime(finalEndTime);
        const finalEventTypeId = override?.eventTypeId || event.eventTypeId;

        results.push({
          event,
          isRecurringInstance,
          instanceDate: dateStr,
          eventTypeId: finalEventTypeId,
          startHour: finalParsedStart.hour,
          startMinute: finalParsedStart.minute,
          endHour: finalParsedEnd.hour,
          endMinute: finalParsedEnd.minute,
          title: finalTitle,
          color: event.color || getTypeColor(finalEventTypeId),
        });
      }
    });

    return results;
  };

  // Get events that cover a specific hour cell
  const getEventsAtHour = (renderedEvents: RenderedEvent[], hour: number) => {
    return renderedEvents.filter(re => {
      const coverage = getHourCellCoverage(hour, re.startHour, re.startMinute, re.endHour, re.endMinute);
      return coverage !== null;
    });
  };

  // Events that start in this hour cell
  const getStartsAtHour = (renderedEvents: RenderedEvent[], hour: number) => {
    return renderedEvents.filter(re => re.startHour === hour);
  };

  // Pre-compute events and layout for all days
  const dayEvents = weekDays.map(day => getRenderedEventsForDay(day));
  const dayLayouts = dayEvents.map(evts => computeOverlapGroups(evts, 2)); // Weekly: max 2 cols

  return (
    <div className="glass-card animate-fade-in overflow-hidden relative">
      {/* Header axis */}
      <div className="flex border-b border-[rgba(255,255,255,0.1)] sticky top-0 bg-[var(--card-bg)] z-10">
        <div className="w-10 flex-shrink-0"></div>
        <div className="flex-1 grid grid-cols-7">
          {weekDays.map((day, idx) => {
            const isToday = isSameDay(day, new Date());
            return (
              <div key={idx} className="flex flex-col items-center py-2 border-l border-[rgba(255,255,255,0.05)]">
                <span className={`text-[10px] font-medium uppercase ${isToday ? 'text-[var(--accent-primary)]' : 'text-gray-400'}`}>
                  {format(day, 'EEE')}
                </span>
                <span className={`text-sm font-bold mt-1 h-6 w-6 flex items-center justify-center rounded-full ${isToday ? 'bg-[var(--accent-primary)] text-black' : 'text-white'}`}>
                  {format(day, 'd')}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      <div ref={scheduleRef} className="overflow-y-auto max-h-[60vh] relative pb-20">
        {hours.map(hour => (
          <div key={hour} data-hour={hour} className="flex min-h-[40px] border-b border-[rgba(255,255,255,0.05)]">
            <div className="w-10 flex-shrink-0 text-[10px] text-gray-500 text-right pr-2 pt-1 font-medium">
              {hour === 0 ? '12a' : hour <= 11 ? `${hour}a` : hour === 12 ? '12p' : `${hour - 12}p`}
            </div>
            <div className="flex-1 grid grid-cols-7 relative">
              {weekDays.map((day, dIdx) => {
                const eventsHere = getEventsAtHour(dayEvents[dIdx], hour);
                const startsHere = getStartsAtHour(dayEvents[dIdx], hour);
                const hasEvent = eventsHere.length > 0;
                const dateStr = format(day, 'yyyy-MM-dd');
                const layout = dayLayouts[dIdx];

                return (
                  <div 
                    key={dIdx} 
                    className={`border-l border-[rgba(255,255,255,0.05)] relative group cursor-pointer transition-colors ${
                      hasEvent ? '' : 'hover:bg-[rgba(255,255,255,0.02)]'
                    }`}
                    onClick={(e) => {
                      if (hasEvent) {
                        e.stopPropagation();
                        const re = eventsHere[0];
                        onEditEvent(re.event, re.isRecurringInstance, re.instanceDate);
                      } else {
                        onAddEvent(dateStr, hour);
                      }
                    }}
                  >
                    {/* Show + icon only on empty slots */}
                    {!hasEvent && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Plus size={14} className="text-[var(--accent-secondary)]" />
                      </div>
                    )}

                    {/* Event color blocks with correct overlap + partial hour */}
                    {hasEvent && eventsHere.map(re => {
                      const coverage = getHourCellCoverage(hour, re.startHour, re.startMinute, re.endHour, re.endMinute);
                      if (!coverage) return null;
                      
                      const evLayout = layout.get(re.event.id);
                      const col = evLayout?.column ?? 0;
                      const totalCols = evLayout?.totalColumns ?? 1;
                      const slotWidth = 100 / totalCols;

                      return (
                        <div
                          key={re.event.id}
                          className="absolute opacity-70"
                          style={{
                            backgroundColor: re.color,
                            top: `${coverage.top * 100}%`,
                            height: `${coverage.height * 100}%`,
                            left: totalCols > 1 ? `${col * slotWidth}%` : '0',
                            width: totalCols > 1 ? `${slotWidth}%` : '100%',
                          }}
                          onPointerDown={(e) => startLongPressTimer(e, re)}
                          onPointerUp={clearLongPressTimer}
                          onPointerLeave={clearLongPressTimer}
                          onPointerCancel={clearLongPressTimer}
                          onContextMenu={(e) => e.preventDefault()}
                          onClick={(e) => {
                            if (longPressTriggeredRef.current) {
                              e.stopPropagation();
                              longPressTriggeredRef.current = false;
                              return;
                            }
                            if (totalCols > 1) {
                              e.stopPropagation();
                              onEditEvent(re.event, re.isRecurringInstance, re.instanceDate);
                            }
                          }}
                        />
                      );
                    })}

                    {/* Event titles — positioned at actual start, stacked vertically */}
                    {startsHere
                      .sort((a, b) => (a.startHour * 60 + a.startMinute) - (b.startHour * 60 + b.startMinute))
                      .map((re, idx) => {
                        const coverage = getHourCellCoverage(hour, re.startHour, re.startMinute, re.endHour, re.endMinute);
                        if (!coverage) return null;
                        
                        const evLayout = layout.get(re.event.id);
                        const col = evLayout?.column ?? 0;
                        const totalCols = evLayout?.totalColumns ?? 1;
                        const slotWidth = 100 / totalCols;

                        // Stack titles: use coverage.top + index offset (10px per stacked title)
                        const topPx = `calc(${coverage.top * 100}% + ${idx * 10}px)`;

                        return (
                          <div 
                            key={re.event.id}
                            className="absolute text-[8px] p-0.5 leading-tight font-bold text-white z-10 truncate pointer-events-none"
                            style={{
                              top: topPx,
                              left: totalCols > 1 ? `${col * slotWidth}%` : '0',
                              width: totalCols > 1 ? `${slotWidth}%` : '100%',
                            }}
                          >
                            {re.title || ''}
                          </div>
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
  );
}
