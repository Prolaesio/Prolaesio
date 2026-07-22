'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ChevronDown, ChevronUp, CircleX, ClipboardCheck, FileText, Minus } from 'lucide-react';
import type {
  PlayerInjuryStatus,
  PlayerSheetCoachSession,
  PlayerSheetSessionDetails,
  TeamPlayerDataset,
} from '@/components/coach/players/types';
import { PlayerEventDetailsModal } from '@/components/coach/players/PlayerCalendar';
import { CoachAttendanceModal } from '@/components/coach/attendance/CoachAttendanceModal';
import {
  getCoachAttendanceTargetFromPlayerCalendarEvent,
  type AttendanceEventTarget,
} from '@/lib/calendar/attendance';

type SortKey = 'name' | 'position';
type SortDirection = 'asc' | 'desc';
type AttendanceRange = 7 | 14 | 30;

const avatarTones = [
  'from-orange-500/45 to-amber-300/10 text-orange-100',
  'from-sky-500/45 to-cyan-300/10 text-sky-100',
  'from-emerald-500/45 to-lime-300/10 text-emerald-100',
  'from-violet-500/45 to-fuchsia-300/10 text-violet-100',
  'from-rose-500/45 to-orange-300/10 text-rose-100',
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function avatarTone(playerId: string): string {
  const sum = Array.from(playerId).reduce((total, character) => total + character.charCodeAt(0), 0);
  return avatarTones[sum % avatarTones.length];
}

function formatMetric(value: number): string {
  return value > 0 ? Math.round(value).toString() : '—';
}

function readinessTone(value: number): string {
  if (value <= 0) return 'text-gray-500';
  if (value >= 75) return 'text-[var(--status-green)]';
  if (value >= 55) return 'text-[var(--status-yellow)]';
  return 'text-[var(--status-red)]';
}

function loadTone(value: number): string {
  if (value <= 0) return 'text-gray-500';
  if (value > 700) return 'text-[var(--status-red)]';
  if (value > 450) return 'text-[var(--status-yellow)]';
  return 'text-[var(--status-green)]';
}

function fatigueTone(value: number): string {
  if (value <= 0) return 'text-gray-500';
  if (value > 60) return 'text-[var(--status-red)]';
  if (value > 45) return 'text-[var(--status-yellow)]';
  return 'text-[var(--status-green)]';
}

function healthLabel(status: PlayerInjuryStatus): string {
  if (status.state === 'active') return status.description || 'Injured';
  if (status.state === 'recovering') return 'Recovering';
  if (status.state === 'unavailable') return 'Unavailable';
  return 'Healthy';
}

function HealthBadge({ status }: { status: PlayerInjuryStatus }) {
  const healthy = status.state === 'healthy' || status.state === 'resolved';
  const recovering = status.state === 'recovering';
  const tone = healthy
    ? 'bg-[rgba(var(--status-green-rgb),0.09)] text-[var(--status-green)]'
    : recovering
      ? 'bg-[rgba(255,212,59,0.09)] text-[var(--status-yellow)]'
      : 'bg-[rgba(255,107,107,0.09)] text-[var(--status-red)]';

  return (
    <span className={`inline-flex max-w-[126px] items-center gap-1.5 rounded-md px-2 py-1 text-xs ${tone}`} title={healthLabel(status)}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      <span className="truncate">{healthLabel(status)}</span>
    </span>
  );
}

function WellnessStatus({ completed }: { completed: boolean }) {
  const Icon = completed ? CheckCircle2 : CircleX;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${completed ? 'text-[var(--status-green)]' : 'text-[var(--status-red)]'}`}>
      <Icon size={16} />
      {completed ? 'Yes' : 'No'}
    </span>
  );
}

function formatSessionDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatSessionType(value: string): string {
  const normalized = value.trim();
  if (!normalized || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(normalized)) return 'Coach session';
  return normalized
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function SessionActionMenu({
  name,
  details,
  open,
  onToggle,
  onClose,
  onOpenDetails,
  onOpenAttendance,
}: {
  name: string;
  details: PlayerSheetSessionDetails;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onOpenDetails: (details: PlayerSheetSessionDetails) => void;
  onOpenAttendance: (details: PlayerSheetSessionDetails) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const bounds = buttonRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const viewportPadding = 8;
      const menuWidth = 168;
      const menuHeight = 88;
      const left = Math.min(
        Math.max(viewportPadding, bounds.left),
        window.innerWidth - menuWidth - viewportPadding
      );
      const spaceBelow = window.innerHeight - bounds.bottom;
      const top = spaceBelow >= menuHeight + viewportPadding
        ? bounds.bottom + 6
        : Math.max(viewportPadding, bounds.top - menuHeight - 6);
      setPosition({ left, top });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1">
        <span className="truncate font-medium text-gray-100">{name}</span>
        <button
          ref={buttonRef}
          type="button"
          onClick={onToggle}
          className="shrink-0 rounded p-0.5 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white"
          aria-label={`Actions for ${name}`}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && position && typeof document !== 'undefined' ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          data-session-action-menu="true"
          className="fixed z-[110] w-[168px] overflow-hidden rounded-lg border border-white/10 bg-[var(--surface-elevated)] p-1 shadow-[0_18px_45px_rgba(0,0,0,0.55)]"
          style={position}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => onOpenDetails(details)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-gray-200 transition-colors hover:bg-white/[0.07] hover:text-white"
          >
            <FileText size={14} />
            Session details
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => onOpenAttendance(details)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-gray-200 transition-colors hover:bg-white/[0.07] hover:text-white"
          >
            <ClipboardCheck size={14} />
            Attendance
          </button>
        </div>,
        document.body
      ) : null}
    </div>
  );
}

function SessionDetails({
  sessions,
  onOpenDetails,
  onOpenAttendance,
}: {
  sessions: PlayerSheetCoachSession[];
  onOpenDetails: (details: PlayerSheetSessionDetails) => void;
  onOpenAttendance: (details: PlayerSheetSessionDetails) => void;
}) {
  const [openActionSessionId, setOpenActionSessionId] = useState<string | null>(null);
  const remainingCount = sessions.filter((session) => !session.logged).length;
  return (
    <div className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(var(--surface-shell-rgb),0.98)] shadow-[0_22px_60px_rgba(0,0,0,0.62)] backdrop-blur-xl">
      <div className="hidden grid-cols-[24px_1.1fr_1fr_1.5fr_0.9fr] border-b border-[rgba(255,255,255,0.08)] px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-gray-500 sm:grid">
        <span aria-hidden="true" />
        <span>Session name</span>
        <span>Session type</span>
        <span>Time &amp; date</span>
        <span>Team / Individual</span>
      </div>
      {sessions.length === 0 ? (
        <p className="px-4 py-3 text-xs text-gray-500">No coach-provided sessions in the last 24 hours.</p>
      ) : null}
      {sessions.map((session) => (
        <div key={session.id} className="grid gap-2 border-b border-[rgba(255,255,255,0.07)] px-4 py-3 text-xs last:border-b-0 sm:grid-cols-[24px_1.1fr_1fr_1.5fr_0.9fr] sm:items-center">
          <span
            className={`inline-flex items-center gap-1.5 font-medium sm:block ${session.logged ? 'text-[var(--status-green)]' : 'text-[var(--status-red)]'}`}
            title={session.logged ? 'Training session logged' : 'Training session not logged'}
          >
            {session.logged ? <CheckCircle2 size={16} /> : <CircleX size={16} />}
            <span className="sm:hidden">{session.logged ? 'Logged' : 'Not logged'}</span>
          </span>
          <SessionActionMenu
            name={session.name}
            details={session.details}
            open={openActionSessionId === session.id}
            onToggle={() => setOpenActionSessionId((current) => current === session.id ? null : session.id)}
            onClose={() => setOpenActionSessionId(null)}
            onOpenDetails={(details) => {
              setOpenActionSessionId(null);
              onOpenDetails(details);
            }}
            onOpenAttendance={(details) => {
              setOpenActionSessionId(null);
              onOpenAttendance(details);
            }}
          />
          <span className="text-gray-300">{formatSessionType(session.type)}</span>
          <span className="text-gray-300">{formatSessionDateTime(session.scheduledAt)}</span>
          <span className="text-gray-400">{session.scope}</span>
        </div>
      ))}
      {remainingCount > 0 ? (
        <p className="border-t border-[rgba(255,255,255,0.08)] px-4 py-2 text-[10px] text-gray-500">
          {remainingCount} {remainingCount === 1 ? 'session' : 'sessions'} remaining
        </p>
      ) : null}
    </div>
  );
}

function AttendanceSessionDetails({
  sessions,
  onOpenDetails,
  onOpenAttendance,
}: {
  sessions: TeamPlayerDataset['sheet']['attendanceHistory'];
  onOpenDetails: (details: PlayerSheetSessionDetails) => void;
  onOpenAttendance: (details: PlayerSheetSessionDetails) => void;
}) {
  const [openActionSessionId, setOpenActionSessionId] = useState<string | null>(null);
  return (
    <div className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(var(--surface-shell-rgb),0.98)] shadow-[0_22px_60px_rgba(0,0,0,0.62)] backdrop-blur-xl">
      <div className="hidden grid-cols-[24px_1.1fr_1fr_1.5fr_0.9fr] border-b border-[rgba(255,255,255,0.08)] px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-gray-500 sm:grid">
        <span aria-hidden="true" />
        <span>Session name</span>
        <span>Session type</span>
        <span>Time &amp; date</span>
        <span>Team / Individual</span>
      </div>
      {sessions.length === 0 ? (
        <p className="px-4 py-3 text-xs text-gray-500">No completed coach sessions in this period.</p>
      ) : null}
      {sessions.map((session) => (
        <div key={`${session.eventGroupId}:${session.date}`} className="grid gap-2 border-b border-[rgba(255,255,255,0.07)] px-4 py-3 text-xs last:border-b-0 sm:grid-cols-[24px_1.1fr_1fr_1.5fr_0.9fr] sm:items-center">
          <span
            className={`inline-flex items-center gap-1.5 font-medium sm:block ${session.attended ? 'text-[var(--status-green)]' : 'text-[var(--status-red)]'}`}
            title={session.attended ? 'Attended' : 'Did not attend'}
          >
            {session.attended ? <CheckCircle2 size={16} /> : <CircleX size={16} />}
            <span className="sm:hidden">{session.attended ? 'Attended' : 'Did not attend'}</span>
          </span>
          <SessionActionMenu
            name={session.name}
            details={session.details}
            open={openActionSessionId === `${session.eventGroupId}:${session.date}`}
            onToggle={() => {
              const sessionId = `${session.eventGroupId}:${session.date}`;
              setOpenActionSessionId((current) => current === sessionId ? null : sessionId);
            }}
            onClose={() => setOpenActionSessionId(null)}
            onOpenDetails={(details) => {
              setOpenActionSessionId(null);
              onOpenDetails(details);
            }}
            onOpenAttendance={(details) => {
              setOpenActionSessionId(null);
              onOpenAttendance(details);
            }}
          />
          <span className="text-gray-300">{formatSessionType(session.type)}</span>
          <span className="text-gray-300">{formatSessionDateTime(session.scheduledAt)}</span>
          <span className="text-gray-400">{session.scope}</span>
        </div>
      ))}
    </div>
  );
}

function FloatingSessionPopover({
  anchor,
  rowCount,
  ariaLabel,
  suspended = false,
  onClose,
  children,
}: {
  anchor: HTMLElement;
  rowCount: number;
  ariaLabel: string;
  suspended?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    const updatePosition = () => {
      const bounds = anchor.getBoundingClientRect();
      const viewportPadding = 12;
      const width = Math.min(460, window.innerWidth - viewportPadding * 2);
      const estimatedHeight = Math.min(250, 78 + Math.max(1, rowCount) * 44);
      const spaceBelow = window.innerHeight - bounds.bottom - viewportPadding;
      const spaceAbove = bounds.top - viewportPadding;
      const shouldOpenAbove = spaceBelow < Math.min(estimatedHeight, 150) && spaceAbove > spaceBelow;
      const left = Math.min(
        Math.max(viewportPadding, bounds.left + bounds.width / 2 - width / 2),
        window.innerWidth - width - viewportPadding
      );
      const maxHeight = Math.max(120, Math.min(300, shouldOpenAbove ? spaceAbove - 8 : spaceBelow - 8));
      const top = shouldOpenAbove
        ? Math.max(viewportPadding, bounds.top - Math.min(estimatedHeight, maxHeight) - 8)
        : bounds.bottom + 8;

      setPosition({ left, top, width, maxHeight });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchor, rowCount]);

  useEffect(() => {
    if (suspended) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (target instanceof Element && target.closest('[data-session-action-menu="true"]')) return;
      if (anchor.contains(target) || popoverRef.current?.contains(target)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [anchor, onClose, suspended]);

  if (!position || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={ariaLabel}
      className="fixed z-[80] overflow-y-auto"
      style={position}
    >
      {children}
    </div>,
    document.body
  );
}

function attendanceSummary(dataset: TeamPlayerDataset, range: AttendanceRange) {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (range - 1));
  const records = dataset.sheet.attendanceHistory.filter((item) => {
    const date = new Date(`${item.date}T00:00:00`);
    return !Number.isNaN(date.getTime()) && date >= cutoff;
  });

  return {
    attended: records.filter((item) => item.attended).length,
    scheduled: records.length,
    sessions: records,
  };
}

function PlayerIdentity({ dataset }: { dataset: TeamPlayerDataset }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br text-xs font-bold ${avatarTone(dataset.player.id)}`}>
        {initials(dataset.player.name) || 'P'}
      </div>
      <span className="truncate font-medium text-gray-100">{dataset.player.name}</span>
    </div>
  );
}

