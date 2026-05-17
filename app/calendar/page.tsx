'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CalendarWeek } from '@/components/CalendarWeek';
import { EventModal } from '@/components/EventModal';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { format, subWeeks, addWeeks, subDays, addDays, isSameDay, parseISO, getHours, getDay, getDate, isBefore, isAfter, lastDayOfMonth } from 'date-fns';
import { useData } from '@/lib/DataContext';
import { CalendarEvent } from '@/lib/types';

// Parse "HH:mm" into { hour, minute }
function parseTime(timeStr: string): { hour: number; minute: number } {
  const parts = timeStr.split(':');
  return { hour: parseInt(parts[0], 10), minute: parseInt(parts[1] || '0', 10) };
}

// Compute what fraction of an hour cell this event covers
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

interface RenderedEvent {
  event: CalendarEvent;
  isRecurringInstance: boolean;
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

/**
 * Sweep-line overlap detection + persistent column assignment.
 * Non-overlapping events get separate clusters and render full-width.
 */
function computeOverlapGroups(events: RenderedEvent[], maxCols: number): Map<string, EventLayout> {
  const result = new Map<string, EventLayout>();
  if (events.length === 0) return result;

  const intervals = events.map(e => ({
    id: e.event.id,
    start: e.startHour * 60 + e.startMinute,
    end: e.endHour * 60 + e.endMinute,
    event: e,
  })).sort((a, b) => a.start - b.start || b.end - a.end);

  const clusters: typeof intervals[] = [];
  let currentCluster = [intervals[0]];
  let clusterEnd = intervals[0].end;

  for (let i = 1; i < intervals.length; i++) {
    const iv = intervals[i];
    if (iv.start < clusterEnd) {
      currentCluster.push(iv);
      clusterEnd = Math.max(clusterEnd, iv.end);
    } else {
      clusters.push(currentCluster);
      currentCluster = [iv];
      clusterEnd = iv.end;
    }
  }
  clusters.push(currentCluster);

  for (const cluster of clusters) {
    const totalColumns = Math.min(cluster.length, maxCols);
    for (let i = 0; i < cluster.length; i++) {
      const col = Math.min(i, maxCols - 1);
      result.set(cluster[i].id, { column: col, totalColumns });
    }
  }

  return result;
}

export default function CalendarPage() {
  const [view, setView] = useState<'Day' | 'Week'>('Week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedDateForEvent, setSelectedDateForEvent] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | undefined>(undefined);
  const [editingIsRecurring, setEditingIsRecurring] = useState(false);
  const [editingInstanceDate, setEditingInstanceDate] = useState<string | undefined>(undefined);
  const [defaultStartHour, setDefaultStartHour] = useState<number | undefined>(undefined);

  const handlePrev = () => {
    if (view === 'Week') setCurrentDate(subWeeks(currentDate, 1));
    if (view === 'Day') setCurrentDate(subDays(currentDate, 1));
  };
  
  const handleNext = () => {
    if (view === 'Week') setCurrentDate(addWeeks(currentDate, 1));
    if (view === 'Day') setCurrentDate(addDays(currentDate, 1));
  };

  const handleAddEvent = (dateStr?: string, hour?: number) => {
    setEditingEvent(undefined);
    setEditingIsRecurring(false);
    setEditingInstanceDate(undefined);
    setSelectedDateForEvent(dateStr || format(currentDate, 'yyyy-MM-dd'));
    setDefaultStartHour(hour);
    setShowEventModal(true);
  };

  const handleEditEvent = (event: CalendarEvent, isRecurringInstance: boolean, instanceDate: string) => {
    setEditingEvent(event);
    setEditingIsRecurring(isRecurringInstance);
    setEditingInstanceDate(instanceDate);
    setSelectedDateForEvent(instanceDate);
    setDefaultStartHour(undefined);
    setShowEventModal(true);
  };

  const handleCloseModal = () => {
    setShowEventModal(false);
    setEditingEvent(undefined);
    setEditingIsRecurring(false);
    setEditingInstanceDate(undefined);
    setDefaultStartHour(undefined);
  };

  const getViewLabel = () => {
    if (view === 'Week') return `Week of ${format(currentDate, 'MMM d')}`;
    if (view === 'Day') return format(currentDate, 'MMM d, yyyy');
  };

  return (
    <div className="px-4 py-8 max-w-md mx-auto h-full flex flex-col relative pb-20">
      <header className="mb-6 pl-1 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Schedule</h1>
        </div>
        <button 
          onClick={() => handleAddEvent()}
          className="bg-[var(--accent-primary)] text-black p-2 rounded-full shadow-lg hover:scale-105 transition-transform touch-target flex items-center justify-center"
        >
          <Plus size={24} />
        </button>
      </header>

      {/* Controls — Day / Week only */}
      <div className="flex justify-between items-center mb-6">
        <div className="bg-[rgba(255,255,255,0.05)] rounded-full p-1 flex">
          {(['Day', 'Week'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                view === v ? 'bg-[var(--card-bg)] text-white shadow' : 'text-gray-500'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-between items-center mb-4 glass-card p-2 rounded-full">
        <button onClick={handlePrev} className="p-2 text-gray-400 hover:text-white touch-target">
          <ChevronLeft size={20} />
        </button>
        <span className="font-bold text-white text-sm">
          {getViewLabel()}
        </span>
        <button onClick={handleNext} className="p-2 text-gray-400 hover:text-white touch-target">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Main View Area */}
      <div className="flex-1 min-h-[400px]">
        {view === 'Week' && (
          <CalendarWeek 
            currentDate={currentDate} 
            onAddEvent={handleAddEvent} 
            onEditEvent={handleEditEvent} 
          />
        )}
        {view === 'Day' && (
          <DayView 
            currentDate={currentDate} 
            onAddEvent={handleAddEvent} 
            onEditEvent={handleEditEvent} 
          />
        )}
      </div>

      {showEventModal && (
        <EventModal 
          onClose={handleCloseModal} 
          selectedDate={selectedDateForEvent} 
          existingEvent={editingEvent}
          isRecurringInstance={editingIsRecurring}
          instanceDate={editingInstanceDate}
          defaultStartHour={defaultStartHour}
        />
      )}
    </div>
  );
}

// ---- Inline Day View Component ----

function DayView({ currentDate, onAddEvent, onEditEvent }: { 
  currentDate: Date; 
  onAddEvent: (dateStr: string, hour?: number) => void;
  onEditEvent: (event: CalendarEvent, isRecurringInstance: boolean, instanceDate: string) => void;
}) {
  const { calendarEvents, customEventTypes } = useData();
  const scheduleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scheduleRef.current;
    if (!container) return;

    const sixAmRow = container.querySelector<HTMLElement>('[data-hour="6"]');
    if (sixAmRow) {
      container.scrollTop = sixAmRow.offsetTop;
    }
  }, [currentDate]);

  const dateStr = format(currentDate, 'yyyy-MM-dd');
  const dayOfWeek = getDay(currentDate) === 0 ? 7 : getDay(currentDate);
  const hours = Array.from({ length: 24 }).map((_, i) => i);

  const getTypeColor = (typeId: string) => {
    return customEventTypes.find(t => t.id === typeId)?.color || 'var(--accent-primary)';
  };

  const isPastRecurrenceEnd = (day: Date, endDateStr?: string): boolean => {
    if (!endDateStr) return false;
    return isAfter(day, parseISO(endDateStr));
  };

  const matchesMonthDay = (day: Date, monthDays: number[]): boolean => {
    const dayOfMonth = getDate(day);
    const lastDay = getDate(lastDayOfMonth(day));
    return monthDays.some(md => {
      if (md > lastDay) return dayOfMonth === lastDay;
      return dayOfMonth === md;
    });
  };

  const renderedEvents: RenderedEvent[] = [];

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
      if (eventStartDate === dateStr) matches = true;
    } else if (event.recurrence === 'daily') {
      if (!isBefore(currentDate, parseISO(eventStartDate)) && !isPastRecurrenceEnd(currentDate, event.recurrenceEndDate)) {
        matches = true;
        isRecurringInstance = true;
      }
    } else if (event.recurrence === 'weekly') {
      if (!isBefore(currentDate, parseISO(eventStartDate)) && event.recurrenceConfig?.days?.includes(dayOfWeek) && !isPastRecurrenceEnd(currentDate, event.recurrenceEndDate)) {
        matches = true;
        isRecurringInstance = true;
      }
    } else if (event.recurrence === 'monthly') {
      if (!isBefore(currentDate, parseISO(eventStartDate)) && event.recurrenceConfig?.monthDays && matchesMonthDay(currentDate, event.recurrenceConfig.monthDays) && !isPastRecurrenceEnd(currentDate, event.recurrenceEndDate)) {
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

      renderedEvents.push({
        event,
        isRecurringInstance,
        startHour: finalParsedStart.hour,
        startMinute: finalParsedStart.minute,
        endHour: finalParsedEnd.hour,
        endMinute: finalParsedEnd.minute,
        title: finalTitle,
        color: event.color || getTypeColor(finalEventTypeId),
      });
    }
  });

