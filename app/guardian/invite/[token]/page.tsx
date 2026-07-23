'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { AppLogo } from '@/components/AppLogo';
import { useAuth } from '@/lib/AuthContext';
import { acceptGuardianInvitation, decidePlayerAccount, previewGuardianInvitation, type InvitationPreview } from '@/lib/guardian/onboarding';

export default function GuardianInvitationPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { user, signIn, signUp, signOut, refreshUserRoles, switchRole } = useAuth();
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [mode, setMode] = useState<'signin'|'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authority, setAuthority] = useState(false);
  const [accepted, setAccepted] = useState<{ invitationId: string; requiresApproval: boolean; requiresReview: boolean } | null>(null);
  const [optional, setOptional] = useState({ product_research: false, marketing: false, optional_analytics: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { void (async () => {
    const result = await previewGuardianInvitation(token);
    setPreview(result.data); setEmail(result.data?.guardianEmail || ''); setDisplayName(result.data?.guardianName || ''); setError(result.error); setLoading(false);
  })(); }, [token]);

  useEffect(() => {
    if (!user || !preview?.valid || user.email?.toLowerCase() !== preview.guardianEmail?.toLowerCase()) return;
    if ((preview.status === 'accepted' || preview.status === 'review_required') && preview.invitationId) {
      setAccepted({ invitationId: preview.invitationId, requiresApproval: preview.consentRequired === true, requiresReview: preview.status === 'review_required' });
    } else if (preview.status === 'approved') {
      setDone('This invitation was already completed.');
    }
  }, [preview, user]);

  const authenticate = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null); setLoading(true);
    const result = mode === 'signin' ? await signIn(email,password) : await signUp(email,password,'guardian');
    setLoading(false);
    if (result.error) setError(result.error);
    else if (mode === 'signup') setNotice('Account created. If email confirmation is enabled, verify your email, then return to this secure link and sign in.');
  };

  const accept = async () => {
    setLoading(true); setError(null);
    const result = await acceptGuardianInvitation(token,displayName,authority);
    setLoading(false);
    if (result.error || !result.data) { setError(result.error || 'Unable to accept the invitation.'); return; }
    setAccepted(result.data); await refreshUserRoles();
    if (!result.data.requiresApproval) setDone('The Guardian relationship is active.');
  };

  const decide = async (approve: boolean) => {
    if (!accepted) return; setLoading(true); setError(null);
    const result = await decidePlayerAccount(accepted.invitationId,approve,optional);
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    setDone(approve ? 'The Player account is approved and active.' : 'The Player account was not approved. The relationship is closed.');
    await refreshUserRoles();
  };

  const openGuardian = async () => {
    const result = await switchRole('guardian');
    if (result.error) { setError(result.error); return; }
    router.replace('/guardian'); router.refresh();
  };

  if (loading && !preview) return <Centered><Loader2 className="animate-spin text-[var(--accent-primary)]" size={34}/></Centered>;
  if (!preview?.valid) return <Centered><Card><AlertCircle className="text-red-300" size={34}/><h1 className="mt-4 text-2xl font-bold">Invitation unavailable</h1><p className="mt-2 text-sm text-gray-400">This link is {preview?.reason || 'invalid'}. Ask the Player or Coach to send a new invitation.</p></Card></Centered>;

  const emailMismatch = user?.email && user.email.toLowerCase() !== preview.guardianEmail?.toLowerCase();
  return <Centered><div className="w-full max-w-lg"><AppLogo size={40}/><Card>
    <ShieldCheck className="text-[var(--accent-primary)]" size={38}/><p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent-primary)]">Secure Guardian invitation</p>
    <h1 className="mt-2 text-2xl font-bold">Connect with {preview.playerName}</h1>
    <p className="mt-3 text-sm leading-relaxed text-gray-400">This creates a limited, read-only Guardian overview. Private notes, raw wellness answers, medical records, and AI conversations are not shared.</p>
    {!user ? <form onSubmit={authenticate} className="mt-6 space-y-3">
      <div className="grid grid-cols-2 rounded-xl bg-white/[0.04] p-1"><button type="button" onClick={()=>setMode('signin')} className={`rounded-lg py-2 text-sm ${mode==='signin'?'bg-white/10 font-bold':''}`}>Sign in</button><button type="button" onClick={()=>setMode('signup')} className={`rounded-lg py-2 text-sm ${mode==='signup'?'bg-white/10 font-bold':''}`}>Create account</button></div>
      <input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Invited email" className="w-full rounded-xl border border-white/10 bg-black/30 p-3"/>
      <input required minLength={6} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" className="w-full rounded-xl border border-white/10 bg-black/30 p-3"/>
      <button disabled={loading} className="min-h-12 w-full rounded-xl bg-[var(--accent-primary)] font-bold text-black">{loading?<Loader2 className="mx-auto animate-spin"/>:mode==='signin'?'Sign in securely':'Create Guardian account'}</button>
    </form> : emailMismatch ? <div className="mt-6 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm"><p className="font-bold text-amber-200">Wrong signed-in email</p><p className="mt-1 text-gray-300">This link was sent to {preview.guardianEmail}. You are signed in as {user.email}.</p><button onClick={signOut} className="mt-3 font-bold text-[var(--accent-primary)]">Sign out and use the invited email</button></div> : !accepted && !done ? <div className="mt-6 space-y-4">
      <label className="block text-sm font-medium">Your name<input required value={displayName} onChange={e=>setDisplayName(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3"/></label>
      <label className="flex items-start gap-3 rounded-xl border border-white/10 p-4 text-sm leading-relaxed"><input type="checkbox" checked={authority} onChange={e=>setAuthority(e.target.checked)} className="mt-1"/><span>I confirm I am an adult and I am authorised to act as this Player’s {preview.relationshipType?.replaceAll('_',' ')}.</span></label>
      <button onClick={accept} disabled={!authority||!displayName.trim()||loading} className="min-h-12 w-full rounded-xl bg-[var(--accent-primary)] font-bold text-black disabled:opacity-50">Accept invitation</button>
    </div> : accepted?.requiresReview ? <p className="mt-6 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm">Your verification requires support review. The Player account remains restricted.</p> : accepted?.requiresApproval && !done ? <div className="mt-6 space-y-4"><div className="rounded-xl border border-white/10 p-4"><h2 className="font-bold">Required account approval</h2><p className="mt-1 text-sm text-gray-400">Approve the Player account and required Guardian relationship, or reject it. Optional choices below are separate and can remain off.</p></div>{Object.entries(optional).map(([key,value])=><label key={key} className="flex items-center justify-between gap-4 text-sm"><span>{key.replaceAll('_',' ')}</span><input type="checkbox" checked={value} onChange={e=>setOptional(current=>({...current,[key]:e.target.checked}))}/></label>)}<div className="grid grid-cols-2 gap-3"><button onClick={()=>decide(false)} className="min-h-12 rounded-xl border border-red-300/30 text-red-200">Reject</button><button onClick={()=>decide(true)} className="min-h-12 rounded-xl bg-[var(--accent-primary)] font-bold text-black">Approve account</button></div></div> : null}
    {done ? <div className="mt-6 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-4"><p className="flex items-center gap-2 font-bold text-emerald-200"><CheckCircle2 size={19}/>Completed</p><p className="mt-2 text-sm text-gray-300">{done}</p>{user ? <button onClick={openGuardian} className="mt-4 min-h-11 w-full rounded-xl bg-[var(--accent-primary)] font-bold text-black">Open Guardian workspace</button> : null}</div> : null}
    {notice ? <p className="mt-4 rounded-xl border border-sky-300/20 bg-sky-300/10 p-3 text-sm text-sky-100">{notice}</p> : null}
    {error ? <p className="mt-4 rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-200">{error}</p> : null}
  </Card></div></Centered>;
}

function Centered({children}:{children:React.ReactNode}) { return <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-10 text-white">{children}</main>; }
function Card({children}:{children:React.ReactNode}) { return <div className="glass-card mt-5 p-6 sm:p-8">{children}</div>; }
