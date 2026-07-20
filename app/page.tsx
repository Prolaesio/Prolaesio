'use client';

import React from 'react';
import Link from 'next/link';
import { format, isTomorrow } from 'date-fns';
import { Calendar as CalendarIcon, ShieldAlert } from 'lucide-react';
import { PlayerRsvpControl } from '@/components/calendar/PlayerRsvpControl';
import { ReadinessGauge } from '@/components/ReadinessGauge';
import { useAuth } from '@/lib/AuthContext';
import {
  getPlayerRsvpTargetFromCalendarEvent,
} from '@/lib/calendar/attendance';
import { getCalendarOccurrencesInWindow } from '@/lib/calendar/occurrences';
import { useData } from '@/lib/DataContext';
import { useTrainingLoad } from '@/hooks/useTrainingLoad';
import { useReadiness } from '@/hooks/useReadiness';

export default function Home() {
  const { user } = useAuth();
  const { readiness } = useReadiness();
  const { calendarEvents, customEventTypes, injuries } = useData();
  const [now, setNow] = React.useState(() => new Date());
  const load = useTrainingLoad();

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activeInjuries = injuries.filter((injury) => injury.status === 'active');
  const showInjuryAlert = activeInjuries.length > 0 || load.hasAutoInjury;
  const windowEnd = React.useMemo(() => new Date(now.getTime() + 24 * 60 * 60 * 1000), [now]);

  const scheduleOccurrences = React.useMemo(() => {
    return getCalendarOccurrencesInWindow(calendarEvents, now, windowEnd)
      .filter((occurrence) => occurrence.end.getTime() > now.getTime())
      .slice(0, 12);
  }, [calendarEvents, now, windowEnd]);

  const eventTypeColorById = React.useMemo(() => {
    return new Map(customEventTypes.map((type) => [type.id, type.color]));
  }, [customEventTypes]);

  return (
    <div className="px-4 py-8 max-w-md mx-auto">
      <header className="mb-8 pl-1">
        <h1 className="text-3xl font-bold text-white tracking-tight">Lodario</h1>
        <p className="text-sm text-[var(--accent-secondary)] mt-1 font-medium">Your personal training guide</p>
      </header>

      {showInjuryAlert ? (
        <div className="mb-6 glass-card p-4 flex items-start space-x-3 bg-[rgba(255,107,107,0.1)] border-[#ff6b6b] animate-slide-up touch-target">
          <ShieldAlert className="text-[#ff6b6b] mt-0.5" size={24} />
          <div>
            <h3 className="text-[#ff6b6b] font-bold text-sm tracking-wide">Active Protocol</h3>
            <p className="text-gray-300 text-xs mt-1 leading-relaxed">
              {load.hasAutoInjury
                ? 'Elevated pain detected over consecutive days. System has engaged injury protocol.'
                : 'Active injury logged. Follow your prescribed recovery plan.'}
            </p>
          </div>
        </div>
      ) : null}

      <section className="mb-6 flex justify-center">
        <ReadinessGauge score={readiness.score} color={readiness.color} label={readiness.label} />
      </section>

      <section className="mb-8 grid grid-cols-5 gap-2 animate-fade-in" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
        {[
          { label: 'Sleep', score: readiness.breakdown.sleep },
          { label: 'Energy', score: readiness.breakdown.energy },
          { label: 'Fatigue', score: readiness.breakdown.fatigue },
          { label: 'Stress', score: readiness.breakdown.stress },
          { label: 'Load', score: readiness.breakdown.load },
        ].map((item) => (
          <div key={item.label} className="glass-card p-2 flex flex-col items-center justify-center">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{item.label}</span>
            <div className="w-full bg-[rgba(255,255,255,0.1)] h-1 rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-[var(--accent-primary)] rounded-full transition-all duration-1000"
                style={{ width: `${item.score}%` }}
              />
            </div>
            <span className="text-xs text-white font-medium mt-1">{item.score}</span>
          </div>
        ))}
      </section>

      <section className="mb-12 animate-slide-up" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
        <div className="flex justify-between items-end mb-4 pl-1">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-sans">Schedule</h2>
          </div>
          <Link href="/calendar" className="text-xs text-[var(--accent-secondary)] font-medium hover:text-[var(--accent-primary)]">
            View All
          </Link>
        </div>

        {scheduleOccurrences.length === 0 ? (
          <div className="glass-card p-6 flex flex-col items-center justify-center text-gray-400 border-dashed border-[rgba(255,255,255,0.2)]">
            <CalendarIcon size={32} className="mb-2 opacity-50" />
            <p className="text-sm">No events in the next 24 hours</p>
            <p className="mt-1 text-center text-xs text-gray-500">
              Upcoming training, matches, gym, school, and recovery blocks will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {scheduleOccurrences.map((occurrence) => {
              const rsvpTarget = getPlayerRsvpTargetFromCalendarEvent(occurrence.event, occurrence.instanceDate, user?.id);
              const color =
                occurrence.event.color ||
                eventTypeColorById.get(occurrence.eventTypeId) ||
                'var(--accent-primary)';

              return (
                <div
                  key={occurrence.key}
                  className="glass-card p-4 border-l-4 touch-target"
                  style={{ borderLeftColor: color }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-bold text-white mb-0.5">{occurrence.title}</h4>
                      <p className="text-xs text-gray-400">
                        {isTomorrow(occurrence.start) ? 'Tomorrow, ' : ''}
                        {format(occurrence.start, 'EEE, MMM d')} - {format(occurrence.start, 'h:mm a')} to {format(occurrence.end, 'h:mm a')}
                      </p>
                    </div>
                    {rsvpTarget ? <PlayerRsvpControl target={rsvpTarget} compact /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