  // Precompute persistent column layout (max 4 for day view)
  const layout = computeOverlapGroups(renderedEvents, 4);

  const getEventsAtHour = (hour: number) => renderedEvents.filter(re => {
    const coverage = getHourCellCoverage(hour, re.startHour, re.startMinute, re.endHour, re.endMinute);
    return coverage !== null;
  });
  const getStartsAtHour = (hour: number) => renderedEvents.filter(re => re.startHour === hour);

  return (
    <div className="glass-card animate-fade-in overflow-hidden relative">
      <div ref={scheduleRef} className="overflow-y-auto max-h-[60vh] relative pb-20">
        {hours.map(hour => {
          const eventsHere = getEventsAtHour(hour);
          const startsHere = getStartsAtHour(hour);
          const hasEvent = eventsHere.length > 0;

          return (
            <div key={hour} data-hour={hour} className="flex min-h-[44px] border-b border-[rgba(255,255,255,0.05)]">
              <div className="w-14 flex-shrink-0 text-[11px] text-gray-500 text-right pr-3 pt-1 font-medium">
                {hour === 0 ? '12 AM' : hour <= 11 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
              </div>
              <div 
                className={`flex-1 relative group cursor-pointer transition-colors ${
                  hasEvent ? '' : 'hover:bg-[rgba(255,255,255,0.02)]'
                }`}
                onClick={() => {
                  if (hasEvent) {
                    const re = eventsHere[0];
                    onEditEvent(re.event, re.isRecurringInstance, dateStr);
                  } else {
                    onAddEvent(dateStr, hour);
                  }
                }}
              >
                {!hasEvent && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Plus size={16} className="text-[var(--accent-secondary)]" />
                  </div>
                )}

                {/* Event color blocks — persistent columns + partial hour */}
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
                      className="absolute opacity-70 rounded-r"
                      style={{
                        backgroundColor: re.color,
                        top: `${coverage.top * 100}%`,
                        height: `${coverage.height * 100}%`,
                        left: totalCols > 1 ? `${col * slotWidth}%` : '0',
                        width: totalCols > 1 ? `${slotWidth}%` : '100%',
                      }}
                      onClick={(e) => {
                        if (totalCols > 1) {
                          e.stopPropagation();
                          onEditEvent(re.event, re.isRecurringInstance, dateStr);
                        }
                      }}
                    />
                  );
                })}

                {/* Titles — positioned inside event block at actual start */}
                {startsHere.map(re => {
                  const coverage = getHourCellCoverage(hour, re.startHour, re.startMinute, re.endHour, re.endMinute);
                  if (!coverage) return null;

                  const evLayout = layout.get(re.event.id);
                  const col = evLayout?.column ?? 0;
                  const totalCols = evLayout?.totalColumns ?? 1;
                  const slotWidth = 100 / totalCols;

                  return (
                    <div 
                      key={re.event.id}
                      className="absolute z-10 p-1.5 text-sm font-bold text-white truncate pointer-events-none"
                      style={{
                        top: `${coverage.top * 100}%`,
                        left: totalCols > 1 ? `${col * slotWidth}%` : '0',
                        width: totalCols > 1 ? `${slotWidth}%` : '100%',
                      }}
                    >
                      {re.title || '(No title)'}
                    </div>
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
