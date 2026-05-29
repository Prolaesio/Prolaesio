'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnalyticsLegend } from '@/components/coach/analytics/AnalyticsLegend';
import { AnalyticsViewToggle } from '@/components/coach/analytics/AnalyticsViewToggle';
import { comparisonMetricDefinitions } from '@/components/coach/analytics/mockData';
import { IndividualPlayerAnalyticsCard } from '@/components/coach/analytics/IndividualPlayerAnalyticsCard';
import { MetricsGrid } from '@/components/coach/analytics/MetricsGrid';
import { PlayerComparisonChart } from '@/components/coach/analytics/PlayerComparisonChart';
import { TeamAnalyticsChart } from '@/components/coach/analytics/TeamAnalyticsChart';
import { TeamAveragesPanel } from '@/components/coach/analytics/TeamAveragesPanel';
import type { AnalyticsViewMode, ComparisonMetricKey, TeamAnalyticsDataset, TeamPlayerComparisonPoint } from '@/components/coach/analytics/types';
import { useCoachTeam } from '@/lib/coach/selectedTeam';
import { useCoachSelectedTeamInsights } from '@/lib/coach/teamInsights';

function AveragesView({
  legendItems,
  teamAveragesMetrics,
  averages,
}: {
  legendItems: string[];
  teamAveragesMetrics: TeamAnalyticsDataset['teamAveragesMetrics'];
  averages: TeamAnalyticsDataset['averages'];
}) {
  const latestSleepPoint = averages.sleepQualityAndTiming[averages.sleepQualityAndTiming.length - 1];
  const sleepTimingNote = latestSleepPoint
    ? `Team average timing: asleep ${latestSleepPoint.bedTime}, woke ${latestSleepPoint.wakeTime}.`
    : undefined;

  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid gap-4 md:grid-cols-2">
        <TeamAnalyticsChart
          graphNumber={1}
          title="Team Readiness Score Trend"
          data={averages.readinessTrend}
          leftDomain={[0, 100]}
          series={[{ dataKey: 'readinessScore', name: 'Readiness Score', color: 'var(--accent-primary)' }]}
        />

        <TeamAnalyticsChart
          graphNumber={2}
          title="Team Energy vs Fatigue vs Acute Training Load"
          data={averages.energyFatigueLoad}
          leftDomain={[250, 950]}
          rightDomain={[0, 10]}
          series={[
            {
              dataKey: 'acuteTrainingLoad',
              name: 'Acute Training Load',
              color: 'var(--accent-secondary)',
              type: 'bar',
              yAxisId: 'left',
            },
            { dataKey: 'energy', name: 'Energy', color: '#ffd43b', yAxisId: 'right' },
            { dataKey: 'fatigue', name: 'Fatigue', color: '#ff6b6b', yAxisId: 'right' },
          ]}
        />

        <TeamAnalyticsChart
          graphNumber={3}
          title="Team Sleep Time vs Sleep Quality vs Sleep Score"
          data={averages.sleepQualityAndTiming}
          leftDomain={[4, 10]}
          rightDomain={[0, 100]}
          footerNote={sleepTimingNote}
          series={[
            { dataKey: 'sleepHours', name: 'Sleep Time (hours)', color: 'var(--accent-secondary)', type: 'bar', yAxisId: 'left' },
            { dataKey: 'sleepQualityScore', name: 'Sleep Quality', color: '#ffd43b', yAxisId: 'right' },
            { dataKey: 'sleepScore', name: 'Sleep Score', color: 'var(--accent-primary)', yAxisId: 'right' },
          ]}
        />

        <TeamAnalyticsChart
          graphNumber={4}
          title="Team Stress vs Sleep Score"
          data={averages.stressVsSleepScore}
          leftDomain={[0, 100]}
          series={[
            { dataKey: 'stress', name: 'Stress', color: '#ff6b6b' },
            { dataKey: 'sleepScore', name: 'Sleep Score', color: 'var(--accent-secondary)' },
          ]}
        />

        <div className="md:col-span-2">
          <TeamAnalyticsChart
            graphNumber={5}
            title="Team Multi-Factor Inputs vs Readiness Score"
            data={averages.multiFactorReadiness}
            leftDomain={[0, 100]}
            series={[
              { dataKey: 'readinessScore', name: 'Readiness Score', color: 'var(--accent-primary)', type: 'bar' },
              { dataKey: 'sleepScore', name: 'Sleep Score', color: 'var(--accent-secondary)' },
              { dataKey: 'energyScore', name: 'Energy', color: '#ffd43b' },
              { dataKey: 'fatigueScore', name: 'Fatigue', color: '#ff922b' },
              { dataKey: 'stressScore', name: 'Stress', color: '#ff6b6b' },
              { dataKey: 'loadScore', name: 'Load Score', color: '#b197fc' },
            ]}
          />
        </div>
      </div>

      <div className="grid h-fit gap-4">
        <AnalyticsLegend items={legendItems} />
        <TeamAveragesPanel metrics={teamAveragesMetrics} />
      </div>
    </div>
  );
}

