'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ClipboardCheck, Loader2, X } from 'lucide-react';
import {
  type AttendanceEventTarget,
  type CoachAttendanceRosterPlayer,
  type CoachAttendanceStatus,
  loadCoachAttendanceRoster,
  setCoachAttendanceStatus,
} from '@/lib/calendar/attendance';

interface CoachAttendanceModalProps {
  target: AttendanceEventTarget;
  onClose: () => void;
}

type RsvpGroupKey = 'going' | 'not_going' | 'no_response';

const groupLabels: Record<RsvpGroupKey, string> = {
  going: 'Going',
  not_going: 'Not going',
  no_response: 'No response',
};

function attendanceButtonClass(params: {
  status: CoachAttendanceStatus;
  selected: boolean;
  hinted: boolean;
}): string {
  const { status, selected, hinted } = params;
  const isDid = status === 'did';

  if (selected) {
    return isDid
      ? 'border-[rgba(var(--status-green-rgb),0.65)] bg-[rgba(var(--status-green-rgb),0.22)] text-[var(--status-green)]'
      : 'border-[rgba(255,107,107,0.65)] bg-[rgba(255,107,107,0.22)] text-[#ff6b6b]';
  }

  if (hinted) {
    return isDid
      ? 'border-[rgba(var(--status-green-rgb),0.42)] bg-[rgba(var(--status-green-rgb),0.16)] text-[var(--status-green)] opacity-60'
      : 'border-[rgba(255,107,107,0.42)] bg-[rgba(255,107,107,0.16)] text-[#ff6b6b] opacity-60';
  }

  return 'border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] text-gray-400 hover:text-white';
}

