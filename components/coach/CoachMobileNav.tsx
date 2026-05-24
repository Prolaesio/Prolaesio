'use client';

import { X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { NavigationItem } from '@/components/coach/NavigationItem';
import {
  coachPrimaryNavigation,
  coachSecondaryNavigation,
  isActiveCoachRoute,
} from '@/components/coach/navigation';
import { useCoachTeam } from '@/lib/coach/selectedTeam';

interface CoachMobileNavProps {
  open: boolean;
  onClose: () => void;
}

export function CoachMobileNav({ open, onClose }: CoachMobileNavProps) {
  const pathname = usePathname();
  const { selectedTeam } = useCoachTeam();

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-hidden={!open}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px] transition-opacity lg:hidden ${
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-[var(--card-border)] bg-[rgba(10,14,39,0.98)] px-4 py-4 shadow-2xl transition-transform duration-300 lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Prolaesio Coach</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-[rgba(255,255,255,0.08)] hover:text-white"
            aria-label="Close coach navigation"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex h-[calc(100%-48px)] flex-col">
          <ul className="space-y-1">
            {coachPrimaryNavigation.map((item) => (
              <NavigationItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActiveCoachRoute(pathname, item.href)}
                expanded
                onSelect={onClose}
                showSelectedTeam={item.label === 'Teams'}
                selectedTeamName={selectedTeam.name}
              />
            ))}
          </ul>

          <div className="mt-auto border-t border-[rgba(255,255,255,0.08)] pt-3">
            <ul className="space-y-1">
              {coachSecondaryNavigation.map((item) => (
                <NavigationItem
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={isActiveCoachRoute(pathname, item.href)}
                  expanded
                  onSelect={onClose}
                />
              ))}
            </ul>
          </div>
        </nav>
      </aside>
    </>
  );
}
