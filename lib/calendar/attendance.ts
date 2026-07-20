import type { TeamCalendarItem } from '@/components/coach/calendar/types';
import type { PlayerCalendarEvent } from '@/components/coach/players/types';
import { parseCoachCalendarMeta } from '@/lib/calendar/events';
import { resolvePlayerDisplayName } from '@/lib/player-names';
import { supabase } from '@/lib/supabase';
import type { CalendarEvent } from '@/lib/types';

export type PlayerRsvpStatus = 'going' | 'not_going';
export type CoachAttendanceStatus = 'did' | 'did_not';

export interface AttendanceEventTarget {
  teamId: string;
  eventGroupId: string;
  occurrenceDate: string;
  assignmentScope?: 'team' | 'player';
  assignedPlayerId?: string | null;
  title?: string;
}

export interface PlayerEventAttendance {
  rsvpStatus: PlayerRsvpStatus | null;
  rsvpUpdatedAt: string | null;
  attendanceStatus: CoachAttendanceStatus | null;
  attendanceUpdatedAt: string | null;
}

export interface CoachAttendanceRosterPlayer extends PlayerEventAttendance {
  playerId: string;
  displayName: string;
  email: string | null;
  attendanceRecordedBy: string | null;
}

const missingMigrationMessage = 'Attendance and RSVP are unavailable until the latest database migration is applied.';

type SupabaseErrorLike = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

