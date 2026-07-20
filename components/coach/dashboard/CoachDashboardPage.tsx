'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  ArrowUpRight,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  ClipboardCheck,
  Layers,
  LineChart,
  Users,
} from 'lucide-react';
import { CoachAttendanceModal } from '@/components/coach/attendance/CoachAttendanceModal';
import { FloatingAttendanceButton } from '@/components/coach/attendance/FloatingAttendanceButton';
import { TeamCalendar } from '@/components/coach/calendar/TeamCalendar';
import type { TeamCalendarItem } from '@/components/coach/calendar/types';
import {
  type AttendanceEventTarget,
  getCoachAttendanceTargetFromTeamItem,
} from '@/lib/calendar/attendance';
import { useCoachAllTeamsCalendarItems, useCoachTeamInjuryAlerts, useCoachTeamProfileAverages } from '@/lib/coach/teamInsights';
import { useCoachTeam } from '@/lib/coach/selectedTeam';

interface TeamStatusBadge {
  label: string;
  className: string;
}

interface TeamCardData {
  id: string;
  name: string;
  code: string;
  players: number | null;
  readinessPlayers: number;
  loadPlayers: number;
  averageReadiness: number | null;
  averageLoad: number | null;
  statusBadge: TeamStatusBadge;
}

interface UpcomingActivity {
  id: string;
  teamId: string;
  title: string;
  type: string;
  startsAt: string;
  item: TeamCalendarItem;
}

interface DashboardAlert {
  id: string;
  teamName: string;
  message: string;
  metaItems?: string[];
  toneClass: string;
  sortKey: number;
}

const stableStatusBadge: TeamStatusBadge = {
  label: 'No Data',
  className: 'border-[rgba(255,255,255,0.22)] bg-[rgba(255,255,255,0.08)] text-gray-200',
};

const liveStatusBadge: TeamStatusBadge = {
  label: 'Live',
  className: 'border-[rgba(var(--status-green-rgb),0.35)] bg-[rgba(var(--status-green-rgb),0.12)] text-[var(--status-green)]',
};

const quickActions = [
  {
    label: 'Create Team Event',
    description: 'Schedule a team event or task.',
    href: '/coach/calendar',
    icon: CalendarPlus,
  },
  {
    label: 'View Teams',
    description: 'Manage active team selection.',
    href: '/coach/teams',
    icon: Users,
  },
  {
    label: 'View Selected Team Overview',
    description: 'Open the current team control room.',
    href: '/coach/overview',
    icon: Layers,
  },
  {
    label: 'View Analytics',
    description: 'Review readiness and load trends.',
    href: '/coach/analytics',
    icon: LineChart,
  },
  {
    label: 'View Calendar',
    description: 'Manage activities and tasks.',
    href: '/coach/calendar',
    icon: CalendarDays,
  },
];

