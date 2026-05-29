'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useCoachTeam } from '@/lib/coach/selectedTeam';
import { TeamGrid } from '@/components/coach/TeamGrid';
import type { TeamAverages } from '@/components/coach/TeamCard';
import { useCoachTeamProfileAverages } from '@/lib/coach/teamInsights';

const defaultTeamAverages: TeamAverages = {
  players: 0,
  averageAge: null,
  averageHeightCm: null,
  averageWeightKg: null,
  averageReadiness: null,
  averageLoad: null,
};

function generateInviteCodeSeed(teamName: string): string {
  const base = teamName
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part.slice(0, 3))
    .join('');
  const prefix = base || 'TEAM';
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${suffix}`;
}

export function CoachTeamsFoundation() {
  const {
    teams,
    selectedTeamId,
    selectedTeam,
    setSelectedTeamId,
    createTeam,
    isLoadingTeams,
    teamsError,
  } = useCoachTeam();
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamCode, setNewTeamCode] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const teamIds = useMemo(() => teams.map((team) => team.id), [teams]);
  const { averagesByTeamId: profileAveragesByTeamId, error: profileAveragesError } = useCoachTeamProfileAverages(teamIds);

  const averagesByTeamId = useMemo(() => {
    return teams.reduce<Record<string, TeamAverages>>((accumulator, team) => {
      const profileAverages = profileAveragesByTeamId[team.id];
      accumulator[team.id] = {
        ...defaultTeamAverages,
        players: profileAverages?.players ?? 0,
        averageAge: profileAverages?.averageAge ?? null,
        averageHeightCm: profileAverages?.averageHeightCm ?? null,
        averageWeightKg: profileAverages?.averageWeightKg ?? null,
        averageReadiness: profileAverages?.averageReadiness ?? null,
        averageLoad: profileAverages?.averageLoad ?? null,
      };
      return accumulator;
    }, {});
  }, [teams, profileAveragesByTeamId]);

  const handleCreateTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);

    setIsCreatingTeam(true);
    const { error } = await createTeam({
      name: newTeamName,
      code: newTeamCode.trim() ? newTeamCode.trim() : undefined,
    });
    setIsCreatingTeam(false);

    if (error) {
      setCreateError(error);
      return;
    }

    setNewTeamName('');
    setNewTeamCode('');
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-white">Teams</h1>
        <p className="mt-2 text-sm text-gray-400">
          Select the active team for Overview, Players, Analytics, and Calendar.
        </p>
        <p className="mt-3 text-xs font-medium text-[var(--accent-secondary)]">
          Active team: {teams.length > 0 ? selectedTeam.name : 'No team selected'}
        </p>
      </header>

      <section className="glass-card mb-6 p-4 sm:p-5">
        <div className="mb-3 flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-white">Create Team</h2>
          <p className="text-xs text-gray-400">
            Add a new team with an invite code. Leave invite code empty to auto-generate one.
          </p>
        </div>
        <form onSubmit={handleCreateTeam} className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
          <input
            type="text"
            value={newTeamName}
            onChange={(event) => setNewTeamName(event.target.value)}
            placeholder="Team name"
            required
            className="rounded-lg border border-[rgba(255,255,255,0.16)] bg-[rgba(8,11,28,0.96)] px-3 py-2 text-sm text-white outline-none transition-colors focus:border-[var(--accent-secondary)]"
          />
          <input
            type="text"
            value={newTeamCode}
            onChange={(event) => setNewTeamCode(event.target.value.toUpperCase())}
            placeholder="Invite code (optional)"
            className="rounded-lg border border-[rgba(255,255,255,0.16)] bg-[rgba(8,11,28,0.96)] px-3 py-2 text-sm uppercase text-white outline-none transition-colors focus:border-[var(--accent-secondary)]"
          />
          <button
            type="button"
            onClick={() => setNewTeamCode(generateInviteCodeSeed(newTeamName))}
            className="rounded-lg border border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-[rgba(255,255,255,0.1)]"
          >
            Generate
          </button>
          <button
            type="submit"
            disabled={isCreatingTeam}
            className="rounded-lg border border-[rgba(0,212,170,0.4)] bg-[rgba(0,212,170,0.14)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--accent-primary)] transition-colors hover:bg-[rgba(0,212,170,0.2)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreatingTeam ? 'Creating...' : 'Create Team'}
          </button>
        </form>
        {createError ? <p className="mt-2 text-xs text-[var(--status-red)]">{createError}</p> : null}
        {teamsError ? (
          <p className="mt-2 text-xs text-[var(--status-red)]">Unable to load real teams: {teamsError}</p>
        ) : null}
        {profileAveragesError ? (
          <p className="mt-2 text-xs text-[var(--status-red)]">Unable to load team profile averages: {profileAveragesError}</p>
        ) : null}
      </section>

      {isLoadingTeams ? <p className="mb-4 text-xs text-gray-400">Loading teams...</p> : null}
      {!isLoadingTeams && teams.length === 0 ? (
        <section className="glass-card border-[rgba(255,255,255,0.16)] p-6 text-center sm:p-8">
          <h2 className="text-lg font-semibold text-white">No teams yet</h2>
          <p className="mt-2 text-sm text-gray-400">
            Create your first team above to start managing players, analytics, and calendar planning.
          </p>
        </section>
      ) : (
        <TeamGrid
          teams={teams}
          selectedTeamId={selectedTeamId}
          onSelectTeam={setSelectedTeamId}
          averagesByTeamId={averagesByTeamId}
        />
      )}
    </div>
  );
}
