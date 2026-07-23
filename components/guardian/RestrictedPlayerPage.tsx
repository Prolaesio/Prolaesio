'use client';

import { useState } from 'react';
import { Clock3, Loader2, LogOut, Mail, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { createGuardianInvitation, manageGuardianInvitation, type PlayerAgeState } from '@/lib/guardian/onboarding';

export function RestrictedPlayerPage({ state, onRefresh }: { state: PlayerAgeState; onRefresh: () => void }) {
  const { user, signOut } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [guardianName, setGuardianName] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const pending = state.pendingInvitation;
  const resend = async () => {
    if (!pending) return; setLoading(true); setMessage(null);
    const result = await manageGuardianInvitation('resend', pending.id);
    setLoading(false); setMessage(result.error || 'Invitation sent again.');
  };
  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setLoading(true); setMessage(null);
    const result = await createGuardianInvitation({ playerId: user.id, guardianEmail, guardianName, relationshipType: 'parent', isPrimary: true, invitationType: 'under13_approval' });
    setLoading(false); setMessage(result.error || result.data?.warning || 'Secure Guardian invitation sent.');
    if (!result.error) onRefresh();
  };
  return <div className="min-h-screen bg-[var(--background)] px-4 py-12 text-white"><div className="glass-card mx-auto max-w-md p-7 text-center">
    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-400/10"><ShieldAlert className="text-amber-300" size={30}/></div>
    <h1 className="mt-5 text-2xl font-bold">Guardian approval needed</h1>
    <p className="mt-3 text-sm leading-relaxed text-gray-400">This Player account is safely restricted while the Guardian connection is completed. Wellness, training, injury notes, personal calendar events, and AI features cannot be submitted yet.</p>
    <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left text-sm"><p className="flex items-center gap-2 font-semibold"><Clock3 size={17}/>Status: {state.accountState.replaceAll('_',' ')}</p>{pending ? <p className="mt-2 flex items-center gap-2 text-gray-400"><Mail size={17}/>{pending.guardianEmail}</p> : null}</div>
    {!pending ? <form onSubmit={invite} className="mt-5 space-y-3 text-left"><p className="text-sm font-semibold">Send the required Guardian invitation</p><input required value={guardianName} onChange={event=>setGuardianName(event.target.value)} placeholder="Guardian name" className="w-full rounded-xl border border-white/10 bg-black/30 p-3"/><input required type="email" value={guardianEmail} onChange={event=>setGuardianEmail(event.target.value)} placeholder="Guardian email" className="w-full rounded-xl border border-white/10 bg-black/30 p-3"/><button disabled={loading} className="min-h-11 w-full rounded-xl bg-[var(--accent-primary)] font-bold text-black">{loading?<Loader2 className="mx-auto animate-spin"/>:'Send secure invitation'}</button></form> : null}
    {message ? <p className="mt-4 text-sm text-gray-300">{message}</p> : null}
    <div className="mt-6 grid gap-3"><button onClick={onRefresh} className="min-h-11 rounded-xl bg-[var(--accent-primary)] font-bold text-black">Check approval status</button>{pending ? <button onClick={resend} disabled={loading} className="min-h-11 rounded-xl border border-white/15 font-semibold">{loading ? <Loader2 className="mx-auto animate-spin"/> : 'Resend invitation'}</button> : null}<button onClick={signOut} className="flex min-h-11 items-center justify-center gap-2 text-sm text-gray-400"><LogOut size={16}/>Sign out</button></div>
  </div></div>;
}
