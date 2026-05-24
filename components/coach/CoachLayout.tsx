'use client';

import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { CoachSidebar } from '@/components/coach/CoachSidebar';
import { CoachMobileNav } from '@/components/coach/CoachMobileNav';
import { getCoachPageTitle, isTeamScopedPath } from '@/components/coach/navigation';
import { CoachTeamProvider, useCoachTeam } from '@/lib/coach/selectedTeam';

interface CoachLayoutProps {
  children: React.ReactNode;
}

function CoachLayoutInner({ children }: CoachLayoutProps) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { selectedTeam } = useCoachTeam();
  const teamScopedPage = isTeamScopedPath(pathname);
  const pageTitle = getCoachPageTitle(pathname);

  return (
    <div className="min-h-screen bg-[var(--background)] text-white">
      <CoachSidebar />
      <CoachMobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div className="min-h-screen lg:pl-20">
        <header className="sticky top-0 z-30 border-b border-[var(--card-border)] bg-[rgba(10,14,39,0.92)] px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-lg border border-[rgba(255,255,255,0.12)] p-2 text-gray-200 transition-colors hover:bg-[rgba(255,255,255,0.08)]"
              aria-label="Open coach navigation"
            >
              <Menu size={18} />
            </button>

            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Prolaesio Coach</p>
              <h1 className="text-sm font-semibold text-white">{pageTitle}</h1>
              {teamScopedPage ? (
                <p className="text-xs font-medium text-[var(--accent-secondary)]">{selectedTeam.name}</p>
              ) : null}
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

export function CoachLayout({ children }: CoachLayoutProps) {
  return (
    <CoachTeamProvider>
      <CoachLayoutInner>{children}</CoachLayoutInner>
    </CoachTeamProvider>
  );
}
