'use client';

import Link from 'next/link';
import { Shield } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { NavigationItem } from '@/components/coach/NavigationItem';
import {
  coachPrimaryNavigation,
  coachSecondaryNavigation,
  isActiveCoachRoute,
} from '@/components/coach/navigation';
import { useCoachTeam } from '@/lib/coach/selectedTeam';

export function CoachSidebar() {
  const pathname = usePathname();
  const { selectedTeam } = useCoachTeam();

  return (
    <aside className="group/sidebar fixed inset-y-0 left-0 z-40 hidden w-20 border-r border-[var(--card-border)] bg-[rgba(10,14,39,0.95)] backdrop-blur-xl transition-[width] duration-300 lg:flex hover:w-64">
      <div className="flex w-full flex-col px-3 py-4">
        <Link href="/coach/dashboard" className="mb-4 flex items-center gap-3 rounded-xl px-3 py-3 text-white">
          <Shield size={19} className="text-[var(--accent-primary)] shrink-0" />
          <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-all duration-300 group-hover/sidebar:max-w-[190px] group-hover/sidebar:opacity-100">
            Prolaesio Coach
          </span>
        </Link>

        <nav className="flex-1">
          <ul className="space-y-1">
            {coachPrimaryNavigation.map((item) => (
              <NavigationItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActiveCoachRoute(pathname, item.href)}
                expanded={false}
                hoverExpandable
                showSelectedTeam={item.label === 'Teams'}
                selectedTeamName={selectedTeam.name}
              />
            ))}
          </ul>
        </nav>

        <div className="border-t border-[rgba(255,255,255,0.08)] pt-3">
          <ul className="space-y-1">
            {coachSecondaryNavigation.map((item) => (
              <NavigationItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActiveCoachRoute(pathname, item.href)}
                expanded={false}
                hoverExpandable
              />
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
