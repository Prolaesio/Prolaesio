'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { AppLogo } from '@/components/AppLogo';
import { guardianPrimaryNavigation, guardianSecondaryNavigation, isActiveGuardianRoute } from './navigation';

function NavLinks({ expanded, onSelect }: { expanded?: boolean; onSelect?: () => void }) {
  const pathname = usePathname();
  const render = (item: (typeof guardianPrimaryNavigation)[number]) => {
    const Icon = item.icon;
    const active = isActiveGuardianRoute(pathname, item.href);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onSelect}
          aria-current={active ? 'page' : undefined}
          className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${active ? 'bg-[rgba(var(--accent-primary-rgb),0.14)] text-[var(--accent-primary)]' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
        >
          <Icon size={19} className="shrink-0" />
          <span className={expanded ? '' : 'lg:max-w-0 lg:overflow-hidden lg:opacity-0 lg:transition-all lg:group-hover/sidebar:max-w-44 lg:group-hover/sidebar:opacity-100'}>{item.label}</span>
        </Link>
      </li>
    );
  };
  return (
    <nav className="flex min-h-0 flex-1 flex-col">
      <ul className="space-y-1">{guardianPrimaryNavigation.map(render)}</ul>
      <ul className="mt-auto space-y-1 border-t border-white/10 pt-3">{guardianSecondaryNavigation.map(render)}</ul>
    </nav>
  );
}

export function GuardianSidebar() {
  return (
    <aside className="group/sidebar fixed inset-y-0 left-0 z-40 hidden w-20 border-r border-[var(--card-border)] bg-[rgba(var(--surface-shell-rgb),0.96)] px-3 py-4 backdrop-blur-xl transition-[width] duration-300 lg:flex lg:flex-col hover:w-64">
      <Link href="/guardian" className="mb-4 flex items-center gap-3 rounded-xl px-3 py-3 text-white">
        <AppLogo size={23} />
        <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-all group-hover/sidebar:max-w-44 group-hover/sidebar:opacity-100">Lodario Guardian</span>
      </Link>
      <NavLinks />
    </aside>
  );
}

export function GuardianMobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      <button type="button" onClick={onClose} aria-hidden={!open} className={`fixed inset-0 z-40 bg-black/60 transition-opacity lg:hidden ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`} />
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[var(--card-border)] bg-[rgba(var(--surface-shell-rgb),0.99)] p-4 shadow-2xl transition-transform lg:hidden ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3"><AppLogo size={28} /><span className="text-sm font-semibold text-white">Lodario Guardian</span></div>
          <button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-lg p-2 text-gray-400 hover:bg-white/5 hover:text-white" aria-label="Close Guardian navigation"><X size={19} /></button>
        </div>
        <NavLinks expanded onSelect={onClose} />
      </aside>
    </>
  );
}
