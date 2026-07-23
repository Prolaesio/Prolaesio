'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, CakeSlice, CalendarDays, CheckCircle2, ChevronLeft, Clock3, CreditCard, ShieldAlert } from 'lucide-react';
import { loadGuardianBillingSummary, loadGuardianPlayerProfileSummary, loadPlayerOverview } from '@/lib/guardian/api';
import type { GuardianBillingSummary, GuardianPlayerOverview, GuardianPlayerProfileSummary } from '@/lib/guardian/types';
import { relationshipLabel } from '@/lib/guardian/visibility';
import { GuardianEmpty, GuardianError, GuardianLoading, PlayerAvatar, StatusPill } from '../GuardianUi';

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Activity; children: React.ReactNode }) {
  return <section className="glass-card p-5"><div className="mb-4 flex items-center gap-2"><Icon size={17} className="text-[var(--accent-primary)]" /><h2 className="text-sm font-semibold">{title}</h2></div>{children}</section>;
}

export function GuardianPlayerDetailPage({ playerId }: { playerId: string }) {
  const [data, setData] = useState<GuardianPlayerOverview | null>(null);
  const [billing, setBilling] = useState<GuardianBillingSummary | null>(null);
  const [profileSummary, setProfileSummary] = useState<GuardianPlayerProfileSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setLoading(true);
    void Promise.all([
      loadPlayerOverview(playerId),
      loadGuardianBillingSummary(playerId),
      loadGuardianPlayerProfileSummary(playerId),
    ]).then(([overviewResult, billingResult, profileResult]) => {
      setData(overviewResult.data);
      setBilling(billingResult.error ? null : billingResult.data);
      setProfileSummary(profileResult.error ? null : profileResult.data);
      setError(overviewResult.error);
      setLoading(false);
    });
  }, [playerId]);
  if (loading) return <GuardianLoading label="Loading the player overview…" />;
  if (error) return <GuardianError message={error.includes('Linked player not found') ? 'This player is not linked to your Guardian account. The URL does not grant access.' : error} />;
  if (!data) return <GuardianEmpty title="Player unavailable" message="No Guardian-visible player information was returned." />;
  const active = data.relationship.status === 'active';
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href="/guardian/children" className="inline-flex min-h-11 items-center gap-1 text-sm text-gray-400 hover:text-white"><ChevronLeft size={16} />Linked players</Link>
      <header className="glass-card p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><PlayerAvatar name={data.player.name} large /><div className="min-w-0 flex-1"><h1 className="truncate text-2xl font-bold">{data.player.name}</h1><p className="mt-1 text-sm text-gray-400">{data.player.teamName ?? 'No active team'}{data.player.positions.length ? ` · ${data.player.positions.join(', ')}` : ''}</p><p className="mt-1 text-xs text-gray-500">{relationshipLabel(data.relationship.type)} · {data.relationship.isPrimary ? 'Primary' : 'Secondary'} guardian</p></div><StatusPill value={data.relationship.status} /></div></header>
      {!active ? <GuardianEmpty title={`${data.relationship.status} relationship`} message="This relationship does not grant current access to sporting information. Direct URL access remains blocked." /> : <div className="grid gap-4 lg:grid-cols-2">
        {profileSummary ? (
          <Section title="Player profile" icon={CakeSlice}>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-gray-500">Date of birth</dt><dd className="mt-1 font-semibold">{new Date(`${profileSummary.dateOfBirth}T12:00:00`).toLocaleDateString()}</dd></div>
              <div><dt className="text-xs text-gray-500">Age</dt><dd className="mt-1 font-semibold">{profileSummary.age}</dd></div>
              <div><dt className="text-xs text-gray-500">Residence policy</dt><dd className="mt-1 font-semibold">{profileSummary.countryCode}</dd></div>
            </dl>
          </Section>
        ) : null}
        <Section title="Readiness overview" icon={Activity}>{data.readiness ? <div><div className="flex items-center justify-between gap-3"><StatusPill value={data.readiness.category} />{data.readiness.score !== null ? <span className="text-2xl font-bold text-[var(--accent-primary)]">{data.readiness.score}</span> : <span className="text-xs text-gray-500">Score not shared</span>}</div><p className="mt-4 text-sm text-gray-300">{data.readiness.recommendation}</p><p className="mt-2 text-xs text-gray-500">Latest wellness: {data.readiness.latestWellnessDate ?? 'No completed entry'}</p></div> : <p className="text-sm text-gray-400">You do not have permission to view readiness information.</p>}</Section>
        <Section title="Wellness completion" icon={CheckCircle2}>{data.wellness ? <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-gray-500">Today</dt><dd className="mt-1 font-semibold">{data.wellness.completedToday ? 'Completed' : 'Not completed'}</dd></div><div><dt className="text-xs text-gray-500">Last 7 days</dt><dd className="mt-1 font-semibold">{data.wellness.completedLast7Days} of 7</dd></div><div className="col-span-2"><dt className="text-xs text-gray-500">Safety threshold</dt><dd className="mt-1 font-semibold">{data.wellness.safetyThresholdTriggered ? 'Review Safety page' : 'No recent threshold shown'}</dd></div>{data.wellness.summary ? <p className="col-span-2 text-xs text-gray-400">{data.wellness.summary}</p> : null}</dl> : <p className="text-sm text-gray-400">Wellness completion is not available under this permission set.</p>}</Section>
        <Section title="Training overview" icon={Clock3}>{data.training ? <><div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-white/[.03] p-3"><p className="text-lg font-bold">{data.training.sessionsLast7Days}</p><p className="text-[10px] text-gray-500">Sessions</p></div><div className="rounded-xl bg-white/[.03] p-3"><p className="text-lg font-bold">{data.training.minutesLast7Days}</p><p className="text-[10px] text-gray-500">Minutes</p></div><div className="rounded-xl bg-white/[.03] p-3"><p className="truncate text-xs font-bold">{data.training.trend}</p><p className="text-[10px] text-gray-500">Load trend</p></div></div><div className="mt-3 space-y-2">{data.training.recentSessions.map((session) => <div key={`${session.date}-${session.sessionType}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 p-3 text-xs"><span className="min-w-0 truncate">{session.sessionType} · {session.duration} min</span><span className="text-gray-400">{session.intensity}</span></div>)}</div></> : <p className="text-sm text-gray-400">Training details are not available under this permission set.</p>}</Section>
        <Section title="Attendance and RSVP" icon={CalendarDays}>{data.attendance ? data.attendance.length ? <div className="space-y-2">{data.attendance.map((item) => <div key={item.date} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 p-3 text-xs"><span>{new Date(`${item.date}T12:00:00`).toLocaleDateString()}</span><span>Attendance: {item.attendanceStatus ?? 'Not yet recorded'}</span><span>RSVP: {item.rsvpStatus ?? 'Pending'}</span></div>)}</div> : <p className="text-sm text-gray-400">No recent attendance records.</p> : <p className="text-sm text-gray-400">Attendance is not available under this permission set.</p>}</Section>
        {billing?.enabled ? (
          <Section title="Billing" icon={CreditCard}>
            {billing.available ? (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-gray-500">Plan</dt><dd className="mt-1 font-semibold">{billing.planName ?? 'Lodario'}</dd></div>
                <div><dt className="text-xs text-gray-500">Status</dt><dd className="mt-1 font-semibold capitalize">{billing.billingStatus?.replaceAll('_', ' ') ?? 'Not configured'}</dd></div>
                {billing.cardLast4 ? <div><dt className="text-xs text-gray-500">Payment card</dt><dd className="mt-1 font-semibold">{billing.cardBrand ?? 'Card'} · {billing.maskedCard ?? `•••• ${billing.cardLast4}`}</dd></div> : null}
                {billing.cardExpMonth && billing.cardExpYear ? <div><dt className="text-xs text-gray-500">Expires</dt><dd className="mt-1 font-semibold">{String(billing.cardExpMonth).padStart(2, '0')}/{String(billing.cardExpYear).slice(-2)}</dd></div> : null}
              </dl>
            ) : <p className="text-sm text-gray-400">{billing.message ?? 'No billing method is connected to this Player.'}</p>}
            <p className="mt-3 text-xs text-gray-500">Only the card brand, expiry, and last four digits are shown. Lodario never displays the full card number or security code.</p>
          </Section>
        ) : null}
        <section className="glass-card p-5 lg:col-span-2"><div className="mb-4 flex items-center gap-2"><ShieldAlert size={17} className="text-[var(--status-yellow)]" /><h2 className="text-sm font-semibold">Safety</h2></div>{data.safety ? data.safety.length ? <div className="grid gap-3 md:grid-cols-2">{data.safety.map((alert) => <article key={alert.id} className="rounded-xl border border-[rgba(255,212,59,.2)] bg-[rgba(255,212,59,.05)] p-4"><div className="flex justify-between gap-3"><StatusPill value={alert.status} /><span className="text-xs text-gray-500">{new Date(alert.dateReported).toLocaleDateString()}</span></div><p className="mt-3 text-sm text-gray-300">{alert.recommendation}</p>{alert.bodyArea ? <p className="mt-2 text-xs text-gray-400">General body area: {alert.bodyArea}</p> : null}</article>)}</div> : <p className="text-sm text-gray-400">No active Guardian-visible injury alerts.</p> : <p className="text-sm text-gray-400">Safety information is not available under this permission set.</p>}<p className="mt-4 border-t border-white/10 pt-3 text-xs leading-relaxed text-gray-500">Lodario provides general sporting and wellness information. It does not diagnose injuries or replace a qualified medical professional.</p></section>
      </div>}
    </div>
  );
}
