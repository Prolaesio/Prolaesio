'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import {
  ArrowUpRight,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  Layers,
  LineChart,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { TeamCalendar } from '@/components/coach/calendar/TeamCalendar';
import type { TeamCalendarItem } from '@/components/coach/calendar/types';
import { useCoachAllTeamsCalendarItems, useCoachTeamProfileAverages } from '@/lib/coach/teamInsights';
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
}

const stableStatusBadge: TeamStatusBadge = {
  label: 'No Data',
  className: 'border-[rgba(255,255,255,0.22)] bg-[rgba(255,255,255,0.08)] text-gray-200',
};

const liveStatusBadge: TeamStatusBadge = {
  label: 'Live',
  className: 'border-[rgba(0,212,170,0.35)] bg-[rgba(0,212,170,0.12)] text-[var(--accent-primary)]',
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
  const teamIds = useMemo(() => teams.map((team) => team.id), [teams]);
  const { averagesByTeamId: profileAveragesByTeamId, isLoading: isLoadingPlayerCounts, error: playerCountError } = useCoachTeamProfileAverages(teamIds);
  const { items: allTeamsCalendarItems, isLoading: isLoadingCalendarItems, error: calendarItemsError } = useCoachAllTeamsCalendarItems(teams);

  const teamCards = useMemo<TeamCardData[]>(() => {
    return teams.map((team) => ({
      ...team,
      players: Object.prototype.hasOwnProperty.call(profileAveragesByTeamId, team.id)
        ? profileAveragesByTeamId[team.id]?.players ?? 0
        : null,
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
    const readinessValues = teamCards
      .map((team) => team.averageReadiness)
      .filter((value): value is number => value != null && Number.isFinite(value));
    const loadValues = teamCards
      .map((team) => team.averageLoad)
      .filter((value): value is number => value != null && Number.isFinite(value));
    const averageReadiness =
      readinessValues.length > 0
        ? readinessValues.reduce((sum, value) => sum + value, 0) / readinessValues.length
        : null;
    const averageLoad =
      loadValues.length > 0
        ? loadValues.reduce((sum, value) => sum + value, 0) / loadValues.length
        : null;

    return {
      totalTeams: teamCards.length,
      totalPlayers,
      hasUnknownPlayerCounts,
      averageReadiness,
      averageLoad,
      attentionCount: 0,
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
      }));
  }, [allTeamsCalendarItems]);

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
                    ? 'No readiness or load logs have been recorded for your teams yet.'
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
              <span className="rounded-full border border-[rgba(0,212,170,0.3)] bg-[rgba(0,212,170,0.1)] px-2.5 py-1 font-medium text-[var(--accent-primary)]">
                Avg readiness {todaySummary.averageReadiness == null ? '--' : `${Math.round(todaySummary.averageReadiness)}%`}
              </span>
              <span className="rounded-full border border-[rgba(74,158,255,0.35)] bg-[rgba(74,158,255,0.12)] px-2.5 py-1 font-medium text-[var(--accent-secondary)]">
                Avg load {todaySummary.averageLoad == null ? '--' : Math.round(todaySummary.averageLoad)}
              </span>
              <span className="rounded-full border border-[rgba(0,212,170,0.28)] bg-[rgba(0,212,170,0.1)] px-2.5 py-1 font-medium text-[var(--accent-primary)]">
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
          <div className="glass-card p-4 text-sm text-gray-300">No teams available yet.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {teamCards.map((team) => (
              <article
                key={team.id}
                className={`glass-card p-4 transition-colors ${
                  team.id === selectedTeamId
                    ? 'border-[rgba(0,212,170,0.42)] bg-[rgba(0,212,170,0.08)]'
                    : 'hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(25,33,73,0.72)]'
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
                    <dd className="font-semibold text-[var(--accent-primary)]">
                      {team.averageReadiness == null ? '--' : `${Math.round(team.averageReadiness)}%`}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-gray-300">Avg load</dt>
                    <dd className="font-semibold text-[var(--accent-secondary)]">
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] xl:items-stretch">
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

          <TeamCalendar items={allTeamsCalendarItems} className="min-h-[560px] xl:h-[760px]" />
          {isLoadingCalendarItems ? <p className="text-xs text-gray-400">Loading cross-team calendar...</p> : null}
        </section>

        <section className="glass-card p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Recent Alerts</h2>
              <p className="mt-1 text-xs text-gray-400">Coach-wide flags from readiness, load, attendance, and sleep trends.</p>
            </div>
            <ShieldAlert size={16} className="text-[var(--status-red)]" />
          </div>

          <div className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-3.5 py-3 text-sm text-gray-300">
            No alerts yet.
          </div>
        </section>
      </div>

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
              No upcoming activities yet.
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
                      <span className="rounded-full border border-[rgba(74,158,255,0.35)] bg-[rgba(74,158,255,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-secondary)]">
                        {activity.type}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-300">Quick Actions</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.label}
                  href={action.href}
                  className="glass-card group flex min-h-[96px] items-center justify-between gap-3 p-4 transition-colors hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(25,33,73,0.72)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="shrink-0 rounded-lg border border-[rgba(0,212,170,0.24)] bg-[rgba(0,212,170,0.1)] p-2 text-[var(--accent-primary)]">
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
      </div>

      <section className="glass-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Continue Where You Left Off</h2>
            <p className="mt-1 text-xs text-gray-400">
              Last selected team: {selectedTeam.name} - Last viewed page: Team Analytics
            </p>
          </div>
          <Link
            href="/coach/analytics"
            className="inline-flex w-fit items-center gap-1 rounded-lg border border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.05)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[rgba(255,255,255,0.1)]"
          >
            Return to Team Analytics
            <ChevronRight size={14} />
          </Link>
        </div>
      </section>
    </div>
  );
}