export function CoachAttendanceModal({ target, onClose }: CoachAttendanceModalProps) {
  const [players, setPlayers] = useState<CoachAttendanceRosterPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingPlayerIds, setSavingPlayerIds] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [openGroups, setOpenGroups] = useState<Record<RsvpGroupKey, boolean>>({
    going: true,
    not_going: true,
    no_response: true,
  });

  const loadRoster = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const result = await loadCoachAttendanceRoster(target);
    setPlayers(result.players);
    setLoadError(result.error);
    setIsLoading(false);
  }, [target]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const groupedPlayers = useMemo(() => {
    const groups: Record<RsvpGroupKey, CoachAttendanceRosterPlayer[]> = {
      going: [],
      not_going: [],
      no_response: [],
    };

    players.forEach((player) => {
      if (player.rsvpStatus === 'going') {
        groups.going.push(player);
      } else if (player.rsvpStatus === 'not_going') {
        groups.not_going.push(player);
      } else {
        groups.no_response.push(player);
      }
    });

    return groups;
  }, [players]);

  const toggleAttendance = async (player: CoachAttendanceRosterPlayer, status: CoachAttendanceStatus) => {
    if (savingPlayerIds.has(player.playerId)) return;

    const previousStatus = player.attendanceStatus;
    const nextStatus = previousStatus === status ? null : status;
    const previousPlayers = players;

    setRowErrors((current) => {
      const next = { ...current };
      delete next[player.playerId];
      return next;
    });
    setPlayers((current) =>
      current.map((candidate) =>
        candidate.playerId === player.playerId
          ? { ...candidate, attendanceStatus: nextStatus, attendanceUpdatedAt: new Date().toISOString() }
          : candidate
      )
    );
    setSavingPlayerIds((current) => new Set(current).add(player.playerId));

    const result = await setCoachAttendanceStatus({
      target,
      playerId: player.playerId,
      attendanceStatus: nextStatus,
    });

    setSavingPlayerIds((current) => {
      const next = new Set(current);
      next.delete(player.playerId);
      return next;
    });

    if (result.error) {
      setPlayers(previousPlayers);
      setRowErrors((current) => ({ ...current, [player.playerId]: result.error ?? 'Unable to save attendance.' }));
      return;
    }

    if (result.player) {
      setPlayers((current) =>
        current.map((candidate) =>
          candidate.playerId === player.playerId
            ? {
                ...candidate,
                rsvpStatus: result.player?.rsvpStatus ?? candidate.rsvpStatus,
                rsvpUpdatedAt: result.player?.rsvpUpdatedAt ?? candidate.rsvpUpdatedAt,
                attendanceStatus: result.player?.attendanceStatus ?? null,
                attendanceUpdatedAt: result.player?.attendanceUpdatedAt ?? candidate.attendanceUpdatedAt,
                attendanceRecordedBy: result.player?.attendanceRecordedBy ?? null,
              }
            : candidate
        )
      );
    }
  };

  const renderAttendanceControl = (player: CoachAttendanceRosterPlayer, status: CoachAttendanceStatus) => {
    const selected = player.attendanceStatus === status;
    const hinted =
      !player.attendanceStatus &&
      ((status === 'did' && player.rsvpStatus === 'going') || (status === 'did_not' && player.rsvpStatus === 'not_going'));
    const disabled = savingPlayerIds.has(player.playerId);

    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => void toggleAttendance(player, status)}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${attendanceButtonClass({
          status,
          selected,
          hinted,
        })}`}
        aria-label={status === 'did' ? `Mark ${player.displayName} attended` : `Mark ${player.displayName} did not attend`}
        aria-pressed={selected}
      >
        {disabled ? (
          <Loader2 size={14} className="animate-spin" />
        ) : status === 'did' ? (
          <Check size={15} />
        ) : (
          <X size={15} />
        )}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 p-4 backdrop-blur-[3px] sm:items-center">
      <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.12)] bg-[var(--background)] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-[rgba(255,255,255,0.1)] bg-[var(--card-bg)] px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ClipboardCheck size={17} className="text-[var(--accent-primary)]" />
              <h2 className="truncate text-base font-bold text-white">Attendance</h2>
            </div>
            <p className="mt-1 text-xs text-gray-400">{target.occurrenceDate}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-[rgba(255,255,255,0.06)] p-2 text-gray-300 transition-colors hover:text-white"
            aria-label="Close attendance"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-4 py-4">
          {isLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] px-4 py-5 text-sm text-gray-300">
              <Loader2 size={16} className="animate-spin text-[var(--accent-secondary)]" />
              Loading roster...
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.12)] px-4 py-3 text-sm text-[#ff6b6b]">
              {loadError}
            </div>
          ) : players.length === 0 ? (
            <div className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] px-4 py-5 text-sm text-gray-300">
              No active players are available for this event.
            </div>
          ) : (
            <div className="space-y-2.5">
              {(Object.keys(groupLabels) as RsvpGroupKey[]).map((groupKey) => {
                const groupPlayers = groupedPlayers[groupKey];
                const isOpen = openGroups[groupKey];

                return (
                  <section key={groupKey} className="rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)]">
                    <button
                      type="button"
                      onClick={() => setOpenGroups((current) => ({ ...current, [groupKey]: !current[groupKey] }))}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                      aria-expanded={isOpen}
                    >
                      <span className="text-sm font-semibold text-white">{groupLabels[groupKey]}</span>
                      <span className="inline-flex items-center gap-2 text-xs font-semibold text-gray-300">
                        {groupPlayers.length}
                        <ChevronDown size={15} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </span>
                    </button>

                    {isOpen ? (
                      <div className="border-t border-[rgba(255,255,255,0.08)]">
                        {groupPlayers.length === 0 ? (
                          <p className="px-3 py-3 text-xs text-gray-400">No players in this group.</p>
                        ) : (
                          <ul className="divide-y divide-[rgba(255,255,255,0.07)]">
                            {groupPlayers.map((player) => (
                              <li key={player.playerId} className="px-3 py-2.5">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-white">{player.displayName}</p>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    {renderAttendanceControl(player, 'did')}
                                    {renderAttendanceControl(player, 'did_not')}
                                  </div>
                                </div>
                                {rowErrors[player.playerId] ? (
                                  <p className="mt-2 rounded-lg border border-[rgba(255,107,107,0.28)] bg-[rgba(255,107,107,0.1)] px-2.5 py-1.5 text-xs text-[#ff6b6b]">
                                    {rowErrors[player.playerId]}
                                  </p>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
