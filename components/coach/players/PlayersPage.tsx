'use client';

import { useEffect, useMemo, useState } from 'react';
import { useCoachTeam } from '@/lib/coach/selectedTeam';
import { IndividualSessionCreator } from '@/components/coach/players/IndividualSessionCreator';
import { PlayerAnalyticsChart } from '@/components/coach/players/PlayerAnalyticsChart';
import { PlayerAnalyticsLegend } from '@/components/coach/players/PlayerAnalyticsLegend';
import { PlayerCalendar } from '@/components/coach/players/PlayerCalendar';
import { PlayerProfileCard } from '@/components/coach/players/PlayerProfileCard';
import { PlayerSelectorDropdown } from '@/components/coach/players/PlayerSelectorDropdown';
import { PlayerViewToggle } from '@/components/coach/players/PlayerViewToggle';
import { WellnessMetricsPanel } from '@/components/coach/players/WellnessMetricsPanel';
import { loadRealTeamPlayerDatasets } from '@/components/coach/players/realData';
import type { PlayerViewMode, TeamPlayerDataset } from '@/components/coach/players/types';

function AnalyticsView({ playerDataset }: { playerDataset: TeamPlayerDataset }) {
  const latestSleep = playerDataset.analytics.sleepQualityAndTiming[playerDataset.analytics.sleepQualityAndTiming.length - 1];
  const sleepTimingNote = latestSleep
    ? `Latest timing: asleep ${latestSleep.bedTime}, woke ${latestSleep.wakeTime}.`
    : undefined;

  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_285px]">
      <div className="grid gap-4 md:grid-cols-2">
        <PlayerAnalyticsChart
          graphNumber={1}
          title="Readiness Score Trend"
          data={playerDataset.analytics.readinessTrend}
          leftDomain={[0, 100]}
          series={[{ dataKey: 'readinessScore', name: 'Readiness Score', color: 'var(--accent-primary)' }]}
        />
        <PlayerAnalyticsChart
          graphNumber={2}
          title="Energy vs Fatigue vs Acute Training Load"
          data={playerDataset.analytics.energyFatigueLoad}
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
        <PlayerAnalyticsChart
          graphNumber={3}
          title="Sleep Time vs Sleep Quality vs Sleep Score"
          data={playerDataset.analytics.sleepQualityAndTiming}
          leftDomain={[4, 10]}
          rightDomain={[0, 100]}
          footerNote={sleepTimingNote}
          series={[
            { dataKey: 'sleepHours', name: 'Sleep Time (hours)', color: 'var(--accent-secondary)', type: 'bar', yAxisId: 'left' },
            { dataKey: 'sleepQualityScore', name: 'Sleep Quality', color: '#ffd43b', yAxisId: 'right' },
            { dataKey: 'sleepScore', name: 'Sleep Score', color: 'var(--accent-primary)', yAxisId: 'right' },
          ]}
        />
        <PlayerAnalyticsChart
          graphNumber={4}
          title="Stress vs Sleep Score"
          data={playerDataset.analytics.stressVsSleepScore}
          leftDomain={[0, 100]}
          series={[
            { dataKey: 'stress', name: 'Stress', color: '#ff6b6b' },
            { dataKey: 'sleepScore', name: 'Sleep Score', color: 'var(--accent-secondary)' },
          ]}
        />
        <div className="md:col-span-2">
          <PlayerAnalyticsChart
            graphNumber={5}
            title="Multi-Factor Inputs vs Readiness Score"
            data={playerDataset.analytics.multiFactorReadiness}
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

      <PlayerAnalyticsLegend items={analyticsLegendItems} />
    </div>
  );
}

const analyticsLegendItems = [
  'Readiness trend',
  'Energy vs fatigue vs acute load',
  'Sleep timing and sleep quality',
  'Stress vs sleep score',
  'Multi-factor readiness inputs',
];

function CalendarView({ playerDataset }: { playerDataset: TeamPlayerDataset }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] xl:items-stretch">
      <PlayerCalendar events={playerDataset.calendarEvents} className="xl:h-[760px]" />
      <IndividualSessionCreator player={playerDataset.player} className="xl:h-[760px]" />
    </div>
  );
}

export function PlayersPage() {
  const { selectedTeam } = useCoachTeam();
  const [viewMode, setViewMode] = useState<PlayerViewMode>('analytics');
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayerDataset[]>([]);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(() => teamPlayers[0]?.player.id ?? '');

  useEffect(() => {
    let isMounted = true;

    const loadPlayers = async () => {
      if (!selectedTeam.id) {
        if (!isMounted) return;
        setTeamPlayers([]);
        setPlayersError(null);
        setIsLoadingPlayers(false);
        return;
      }

      setIsLoadingPlayers(true);
      setPlayersError(null);
      const { data, error } = await loadRealTeamPlayerDatasets(selectedTeam.id);
      if (!isMounted) return;

      if (error) {
        setTeamPlayers([]);
        setPlayersError(error);
        setIsLoadingPlayers(false);
        return;
      }

      setTeamPlayers(data);
      setIsLoadingPlayers(false);
    };

    void loadPlayers();

    return () => {
      isMounted = false;
    };
  }, [selectedTeam.id]);

  useEffect(() => {
    const selectedPlayerStillExists = teamPlayers.some((dataset) => dataset.player.id === selectedPlayerId);
    if (!selectedPlayerStillExists) {
      setSelectedPlayerId(teamPlayers[0]?.player.id ?? '');
    }
  }, [selectedPlayerId, teamPlayers]);

  const selectedPlayerDataset = useMemo(() => {
    return teamPlayers.find((dataset) => dataset.player.id === selectedPlayerId) ?? teamPlayers[0];
  }, [selectedPlayerId, teamPlayers]);

  if (!selectedTeam.id) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">Players</h1>
          <p className="mt-2 text-sm text-gray-400">Create or select a team first to view players.</p>
        </header>
      </div>
    );
  }

  if (isLoadingPlayers) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">Players</h1>
          <p className="mt-2 text-sm text-gray-400">Loading players for {selectedTeam.name}...</p>
        </header>
      </div>
    );
  }

  if (playersError) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">Players</h1>
          <p className="mt-2 text-sm text-[var(--status-red)]">{playersError}</p>
        </header>
      </div>
    );
  }

  if (!selectedPlayerDataset) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">Players</h1>
          <p className="mt-2 text-sm text-gray-400">No joined players are in {selectedTeam.name} yet.</p>
        </header>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Players</h1>
          <p className="mt-2 text-sm text-gray-400">
            Review individual player analytics, wellness, and scheduling for {selectedTeam.name}.
          </p>
          <p className="mt-3 text-xs font-medium text-[var(--accent-secondary)]">
            Selected team: {selectedTeam.name}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-300">View:</span>
          <PlayerViewToggle value={viewMode} onChange={setViewMode} />
        </div>
      </header>

      <section className="flex justify-start">
        <PlayerSelectorDropdown
          players={teamPlayers}
          selectedPlayerId={selectedPlayerId}
          onSelectPlayer={setSelectedPlayerId}
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-[290px_minmax(0,1fr)]">
        <div className="space-y-4">
          <PlayerProfileCard player={selectedPlayerDataset.player} teamName={selectedTeam.name} />
          {viewMode === 'calendar' ? <WellnessMetricsPanel metrics={selectedPlayerDataset.wellness} /> : null}
        </div>
        {viewMode === 'analytics' ? (
          <AnalyticsView playerDataset={selectedPlayerDataset} />
        ) : (
          <CalendarView playerDataset={selectedPlayerDataset} />
        )}
      </div>
    </div>
  );
}
