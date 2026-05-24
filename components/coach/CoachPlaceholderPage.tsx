'use client';

import { useCoachTeam } from '@/lib/coach/selectedTeam';

interface CoachPlaceholderPageProps {
  title: string;
  description: string;
  teamScoped?: boolean;
}

export function CoachPlaceholderPage({
  title,
  description,
  teamScoped = false,
}: CoachPlaceholderPageProps) {
  const { selectedTeam } = useCoachTeam();

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
        <p className="mt-2 text-sm text-gray-400">{description}</p>
      </header>

      <section className="glass-card p-5">
        <p className="text-sm text-gray-300">
          Coach foundation page is ready. Full {title.toLowerCase()} modules can be added here next.
        </p>
        {teamScoped ? (
          <p className="mt-3 text-xs font-medium text-[var(--accent-secondary)]">
            Selected team: {selectedTeam.name}
          </p>
        ) : null}
      </section>
    </div>
  );
}
