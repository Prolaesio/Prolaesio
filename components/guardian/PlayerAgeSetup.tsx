'use client';

import { useState } from 'react';
import { AlertCircle, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { AppLogo } from '@/components/AppLogo';
import { useAuth } from '@/lib/AuthContext';
import { createGuardianInvitation, setInitialPlayerAge, type PlayerAgeState } from '@/lib/guardian/onboarding';
import { CountryResidenceSelector } from '@/components/guardian/CountryResidenceSelector';

export function PlayerAgeSetup({ onComplete }: { onComplete: (state: PlayerAgeState) => void }) {
  const { user } = useAuth();
  const [stage, setStage] = useState<'age' | 'guardian'>('age');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [relationshipType, setRelationshipType] = useState<'parent' | 'legal_guardian' | 'authorised_guardian'>('parent');
  const [ageState, setAgeState] = useState<PlayerAgeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [developmentUrl, setDevelopmentUrl] = useState<string | null>(null);

  const saveAge = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null); setLoading(true);
    if (!countryCode) {
      setLoading(false);
      setError('Select your country of residence.');
      return;
    }
    const result = await setInitialPlayerAge(dateOfBirth, countryCode);
    setLoading(false);
    if (result.error || !result.data) { setError(result.error || 'Unable to save age information.'); return; }
    const next = { ...result.data, hasAgeIdentity: true } as PlayerAgeState;
    setAgeState(next);
    if (next.guardianConnectionRequired === true) setStage('guardian');
    else onComplete(next);
  };

  const sendInvitation = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null);
    if (!user || !ageState) return;
    setLoading(true);
    const result = await createGuardianInvitation({
      playerId: user.id, guardianEmail, guardianName, relationshipType, isPrimary: true,
      invitationType: ageState.ageBand === 'under_self_consent' ? 'under13_approval' : 'minor_overview',
    });
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    setDevelopmentUrl(result.data?.developmentPreviewUrl || null);
    onComplete({ ...ageState, restricted: ageState.guardianApprovalRequired, accountState: ageState.guardianApprovalRequired ? 'invitation_pending' : 'active' });
  };

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-10 text-white">
      <div className="mx-auto max-w-md">
        <AppLogo size={42} />
        <div className="glass-card mt-6 p-6">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[rgba(var(--accent-primary-rgb),0.15)]"><ShieldCheck className="text-[var(--accent-primary)]" /></div>
          {stage === 'age' ? (
            <form onSubmit={saveAge} className="space-y-4">
              <div><h1 className="text-2xl font-bold">Set up your Player account</h1><p className="mt-2 text-sm leading-relaxed text-gray-400">Your date of birth is kept private and is used only to apply the correct account and Guardian rules. Coaches and Guardians do not see it.</p></div>
              <label className="block text-sm font-medium">Date of birth<input required type="date" max={new Date().toISOString().slice(0,10)} value={dateOfBirth} onChange={e=>setDateOfBirth(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3" /></label>
              <CountryResidenceSelector value={countryCode} onChange={setCountryCode} />
              <Submit loading={loading} label="Continue" />
            </form>
          ) : (
            <form onSubmit={sendInvitation} className="space-y-4">
              <div><h1 className="text-2xl font-bold">Connect a Guardian</h1><p className="mt-2 text-sm leading-relaxed text-gray-400">{ageState?.fallbackUsed ? 'Based on the information provided, a parent or Guardian needs to be connected to this account. ' : 'A parent or Guardian needs to be connected to this account. '}{ageState?.guardianApprovalRequired ? 'Your account remains restricted until they approve it.' : 'You can continue using Lodario while the invitation is pending.'}</p></div>
              <label className="block text-sm font-medium">Guardian name<input required value={guardianName} onChange={e=>setGuardianName(e.target.value)} maxLength={80} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3" /></label>
              <label className="block text-sm font-medium">Guardian email<input required type="email" value={guardianEmail} onChange={e=>setGuardianEmail(e.target.value)} maxLength={254} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3" /></label>
              <label className="block text-sm font-medium">Relationship<select value={relationshipType} onChange={e=>setRelationshipType(e.target.value as typeof relationshipType)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#171817] p-3"><option value="parent">Parent</option><option value="legal_guardian">Legal Guardian</option><option value="authorised_guardian">Authorised Guardian</option></select></label>
              <Submit loading={loading} label="Send secure invitation" />
            </form>
          )}
          {error ? <p className="mt-4 flex gap-2 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300"><AlertCircle size={18} />{error}</p> : null}
          {developmentUrl ? <a className="mt-4 block break-all text-xs text-[var(--accent-primary)] underline" href={developmentUrl}>Development-only invitation preview</a> : null}
        </div>
      </div>
    </div>
  );
}

function Submit({ loading, label }: { loading: boolean; label: string }) {
  return <button disabled={loading} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-tertiary)] font-bold text-black disabled:opacity-60">{loading ? <Loader2 className="animate-spin" size={18} /> : <>{label}<ArrowRight size={18} /></>}</button>;
}
