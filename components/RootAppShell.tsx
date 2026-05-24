'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { AuthGate } from '@/components/AuthGate';
import { DataProvider } from '@/lib/DataContext';
import { BottomNav } from '@/components/BottomNav';
import { OfflineBanner } from '@/components/OfflineBanner';
import { OnboardingGate } from '@/components/OnboardingGate';
import { isCoachRoute } from '@/lib/routeRoles';

interface RootAppShellProps {
  children: React.ReactNode;
}

export function RootAppShell({ children }: RootAppShellProps) {
  const pathname = usePathname();
  const coachRoute = isCoachRoute(pathname);

  if (coachRoute) {
    return (
      <AuthGate>
        <div className="min-h-screen bg-[var(--background)]">
          {children}
        </div>
      </AuthGate>
    );
  }

  return (
    <AuthGate requiredRole="player">
      <DataProvider>
        <OnboardingGate>
          <div className="max-w-md mx-auto min-h-screen relative shadow-2xl bg-[var(--background)] overflow-hidden flex flex-col">
            <OfflineBanner />
            <main className="flex-1 overflow-y-auto pb-24">
              {children}
            </main>
            <BottomNav />
          </div>
        </OnboardingGate>
      </DataProvider>
    </AuthGate>
  );
}
