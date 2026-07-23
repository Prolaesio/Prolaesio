import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  CalendarDays,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserCircle2,
  UsersRound,
} from 'lucide-react';

export interface GuardianNavigationItem { label: string; href: string; icon: LucideIcon }

export const guardianPrimaryNavigation: GuardianNavigationItem[] = [
  { label: 'Overview', href: '/guardian', icon: LayoutDashboard },
  { label: 'Players', href: '/guardian/children', icon: UsersRound },
  { label: 'Calendar', href: '/guardian/calendar', icon: CalendarDays },
  { label: 'Updates', href: '/guardian/updates', icon: Bell },
  { label: 'Safety', href: '/guardian/safety', icon: ShieldCheck },
  { label: 'Permissions', href: '/guardian/permissions', icon: SlidersHorizontal },
];

export const guardianSecondaryNavigation: GuardianNavigationItem[] = [
  { label: 'Profile', href: '/guardian/profile', icon: UserCircle2 },
  { label: 'Settings', href: '/guardian/settings', icon: Settings },
];

export function isActiveGuardianRoute(pathname: string, href: string): boolean {
  if (href === '/guardian') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getGuardianPageTitle(pathname: string): string {
  return [...guardianPrimaryNavigation, ...guardianSecondaryNavigation]
    .find((item) => isActiveGuardianRoute(pathname, item.href))?.label ?? 'Guardian';
}