function getExtremePlayer(
  players: TeamPlayerComparisonPoint[],
  key: ComparisonMetricKey,
  direction: 'highest' | 'lowest'
) {
  if (players.length === 0) return null;

  return players.reduce((current, candidate) => {
    const currentValue = current[key];
    const candidateValue = candidate[key];
    if (direction === 'highest') {
      return candidateValue > currentValue ? candidate : current;
    }
    return candidateValue < currentValue ? candidate : current;
  });
}

function IndividualsView({
  labels,
  selectedDayLabel,
  onSelectDayLabel,
  playersForDay,
}: {
  labels: string[];
  selectedDayLabel: string;
  onSelectDayLabel: (label: string) => void;
  playersForDay: TeamPlayerComparisonPoint[];
}) {
  const teamAverageLoad =
    playersForDay.length > 0
      ? playersForDay.reduce((sum, player) => sum + player.acuteTrainingLoad, 0) / playersForDay.length
      : 0;

  const topReadiness = getExtremePlayer(playersForDay, 'readinessScore', 'highest');
  const lowReadiness = getExtremePlayer(playersForDay, 'readinessScore', 'lowest');
  const topLoad = getExtremePlayer(playersForDay, 'acuteTrainingLoad', 'highest');
  const lowSleep = getExtremePlayer(playersForDay, 'sleepScore', 'lowest');

  const metricsItems = [
    {
      label: 'Highest Readiness',
      value: topReadiness ? `${topReadiness.readinessScore}` : '--',
      context: topReadiness ? `${topReadiness.playerName}` : 'No players for this day',
      toneClass: 'text-[var(--accent-primary)]',
    },
    {
      label: 'Lowest Readiness',
      value: lowReadiness ? `${lowReadiness.readinessScore}` : '--',
      context: lowReadiness ? `${lowReadiness.playerName}` : 'No players for this day',
      toneClass: 'text-[var(--status-red)]',
    },
    {
      label: 'Highest Acute Load',
      value: topLoad ? `${topLoad.acuteTrainingLoad}` : '--',
      context: topLoad ? `${topLoad.playerName}` : 'No players for this day',
      toneClass: 'text-[var(--accent-secondary)]',
    },
    {
      label: 'Lowest Sleep Score',
      value: lowSleep ? `${lowSleep.sleepScore}` : '--',
      context: lowSleep ? `${lowSleep.playerName}` : 'No players for this day',
      toneClass: 'text-[var(--status-orange)]',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="text-sm font-semibold text-white">Selected Day Comparison</h2>
          <p className="mt-1 text-xs text-gray-400">
            One data point per player for the selected day to spot overload and recovery risk.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          Day:
          <select
            value={selectedDayLabel}
            onChange={(event) => onSelectDayLabel(event.target.value)}
            className="min-w-[132px] appearance-none rounded-lg border border-[rgba(255,255,255,0.16)] bg-[rgba(8,11,28,0.96)] px-3 py-2 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-colors focus:border-[var(--accent-secondary)] focus:bg-[rgba(8,11,28,1)]"
          >
            {labels.map((label) => (
              <option key={label} value={label} className="bg-[var(--background)] text-white">
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <MetricsGrid items={metricsItems} />

      <div className="grid gap-4 md:grid-cols-2">
        {comparisonMetricDefinitions.map((metric, index) => (
          <PlayerComparisonChart
            key={metric.key}
            graphNumber={index + 1}
            metric={metric}
            players={playersForDay}
          />
        ))}
      </div>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Player Snapshot Cards</h3>
          <p className="mt-1 text-xs text-gray-400">Compact same-day cards to quickly flag overload and under-recovery.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {playersForDay.map((player) => (
            <IndividualPlayerAnalyticsCard key={player.playerId} player={player} teamAverageLoad={teamAverageLoad} />
          ))}
        </div>
      </section>
    </div>
  );
}

export function CoachAnalyticsPage() {
  const { selectedTeam } = useCoachTeam();
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>('averages');
  const { analyticsData: teamAnalytics, isLoading, error } = useCoachSelectedTeamInsights(selectedTeam.id);
  const hasAnalyticsData = teamAnalytics.labels.length > 0;
  const [selectedDayLabel, setSelectedDayLabel] = useState<string>('');

  useEffect(() => {
    const latestLabel = teamAnalytics.labels[teamAnalytics.labels.length - 1] ?? '';
    setSelectedDayLabel(latestLabel);
  }, [teamAnalytics.labels]);

  const playersForSelectedDay = useMemo(() => {
    if (!selectedDayLabel) return [];
    return teamAnalytics.individualsByLabel[selectedDayLabel] ?? [];
  }, [selectedDayLabel, teamAnalytics.individualsByLabel]);

  if (!selectedTeam.id) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-white">Analytics</h1>
          <p className="mt-2 text-sm text-gray-400">Create or select a team first to view analytics.</p>
        </header>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Analytics</h1>
          <p className="mt-2 text-sm text-gray-400">
            Analyze team-wide readiness trends and compare individuals for {selectedTeam.name}.
          </p>
          <p className="mt-3 text-xs font-medium text-[var(--accent-secondary)]">Selected team: {selectedTeam.name}</p>
          {isLoading ? <p className="mt-2 text-xs text-gray-400">Loading team analytics data...</p> : null}
          {error ? <p className="mt-2 text-xs text-[var(--status-red)]">Unable to load analytics data: {error}</p> : null}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-300">View:</span>
          <AnalyticsViewToggle value={viewMode} onChange={setViewMode} />
        </div>
      </header>

      {viewMode === 'averages' ? (
        isLoading ? (
          <section className="glass-card p-6 text-sm text-gray-300">Loading analytics data...</section>
        ) : hasAnalyticsData ? (
          <AveragesView
            legendItems={teamAnalytics.legendItems}
            teamAveragesMetrics={teamAnalytics.teamAveragesMetrics}
            averages={teamAnalytics.averages}
          />
        ) : (
          <section className="glass-card p-6 text-sm text-gray-300">No analytics data available for this team yet.</section>
        )
      ) : isLoading ? (
        <section className="glass-card p-6 text-sm text-gray-300">Loading individual player analytics...</section>
      ) : hasAnalyticsData ? (
        <IndividualsView
          labels={teamAnalytics.labels}
          selectedDayLabel={selectedDayLabel}
          onSelectDayLabel={setSelectedDayLabel}
          playersForDay={playersForSelectedDay}
        />
      ) : (
        <section className="glass-card p-6 text-sm text-gray-300">No individual player data available for this team yet.</section>
      )}
    </div>
  );
}
