'use client';

import { useEffect, useMemo, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { loadGuardianPermissions } from '@/lib/guardian/api';
import type { GuardianPermission } from '@/lib/guardian/types';
import { FutureAction, GuardianEmpty, GuardianError, GuardianLoading, GuardianPageHeader, StatusPill } from '../GuardianUi';

export function GuardianPermissionsPage() {
  const [permissions, setPermissions] = useState<GuardianPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void loadGuardianPermissions().then((result) => { setPermissions(result.data); setError(result.error); setLoading(false); }); }, []);
  const players = useMemo(() => Array.from(new Map(permissions.map((item) => [item.player_id, item.player_name])).entries()), [permissions]);
  if (loading) return <GuardianLoading label="Loading relationship permissions…" />;
  if (error) return <GuardianError message={error} />;
  return <div className="mx-auto max-w-6xl space-y-6"><GuardianPageHeader title="Permissions and access" description="A transparent, relationship-specific view of what this Guardian account may see. Permissions cannot be escalated here." action={<FutureAction>Request additional access</FutureAction>} />{players.length === 0 ? <GuardianEmpty title="No relationship permissions" message="Permissions will appear after a Guardian-player relationship is created." /> : players.map(([playerId, playerName]) => { const rows = permissions.filter((item) => item.player_id === playerId); const status = rows[0]?.relationship_status ?? 'pending'; return <section key={playerId} className="glass-card overflow-hidden"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5"><div><h2 className="text-base font-semibold">{playerName}</h2><p className="mt-1 text-xs text-gray-500">Relationship-specific access</p></div><StatusPill value={status} /></header><div className="grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-3">{rows.map((permission) => <article key={permission.permission_key} className="min-w-0 bg-[var(--surface-shell)] p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[10px] uppercase tracking-wide text-gray-500">{permission.category}</p><h3 className="mt-1 text-sm font-semibold">{permission.label}</h3></div><StatusPill value={permission.state} /></div><p className="mt-2 text-xs leading-relaxed text-gray-400">{permission.description}</p><p className="mt-3 inline-flex items-center gap-1 text-[10px] text-gray-500"><LockKeyhole size={11} />Controlled by {permission.controlled_by}</p></article>)}</div><div className="flex flex-wrap gap-2 border-t border-white/10 p-4"><FutureAction>Review consent</FutureAction><FutureAction>Withdraw optional access</FutureAction><FutureAction>Remove relationship</FutureAction></div></section>; })}</div>;
}
