import type { CoachTeam } from '@/lib/coach/selectedTeam';
import { TeamCard, type TeamAverages } from '@/components/coach/TeamCard';

interface TeamGridProps {
  teams: CoachTeam[];
  selectedTeamId: string;
  onSelectTeam: (teamId: string) => void;
  averagesByTeamId: Record<string, TeamAverages>;
}

export function TeamGrid({
  teams,
  selectedTeamId,
  onSelectTeam,
  averagesByTeamId,
}: TeamGridProps) {
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {teams.map((team) => {
        const averages = averagesByTeamId[team.id];

        if (!averages) {
          return null;
        }

        return (
          <TeamCard
            key={team.id}
            team={team}
            averages={averages}
            selected={team.id === selectedTeamId}
            onSelect={onSelectTeam}
          />
        );
      })}
    </section>
  );
}
