import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Layers,
  Settings,
  UserCircle2,
  Users,
} from 'lucide-react';

export interface CoachNavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
  isTeamScoped?: boolean;
}

export const coachPrimaryNavigation: CoachNavigationItem[] = [
  { label: 'Dashboard', href: '/coach/dashboard', icon: LayoutDashboard },
  { label: 'Teams', href: '/coach/teams', icon: Users },
  { label: 'Overview', href: '/coach/overview', icon: Layers, isTeamScoped: true },
  { label: 'Players', href: '/coach/players', icon: ClipboardList, isTeamScoped: true },
  { label: 'Analytics', href: '/coach/analytics', icon: BarChart3, isTeamScoped: true },
  { label: 'Calendar', href: '/coach/calendar', icon: CalendarDays, isTeamScoped: true },
];

export const coachSecondaryNavigation: CoachNavigationItem[] = [
  { label: 'Profile', href: '/coach/profile', icon: UserCircle2 },
  { label: 'Settings', href: '/coach/settings', icon: Settings },
];

export function isActiveCoachRoute(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function isTeamScopedPath(pathname: string): boolean {
  return coachPrimaryNavigation.some((item) => item.isTeamScoped && isActiveCoachRoute(pathname, item.href));
}

export function getCoachPageTitle(pathname: string): string {
  const allItems = [...coachPrimaryNavigation, ...coachSecondaryNavigation];
  const matched = allItems.find((item) => isActiveCoachRoute(pathname, item.href));
  return matched?.label ?? 'Coach';
}
