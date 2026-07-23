'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { AppLogo } from '@/components/AppLogo';
import { OfflineBanner } from '@/components/OfflineBanner';
import { GuardianProvider } from './GuardianProvider';
import { GuardianMobileNav, GuardianSidebar } from './GuardianNavigation';
import { getGuardianPageTitle } from './navigation';

export function GuardianLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (pathname.startsWith('/guardian/invite/')) {
    return <div className="min-h-screen bg-[var(--background)] text-white">{children}</div>;
  }
  return (
    <GuardianProvider>
      <div className="min-h-screen bg-[var(--background)] text-white">
        <OfflineBanner />
        <GuardianSidebar />
        <GuardianMobileNav open={open} onClose={() => setOpen(false)} />
        <div className="min-h-screen lg:pl-20">
          <header className="sticky top-0 z-30 border-b border-[var(--card-border)] bg-[rgba(var(--surface-shell-rgb),0.94)] px-4 py-3 backdrop-blur lg:hidden">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setOpen(true)} className="min-h-11 min-w-11 rounded-lg border border-white/10 p-2 text-gray-200" aria-label="Open Guardian navigation"><Menu size={19} /></button>
              <AppLogo size={28} />
              <div><p className="text-xs uppercase tracking-wide text-gray-400">Lodario Guardian</p><h1 className="text-sm font-semibold">{getGuardianPageTitle(pathname)}</h1></div>
            </div>
          </header>
          <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </GuardianProvider>
  );
}
