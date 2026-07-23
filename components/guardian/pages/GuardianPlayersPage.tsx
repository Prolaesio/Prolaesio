'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useGuardian } from '../GuardianProvider';
import { FutureAction, GuardianEmpty, GuardianError, GuardianLoading, GuardianPageHeader, PlayerAvatar, StatusPill } from '../GuardianUi';
import { relationshipLabel } from '@/lib/guardian/visibility';

export function GuardianPlayersPage() {
  const { players, isLoading, error, refresh } = useGuardian();
  if (isLoading) return <GuardianLoading label="Loading linked-player relationships…" />;
  if (error) return <GuardianError message={error} onRetry={() => void refresh()} />;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <GuardianPageHeader title="Linked players" description="Current and historical Guardian-player relationships. Only active relationships grant access to sporting information." action={<FutureAction>Link another player</FutureAction>} />
      {players.length === 0 ? <GuardianEmpty title="No linked players" message="No Guardian-player relationships have been created for this account. The verified linking flow will be added separately." /> : <div className="grid gap-4 md:grid-cols-2">{players.map((player) => <article key={player.relationship_id} className="glass-card min-w-0 p-5"><div className="flex min-w-0 items-start gap-3"><PlayerAvatar name={player.player_name} /><div className="min-w-0 flex-1"><h2 className="truncate text-base font-semibold">{player.player_name}</h2><p className="truncate text-xs text-gray-400">{player.team_name ?? 'Player is not currently connected to a team'}</p></div><StatusPill value={player.relationship_status} /></div><dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2"><div><dt className="text-gray-500">Relationship</dt><dd className="mt-0.5 text-gray-200">{relationshipLabel(player.relationship_type)}{player.is_primary ? ' · Primary' : ' · Secondary'}</dd></div><div><dt className="text-gray-500">Access level</dt><dd className="mt-0.5 text-gray-200">{player.access_level}</dd></div><div><dt className="text-gray-500">Coach or club</dt><dd className="mt-0.5 text-gray-200">{player.coach_or_club ?? 'Not available'}</dd></div><div><dt className="text-gray-500">Date linked</dt><dd className="mt-0.5 text-gray-200">{player.linked_at ? new Date(player.linked_at).toLocaleDateString() : 'Not linked yet'}</dd></div></dl>{player.relationship_status === 'active' ? <Link href={`/guardian/children/${player.player_id}`} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[rgba(var(--accent-primary-rgb),.35)] bg-[rgba(var(--accent-primary-rgb),.1)] text-sm font-semibold text-[var(--accent-primary)]">View player overview <ArrowRight size={15} /></Link> : <div className="mt-4 rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs text-gray-400">{player.relationship_status === 'pending' ? 'This relationship is pending. Sporting information is not available.' : player.relationship_status === 'revoked' ? 'Access was revoked. Historical relationship information is retained without current player access.' : 'This relationship was removed and does not grant access.'}</div>}</article>)}</div>}
    </div>
  );
}
