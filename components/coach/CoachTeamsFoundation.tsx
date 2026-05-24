'use client';

import { useCoachTeam } from '@/lib/coach/selectedTeam';
import { TeamGrid } from '@/components/coach/TeamGrid';
import type { TeamAverages } from '@/components/coach/TeamCard';

const mockTeamAverages: Record<string, TeamAverages> = {
  'whitby-u19': {
    players: 24,
    averageAge: 18.3,
    averageHeightCm: 178,
    averageWeightKg: 72,
    averageReadiness: 84,
    averageLoad: 611,
  },
  'whitby-u17': {
    players: 22,
    averageAge: 16.8,
    averageHeightCm: 173,
    averageWeightKg: 66,
    averageReadiness: 79,
    averageLoad: 552,
  },
  'seattle-u23': {
    players: 26,
    averageAge: 21.1,
    averageHeightCm: 181,
    averageWeightKg: 76,
    averageReadiness: 82,
    averageLoad: 634,
  },
  'ridgeview-w': {
    players: 23,
    averageAge: 20.4,
    averageHeightCm: 169,
    averageWeightKg: 64,
    averageReadiness: 86,
    averageLoad: 577,
  },
};

export function CoachTeamsFoundation() {
  const { teams, selectedTeamId, selectedTeam, setSelectedTeamId } = useCoachTeam();

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-white">Teams</h1>
        <p className="mt-2 text-sm text-gray-400">
          Select the active team for Overview, Players, Analytics, and Calendar.
        </p>
        <p className="mt-3 text-xs font-medium text-[var(--accent-secondary)]">
          Active team: {selectedTeam.name}
        </p>
      </header>

      <TeamGrid
        teams={teams}
        selectedTeamId={selectedTeamId}
        onSelectTeam={setSelectedTeamId}
        averagesByTeamId={mockTeamAverages}
      />
    </div>
  );
}
