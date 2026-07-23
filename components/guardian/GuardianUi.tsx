'use client';

import Link from 'next/link';
import { AlertCircle, ArrowRight, Loader2, RefreshCw, UserRound } from 'lucide-react';
import { initials, statusLabel } from '@/lib/guardian/visibility';
import type { GuardianLinkedPlayer } from '@/lib/guardian/types';

export function GuardianPageHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1><p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-gray-400">{description}</p></div>
      {action}
    </header>
  );
}

export function GuardianLoading({ label = 'Loading Guardian information…' }: { label?: string }) {
  return <div className="glass-card flex min-h-52 items-center justify-center gap-3 p-8 text-sm text-gray-400"><Loader2 className="animate-spin text-[var(--accent-primary)]" size={20} />{label}</div>;
}

export function GuardianError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="glass-card border-[rgba(255,107,107,0.25)] p-6 text-center">
      <AlertCircle className="mx-auto text-[var(--status-red)]" size={28} />
      <h2 className="mt-3 text-base font-semibold text-white">Information unavailable</h2>
      <p className="mt-1 text-sm text-gray-400">{message}</p>
      {onRetry ? <button type="button" onClick={onRetry} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white"><RefreshCw size={15} />Try again</button> : null}
    </div>
  );
}

export function GuardianEmpty({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return <div className="glass-card p-8 text-center"><UserRound className="mx-auto text-gray-500" size={32} /><h2 className="mt-3 text-base font-semibold text-white">{title}</h2><p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-gray-400">{message}</p>{action}</div>;
}

export function PlayerAvatar({ name, large = false }: { name: string; large?: boolean }) {
  return <div aria-hidden className={`flex shrink-0 items-center justify-center rounded-full border border-[rgba(var(--accent-primary-rgb),0.3)] bg-[rgba(var(--accent-primary-rgb),0.12)] font-bold text-[var(--accent-primary)] ${large ? 'h-16 w-16 text-lg' : 'h-11 w-11 text-sm'}`}>{initials(name)}</div>;
}

export function StatusPill({ value }: { value: string }) {
  const positive = ['active', 'allowed', 'required', 'ready', 'going', 'did'].includes(value.toLowerCase());
  const warning = ['pending', 'attention', 'moderate caution'].includes(value.toLowerCase());
  const tone = positive ? 'border-[rgba(81,207,102,.3)] bg-[rgba(81,207,102,.1)] text-[var(--status-green)]' : warning ? 'border-[rgba(255,212,59,.3)] bg-[rgba(255,212,59,.1)] text-[var(--status-yellow)]' : 'border-white/10 bg-white/5 text-gray-300';
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>{statusLabel(value)}</span>;
}

export function PlayerFilter({ players, value, onChange, includeAll = true }: { players: GuardianLinkedPlayer[]; value: string; onChange: (value: string) => void; includeAll?: boolean }) {
  return (
    <label className="block min-w-0 sm:min-w-56">
      <span className="sr-only">Filter by linked player</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/15 bg-[rgb(var(--surface-shell-rgb))] px-3 text-sm font-medium text-white outline-none focus:border-[var(--accent-primary)]">
        {includeAll ? <option value="all">All linked players</option> : null}
        {players.map((player) => <option key={player.player_id} value={player.player_id}>{player.player_name}</option>)}
      </select>
    </label>
  );
}

export function PlayerCard({ player }: { player: GuardianLinkedPlayer }) {
  return (
    <article className="glass-card min-w-0 p-5">
      <div className="flex min-w-0 items-start gap-3"><PlayerAvatar name={player.player_name} /><div className="min-w-0 flex-1"><h2 className="truncate text-base font-semibold text-white">{player.player_name}</h2><p className="truncate text-xs text-gray-400">{player.team_name ?? 'No active team'}</p></div><StatusPill value={player.relationship_status} /></div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-white/10 bg-white/[.03] p-3"><dt className="text-gray-500">Readiness</dt><dd className="mt-1 font-semibold text-white">{player.readiness_category}</dd></div>
        <div className="rounded-xl border border-white/10 bg-white/[.03] p-3"><dt className="text-gray-500">Attendance</dt><dd className="mt-1 font-semibold text-white">{player.attendance_summary}</dd></div>
        <div className="rounded-xl border border-white/10 bg-white/[.03] p-3"><dt className="text-gray-500">Wellness today</dt><dd className="mt-1 font-semibold text-white">{player.wellness_completed_today ? 'Completed' : 'Not completed'}</dd></div>
        <div className="rounded-xl border border-white/10 bg-white/[.03] p-3"><dt className="text-gray-500">Training log</dt><dd className="mt-1 font-semibold text-white">{player.training_completed_today ? 'Completed' : 'Not completed'}</dd></div>
      </dl>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3"><p className="min-w-0 truncate text-xs text-gray-400">{player.upcoming_event_title ? `Next: ${player.upcoming_event_title}` : 'No upcoming event'}</p><Link href={`/guardian/children/${player.player_id}`} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--accent-primary)]">View <ArrowRight size={14} /></Link></div>
    </article>
  );
}

export function FutureAction({ children }: { children: React.ReactNode }) {
  return <button type="button" disabled title="Available in the future Guardian onboarding and account-request phase" className="min-h-11 rounded-xl border border-white/10 bg-white/[.03] px-4 text-sm font-semibold text-gray-500 disabled:cursor-not-allowed">{children} · Coming later</button>;
}