function isMissingAttendanceMigrationError(error: SupabaseErrorLike | null | undefined): boolean {
  const message = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''} ${error?.code ?? ''}`.toLowerCase();

  return (
    (message.includes('calendar_event_attendance') || message.includes('calendar_event_rsvp')) &&
      (message.includes('does not exist') || message.includes('could not find') || message.includes('not found')) ||
    message.includes('get_calendar_event_attendance_roster') ||
    message.includes('get_my_calendar_event_attendance') ||
    message.includes('set_my_calendar_event_rsvp') ||
    message.includes('set_calendar_event_attendance') ||
    message.includes('delete_calendar_event_attendance_for')
  );
}

function formatAttendanceError(error: SupabaseErrorLike | null | undefined, fallback: string): string {
  if (isMissingAttendanceMigrationError(error)) {
    return missingMigrationMessage;
  }

  return error?.message || fallback;
}

function normalizeNullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function normalizeRsvpStatus(value: unknown): PlayerRsvpStatus | null {
  return value === 'going' || value === 'not_going' ? value : null;
}

function normalizeAttendanceStatus(value: unknown): CoachAttendanceStatus | null {
  return value === 'did' || value === 'did_not' ? value : null;
}

function isEventGroupId(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isAttendanceTarget(target: AttendanceEventTarget | null | undefined): target is AttendanceEventTarget {
  return Boolean(target?.teamId && target.eventGroupId && target.occurrenceDate);
}

export function getCoachAttendanceTargetFromTeamItem(
  item: TeamCalendarItem,
  occurrenceDate: string
): AttendanceEventTarget | null {
  if (item.kind !== 'event' || item.isDraft) {
    return null;
  }

  if (!isEventGroupId(item.sourceEventGroupId)) {
    return null;
  }

  return {
    teamId: item.teamId,
    eventGroupId: item.sourceEventGroupId,
    occurrenceDate,
    assignmentScope: item.assignmentScope ?? 'team',
    assignedPlayerId: item.assignedPlayerId ?? null,
    title: item.title,
  };
}

export function getCoachAttendanceTargetFromPlayerCalendarEvent(
  event: PlayerCalendarEvent,
  occurrenceDate: string
): AttendanceEventTarget | null {
  if (event.kind === 'task' || event.isDraft || event.coachManaged !== true) {
    return null;
  }

  if (!event.teamId || !isEventGroupId(event.sourceEventGroupId)) {
    return null;
  }

  return {
    teamId: event.teamId,
    eventGroupId: event.sourceEventGroupId,
    occurrenceDate,
    assignmentScope: event.assignmentScope ?? 'player',
    assignedPlayerId: event.assignmentScope === 'team' ? null : event.playerId,
    title: event.title,
  };
}

export function getPlayerRsvpTargetFromCalendarEvent(
  event: CalendarEvent,
  occurrenceDate: string,
  currentUserId?: string | null
): AttendanceEventTarget | null {
  const meta = parseCoachCalendarMeta(event.recurrenceConfig);

  if (!meta?.coachManaged || meta.kind !== 'event' || meta.published === false) {
    return null;
  }

  if (!meta.teamId || !isEventGroupId(meta.eventGroupId)) {
    return null;
  }

  if (
    currentUserId &&
    meta.assignmentScope === 'player' &&
    meta.assignedPlayerId &&
    meta.assignedPlayerId !== currentUserId
  ) {
    return null;
  }

  return {
    teamId: meta.teamId,
    eventGroupId: meta.eventGroupId,
    occurrenceDate,
    assignmentScope: meta.assignmentScope,
    assignedPlayerId: meta.assignedPlayerId ?? null,
    title: event.title,
  };
}

export async function loadCoachAttendanceRoster(target: AttendanceEventTarget): Promise<{
  players: CoachAttendanceRosterPlayer[];
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('get_calendar_event_attendance_roster', {
    p_team_id: target.teamId,
    p_event_group_id: target.eventGroupId,
    p_occurrence_date: target.occurrenceDate,
  });

  if (error) {
    return {
      players: [],
      error: formatAttendanceError(error, 'Unable to load attendance for this event.'),
    };
  }

  const players = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    playerId: String(row.player_id),
    displayName: resolvePlayerDisplayName({
      displayName: normalizeNullableText(row.display_name),
      email: normalizeNullableText(row.email),
      userId: String(row.player_id),
    }),
    email: normalizeNullableText(row.email),
    rsvpStatus: normalizeRsvpStatus(row.rsvp_status),
    rsvpUpdatedAt: normalizeNullableText(row.rsvp_updated_at),
    attendanceStatus: normalizeAttendanceStatus(row.attendance_status),
    attendanceUpdatedAt: normalizeNullableText(row.attendance_updated_at),
    attendanceRecordedBy: normalizeNullableText(row.attendance_recorded_by),
  }));

  return { players, error: null };
}

export async function setCoachAttendanceStatus(params: {
  target: AttendanceEventTarget;
  playerId: string;
  attendanceStatus: CoachAttendanceStatus | null;
}): Promise<{ player: CoachAttendanceRosterPlayer | null; error: string | null }> {
  const { target, playerId, attendanceStatus } = params;
  const { data, error } = await supabase.rpc('set_calendar_event_attendance', {
    p_team_id: target.teamId,
    p_event_group_id: target.eventGroupId,
    p_occurrence_date: target.occurrenceDate,
    p_player_id: playerId,
    p_attendance_status: attendanceStatus,
  });

  if (error) {
    return {
      player: null,
      error: formatAttendanceError(error, 'Unable to save attendance for this player.'),
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    return { player: null, error: null };
  }

  const normalizedRow = row as Record<string, unknown>;
  return {
    player: {
      playerId: String(normalizedRow.player_id ?? playerId),
      displayName: '',
      email: null,
      rsvpStatus: normalizeRsvpStatus(normalizedRow.rsvp_status),
      rsvpUpdatedAt: normalizeNullableText(normalizedRow.rsvp_updated_at),
      attendanceStatus: normalizeAttendanceStatus(normalizedRow.attendance_status),
      attendanceUpdatedAt: normalizeNullableText(normalizedRow.attendance_updated_at),
      attendanceRecordedBy: normalizeNullableText(normalizedRow.attendance_recorded_by),
    },
    error: null,
  };
}

export async function loadPlayerEventAttendance(target: AttendanceEventTarget): Promise<{
  attendance: PlayerEventAttendance;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('get_my_calendar_event_attendance', {
    p_team_id: target.teamId,
    p_event_group_id: target.eventGroupId,
    p_occurrence_date: target.occurrenceDate,
  });

  const emptyAttendance: PlayerEventAttendance = {
    rsvpStatus: null,
    rsvpUpdatedAt: null,
    attendanceStatus: null,
    attendanceUpdatedAt: null,
  };

  if (error) {
    return {
      attendance: emptyAttendance,
      error: formatAttendanceError(error, 'Unable to load your RSVP for this event.'),
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    return { attendance: emptyAttendance, error: null };
  }

  const normalizedRow = row as Record<string, unknown>;
  return {
    attendance: {
      rsvpStatus: normalizeRsvpStatus(normalizedRow.rsvp_status),
      rsvpUpdatedAt: normalizeNullableText(normalizedRow.rsvp_updated_at),
      attendanceStatus: normalizeAttendanceStatus(normalizedRow.attendance_status),
      attendanceUpdatedAt: normalizeNullableText(normalizedRow.attendance_updated_at),
    },
    error: null,
  };
}

export async function setPlayerEventRsvpStatus(params: {
  target: AttendanceEventTarget;
  rsvpStatus: PlayerRsvpStatus | null;
}): Promise<{ attendance: PlayerEventAttendance | null; error: string | null }> {
  const { target, rsvpStatus } = params;
  const { data, error } = await supabase.rpc('set_my_calendar_event_rsvp', {
    p_team_id: target.teamId,
    p_event_group_id: target.eventGroupId,
    p_occurrence_date: target.occurrenceDate,
    p_rsvp_status: rsvpStatus,
  });

  if (error) {
    return {
      attendance: null,
      error: formatAttendanceError(error, 'Unable to save your RSVP for this event.'),
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    return {
      attendance: {
        rsvpStatus: null,
        rsvpUpdatedAt: null,
        attendanceStatus: null,
        attendanceUpdatedAt: null,
      },
      error: null,
    };
  }

  const normalizedRow = row as Record<string, unknown>;
  return {
    attendance: {
      rsvpStatus: normalizeRsvpStatus(normalizedRow.rsvp_status),
      rsvpUpdatedAt: normalizeNullableText(normalizedRow.rsvp_updated_at),
      attendanceStatus: normalizeAttendanceStatus(normalizedRow.attendance_status),
      attendanceUpdatedAt: normalizeNullableText(normalizedRow.attendance_updated_at),
    },
    error: null,
  };
}

export async function cleanupAttendanceForOccurrence(params: {
  target: AttendanceEventTarget;
  playerId?: string | null;
}): Promise<{ deletedCount: number; error: string | null }> {
  const { target, playerId } = params;
  const { data, error } = await supabase.rpc('delete_calendar_event_attendance_for_occurrence', {
    p_team_id: target.teamId,
    p_event_group_id: target.eventGroupId,
    p_occurrence_date: target.occurrenceDate,
    p_player_id: playerId ?? null,
  });

  if (error) {
    if (isMissingAttendanceMigrationError(error)) {
      return { deletedCount: 0, error: null };
    }

    return {
      deletedCount: 0,
      error: formatAttendanceError(error, 'Unable to clean up attendance for this occurrence.'),
    };
  }

  return { deletedCount: typeof data === 'number' ? data : 0, error: null };
}

export async function cleanupAttendanceForEventGroup(params: {
  target: AttendanceEventTarget;
  playerId?: string | null;
}): Promise<{ deletedCount: number; error: string | null }> {
  const { target, playerId } = params;
  const { data, error } = await supabase.rpc('delete_calendar_event_attendance_for_group', {
    p_team_id: target.teamId,
    p_event_group_id: target.eventGroupId,
    p_player_id: playerId ?? null,
  });

  if (error) {
    if (isMissingAttendanceMigrationError(error)) {
      return { deletedCount: 0, error: null };
    }

    return {
      deletedCount: 0,
      error: formatAttendanceError(error, 'Unable to clean up attendance for this event.'),
    };
  }

  return { deletedCount: typeof data === 'number' ? data : 0, error: null };
}
