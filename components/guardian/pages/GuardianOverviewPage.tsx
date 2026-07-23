'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, CalendarDays, Clock3, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { loadGuardianEvents, loadGuardianUpdates } from '@/lib/guardian/api';
import type { GuardianEvent, GuardianUpdate } from '@/lib/guardian/types';
import { useGuardian } from '../GuardianProvider';
import { GuardianEmpty, GuardianError, GuardianLoading, GuardianPageHeader, PlayerCard, PlayerFilter, StatusPill } from '../GuardianUi';

export function GuardianOverviewPage() {
  const { activePlayers, selectedPlayerId, setSelectedPlayerId, isLoading, error, refresh } = useGuardian();
  const [events, setEvents] = useState<GuardianEvent[]>([]);
  const [updates, setUpdates] = useState<GuardianUpdate[]>([]);
  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    if (isLoading || activePlayers.length === 0) return;
    void Promise.all([
      loadGuardianEvents(today, today, selectedPlayerId === 'all' ? undefined : selectedPlayerId),
      loadGuardianUpdates(),
    ]).then(([eventResult, updateResult]) => {
      setEvents(eventResult.data);
      setUpdates(updateResult.data.filter((item) => item.importance !== 'information').slice(0, 5));
    });
  }, [activePlayers.length, isLoading, selectedPlayerId, today]);

  const visiblePlayers = useMemo(() => selectedPlayerId === 'all' ? activePlayers : activePlayers.filter((player) => player.player_id === selectedPlayerId), [activePlayers, selectedPlayerId]);
  if (isLoading) return <GuardianLoading />;
  if (error) return <GuardianError message={error} onRetry={() => void refresh()} />;
  if (activePlayers.length === 0) return <div className="space-y-6"><GuardianPageHeader title="Guardian overview" description="Awareness, schedules, safety, and communication for linked players." /><GuardianEmpty title="No active linked players" message="There is no active Guardian-player relationship on this account. Pending and historical relationships remain visible on the Players page." /></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <GuardianPageHeader title="Guardian overview" description="A read-only view of today, readiness, attendance, and important changes across linked players." action={<PlayerFilter players={activePlayers} value={selectedPlayerId} onChange={setSelectedPlayerId} />} />

      <section aria-labelledby="today-heading">
        <div className="mb-3 flex items-center gap-2"><CalendarDays size={18} className="text-[var(--accent-primary)]" /><h2 id="today-heading" className="text-base font-semibold">Today</h2></div>
        {events.length === 0 ? <div className="glass-card p-5 text-sm text-gray-400">No Guardian-visible events are scheduled today.</div> : <div className="grid gap-3 lg:grid-cols-2">{events.map((event) => <article key={`${event.event_id}-${event.player_id}-${event.event_date}`} className={`glass-card p-4 ${event.is_cancelled ? 'border-[rgba(255,107,107,.3)]' : ''}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{event.title}</p><p className="mt-1 text-xs text-[var(--accent-primary)]">{event.player_name} · {event.team_name ?? 'Individual'}</p></div>{event.is_cancelled ? <StatusPill value="Cancelled" /> : event.is_changed ? <StatusPill value="Changed" /> : null}</div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-400"><span className="inline-flex items-center gap-1"><Clock3 size={13} />{event.start_time.includes('T') ? event.start_time.split('T')[1]?.slice(0, 5) : event.start_time}</span><span>RSVP: {event.rsvp_status ?? 'Pending'}</span><span>Attendance: {event.attendance_status ?? 'Not yet recorded'}</span>{event.description ? <span className="inline-flex items-center gap-1"><MapPin size={13} />{event.description}</span> : null}</div></article>)}</div>}
      </section>

      {events.some((event) => event.location) ? (
        <div className="glass-card flex flex-wrap gap-3 p-4 text-xs text-gray-300">
          {events.filter((event) => event.location).map((event) => (
            <span key={`location-${event.event_id}-${event.player_id}`} className="inline-flex items-center gap-1.5">
              <MapPin size={13} className="text-[var(--accent-primary)]" />{event.player_name}: {event.location}
            </span>
          ))}
        </div>
      ) : null}

      <section aria-labelledby="players-heading"><div className="mb-3 flex items-center justify-between"><h2 id="players-heading" className="text-base font-semibold">Linked player summary</h2><span className="text-xs text-gray-500">{visiblePlayers.length} shown</span></div><div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">{visiblePlayers.map((player) => <PlayerCard key={player.relationship_id} player={player} />)}</div></section>

      <section aria-labelledby="alerts-heading"><div className="mb-3 flex items-center gap-2"><Bell size={18} className="text-[var(--status-yellow)]" /><h2 id="alerts-heading" className="text-base font-semibold">Important alerts</h2></div><div className="glass-card divide-y divide-white/10 overflow-hidden">{updates.length === 0 && !visiblePlayers.some((player) => player.active_safety_flag) ? <p className="p-5 text-sm text-gray-400">No important Guardian-facing alerts.</p> : <>{visiblePlayers.filter((player) => player.active_safety_flag).map((player) => <div key={player.player_id} className="flex items-start gap-3 p-4"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--status-yellow)]" /><div><p className="text-sm font-semibold text-white">Safety information available</p><p className="mt-1 text-xs text-gray-400">Review the Safety page for {player.player_name}. Lodario does not provide a medical diagnosis.</p></div></div>)}{updates.map((update) => <div key={update.id} className="flex items-start gap-3 p-4"><Bell size={17} className="mt-0.5 shrink-0 text-[var(--accent-primary)]" /><div className="min-w-0"><p className="text-sm font-semibold text-white">{update.title}</p><p className="mt-1 line-clamp-2 text-xs text-gray-400">{update.message}</p></div><StatusPill value={update.importance} /></div>)}</>}</div></section>
    </div>
  );
}
