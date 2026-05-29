import { supabase } from '@/lib/supabase';

export type TeamJoinStatus = 'joined' | 'already_member' | 'invalid_code' | 'error';

export interface TeamJoinResult {
  status: TeamJoinStatus;
  message: string;
  teamId?: string;
  teamName?: string;
  inviteCode?: string;
}

interface JoinTeamRpcRow {
  team_id: string | null;
  team_name: string | null;
  invite_code: string | null;
  status: string | null;
  message: string | null;
}

function normalizeTeamCode(rawCode: string): string {
  return rawCode.trim().toUpperCase();
}

export async function joinTeamByCode(rawCode: string): Promise<TeamJoinResult> {
  const normalizedCode = normalizeTeamCode(rawCode);

  if (!normalizedCode) {
    return {
      status: 'invalid_code',
      message: 'Please enter a team code.',
    };
  }

  try {
    const { data, error } = await supabase.rpc('join_team_by_invite_code', {
      p_invite_code: normalizedCode,
    });

    if (error) {
      return {
        status: 'error',
        message: error.message || 'Unable to join this team right now.',
      };
    }

    const row = Array.isArray(data)
      ? (data[0] as JoinTeamRpcRow | undefined)
      : (data as JoinTeamRpcRow | null);

    if (!row) {
      return {
        status: 'error',
        message: 'Unable to join this team right now.',
      };
    }

    if (row.status === 'joined' || row.status === 'already_member' || row.status === 'invalid_code') {
      return {
        status: row.status,
        message: row.message ?? 'Team join status updated.',
        teamId: row.team_id ?? undefined,
        teamName: row.team_name ?? undefined,
        inviteCode: row.invite_code ?? normalizedCode,
      };
    }

    return {
      status: 'error',
      message: row.message ?? 'Unable to join this team right now.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to join this team right now.';
    return {
      status: 'error',
      message,
    };
  }
}
