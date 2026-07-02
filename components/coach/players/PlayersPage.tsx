'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useCoachTeam } from '@/lib/coach/selectedTeam';
import { useData } from '@/lib/DataContext';
import { usePersistedState } from '@/lib/usePersistedState';
import { PlayerAnalyticsChart } from '@/components/coach/players/PlayerAnalyticsChart';
import { PlayerAnalyticsLegend } from '@/components/coach/players/PlayerAnalyticsLegend';
import { IndividualEventCreator } from '@/components/coach/players/IndividualEventCreator';
import { PlayerCalendar } from '@/components/coach/players/PlayerCalendar';
import { PlayerProfileCard } from '@/components/coach/players/PlayerProfileCard';
import { PlayerSelectorDropdown } from '@/components/coach/players/PlayerSelectorDropdown';
import { PlayerViewToggle } from '@/components/coach/players/PlayerViewToggle';
import { WellnessMetricsPanel } from '@/components/coach/players/WellnessMetricsPanel';
import { loadRealTeamPlayerDatasets } from '@/components/coach/players/realData';
import type { PlayerInjuryStatus, PlayerNoteItem, PlayerViewMode, TeamPlayerDataset } from '@/components/coach/players/types';

function NotesSection({
  title,
  emptyLabel,
  notes,
}: {
  title: string;
  emptyLabel: string;
  notes: PlayerNoteItem[];
}) {
  return (
    <section className="glass-card p-4 sm:p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-300">{title}</h3>
      {notes.length === 0 ? (
        <p className="mt-3 text-sm text-gray-400">{emptyLabel}</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-gray-400">{note.date}</p>
              <p className="mt-1 text-sm text-gray-200">{note.note}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function InjuryStatusCard({
  injuryStatus,
  todaysGuidance,
  todaysRecommendation,
}: {
  injuryStatus: PlayerInjuryStatus;
  todaysGuidance: string | null;
  todaysRecommendation: TeamPlayerDataset['todaysRecommendation'];
}) {
  const label =
    injuryStatus.state === 'active'
      ? 'Active'
      : injuryStatus.state === 'recovering'
        ? 'Recovering'
        : injuryStatus.state === 'resolved'
          ? 'Resolved'
          : injuryStatus.state === 'unavailable'
            ? 'Unavailable'
            : 'Healthy';

  const toneClass =
    injuryStatus.state === 'active'
      ? 'border-[rgba(255,107,107,0.4)] bg-[rgba(255,107,107,0.12)] text-[var(--status-red)]'
      : injuryStatus.state === 'recovering'
        ? 'border-[rgba(255,146,43,0.4)] bg-[rgba(255,146,43,0.12)] text-[var(--status-orange)]'
        : injuryStatus.state === 'unavailable'
          ? 'border-[rgba(255,212,59,0.3)] bg-[rgba(255,212,59,0.1)] text-[var(--status-yellow)]'
          : 'border-[rgba(var(--status-green-rgb),0.3)] bg-[rgba(var(--status-green-rgb),0.1)] text-[var(--status-green)]';

  return (
    <section className="glass-card p-3.5 sm:p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-300">Injury Status</h3>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <span className="text-xs text-gray-300">Current state</span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${toneClass}`}>
          {label}
        </span>
      </div>
      {injuryStatus.description ? <p className="mt-2 text-xs text-gray-300">{injuryStatus.description}</p> : null}
      {injuryStatus.reportedAgo ? <p className="mt-1 text-[11px] text-gray-400">{injuryStatus.reportedAgo}</p> : null}
      {injuryStatus.expectedReturn ? <p className="mt-1 text-[11px] text-gray-400">Expected return: {injuryStatus.expectedReturn}</p> : null}
      {injuryStatus.state === 'unavailable' ? (
        <p className="mt-2 text-xs text-gray-400">{injuryStatus.message ?? 'Injury data is not available for this player.'}</p>
      ) : null}
      <p className="mt-2 text-[11px] text-gray-300">
        Today&apos;s guidance: {todaysGuidance ?? 'Not available'}
      </p>
      {todaysRecommendation ? (
        <div className="mt-2 rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] px-3 py-2">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-300">
            <span>Readiness: {todaysRecommendation.score}</span>
            <span>Load Risk: {todaysRecommendation.loadRiskLabel}</span>
            <span>Recommendation: {todaysRecommendation.recommendationLabel}</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-gray-300">{todaysRecommendation.reason}</p>
        </div>
      ) : null}
    </section>
  );
}

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
          series={[{ dataKey: 'readinessScore', name: 'Readiness Score', color: 'var(--metric-readiness)' }]}
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
              color: 'var(--metric-load)',
              type: 'bar',
              yAxisId: 'left',
            },
            { dataKey: 'energy', name: 'Energy', color: 'var(--metric-energy)', yAxisId: 'right' },
            { dataKey: 'fatigue', name: 'Fatigue', color: 'var(--metric-fatigue)', yAxisId: 'right' },
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
            { dataKey: 'sleepHours', name: 'Sleep Time (hours)', color: 'var(--metric-sleep-time)', type: 'bar', yAxisId: 'left' },
            { dataKey: 'sleepQualityScore', name: 'Sleep Quality', color: 'var(--metric-sleep-quality)', yAxisId: 'right' },
            { dataKey: 'sleepScore', name: 'Sleep Score', color: 'var(--metric-sleep-score)', yAxisId: 'right' },
          ]}
        />
        <PlayerAnalyticsChart
          graphNumber={4}
          title="Stress vs Sleep Score"
          data={playerDataset.analytics.stressVsSleepScore}
          leftDomain={[0, 100]}
          series={[
            { dataKey: 'stress', name: 'Stress', color: 'var(--metric-stress)' },
            { dataKey: 'sleepScore', name: 'Sleep Score', color: 'var(--metric-sleep-score)' },
          ]}
        />
        <div className="md:col-span-2">
          <PlayerAnalyticsChart
            graphNumber={5}
            title="Multi-Factor Inputs vs Readiness Score"
            data={playerDataset.analytics.multiFactorReadiness}
            leftDomain={[0, 100]}
            interactiveLegend
            series={[
              { dataKey: 'readinessScore', name: 'Readiness Score', color: 'var(--metric-readiness)', type: 'bar' },
              { dataKey: 'sleepScore', name: 'Sleep Score', color: 'var(--metric-sleep-score)' },
              { dataKey: 'energyScore', name: 'Energy', color: 'var(--metric-energy)' },
              { dataKey: 'fatigueScore', name: 'Fatigue', color: 'var(--metric-fatigue)' },
              { dataKey: 'stressScore', name: 'Stress', color: 'var(--metric-stress)' },
              { dataKey: 'loadScore', name: 'Load Score', color: 'var(--metric-load-score)' },
            ]}
          />
        </div>
      </div>

      <div className="grid h-fit gap-4">
        <PlayerAnalyticsLegend items={analyticsLegendItems} />
        <NotesSection title="Wellness Notes" emptyLabel="No wellness notes yet." notes={playerDataset.wellnessNotes} />
        <NotesSection title="Training Notes" emptyLabel="No training notes yet." notes={playerDataset.trainingNotes} />
      </div>
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

function DailyWellnessStatusStrip({
  completedToday,
  isChecking,
}: {
  completedToday: boolean;
  isChecking: boolean;
}) {
  if (isChecking) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-xs text-gray-300">
        <Loader2 size={14} className="shrink-0 animate-spin text-gray-400" />
        <span className="font-semibold uppercase tracking-wide">Checking wellness...</span>
      </div>
    );
  }

  const Icon = completedToday ? CheckCircle2 : XCircle;
  const toneClass = completedToday
    ? 'border-[rgba(var(--status-green-rgb),0.35)] bg-[rgba(var(--status-green-rgb),0.1)] text-[var(--status-green)]'
    : 'border-[rgba(255,146,43,0.35)] bg-[rgba(255,146,43,0.1)] text-[var(--status-orange)]';

  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${toneClass}`}>
      <Icon size={14} className="shrink-0" />
      <span className="font-semibold uppercase tracking-wide">
        Daily wellness: {completedToday ? 'Completed today' : 'Not completed today'}
      </span>
    </div>
  );
}

function CalendarView({
  playerDataset,
  onEventCreated,
  eventTypeColors,
}: {
  playerDataset: TeamPlayerDataset;
  onEventCreated: () => void;
  eventTypeColors: Record<string, string>;
}) {
  return (
    <>
      <PlayerCalendar events={playerDataset.calendarEvents} eventTypeColors={eventTypeColors} className="xl:h-[760px]" />
      <IndividualEventCreator
        playerId={playerDataset.player.id}
        playerName={playerDataset.player.name}
        teamId={playerDataset.player.teamId}
        onSaved={onEventCreated}
      />
    </>
  );
}

export function PlayersPage() {
  const { selectedTeam } = useCoachTeam();
  const { customEventTypes } = useData();
  const [viewMode, setViewMode] = usePersistedState<PlayerViewMode>('lodario:coach-players:view', 'analytics');
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayerDataset[]>([]);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = usePersistedState<string>('lodario:coach-players:selected-player', '');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const eventTypeColors = useMemo(
    () => Object.fromEntries(customEventTypes.map((type) => [type.id, type.color])),
    [customEventTypes]
  );

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
  }, [selectedTeam.id, refreshVersion]);

  useEffect(() => {
    const selectedPlayerStillExists = teamPlayers.some((dataset) => dataset.player.id === selectedPlayerId);
    if (!selectedPlayerStillExists) {
      setSelectedPlayerId(teamPlayers[0]?.player.id ?? '');
    }
  }, [selectedPlayerId, setSelectedPlayerId, teamPlayers]);

  const selectedPlayerDataset = useMemo(() => {
    return teamPlayers.find((dataset) => dataset.player.id === selectedPlayerId) ?? teamPlayers[0];
  }, [selectedPlayerId, teamPlayers]);

  if (!selectedTeam.id) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">Players</h1>
          <p className="mt-2 text-sm text-gray-400">Create or select a team first, then share its invite code with players.</p>
        </header>
      </div>
    );
  }

  if (isLoadingPlayers && !selectedPlayerDataset) {
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
          <p className="mt-2 text-sm text-gray-400">No players have joined {selectedTeam.name} yet.</p>
          <p className="mt-2 text-xs text-gray-500">
            Share the team invite code from Teams. Player wellness, training, and calendar data appears after they join and start logging.
          </p>
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

      <div
        className={`grid ${
          viewMode === 'calendar'
            ? 'gap-4 xl:grid-cols-[250px_minmax(0,1fr)_340px] xl:items-stretch'
            : 'gap-5 xl:grid-cols-[290px_minmax(0,1fr)]'
        }`}
      >
        <div className="space-y-4">
          <PlayerProfileCard player={selectedPlayerDataset.player} teamName={selectedTeam.name} />
          <DailyWellnessStatusStrip
            completedToday={selectedPlayerDataset.dailyWellness.completedToday}
            isChecking={isLoadingPlayers}
          />
          {viewMode === 'analytics' ? (
            <InjuryStatusCard
              injuryStatus={selectedPlayerDataset.injuryStatus}
              todaysGuidance={selectedPlayerDataset.todaysGuidance}
              todaysRecommendation={selectedPlayerDataset.todaysRecommendation}
            />
          ) : null}
          {viewMode === 'calendar' ? <WellnessMetricsPanel metrics={selectedPlayerDataset.wellness} /> : null}
        </div>
        {viewMode === 'analytics' ? (
          <AnalyticsView playerDataset={selectedPlayerDataset} />
        ) : (
          <CalendarView
            playerDataset={selectedPlayerDataset}
            onEventCreated={() => setRefreshVersion((version) => version + 1)}
            eventTypeColors={eventTypeColors}
          />
        )}
      </div>
    </div>
  );
}