export function PlayerSheetView({
  players,
  onAttendanceUpdated,
}: {
  players: TeamPlayerDataset[];
  onAttendanceUpdated?: () => void;
}) {
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);
  const [expandedAttendancePlayerId, setExpandedAttendancePlayerId] = useState<string | null>(null);
  const [attendancePopoverAnchor, setAttendancePopoverAnchor] = useState<HTMLElement | null>(null);
  const [selectedSessionDetails, setSelectedSessionDetails] = useState<PlayerSheetSessionDetails | null>(null);
  const [attendanceModalTarget, setAttendanceModalTarget] = useState<AttendanceEventTarget | null>(null);
  const [attendanceRange, setAttendanceRange] = useState<AttendanceRange>(7);
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'name', direction: 'asc' });

  const sortedPlayers = useMemo(() => {
    return [...players].sort((first, second) => {
      const firstValue = sort.key === 'name' ? first.player.name : first.player.positions[0] ?? '';
      const secondValue = sort.key === 'name' ? second.player.name : second.player.positions[0] ?? '';
      const comparison = firstValue.localeCompare(secondValue, undefined, { sensitivity: 'base' });
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [players, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const SortIcon = sort.direction === 'asc' ? ChevronUp : ChevronDown;
  const expandedDataset = players.find((dataset) => dataset.player.id === expandedPlayerId) ?? null;
  const expandedAttendanceDataset = players.find((dataset) => dataset.player.id === expandedAttendancePlayerId) ?? null;
  const expandedAttendance = expandedAttendanceDataset
    ? attendanceSummary(expandedAttendanceDataset, attendanceRange)
    : null;

  const closeTrainingDetails = () => {
    setExpandedPlayerId(null);
    setPopoverAnchor(null);
  };

  const toggleTrainingDetails = (dataset: TeamPlayerDataset, anchor: HTMLElement) => {
    if (expandedPlayerId === dataset.player.id) {
      closeTrainingDetails();
      return;
    }

    setExpandedAttendancePlayerId(null);
    setAttendancePopoverAnchor(null);
    setExpandedPlayerId(dataset.player.id);
    setPopoverAnchor(anchor);
  };

  const closeAttendanceDetails = () => {
    setExpandedAttendancePlayerId(null);
    setAttendancePopoverAnchor(null);
  };

  const toggleAttendanceDetails = (dataset: TeamPlayerDataset, anchor: HTMLElement) => {
    if (expandedAttendancePlayerId === dataset.player.id) {
      closeAttendanceDetails();
      return;
    }

    closeTrainingDetails();
    setExpandedAttendancePlayerId(dataset.player.id);
    setAttendancePopoverAnchor(anchor);
  };

  const openSessionDetails = (details: PlayerSheetSessionDetails) => {
    setSelectedSessionDetails(details);
  };

  const openSessionAttendance = (details: PlayerSheetSessionDetails) => {
    const target = getCoachAttendanceTargetFromPlayerCalendarEvent(details.event, details.instanceDate);
    if (target) setAttendanceModalTarget(target);
  };

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(11,13,13,0.72)] shadow-[0_24px_70px_rgba(0,0,0,0.24)]">
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[1160px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[rgba(255,255,255,0.08)] text-xs font-medium text-gray-300">
              <th className="w-[210px] px-5 py-4">
                <button type="button" onClick={() => toggleSort('name')} className="inline-flex items-center gap-1.5 hover:text-white">
                  Name {sort.key === 'name' ? <SortIcon size={13} /> : <ChevronDown size={13} className="text-gray-600" />}
                </button>
              </th>
              <th className="w-[90px] px-3 py-4">
                <button type="button" onClick={() => toggleSort('position')} className="inline-flex items-center gap-1.5 hover:text-white">
                  Position {sort.key === 'position' ? <SortIcon size={13} /> : <ChevronDown size={13} className="text-gray-600" />}
                </button>
              </th>
              <th className="w-[78px] px-3 py-4">Height</th>
              <th className="w-[78px] px-3 py-4">Weight</th>
              <th className="w-[126px] px-3 py-4">Health status</th>
              <th className="w-[142px] px-3 py-4">Logged daily wellness</th>
              <th className="w-[168px] px-3 py-4 leading-4">Logged training session<span className="block text-[10px] font-normal text-gray-500">last 24 hours</span></th>
              <th className="w-[88px] px-3 py-4 text-center">Readiness</th>
              <th className="w-[76px] px-3 py-4 text-center">Load</th>
              <th className="w-[76px] px-3 py-4 text-center">Fatigue</th>
              <th className="w-[138px] px-3 py-3 text-center">
                <span className="block">Attended sessions</span>
                <select
                  aria-label="Attendance history range"
                  value={attendanceRange}
                  onChange={(event) => setAttendanceRange(Number(event.target.value) as AttendanceRange)}
                  className="mt-1 rounded-md border border-white/10 bg-[var(--surface-card)] px-2 py-1 text-[10px] font-normal text-gray-400 outline-none"
                >
                  <option value={7}>Last 7 days</option>
                  <option value={14}>Last 14 days</option>
                  <option value={30}>Last 30 days</option>
                </select>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((dataset) => {
              const expanded = expandedPlayerId === dataset.player.id;
              const attendanceExpanded = expandedAttendancePlayerId === dataset.player.id;
              const trainingCount = dataset.sheet.coachSessionsLast24Hours.filter((session) => session.logged).length;
              const expectedCount = dataset.sheet.coachSessionsLast24Hours.length;
              const attendance = attendanceSummary(dataset, attendanceRange);
              return (
                <FragmentRow
                  key={dataset.player.id}
                  dataset={dataset}
                  expanded={expanded}
                  trainingCount={trainingCount}
                  expectedCount={expectedCount}
                  attendance={attendance}
                  attendanceExpanded={attendanceExpanded}
                  onToggle={(anchor) => toggleTrainingDetails(dataset, anchor)}
                  onToggleAttendance={(anchor) => toggleAttendanceDetails(dataset, anchor)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-white/[0.07] lg:hidden">
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
          <button type="button" onClick={() => toggleSort('name')} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-300">
            Name {sort.key === 'name' ? <SortIcon size={13} /> : <ChevronDown size={13} />}
          </button>
          <select
            aria-label="Attendance history range"
            value={attendanceRange}
            onChange={(event) => setAttendanceRange(Number(event.target.value) as AttendanceRange)}
            className="rounded-md border border-white/10 bg-[var(--surface-card)] px-2 py-1.5 text-xs text-gray-400 outline-none"
          >
            <option value={7}>Attendance · 7 days</option>
            <option value={14}>Attendance · 14 days</option>
            <option value={30}>Attendance · 30 days</option>
          </select>
        </div>
        {sortedPlayers.map((dataset) => {
          const expanded = expandedPlayerId === dataset.player.id;
          const attendanceExpanded = expandedAttendancePlayerId === dataset.player.id;
          const trainingCount = dataset.sheet.coachSessionsLast24Hours.filter((session) => session.logged).length;
          const expectedCount = dataset.sheet.coachSessionsLast24Hours.length;
          const attendance = attendanceSummary(dataset, attendanceRange);
          return (
            <article key={dataset.player.id} className="px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <PlayerIdentity dataset={dataset} />
                <HealthBadge status={dataset.injuryStatus} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-4">
                <Metric label="Position" value={dataset.player.positions.join(', ') || '—'} />
                <Metric label="Height / Weight" value={`${dataset.player.heightCm || '—'} cm · ${dataset.player.weightKg || '—'} kg`} />
                <Metric label="Wellness" value={<WellnessStatus completed={dataset.dailyWellness.completedToday} />} />
                <Metric
                  label="Attendance"
                  value={(
                    <button
                      type="button"
                      onClick={(event) => toggleAttendanceDetails(dataset, event.currentTarget)}
                      disabled={attendance.scheduled === 0}
                      className="inline-flex items-center gap-1 text-gray-100 enabled:hover:text-white disabled:cursor-default disabled:text-gray-500"
                      aria-expanded={attendanceExpanded}
                    >
                      {attendance.attended} / {attendance.scheduled}{' '}
                      {attendance.scheduled > 0
                        ? attendanceExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                        : <Minus size={14} />}
                    </button>
                  )}
                />
                <Metric label="Readiness" value={<span className={readinessTone(dataset.wellness.readinessScore)}>{formatMetric(dataset.wellness.readinessScore)}</span>} />
                <Metric label="Load" value={<span className={loadTone(dataset.wellness.acuteTrainingLoad)}>{formatMetric(dataset.wellness.acuteTrainingLoad)}</span>} />
                <Metric label="Fatigue" value={<span className={fatigueTone(dataset.wellness.fatigue)}>{formatMetric(dataset.wellness.fatigue)}</span>} />
                <Metric
                  label="Training · 24h"
                  value={(
                    <button
                      type="button"
                      onClick={(event) => toggleTrainingDetails(dataset, event.currentTarget)}
                      className="inline-flex items-center gap-1 text-gray-100 hover:text-white"
                      aria-expanded={expanded}
                    >
                      {trainingCount} / {expectedCount} {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}
                />
              </dl>
            </article>
          );
        })}
      </div>
      </section>
      {expandedDataset && popoverAnchor ? (
        <FloatingSessionPopover
          anchor={popoverAnchor}
          rowCount={expandedDataset.sheet.coachSessionsLast24Hours.length}
          ariaLabel="Logged training sessions"
          suspended={Boolean(selectedSessionDetails || attendanceModalTarget)}
          onClose={closeTrainingDetails}
        >
          <SessionDetails
            sessions={expandedDataset.sheet.coachSessionsLast24Hours}
            onOpenDetails={openSessionDetails}
            onOpenAttendance={openSessionAttendance}
          />
        </FloatingSessionPopover>
      ) : null}
      {expandedAttendanceDataset && expandedAttendance && attendancePopoverAnchor ? (
        <FloatingSessionPopover
          anchor={attendancePopoverAnchor}
          rowCount={expandedAttendance.sessions.length}
          ariaLabel="Attended sessions"
          suspended={Boolean(selectedSessionDetails || attendanceModalTarget)}
          onClose={closeAttendanceDetails}
        >
          <AttendanceSessionDetails
            sessions={expandedAttendance.sessions}
            onOpenDetails={openSessionDetails}
            onOpenAttendance={openSessionAttendance}
          />
        </FloatingSessionPopover>
      ) : null}
      {selectedSessionDetails ? (
        <PlayerEventDetailsModal
          occurrence={selectedSessionDetails}
          onClose={() => setSelectedSessionDetails(null)}
        />
      ) : null}
      {attendanceModalTarget ? (
        <CoachAttendanceModal
          target={attendanceModalTarget}
          onClose={() => {
            setAttendanceModalTarget(null);
            onAttendanceUpdated?.();
          }}
        />
      ) : null}
    </>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 font-medium text-gray-200">{value}</dd>
    </div>
  );
}

function FragmentRow({
  dataset,
  expanded,
  trainingCount,
  expectedCount,
  attendance,
  attendanceExpanded,
  onToggle,
  onToggleAttendance,
}: {
  dataset: TeamPlayerDataset;
  expanded: boolean;
  trainingCount: number;
  expectedCount: number;
  attendance: { attended: number; scheduled: number; sessions: TeamPlayerDataset['sheet']['attendanceHistory'] };
  attendanceExpanded: boolean;
  onToggle: (anchor: HTMLElement) => void;
  onToggleAttendance: (anchor: HTMLElement) => void;
}) {
  const ToggleIcon = trainingCount > 0 || expectedCount > 0 ? (expanded ? ChevronUp : ChevronDown) : Minus;
  const AttendanceToggleIcon = attendance.scheduled > 0
    ? attendanceExpanded ? ChevronUp : ChevronDown
    : Minus;
  return (
      <tr className={`border-b border-[rgba(255,255,255,0.07)] transition-colors hover:bg-white/[0.025] ${expanded || attendanceExpanded ? 'bg-white/[0.02]' : ''}`}>
        <td className="px-5 py-3"><PlayerIdentity dataset={dataset} /></td>
        <td className="px-3 py-3 text-xs text-gray-300">{dataset.player.positions.join(', ') || '—'}</td>
        <td className="px-3 py-3 text-xs text-gray-300">{dataset.player.heightCm ? `${dataset.player.heightCm} cm` : '—'}</td>
        <td className="px-3 py-3 text-xs text-gray-300">{dataset.player.weightKg ? `${dataset.player.weightKg} kg` : '—'}</td>
        <td className="px-3 py-3"><HealthBadge status={dataset.injuryStatus} /></td>
        <td className="px-3 py-3"><WellnessStatus completed={dataset.dailyWellness.completedToday} /></td>
        <td className="px-3 py-3">
          <button
            type="button"
            onClick={(event) => onToggle(event.currentTarget)}
            disabled={trainingCount === 0 && expectedCount === 0}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-200 enabled:hover:text-white disabled:cursor-default disabled:text-gray-500"
          >
            {trainingCount} / {expectedCount} <ToggleIcon size={14} />
          </button>
        </td>
        <td className={`px-3 py-3 text-center font-medium tabular-nums ${readinessTone(dataset.wellness.readinessScore)}`}>{formatMetric(dataset.wellness.readinessScore)}</td>
        <td className={`px-3 py-3 text-center font-medium tabular-nums ${loadTone(dataset.wellness.acuteTrainingLoad)}`}>{formatMetric(dataset.wellness.acuteTrainingLoad)}</td>
        <td className={`px-3 py-3 text-center font-medium tabular-nums ${fatigueTone(dataset.wellness.fatigue)}`}>{formatMetric(dataset.wellness.fatigue)}</td>
        <td className="px-3 py-3 text-center">
          <button
            type="button"
            onClick={(event) => onToggleAttendance(event.currentTarget)}
            disabled={attendance.scheduled === 0}
            aria-expanded={attendanceExpanded}
            className="inline-flex items-center gap-1 text-xs font-medium tabular-nums text-gray-300 enabled:hover:text-white disabled:cursor-default disabled:text-gray-500"
          >
            {attendance.attended} / {attendance.scheduled} <AttendanceToggleIcon size={14} />
          </button>
        </td>
      </tr>
  );
}
