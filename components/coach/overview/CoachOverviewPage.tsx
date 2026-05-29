'use client';

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ArrowUpRight, CalendarPlus, CalendarRange, ChevronRight, ClipboardList, LineChart } from 'lucide-react';
import { useCoachTeam } from '@/lib/coach/selectedTeam';
import { useCoachSelectedTeamInsights } from '@/lib/coach/teamInsights';
import type { OverviewTrend } from '@/components/coach/overview/mockData';

interface SparklineProps {
  points: number[];
}

function Sparkline({ points }: SparklineProps) {
  if (points.length === 0) {
    return <div className="h-16 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)]" />;
  }

  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = Math.max(1, max - min);
  const width = 280;
  const height = 64;

  const coordinates = points.map((value, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 8) - 4;
    return { x, y };
  });

  const path = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${path} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="overviewTrendFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(74,158,255,0.34)" />
          <stop offset="100%" stopColor="rgba(74,158,255,0.02)" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#overviewTrendFill)" />
      <path d={path} fill="none" stroke="var(--accent-secondary)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function TrendCard({ trend }: { trend: OverviewTrend }) {
  const trendDirection = trend.delta === 0 ? 'No change' : trend.delta > 0 ? `+${trend.delta}` : `${trend.delta}`;

  return (
    <article className="glass-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-400">{trend.label}</p>
          <p className={`mt-1 text-lg font-bold ${trend.toneClass}`}>{trend.latest}</p>
        </div>
        <span className="rounded-md border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.05)] px-2 py-0.5 text-[11px] font-semibold text-gray-200">
          {trendDirection}
        </span>
      </div>
      <Sparkline points={trend.points} />
    </article>
  );
}

const quickActions = [
  {
    label: 'Create Team Event',
    description: 'Open the team scheduler and create a new event or task.',
    href: '/coach/calendar',
    icon: CalendarPlus,
  },
  {
    label: 'View Players',
    description: 'Inspect player wellness, analytics, and personal calendars.',
    href: '/coach/players',
    icon: ClipboardList,
  },
  {
    label: 'View Analytics',
    description: 'Review team averages and individual comparisons.',
    href: '/coach/analytics',
    icon: LineChart,
  },
  {
    label: 'View Calendar',
    description: 'Manage upcoming team sessions, tasks, and game windows.',
    href: '/coach/calendar',
    icon: CalendarRange,
  },
];

