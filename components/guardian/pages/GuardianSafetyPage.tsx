'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { loadGuardianUpdates, loadPlayerOverview } from '@/lib/guardian/api';
import type { GuardianPlayerOverview, GuardianUpdate } from '@/lib/guardian/types';
import { useGuardian } from '../GuardianProvider';
import { GuardianEmpty, GuardianError, GuardianLoading, GuardianPageHeader, StatusPill } from '../GuardianUi';

export function GuardianSafetyPage() {
  const { activePlayers, isLoading, error } = useGuardian();
  const [overviews, setOverviews] = useState<Array<{ name: string; overview: GuardianPlayerOverview }>>([]);
  const [notices, setNotices] = useState<GuardianUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isLoading) return;
    setLoading(true);
    void Promise.all([
      Promise.all(activePlayers.map(async (player) => ({ name: player.player_name, result: await loadPlayerOverview(player.player_id) }))),
      loadGuardianUpdates(),
    ]).then(([results, updateResult]) => {
      setOverviews(results
        .filter((item): item is { name: string; result: { data: GuardianPlayerOverview; error: string | null } } => Boolean(item.result.data))
        .map((item) => ({ name: item.name, overview: item.result.data })));
      setNotices(updateResult.data.filter((item) => item.update_type === 'safety_alert'));
      setLoading(false);
    });
  }, [activePlayers, isLoading]);

  if (isLoading || loading) return <GuardianLoading label="Loading Guardian-visible safety information…" />;
  if (error) return <GuardianError message={error} />;

  const alerts = overviews.flatMap(({ name, overview }) => (overview.safety ?? []).map((alert) => ({ name, alert })));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <GuardianPageHeader title="Safety" description="Important, non-diagnostic sporting and wellness information across linked players." />
      <div className="rounded-2xl border border-[rgba(var(--accent-primary-rgb),.25)] bg-[rgba(var(--accent-primary-rgb),.07)] p-4 text-sm leading-relaxed text-gray-300">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-[var(--accent-primary)]" size={20} /><p>Lodario provides general sporting and wellness information and is not a medical diagnosis service. Seek qualified medical advice when an injury or symptom needs assessment.</p></div>
      </div>
      {alerts.length === 0 && notices.length === 0 ? (
        <GuardianEmpty title="No active Guardian-visible safety alerts" message="No current injury, high-pain, readiness, or coach safety notice is available under your relationship permissions." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {alerts.map(({ name, alert }) => (
            <article key={alert.id} className="glass-card border-[rgba(255,212,59,.22)] p-5">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[var(--accent-primary)]">{name}</p><h2 className="mt-1 text-base font-semibold">Active safety information</h2></div><StatusPill value={alert.severity ?? 'Attention'} /></div>
              <dl className="mt-4 space-y-2 text-sm">
                <div><dt className="text-xs text-gray-500">Reported</dt><dd>{new Date(alert.dateReported).toLocaleString()}</dd></div>
                <div><dt className="text-xs text-gray-500">Current status</dt><dd>{alert.status}</dd></div>
                {alert.severity ? <div><dt className="text-xs text-gray-500">Pain severity</dt><dd>{alert.severity}</dd></div> : null}
                {alert.bodyArea ? <div><dt className="text-xs text-gray-500">General body area</dt><dd>{alert.bodyArea}</dd></div> : null}
                <div><dt className="text-xs text-gray-500">General recommendation</dt><dd>{alert.recommendation}</dd></div>
              </dl>
            </article>
          ))}
          {notices.map((notice) => (
            <article key={notice.id} className="glass-card p-5">
              <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-[var(--status-yellow)]" size={19} /><div><div className="flex flex-wrap gap-2"><h2 className="text-sm font-semibold">{notice.title}</h2><StatusPill value={notice.importance} /></div><p className="mt-2 text-sm text-gray-300">{notice.message}</p><p className="mt-3 text-xs text-gray-500">{new Date(notice.created_at).toLocaleString()}{notice.acknowledgement_required ? ' · Acknowledgement required in Updates' : ''}</p></div></div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
