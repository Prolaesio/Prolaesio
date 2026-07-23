'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { AuthGate } from '@/components/AuthGate';
import { DataProvider } from '@/lib/DataContext';
import { BottomNav } from '@/components/BottomNav';
import { OfflineBanner } from '@/components/OfflineBanner';
import { OnboardingGate } from '@/components/OnboardingGate';
import { isCoachRoute, isGuardianRoute } from '@/lib/routeRoles';

interface RootAppShellProps {
  children: React.ReactNode;
}

export function RootAppShell({ children }: RootAppShellProps) {
  const pathname = usePathname();
  const publicRoute = pathname === '/beta' || pathname.startsWith('/guardian/invite/');
  const coachRoute = isCoachRoute(pathname);
  const guardianRoute = isGuardianRoute(pathname);

  if (publicRoute) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        {children}
      </div>
    );
  }

  if (coachRoute) {
    return (
      <AuthGate requiredRole="coach">
        <div className="min-h-screen bg-[var(--background)]">
          {children}
        </div>
      </AuthGate>
    );
  }

  if (guardianRoute) {
    return (
      <AuthGate requiredRole="guardian">
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