export function CoachDashboardPage() {
  const { teams, selectedTeam, selectedTeamId, setSelectedTeamId } = useCoachTeam();
  const [floatingAttendance, setFloatingAttendance] = useState<{
    target: AttendanceEventTarget;
    x: number;
    y: number;
  } | null>(null);
  const [attendanceModalTarget, setAttendanceModalTarget] = useState<AttendanceEventTarget | null>(null);
  const teamIds = useMemo(() => teams.map((team) => team.id), [teams]);
  const { averagesByTeamId: profileAveragesByTeamId, isLoading: isLoadingPlayerCounts, error: playerCountError } = useCoachTeamProfileAverages(teamIds);
  const { items: allTeamsCalendarItems, isLoading: isLoadingCalendarItems, error: calendarItemsError } = useCoachAllTeamsCalendarItems(teams);
  const { alerts: injuryAlerts, isLoading: isLoadingInjuryAlerts, error: injuryAlertsError } = useCoachTeamInjuryAlerts(teams);

  const teamCards = useMemo<TeamCardData[]>(() => {
    return teams.map((team) => ({
      ...team,
      players: Object.prototype.hasOwnProperty.call(profileAveragesByTeamId, team.id)
        ? profileAveragesByTeamId[team.id]?.players ?? 0
        : null,
      readinessPlayers: profileAveragesByTeamId[team.id]?.readinessPlayers ?? 0,
      loadPlayers: profileAveragesByTeamId[team.id]?.loadPlayers ?? 0,
      averageReadiness: profileAveragesByTeamId[team.id]?.averageReadiness ?? null,
      averageLoad: profileAveragesByTeamId[team.id]?.averageLoad ?? null,
      statusBadge:
        profileAveragesByTeamId[team.id]?.averageReadiness != null || profileAveragesByTeamId[team.id]?.averageLoad != null
          ? liveStatusBadge
          : stableStatusBadge,
    }));
  }, [teams, profileAveragesByTeamId]);

  const todaySummary = useMemo(() => {
    const totalPlayers = teamCards.reduce((sum, team) => sum + (team.players ?? 0), 0);
    const hasUnknownPlayerCounts = teamCards.some((team) => team.players === null);
    const readinessPlayers = teamCards.reduce((sum, team) => sum + team.readinessPlayers, 0);
    const loadPlayers = teamCards.reduce((sum, team) => sum + team.loadPlayers, 0);
    const averageReadiness =
      readinessPlayers > 0
        ? teamCards.reduce((sum, team) => sum + (team.averageReadiness ?? 0) * team.readinessPlayers, 0) / readinessPlayers
        : null;
    const averageLoad =
      loadPlayers > 0
        ? teamCards.reduce((sum, team) => sum + (team.averageLoad ?? 0) * team.loadPlayers, 0) / loadPlayers
        : null;

    return {
      totalTeams: teamCards.length,
      totalPlayers,
      hasUnknownPlayerCounts,
      averageReadiness,
      averageLoad,
    };
  }, [teamCards]);

  const teamNameById = useMemo(() => {
    return new Map(teams.map((team) => [team.id, team.name]));
  }, [teams]);

  const upcomingActivities = useMemo<UpcomingActivity[]>(() => {
    return allTeamsCalendarItems
      .filter((item) => item.status === 'upcoming')
      .slice(0, 8)
      .map((item) => ({
        id: item.id,
        teamId: item.teamId,
        title: item.title,
        type: item.type,
        startsAt: `${item.date}T${item.startTime}:00`,
        item,
      }));
  }, [allTeamsCalendarItems]);

  const closeFloatingAttendance = useCallback(() => {
    setFloatingAttendance(null);
  }, []);

  const handleCalendarItemSelect = useCallback((item: TeamCalendarItem, instanceDate: string, click?: { x: number; y: number }) => {
    const attendanceTarget = getCoachAttendanceTargetFromTeamItem(item, instanceDate);
    if (attendanceTarget && click) {
      setFloatingAttendance({
        target: attendanceTarget,
        x: click.x,
        y: click.y,
      });
    } else {
      setFloatingAttendance(null);
    }
  }, []);

  const recentAlerts = useMemo<DashboardAlert[]>(() => {
    const alerts: DashboardAlert[] = [];

    injuryAlerts.forEach((injuryAlert) => {
      const statusLabel =
        injuryAlert.source === 'wellness' || injuryAlert.source === 'training'
          ? injuryAlert.isCurrent
            ? injuryAlert.source === 'wellness'
              ? 'Current morning wellness injury'
              : 'Current training injury'
            : injuryAlert.source === 'wellness'
              ? 'Recent morning wellness injury'
              : 'Recent training injury'
            : injuryAlert.status === 'active'
              ? 'Active injury'
              : 'Recovering injury';
      alerts.push({
        id: `${injuryAlert.id}-injury`,
        teamName: teamNameById.get(injuryAlert.teamId) ?? 'Unknown Team',
        message: `${statusLabel}: ${injuryAlert.playerName} - ${injuryAlert.description}`,
        metaItems: [
          injuryAlert.reportedAgo,
          ...(injuryAlert.isCurrent ? [] : ['latest status is healthy']),
        ],
        toneClass: injuryAlert.isCurrent ? 'text-[var(--status-red)]' : 'text-[var(--status-orange)]',
        sortKey: new Date(injuryAlert.createdAt).getTime(),
      });
    });

    teamCards.forEach((team) => {
      if (team.averageReadiness != null && team.averageReadiness < 70) {
        alerts.push({
          id: `${team.id}-readiness`,
          teamName: team.name,
          message: `Low readiness average (${Math.round(team.averageReadiness)}%).`,
          toneClass: 'text-[var(--status-red)]',
          sortKey: Number.MAX_SAFE_INTEGER - 1,
        });
      }

      if (team.averageLoad != null && team.averageLoad > 700) {
        alerts.push({
          id: `${team.id}-load`,
          teamName: team.name,
          message: `High seven-day training load (${Math.round(team.averageLoad)}).`,
          toneClass: 'text-[var(--status-orange)]',
          sortKey: Number.MAX_SAFE_INTEGER - 2,
        });
      }
    });

    return alerts
      .sort((first, second) => second.sortKey - first.sortKey)
      .slice(0, 8);
  }, [injuryAlerts, teamCards, teamNameById]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="glass-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-secondary)]">Coach Dashboard</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">Welcome back, Coach.</h1>
            <p className="mt-2 text-sm text-gray-400">
              {todaySummary.totalTeams > 0
                ? (todaySummary.averageReadiness == null && todaySummary.averageLoad == null
                    ? 'No readiness or load logs have been recorded for your teams yet. Invite players and ask them to start logging.'
                    : 'Team readiness and load metrics are connected from real player logs.')
                : 'Create your first team to start your coach workspace.'}
            </p>
            {isLoadingPlayerCounts ? <p className="mt-2 text-xs text-gray-400">Loading team player totals...</p> : null}
            {playerCountError ? <p className="mt-2 text-xs text-[var(--status-red)]">Unable to load player totals: {playerCountError}</p> : null}
            {calendarItemsError ? <p className="mt-2 text-xs text-[var(--status-red)]">Unable to load team calendar: {calendarItemsError}</p> : null}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.05)] px-2.5 py-1 font-medium text-gray-300">
                {todaySummary.totalTeams} teams
              </span>
              <span className="rounded-full border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.05)] px-2.5 py-1 font-medium text-gray-300">
                {todaySummary.hasUnknownPlayerCounts ? 'Loading players...' : `${todaySummary.totalPlayers} players`}
              </span>
              <span className="rounded-full border border-[rgba(var(--accent-secondary-rgb),0.3)] bg-[rgba(var(--accent-secondary-rgb),0.1)] px-2.5 py-1 font-medium text-[var(--metric-readiness)]">
                Avg readiness {todaySummary.averageReadiness == null ? '--' : `${Math.round(todaySummary.averageReadiness)}%`}
              </span>
              <span className="rounded-full border border-[rgba(var(--metric-load-rgb),0.35)] bg-[rgba(var(--metric-load-rgb),0.12)] px-2.5 py-1 font-medium text-[var(--metric-load)]">
                Average Load (7 days) {todaySummary.averageLoad == null ? '--' : Math.round(todaySummary.averageLoad)}
              </span>
              <span className="rounded-full border border-[rgba(var(--accent-primary-rgb),0.28)] bg-[rgba(var(--accent-primary-rgb),0.1)] px-2.5 py-1 font-medium text-[var(--accent-primary)]">
                Selected team: {selectedTeam.name}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Today</p>
            <p className="mt-1 text-sm font-semibold text-white">{format(new Date(), 'EEEE, MMM d')}</p>
          </div>
        </div>
      </header>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-300">All Teams Summary</h2>
          <Link
            href="/coach/teams"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-secondary)] transition-colors hover:text-white"
          >
            Open teams
            <ChevronRight size={14} />
          </Link>
        </div>

        {teamCards.length === 0 ? (
          <div className="glass-card p-4 text-sm text-gray-300">
            <p>No teams available yet.</p>
            <p className="mt-2 text-xs text-gray-500">Create a team from Teams, then share its invite code with players.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {teamCards.map((team) => (
              <article
                key={team.id}
                className={`glass-card p-4 transition-colors ${
                  team.id === selectedTeamId
                    ? 'border-[rgba(var(--accent-primary-rgb),0.42)] bg-[rgba(var(--accent-primary-rgb),0.08)]'
                    : 'hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(var(--surface-elevated-rgb),0.92)]'
                }`}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{team.name}</p>
                    <p className="mt-0.5 text-[11px] uppercase tracking-wide text-gray-400">{team.code}</p>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${team.statusBadge.className}`}>
                    {team.statusBadge.label}
                  </span>
                </div>

                <dl className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-gray-300">Players</dt>
                    <dd className="font-semibold text-white">{team.players ?? '--'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-gray-300">Avg readiness</dt>
                    <dd className="font-semibold text-[var(--metric-readiness)]">
                      {team.averageReadiness == null ? '--' : `${Math.round(team.averageReadiness)}%`}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-gray-300" title="Total seven-day training load divided by all players on the team.">
                      Average Load (7 days)
                    </dt>
                    <dd className="font-semibold text-[var(--metric-load)]">
                      {team.averageLoad == null ? '--' : Math.round(team.averageLoad)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTeamId(team.id)}
                    className="rounded-lg border border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.05)] px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white transition-colors hover:bg-[rgba(255,255,255,0.1)]"
                  >
                    {team.id === selectedTeamId ? 'Selected' : 'Select Team'}
                  </button>
                  <Link
                    href="/coach/overview"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-secondary)] transition-colors hover:text-white"
                  >
                    View team
                    <ArrowUpRight size={12} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.92fr)] xl:items-start">
        <section className="glass-card p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Cross-Team Upcoming Activities</h2>
              <p className="mt-1 text-xs text-gray-400">Games, training, gym, recovery, and tasks across all teams.</p>
            </div>
            <Link
              href="/coach/calendar"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-secondary)] transition-colors hover:text-white"
            >
              Open calendar
              <ChevronRight size={14} />
            </Link>
          </div>

          {upcomingActivities.length === 0 ? (
            <div className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-3.5 py-3 text-sm text-gray-300">
              No upcoming activities yet. Add team events or tasks from Calendar.
            </div>
          ) : (
            <div className="space-y-2.5">
              {upcomingActivities.map((activity) => (
                <article
                  key={activity.id}
                  className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-3.5 py-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{activity.title}</p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {teamNameById.get(activity.teamId) ?? 'Unknown Team'} - {format(parseISO(activity.startsAt), 'EEE, MMM d - h:mm a')}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-[rgba(var(--accent-secondary-rgb),0.35)] bg-[rgba(var(--accent-secondary-rgb),0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-secondary)]">
                        {activity.type}
                      </span>
                      {getCoachAttendanceTargetFromTeamItem(activity.item, activity.item.date) ? (
                        <button
                          type="button"
                          onClick={() => {
                            const target = getCoachAttendanceTargetFromTeamItem(activity.item, activity.item.date);
                            if (target) setAttendanceModalTarget(target);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(var(--accent-primary-rgb),0.38)] bg-[rgba(var(--accent-primary-rgb),0.12)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--accent-primary)] transition-colors hover:bg-[rgba(var(--accent-primary-rgb),0.18)]"
                        >
                          <ClipboardCheck size={12} />
                          Attendance
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="glass-card p-4 sm:p-5">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-white">Recent Alerts</h2>
            <p className="mt-1 text-xs text-gray-400">Real signals generated from current readiness, load, and injury data.</p>
          </div>
          {injuryAlertsError ? <p className="mb-2 text-xs text-[var(--status-red)]">Unable to load injury alerts: {injuryAlertsError}</p> : null}
          {isLoadingInjuryAlerts ? <p className="mb-2 text-xs text-gray-400">Loading injury alerts...</p> : null}
          {recentAlerts.length === 0 ? (
            <div className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-3.5 py-3 text-sm text-gray-300">
              No alerts triggered from current team data.
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentAlerts.map((alert) => (
                <article
                  key={alert.id}
                  className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-3.5 py-3"
                >
                  <p className="text-sm font-semibold text-white">{alert.teamName}</p>
                  <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <p className={`min-w-0 flex-1 text-xs ${alert.toneClass}`}>{alert.message}</p>
                    {alert.metaItems && alert.metaItems.length > 0 ? (
                      <div className="flex shrink-0 flex-wrap gap-1.5 sm:max-w-[45%] sm:justify-end">
                        {alert.metaItems.map((item) => (
                          <span
                            key={item}
                            className={`rounded-full border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[10px] font-semibold ${alert.toneClass}`}
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-300">Quick Actions</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                href={action.href}
                className="glass-card group flex min-h-[96px] items-center justify-between gap-3 p-4 transition-colors hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(var(--surface-elevated-rgb),0.92)]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0 rounded-lg border border-[rgba(var(--accent-primary-rgb),0.24)] bg-[rgba(var(--accent-primary-rgb),0.1)] p-2 text-[var(--accent-primary)]">
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{action.label}</p>
                    <p className="mt-1 text-xs text-gray-400">{action.description}</p>
                  </div>
                </div>
                <ArrowUpRight
                  size={14}
                  className="shrink-0 text-gray-500 transition-colors group-hover:text-[var(--accent-secondary)]"
                />
              </Link>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">All Teams Calendar</h2>
            <p className="mt-1 text-xs text-gray-400">
              Coach-wide schedule across all teams with daily and weekly views.
            </p>
          </div>
          <Link
            href="/coach/calendar"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-secondary)] transition-colors hover:text-white"
          >
            Open full calendar
            <ChevronRight size={14} />
          </Link>
        </div>

        <TeamCalendar
          items={allTeamsCalendarItems}
          className="min-h-[560px] xl:h-[760px]"
          onSelectItem={handleCalendarItemSelect}
          onCalendarViewportChange={closeFloatingAttendance}
        />
        {isLoadingCalendarItems ? <p className="text-xs text-gray-400">Loading cross-team calendar...</p> : null}
      </section>

      {floatingAttendance ? (
        <FloatingAttendanceButton
          x={floatingAttendance.x}
          y={floatingAttendance.y}
          onClose={closeFloatingAttendance}
          onOpen={() => {
            setAttendanceModalTarget(floatingAttendance.target);
            setFloatingAttendance(null);
          }}
        />
      ) : null}

      {attendanceModalTarget ? (
        <CoachAttendanceModal
          target={attendanceModalTarget}
          onClose={() => setAttendanceModalTarget(null)}
        />
      ) : null}
    </div>
  );
}
