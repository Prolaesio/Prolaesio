'use client';

import { useEffect, useState } from 'react';
import { Bell, CheckCheck, Eye } from 'lucide-react';
import { acknowledgeGuardianUpdate, loadGuardianUpdates, markGuardianUpdateRead } from '@/lib/guardian/api';
import type { GuardianUpdate } from '@/lib/guardian/types';
import { GuardianEmpty, GuardianError, GuardianLoading, GuardianPageHeader, StatusPill } from '../GuardianUi';

export function GuardianUpdatesPage() {
  const [updates, setUpdates] = useState<GuardianUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = async () => { setLoading(true); const result = await loadGuardianUpdates(); setUpdates(result.data); setError(result.error); setLoading(false); };
  useEffect(() => { void reload(); }, []);
  const act = async (id: string, acknowledge: boolean) => { const nextError = acknowledge ? await acknowledgeGuardianUpdate(id) : await markGuardianUpdateRead(id); if (nextError) setError(nextError); else await reload(); };
  if (loading) return <GuardianLoading label="Loading updates…" />;
  if (error && updates.length === 0) return <GuardianError message={error} onRetry={() => void reload()} />;
  return <div className="mx-auto max-w-5xl space-y-6"><GuardianPageHeader title="Updates" description="Guardian-facing announcements, schedule changes, safety notices, and relationship or permission updates." />{error ? <GuardianError message={error} /> : null}{updates.length === 0 ? <GuardianEmpty title="No updates" message="There are no Guardian-facing updates for this account." /> : <div className="space-y-3">{updates.map((update) => <article key={update.id} className={`glass-card p-5 ${!update.is_read ? 'border-[rgba(var(--accent-primary-rgb),.32)]' : ''}`}><div className="flex flex-col gap-3 sm:flex-row sm:items-start"><Bell size={19} className="mt-0.5 shrink-0 text-[var(--accent-primary)]" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{update.title}</h2><StatusPill value={update.importance} />{!update.is_read ? <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-primary)]">Unread</span> : null}</div><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">{update.message}</p><p className="mt-3 text-xs text-gray-500">{new Date(update.created_at).toLocaleString()} · {update.update_type.replaceAll('_', ' ')}</p></div><div className="flex shrink-0 flex-wrap gap-2">{!update.is_read ? <button type="button" onClick={() => void act(update.id, false)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-3 text-xs font-semibold"><Eye size={14} />Mark read</button> : null}{update.acknowledgement_required && !update.acknowledged_at ? <button type="button" onClick={() => void act(update.id, true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent-primary)] px-3 text-xs font-bold text-black"><CheckCheck size={14} />Acknowledge</button> : update.acknowledged_at ? <span className="inline-flex min-h-11 items-center gap-2 text-xs text-[var(--status-green)]"><CheckCheck size={14} />Acknowledged</span> : null}</div></div></article>)}</div>}</div>;
}
