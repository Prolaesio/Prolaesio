'use client';

import { useEffect, useRef, useState } from 'react';
import { EventCreatorPanel } from '@/components/coach/calendar/EventCreatorPanel';
import { TeamAveragesPanel } from '@/components/coach/calendar/TeamAveragesPanel';
import { TeamCalendar } from '@/components/coach/calendar/TeamCalendar';
import { useCoachTeam } from '@/lib/coach/selectedTeam';
import { useCoachSelectedTeamInsights } from '@/lib/coach/teamInsights';

export function CoachCalendarPage() {
  const { selectedTeam } = useCoachTeam();
  const { calendarData: teamData, isLoading, error } = useCoachSelectedTeamInsights(selectedTeam.id);
  const hasCalendarData = teamData.items.length > 0 || teamData.averages.length > 0;
  const teamAveragesContainerRef = useRef<HTMLDivElement>(null);
  const [desktopScheduleHeight, setDesktopScheduleHeight] = useState<number | null>(null);

  useEffect(() => {
    const averagesContainer = teamAveragesContainerRef.current;
    if (!averagesContainer) return;

    const syncScheduleHeight = () => {
      if (window.innerWidth >= 1280) {
        setDesktopScheduleHeight(Math.round(averagesContainer.getBoundingClientRect().height));
      } else {
        setDesktopScheduleHeight(null);
      }
    };

    syncScheduleHeight();

    const resizeObserver = new ResizeObserver(() => {
      syncScheduleHeight();
    });
    resizeObserver.observe(averagesContainer);
    window.addEventListener('resize', syncScheduleHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', syncScheduleHeight);
    };
  }, []);

  if (!selectedTeam.id) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-white">Calendar</h1>
          <p className="mt-2 text-sm text-gray-400">Create or select a team first to view team calendar data.</p>
        </header>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">Calendar</h1>
        <p className="mt-2 text-sm text-gray-400">Manage events, tasks, and schedule windows for {selectedTeam.name}.</p>
        <p className="mt-3 text-xs font-medium text-[var(--accent-secondary)]">Selected team: {selectedTeam.name}</p>
        {isLoading ? <p className="mt-2 text-xs text-gray-400">Loading team calendar data...</p> : null}
        {error ? <p className="mt-2 text-xs text-[var(--status-red)]">Unable to load calendar data: {error}</p> : null}
        {!isLoading && !error && !hasCalendarData ? <p className="mt-2 text-xs text-gray-400">No team calendar data yet.</p> : null}
      </header>

      <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_340px] xl:items-stretch">
        <div ref={teamAveragesContainerRef} className="xl:self-start">
          <TeamAveragesPanel metrics={teamData.averages} />
        </div>
        <TeamCalendar
          items={teamData.items}
          className="xl:self-start"
          style={desktopScheduleHeight && teamData.averages.length > 0 ? { height: `${desktopScheduleHeight}px` } : undefined}
        />
        <EventCreatorPanel teamName={selectedTeam.name} className="xl:self-start" />
      </div>
    </div>
  );
}
