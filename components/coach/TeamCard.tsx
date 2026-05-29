import type { CoachTeam } from '@/lib/coach/selectedTeam';
import { SelectedTeamIndicator } from '@/components/coach/SelectedTeamIndicator';

export interface TeamAverages {
  players: number;
  averageAge: number | null;
  averageHeightCm: number | null;
  averageWeightKg: number | null;
  averageReadiness: number | null;
  averageLoad: number | null;
}

interface TeamCardProps {
  team: CoachTeam;
  averages: TeamAverages;
  selected: boolean;
  onSelect: (teamId: string) => void;
}

function getTeamAvatarLabel(team: CoachTeam): string {
  const codeParts = team.code.split('-');
  if (codeParts.length > 0 && codeParts[0]) {
    return codeParts[0].slice(0, 3);
  }

  return team.name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

export function TeamCard({ team, averages, selected, onSelect }: TeamCardProps) {
  const cardStateClasses = selected
    ? 'border-[rgba(0,212,170,0.45)] bg-[rgba(0,212,170,0.09)] shadow-[0_10px_24px_rgba(0,212,170,0.14)]'
    : 'hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(25,33,73,0.72)]';

  return (
    <button
      type="button"
      onClick={() => onSelect(team.id)}
      aria-pressed={selected}
      className={`glass-card w-full p-5 text-left transition-all duration-200 sm:p-6 ${cardStateClasses}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.06)] text-sm font-bold text-white">
            {getTeamAvatarLabel(team)}
          </div>
          <div>
            <p className="text-base font-semibold text-white">{team.name}</p>
            <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-gray-400">
              {team.code}
            </p>
          </div>
        </div>
        <SelectedTeamIndicator selected={selected} />
      </div>

      <dl className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <dt className="text-gray-300">Players</dt>
          <dd className="rounded-md border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.05)] px-2 py-0.5 text-xs font-semibold text-white">
            {averages.players}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <dt className="text-gray-300">Avg age</dt>
          <dd className="rounded-md border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.05)] px-2 py-0.5 text-xs font-semibold text-white">
            {averages.averageAge == null ? '--' : `${averages.averageAge.toFixed(1)}y`}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <dt className="text-gray-300">Avg height</dt>
          <dd className="rounded-md border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.05)] px-2 py-0.5 text-xs font-semibold text-white">
            {averages.averageHeightCm == null ? '--' : `${averages.averageHeightCm.toFixed(0)} cm`}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <dt className="text-gray-300">Avg weight</dt>
          <dd className="rounded-md border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.05)] px-2 py-0.5 text-xs font-semibold text-white">
            {averages.averageWeightKg == null ? '--' : `${averages.averageWeightKg.toFixed(0)} kg`}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <dt className="text-gray-300">Avg readiness</dt>
          <dd className="rounded-md border border-[rgba(0,212,170,0.3)] bg-[rgba(0,212,170,0.1)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-primary)]">
            {averages.averageReadiness == null ? '--' : `${averages.averageReadiness.toFixed(0)}%`}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <dt className="text-gray-300">Avg load</dt>
          <dd className="rounded-md border border-[rgba(74,158,255,0.35)] bg-[rgba(74,158,255,0.12)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-secondary)]">
            {averages.averageLoad == null ? '--' : averages.averageLoad.toFixed(0)}
          </dd>
        </div>
      </dl>
    </button>
  );
}
