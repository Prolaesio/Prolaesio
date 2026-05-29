import type { CoachPlayer } from '@/components/coach/players/types';

interface PlayerProfileCardProps {
  player: CoachPlayer;
  teamName: string;
}

function getInitials(name: string) {
  const words = name.trim().split(/\s+/);
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('');
}

export function PlayerProfileCard({ player, teamName }: PlayerProfileCardProps) {
  const ageLabel = player.age > 0 ? `${player.age}` : '--';
  const heightLabel = player.heightCm > 0 ? `${player.heightCm} cm` : '--';
  const weightLabel = player.weightKg > 0 ? `${player.weightKg} kg` : '--';

  return (
    <aside className="glass-card h-fit p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Selected Player</p>

      <div className="mt-4 flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.06)] text-lg font-bold text-white">
          {getInitials(player.name)}
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">{player.name}</h2>
          <p className="mt-1 text-sm text-gray-300">#{player.jerseyNumber}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {player.positions.map((position) => (
          <span
            key={position}
            className="rounded-full border border-[rgba(74,158,255,0.35)] bg-[rgba(74,158,255,0.12)] px-2.5 py-1 text-xs font-semibold text-[var(--accent-secondary)]"
          >
            {position}
          </span>
        ))}
      </div>

      <dl className="mt-5 space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <dt className="text-gray-300">Age</dt>
          <dd className="rounded-md border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.05)] px-2 py-0.5 text-xs font-semibold text-white">
            {ageLabel}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <dt className="text-gray-300">Height</dt>
          <dd className="rounded-md border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.05)] px-2 py-0.5 text-xs font-semibold text-white">
            {heightLabel}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <dt className="text-gray-300">Weight</dt>
          <dd className="rounded-md border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.05)] px-2 py-0.5 text-xs font-semibold text-white">
            {weightLabel}
          </dd>
        </div>
      </dl>

      <div className="mt-5 rounded-xl border border-[rgba(0,212,170,0.25)] bg-[rgba(0,212,170,0.08)] px-3 py-2">
        <p className="text-xs uppercase tracking-wide text-[var(--accent-primary)]">Team</p>
        <p className="mt-1 text-sm font-semibold text-white">{teamName}</p>
      </div>
    </aside>
  );
}
