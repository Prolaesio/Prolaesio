import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ActivePageIndicator } from '@/components/coach/ActivePageIndicator';
import { TeamNavigationLabel } from '@/components/coach/TeamNavigationLabel';

interface NavigationItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  expanded: boolean;
  hoverExpandable?: boolean;
  selectedTeamName?: string;
  showSelectedTeam?: boolean;
  onSelect?: () => void;
}

export function NavigationItem({
  href,
  label,
  icon: Icon,
  active,
  expanded,
  hoverExpandable = false,
  selectedTeamName,
  showSelectedTeam = false,
  onSelect,
}: NavigationItemProps) {
  const labelVisibility = expanded
    ? 'max-w-[180px] opacity-100 translate-x-0'
    : hoverExpandable
      ? 'max-w-0 opacity-0 -translate-x-1 group-hover/sidebar:max-w-[180px] group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0'
      : 'max-w-0 opacity-0 -translate-x-1';

  return (
    <li>
      <Link
        href={href}
        onClick={onSelect}
        className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
          active
            ? 'bg-[rgba(74,158,255,0.12)] text-white'
            : 'text-gray-400 hover:bg-[rgba(255,255,255,0.06)] hover:text-gray-100'
        }`}
      >
        <ActivePageIndicator active={active} />
        <Icon size={18} className="shrink-0" />
        <span
          className={`overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-300 ${labelVisibility}`}
        >
          {label}
        </span>
      </Link>
      {showSelectedTeam && selectedTeamName ? (
        <TeamNavigationLabel
          teamName={selectedTeamName}
          expanded={expanded}
          hoverExpandable={hoverExpandable}
        />
      ) : null}
    </li>
  );
}
