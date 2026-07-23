'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDays, addMonths, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, X } from 'lucide-react';
import { loadGuardianEvents } from '@/lib/guardian/api';
import type { GuardianEvent } from '@/lib/guardian/types';
import { useGuardian } from '../GuardianProvider';
import { GuardianEmpty, GuardianError, GuardianLoading, GuardianPageHeader, PlayerFilter, StatusPill } from '../GuardianUi';

export function GuardianCalendarPage() {
  const { activePlayers, isLoading: playersLoading } = useGuardian();
  const [view, setView] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState(new Date());
  const [playerId, setPlayerId] = useState('all');
  const [teamId, setTeamId] = useState('all');
  const [typeId, setTypeId] = useState('all');
  const [events, setEvents] = useState<GuardianEvent[]>([]);
  const [selected, setSelected] = useState<GuardianEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const range = useMemo(() => {
    const fromDate = view === 'week' ? startOfWeek(anchor, { weekStartsOn: 1 }) : startOfMonth(anchor);
    const toDate = view === 'week' ? endOfWeek(anchor, { weekStartsOn: 1 }) : endOfMonth(anchor);
    const count = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
    return {
      fromDate,
      toDate,
      fromKey: format(fromDate, 'yyyy-MM-dd'),
      toKey: format(toDate, 'yyyy-MM-dd'),
      dates: Array.from({ length: count }, (_, index) => addDays(fromDate, index)),
    };
  }, [anchor, view]);
  useEffect(() => { if (playersLoading || activePlayers.length === 0) return; setLoading(true); void loadGuardianEvents(range.fromKey, range.toKey, playerId === 'all' ? undefined : playerId).then((result) => { setEvents(result.data); setError(result.error); setLoading(false); }); }, [activePlayers.length, playersLoading, playerId, range.fromKey, range.toKey]);
  const filtered = useMemo(() => events.filter((event) => (teamId === 'all' || event.team_id === teamId) && (typeId === 'all' || event.event_type_id === typeId)), [events, teamId, typeId]);
  const teams = Array.from(new Map(activePlayers.filter((p) => p.team_id).map((p) => [p.team_id!, p.team_name ?? 'Team'])).entries());
  const types = Array.from(new Set(events.map((event) => event.event_type_id)));
  if (playersLoading) return <GuardianLoading />;
  if (!activePlayers.length) return <GuardianEmpty title="No active player calendars" message="An active linked-player relationship is required before calendar events can be shown." />;
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <GuardianPageHeader title="Calendar" description="Read-only schedules across linked players. Personal events appear only when the relationship permission allows them." />
      {selected?.location ? <div className="glass-card flex items-center gap-2 p-3 text-sm text-gray-300"><MapPin size={15} className="text-[var(--accent-primary)]" />{selected.location}</div> : null}
      <div className="glass-card space-y-3 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex gap-2"><button type="button" onClick={() => setView('week')} className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${view === 'week' ? 'bg-[var(--accent-primary)] text-black' : 'border border-white/10 text-gray-300'}`}>Week</button><button type="button" onClick={() => setView('month')} className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${view === 'month' ? 'bg-[var(--accent-primary)] text-black' : 'border border-white/10 text-gray-300'}`}>Month</button></div><div className="flex items-center gap-2"><button type="button" onClick={() => setAnchor(view === 'week' ? addDays(anchor, -7) : addMonths(anchor, -1))} className="min-h-11 min-w-11 rounded-xl border border-white/10" aria-label="Previous period"><ChevronLeft className="mx-auto" size={18} /></button><p className="min-w-36 text-center text-sm font-semibold">{format(range.fromDate, 'd MMM')} – {format(range.toDate, 'd MMM yyyy')}</p><button type="button" onClick={() => setAnchor(view === 'week' ? addDays(anchor, 7) : addMonths(anchor, 1))} className="min-h-11 min-w-11 rounded-xl border border-white/10" aria-label="Next period"><ChevronRight className="mx-auto" size={18} /></button></div></div><div className="grid gap-2 sm:grid-cols-3"><PlayerFilter players={activePlayers} value={playerId} onChange={setPlayerId} /><select value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label="Filter by team" className="min-h-11 rounded-xl border border-white/15 bg-[rgb(var(--surface-shell-rgb))] px-3 text-sm"><option value="all">All teams</option>{teams.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><select value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-label="Filter by event type" className="min-h-11 rounded-xl border border-white/15 bg-[rgb(var(--surface-shell-rgb))] px-3 text-sm"><option value="all">All event types</option>{types.map((type) => <option key={type} value={type}>{type.replaceAll('-', ' ')}</option>)}</select></div></div>
      {loading ? <GuardianLoading label="Loading calendar…" /> : error ? <GuardianError message={error} /> : <div className={`grid gap-3 ${view === 'week' ? 'md:grid-cols-2 xl:grid-cols-7' : 'sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7'}`}>{range.dates.map((date) => { const key = format(date, 'yyyy-MM-dd'); const dayEvents = filtered.filter((event) => event.event_date === key); return <section key={key} className="glass-card min-h-32 min-w-0 p-3"><div className="flex items-baseline justify-between"><h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{format(date, view === 'week' ? 'EEE' : 'EEE d')}</h2>{view === 'week' ? <span className="text-lg font-bold">{format(date, 'd')}</span> : null}</div><div className="mt-3 space-y-2">{dayEvents.map((event) => <button type="button" onClick={() => setSelected(event)} key={`${event.event_id}-${event.player_id}`} className={`w-full min-w-0 rounded-lg border p-2 text-left ${event.is_cancelled ? 'border-[rgba(255,107,107,.25)] bg-[rgba(255,107,107,.07)]' : 'border-[rgba(var(--accent-primary-rgb),.22)] bg-[rgba(var(--accent-primary-rgb),.07)]'}`}><p className="truncate text-xs font-semibold">{event.title}</p><p className="mt-1 truncate text-[10px] text-[var(--accent-primary)]">{event.player_name}</p><p className="mt-1 text-[10px] text-gray-500">{event.start_time.split('T')[1]?.slice(0,5) ?? event.start_time}</p></button>)}{!dayEvents.length ? <p className="text-[11px] text-gray-600">No events</p> : null}</div></section>; })}</div>}
      {selected ? <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Event details"><button className="absolute inset-0" onClick={() => setSelected(null)} aria-label="Close event details" /><article className="relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/15 bg-[rgb(var(--surface-shell-rgb))] p-5 shadow-2xl sm:rounded-2xl"><button type="button" onClick={() => setSelected(null)} className="absolute right-3 top-3 min-h-11 min-w-11 rounded-xl p-2 text-gray-400" aria-label="Close"><X className="mx-auto" size={18} /></button><CalendarDays className="text-[var(--accent-primary)]" size={22} /><h2 className="mt-3 pr-10 text-lg font-semibold">{selected.title}</h2><p className="mt-1 text-sm text-[var(--accent-primary)]">{selected.player_name} · {selected.team_name ?? 'Individual'}</p><div className="mt-4 space-y-2 text-sm text-gray-300"><p className="flex items-center gap-2"><Clock3 size={15} />{selected.event_date} · {selected.start_time.split('T')[1]?.slice(0,5)}–{selected.end_time.split('T')[1]?.slice(0,5)}</p>{selected.description ? <p className="flex items-start gap-2"><MapPin className="mt-0.5 shrink-0" size={15} />{selected.description}</p> : null}<p>RSVP: {selected.rsvp_status ?? 'Pending'}</p><p>Attendance: {selected.attendance_status ?? 'Not yet recorded'}</p></div><div className="mt-4 flex gap-2">{selected.is_cancelled ? <StatusPill value="Cancelled" /> : null}{selected.is_changed ? <StatusPill value="Changed" /> : null}</div><p className="mt-5 border-t border-white/10 pt-3 text-xs text-gray-500">Guardian calendars are read-only.</p></article></div> : null}
    </div>
  );
}
