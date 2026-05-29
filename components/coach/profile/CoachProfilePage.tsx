'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, LogOut, Mail, ShieldCheck, UserCircle2, Users } from 'lucide-react';
import { useCoachTeam } from '@/lib/coach/selectedTeam';
import { useAuth } from '@/lib/AuthContext';

function resolveDisplayName(userEmail: string | undefined, metadataName: unknown): string {
  if (typeof metadataName === 'string' && metadataName.trim()) {
    return metadataName.trim();
  }

  if (!userEmail) return 'Coach';
  const localPart = userEmail.split('@')[0] ?? 'coach';
  return localPart
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatMemberSince(createdAt?: string): string {
  if (!createdAt) return '--';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function CoachProfilePage() {
  const { teams } = useCoachTeam();
  const { user, userRole, signOut, updateDisplayName, updateEmail } = useAuth();

  const accountEmail = user?.email ?? '';
  const accountName = resolveDisplayName(accountEmail, user?.user_metadata?.full_name);
  const connectedTeams = teams.length;
  const totalPlayersCoached = 0;
  const initials = accountName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const [fullNameInput, setFullNameInput] = useState(accountName);
  const [emailInput, setEmailInput] = useState(accountEmail);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    setFullNameInput(accountName);
  }, [accountName]);

  useEffect(() => {
    setEmailInput(accountEmail);
  }, [accountEmail]);

  const roleLabel = useMemo(() => {
    return userRole === 'coach' ? 'Coach' : 'User';
  }, [userRole]);

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);

    if (!fullNameInput.trim()) {
      setSaveError('Name cannot be empty.');
      return;
    }

    if (!emailInput.trim()) {
      setSaveError('Email cannot be empty.');
      return;
    }

    setIsSavingProfile(true);

    if (fullNameInput.trim() !== accountName) {
      const result = await updateDisplayName(fullNameInput);
      if (result.error) {
        setSaveError(result.error);
        setIsSavingProfile(false);
        return;
      }
    }

    if (emailInput.trim().toLowerCase() !== accountEmail.toLowerCase()) {
      const result = await updateEmail(emailInput);
      if (result.error) {
        setSaveError(result.error);
        setIsSavingProfile(false);
        return;
      }

      setSaveSuccess('Profile updated. Check your inbox to confirm the new email address.');
      setIsSavingProfile(false);
      return;
    }

    setSaveSuccess('Profile updated.');
    setIsSavingProfile(false);
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut();
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">Profile</h1>
        <p className="mt-2 text-sm text-gray-400">
          Coach profile details, connected teams, and account information.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="glass-card p-5">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-full border border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.06)] text-2xl font-semibold text-white">
                {initials || 'C'}
              </div>

              <h2 className="mt-4 text-lg font-semibold text-white">{accountName}</h2>
              <p className="mt-1 text-sm text-gray-400">{accountEmail || '--'}</p>
              <span className="mt-3 inline-flex items-center gap-1 rounded-full border border-[rgba(0,212,170,0.35)] bg-[rgba(0,212,170,0.12)] px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--accent-primary)]">
                <BadgeCheck size={12} />
                {roleLabel}
              </span>
            </div>

            <dl className="mt-5 space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-gray-300">Connected Teams</dt>
                <dd className="font-semibold text-white">{connectedTeams}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-gray-300">Total Players Coached</dt>
                <dd className="font-semibold text-[var(--accent-secondary)]">{totalPlayersCoached}</dd>
              </div>
            </dl>
          </section>

          <section className="glass-card p-5">
            <h3 className="text-sm font-semibold text-white">Connected Teams</h3>
            {teams.length === 0 ? (
              <p className="mt-3 text-xs text-gray-400">No teams connected yet.</p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {teams.map((team) => (
                  <article
                    key={team.id}
                    className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-white">{team.name}</p>
                      <span className="rounded-md border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-300">
                        {team.code}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </aside>

        <div className="space-y-4">
          <section className="glass-card p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-white">Personal Information</h3>
              <p className="mt-1 text-xs text-gray-400">Update your account name and email.</p>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-gray-400">Full Name</label>
                  <input
                    type="text"
                    value={fullNameInput}
                    onChange={(event) => setFullNameInput(event.target.value)}
                    className="w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[var(--accent-secondary)]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-gray-400">Email</label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(event) => setEmailInput(event.target.value)}
                    className="w-full rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[var(--accent-secondary)]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSavingProfile}
                className="rounded-lg border border-[rgba(0,212,170,0.4)] bg-[rgba(0,212,170,0.14)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--accent-primary)] transition-colors hover:bg-[rgba(0,212,170,0.2)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingProfile ? 'Saving...' : 'Save Profile'}
              </button>

              {saveError ? <p className="text-xs text-[var(--status-red)]">{saveError}</p> : null}
              {saveSuccess ? <p className="text-xs text-[var(--accent-primary)]">{saveSuccess}</p> : null}
            </form>
          </section>

          <section className="glass-card p-5">
            <h3 className="text-sm font-semibold text-white">Account Information</h3>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <article className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-3.5 py-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-400">Account ID</p>
                <p className="mt-1 text-sm font-medium text-white">{user?.id ?? '--'}</p>
              </article>
              <article className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-3.5 py-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-400">Member Since</p>
                <p className="mt-1 text-sm font-medium text-white">{formatMemberSince(user?.created_at)}</p>
              </article>
              <article className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={14} className="text-[var(--accent-primary)]" />
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">Security</p>
                </div>
                <p className="mt-1 text-sm font-medium text-white">Use Settings to update your password.</p>
              </article>
              <article className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-[var(--accent-secondary)]" />
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">Primary Contact</p>
                </div>
                <p className="mt-1 text-sm font-medium text-white">{accountEmail || '--'}</p>
              </article>
            </div>
          </section>

          <section className="glass-card p-5">
            <h3 className="text-sm font-semibold text-white">Coach Profile Completion</h3>
            <p className="mt-1 text-xs text-gray-400">
              Team and player-specific coach metadata can be added once those backend tables are introduced.
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-300">
              <Users size={14} className="text-[var(--accent-secondary)]" />
              <span>{connectedTeams > 0 ? `${connectedTeams} team(s) connected.` : 'No teams connected yet.'}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-300">
              <UserCircle2 size={14} className="text-[var(--accent-secondary)]" />
              <span>{accountName ? 'Account profile is active.' : 'Set a display name to complete profile basics.'}</span>
            </div>
          </section>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(255,107,107,0.34)] bg-[rgba(255,107,107,0.09)] px-5 py-3.5 text-sm font-semibold text-[var(--status-red)] transition-colors hover:bg-[rgba(255,107,107,0.15)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogOut size={18} />
            <span>{isSigningOut ? 'Logging out...' : 'Log Out'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
