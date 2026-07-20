'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import {
  type AttendanceEventTarget,
  type PlayerEventAttendance,
  type PlayerRsvpStatus,
  loadPlayerEventAttendance,
  setPlayerEventRsvpStatus,
} from '@/lib/calendar/attendance';

interface PlayerRsvpControlProps {
  target: AttendanceEventTarget;
  compact?: boolean;
  className?: string;
}

function optionClass(status: PlayerRsvpStatus, selected: boolean): string {
  if (selected) {
    return status === 'going'
      ? 'border-[rgba(var(--status-green-rgb),0.55)] bg-[rgba(var(--status-green-rgb),0.18)] text-[var(--status-green)]'
      : 'border-[rgba(255,107,107,0.55)] bg-[rgba(255,107,107,0.18)] text-[#ff6b6b]';
  }

  return 'border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] text-gray-300 hover:text-white';
}

export function PlayerRsvpControl({ target, compact = false, className = '' }: PlayerRsvpControlProps) {
  const { teamId, eventGroupId, occurrenceDate } = target;
  const stableTarget = useMemo<AttendanceEventTarget>(
    () => ({
      teamId: target.teamId,
      eventGroupId: target.eventGroupId,
      occurrenceDate: target.occurrenceDate,
      assignmentScope: target.assignmentScope,
      assignedPlayerId: target.assignedPlayerId,
      title: target.title,
    }),
    [
      target.assignedPlayerId,
      target.assignmentScope,
      target.eventGroupId,
      target.occurrenceDate,
      target.teamId,
      target.title,
    ]
  );
  const [attendance, setAttendance] = useState<PlayerEventAttendance>({
    rsvpStatus: null,
    rsvpUpdatedAt: null,
    attendanceStatus: null,
    attendanceUpdatedAt: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targetKey = useMemo(() => `${teamId}:${eventGroupId}:${occurrenceDate}`, [eventGroupId, occurrenceDate, teamId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      const result = await loadPlayerEventAttendance(stableTarget);
      if (cancelled) return;
      setAttendance(result.attendance);
      setError(result.error);
      setIsLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [stableTarget, targetKey]);

  const updateRsvp = async (status: PlayerRsvpStatus) => {
    if (isLoading || isSaving) return;

    const previousAttendance = attendance;
    const nextStatus = attendance.rsvpStatus === status ? null : status;

    setError(null);
    setAttendance((current) => ({
      ...current,
      rsvpStatus: nextStatus,
      rsvpUpdatedAt: new Date().toISOString(),
    }));
    setIsSaving(true);

    const result = await setPlayerEventRsvpStatus({ target: stableTarget, rsvpStatus: nextStatus });
    setIsSaving(false);

    if (result.error) {
      setAttendance(previousAttendance);
      setError(result.error);
      return;
    }

    if (result.attendance) {
      setAttendance(result.attendance);
    }
  };

  const disabled = isLoading || isSaving;
  const coachLabel =
    attendance.attendanceStatus === 'did'
      ? 'Coach marked: Did'
      : attendance.attendanceStatus === 'did_not'
        ? 'Coach marked: Did not'
        : null;

  if (compact) {
    return (
      <div className={`flex shrink-0 flex-col items-end gap-1 ${className}`}>
        <p className="whitespace-nowrap text-[9px] font-bold uppercase tracking-wide text-gray-400">Are you going?</p>
        <div className="flex items-center gap-1.5">
          {(['going', 'not_going'] as PlayerRsvpStatus[]).map((status) => {
            const selected = attendance.rsvpStatus === status;
            const Icon = status === 'going' ? Check : X;

            return (
              <button
                key={status}
                type="button"
                disabled={disabled}
                onClick={() => void updateRsvp(status)}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-65 ${optionClass(status, selected)}`}
                aria-label={status === 'going' ? 'RSVP going' : 'RSVP not going'}
                aria-pressed={selected}
              >
                {disabled && isSaving ? <Loader2 size={14} className="animate-spin" /> : <Icon size={16} />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] p-3 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">RSVP</p>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {(['going', 'not_going'] as PlayerRsvpStatus[]).map((status) => {
          const selected = attendance.rsvpStatus === status;
          const Icon = status === 'going' ? Check : X;

          return (
            <button
              key={status}
              type="button"
              disabled={disabled}
              onClick={() => void updateRsvp(status)}
              className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-65 ${optionClass(status, selected)}`}
              aria-pressed={selected}
            >
              {disabled && isSaving ? <Loader2 size={14} className="animate-spin" /> : <Icon size={15} />}
              {status === 'going' ? 'Going' : 'Not going'}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-400">
          <Loader2 size={12} className="animate-spin" />
          Loading RSVP...
        </p>
      ) : coachLabel ? (
        <p className="mt-2 text-[11px] text-gray-400">{coachLabel}</p>
      ) : null}

      {error ? (
        <p className="mt-2 rounded-lg border border-[rgba(255,107,107,0.32)] bg-[rgba(255,107,107,0.1)] px-2.5 py-1.5 text-xs text-[#ff6b6b]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