export function CoachOverviewPage() {
  const { selectedTeam } = useCoachTeam();
  const { overviewData, isLoading, error } = useCoachSelectedTeamInsights(selectedTeam.id);

  if (!selectedTeam.id) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="glass-card p-5 sm:p-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">Overview</h1>
          <p className="mt-2 text-sm text-gray-400">Create or select a team first to view overview data.</p>
        </header>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="glass-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Overview</h1>
            <p className="mt-2 text-sm text-gray-400">
              Team control room for {selectedTeam.name}. Quick status, risk signals, and next activities.
            </p>
            {isLoading ? <p className="mt-2 text-xs text-gray-400">Loading team overview data...</p> : null}
            {error ? <p className="mt-2 text-xs text-[var(--status-red)]">Unable to load overview data: {error}</p> : null}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.05)] px-2.5 py-1 font-semibold uppercase tracking-wide text-gray-200">
                {selectedTeam.code}
              </span>
              <span className="rounded-full border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.04)] px-2.5 py-1 font-medium text-gray-300">
                {overviewData.summary.playerCount} players
              </span>
              <span className="rounded-full border border-[rgba(0,212,170,0.3)] bg-[rgba(0,212,170,0.1)] px-2.5 py-1 font-medium text-[var(--accent-primary)]">
                Avg readiness {overviewData.summary.averageReadiness == null ? '--' : `${overviewData.summary.averageReadiness}%`}
              </span>
              <span className="rounded-full border border-[rgba(74,158,255,0.35)] bg-[rgba(74,158,255,0.12)] px-2.5 py-1 font-medium text-[var(--accent-secondary)]">
                Avg load {overviewData.summary.averageLoad == null ? '--' : overviewData.summary.averageLoad}
              </span>
            </div>
          </div>

          <span
            className={`h-fit rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${overviewData.summary.status.className}`}
          >
            {overviewData.summary.status.label}
          </span>
        </div>
      </header>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-300">Key Team Metrics</h2>
        {overviewData.keyMetrics.length === 0 ? (
          <div className="mt-3 glass-card p-4 text-sm text-gray-300">No team metrics available yet.</div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {overviewData.keyMetrics.map((metric) => (
              <article key={metric.label} className="glass-card p-3.5">
                <p className="text-[10px] uppercase tracking-wide text-gray-400">{metric.label}</p>
                <p className={`mt-1.5 text-xl font-bold ${metric.toneClass}`}>{metric.value == null ? '--' : metric.value}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className="glass-card p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Players Needing Attention</h2>
              <p className="mt-1 text-xs text-gray-400">Based on readiness, fatigue, load, sleep, and stress signals.</p>
            </div>
            <Link
              href="/coach/players"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-secondary)] transition-colors hover:text-white"
            >
              Open players
              <ChevronRight size={14} />
            </Link>
          </div>

          {overviewData.playersNeedingAttention.length === 0 ? (
            <div className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-4 py-5">
              <p className="text-sm text-gray-300">No players are currently flagged.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {overviewData.playersNeedingAttention.map((player) => (
                <article
                  key={player.playerId}
                  className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-3.5 py-3 sm:px-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-white">{player.playerName}</h3>
                      <p className="mt-0.5 text-xs text-gray-400">{player.issue}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="rounded-md border border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.05)] px-2 py-0.5 text-xs font-semibold text-white">
                        {player.scoreLabel}: {player.scoreValue}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${player.statusClassName}`}
                      >
                        {player.statusLabel}
                      </span>
                      <Link
                        href={`/coach/players?player=${player.playerId}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-secondary)] transition-colors hover:text-white"
                      >
                        View player
                        <ArrowUpRight size={12} />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="glass-card p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Upcoming Activities</h2>
              <p className="mt-1 text-xs text-gray-400">Team sessions, tasks, games, and training events.</p>
            </div>
            <Link
              href="/coach/calendar"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-secondary)] transition-colors hover:text-white"
            >
              Open calendar
              <ChevronRight size={14} />
            </Link>
          </div>

          {overviewData.upcomingActivities.length === 0 ? (
            <div className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-4 py-5">
              <p className="text-sm text-gray-300">No upcoming activities yet.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {overviewData.upcomingActivities.map((activity) => (
                <article
                  key={activity.id}
                  className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-3.5 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{activity.title}</p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {format(parseISO(activity.date), 'EEE, MMM d')} - {activity.startTime} - {activity.endTime}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-full border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.05)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-200">
                        {activity.kind}
                      </span>
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
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-300">Recent Trends</h2>
        {overviewData.trends.length === 0 ? (
          <div className="mt-3 glass-card p-4 text-sm text-gray-300">No trend data available yet.</div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {overviewData.trends.map((trend) => (
              <TrendCard key={trend.label} trend={trend} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-300">Quick Actions</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                href={action.href}
                className="glass-card group flex flex-col gap-3 p-4 transition-colors hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(25,33,73,0.72)]"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-lg border border-[rgba(0,212,170,0.24)] bg-[rgba(0,212,170,0.1)] p-2 text-[var(--accent-primary)]">
                    <Icon size={16} />
                  </span>
                  <ArrowUpRight
                    size={14}
                    className="text-gray-500 transition-colors group-hover:text-[var(--accent-secondary)]"
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{action.label}</p>
                  <p className="mt-1 text-xs text-gray-400">{action.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
