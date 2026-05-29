'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import type { CoachTeam, SelectedTeam, TeamRow } from '@/lib/types';
import { toCoachTeam, toTeam } from '@/lib/types';
export type { CoachTeam, SelectedTeam } from '@/lib/types';

interface CoachTeamContextValue {
  teams: CoachTeam[];
  selectedTeamId: string;
  selectedTeam: SelectedTeam;
  isLoadingTeams: boolean;
  usingMockTeams: boolean;
  teamsError: string | null;
  setSelectedTeamId: (teamId: string) => void;
  reloadTeams: () => Promise<void>;
  createTeam: (input: { name: string; code?: string }) => Promise<{ error: string | null }>;
}

const emptySelectedTeam: CoachTeam = {
  id: '',
  name: 'No Team Selected',
  code: '--',
};

const CoachTeamContext = createContext<CoachTeamContextValue>({
  teams: [],
  selectedTeamId: '',
  selectedTeam: emptySelectedTeam,
  isLoadingTeams: true,
  usingMockTeams: false,
  teamsError: null,
  setSelectedTeamId: () => {},
  reloadTeams: async () => {},
  createTeam: async () => ({ error: null }),
});

function generateTeamCode(name: string): string {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((chunk) => chunk.slice(0, 3))
    .join('');
  const prefix = base || 'TEAM';
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${suffix}`;
}

function getCreateTeamErrorMessage(error: { code?: string | null; message?: string | null; details?: string | null }): string {
  const errorText = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
  const isDuplicateInviteCode =
    error.code === '23505' ||
    errorText.includes('teams_invite_code_key') ||
    errorText.includes('duplicate key value');

  if (isDuplicateInviteCode) {
    return 'This code is already taken.';
  }

  return error.message ?? 'Unable to create team right now.';
}

export function CoachTeamProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [teams, setTeams] = useState<CoachTeam[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [isLoadingTeams, setIsLoadingTeams] = useState<boolean>(true);
  const [usingMockTeams, setUsingMockTeams] = useState<boolean>(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const selectedTeamStorageKey = user ? `coach:selected-team:${user.id}` : '';

  const loadTeams = useCallback(async (preferredTeamId?: string) => {
    if (!user) {
      setTeams([]);
      setSelectedTeamId('');
      setUsingMockTeams(false);
      setTeamsError(null);
      setIsLoadingTeams(false);
      return;
    }

    setIsLoadingTeams(true);
    setTeamsError(null);

    const [createdTeamsResult, membershipResult] = await Promise.all([
      supabase
        .from('teams')
        .select('id, name, invite_code, created_by, created_at, updated_at')
        .eq('created_by', user.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('team_memberships')
        .select('team_id')
        .eq('user_id', user.id)
        .eq('role', 'coach')
        .eq('status', 'active'),
    ]);

    if (createdTeamsResult.error) {
      console.error('Error loading coach-created teams:', createdTeamsResult.error);
      setTeams([]);
      setSelectedTeamId('');
      setUsingMockTeams(false);
      setTeamsError(createdTeamsResult.error.message);
      setIsLoadingTeams(false);
      return;
    }

    if (membershipResult.error) {
      console.error('Error loading coach memberships:', membershipResult.error);
      setTeams([]);
      setSelectedTeamId('');
      setUsingMockTeams(false);
      setTeamsError(membershipResult.error.message);
      setIsLoadingTeams(false);
      return;
    }

    const membershipTeamIds = (membershipResult.data ?? [])
      .map((row) => row.team_id)
      .filter((teamId): teamId is string => typeof teamId === 'string' && teamId.length > 0);

    let membershipTeams: TeamRow[] = [];
    if (membershipTeamIds.length > 0) {
      const membershipTeamsResult = await supabase
        .from('teams')
        .select('id, name, invite_code, created_by, created_at, updated_at')
        .in('id', membershipTeamIds);

      if (membershipTeamsResult.error) {
        console.error('Error loading membership teams:', membershipTeamsResult.error);
        setTeams([]);
        setSelectedTeamId('');
        setUsingMockTeams(false);
        setTeamsError(membershipTeamsResult.error.message);
        setIsLoadingTeams(false);
        return;
      }

      membershipTeams = (membershipTeamsResult.data ?? []) as TeamRow[];
    }

    const combinedRows = [...(createdTeamsResult.data ?? []), ...membershipTeams] as TeamRow[];
    const dedupedRows = Array.from(new Map(combinedRows.map((row) => [row.id, row])).values());
    const resolvedTeams = dedupedRows.map((row) => toCoachTeam(toTeam(row)));

    if (resolvedTeams.length === 0) {
      setTeams([]);
      setSelectedTeamId('');
      setUsingMockTeams(false);
      setTeamsError(null);
      setIsLoadingTeams(false);
      return;
    }

    setTeams(resolvedTeams);
    setUsingMockTeams(false);
    setTeamsError(null);
    setSelectedTeamId((currentId) =>
      resolvedTeams.some((team) => team.id === (preferredTeamId ?? currentId))
        ? (preferredTeamId ?? currentId)
        : resolvedTeams[0].id
    );
    setIsLoadingTeams(false);
  }, [user]);

  useEffect(() => {
    let preferredTeamId: string | undefined;

    if (selectedTeamStorageKey) {
      try {
        const storedTeamId = window.localStorage.getItem(selectedTeamStorageKey);
        if (storedTeamId) {
          preferredTeamId = storedTeamId;
        }
      } catch (error) {
        console.error('Unable to read stored coach selected team id:', error);
      }
    }

    void loadTeams(preferredTeamId);
  }, [loadTeams, selectedTeamStorageKey]);

  useEffect(() => {
    if (!selectedTeamStorageKey || !selectedTeamId) return;

    try {
      window.localStorage.setItem(selectedTeamStorageKey, selectedTeamId);
    } catch (error) {
      console.error('Unable to persist coach selected team id:', error);
    }
  }, [selectedTeamId, selectedTeamStorageKey]);

  const createTeam = useCallback(
    async ({ name, code }: { name: string; code?: string }) => {
      if (!user) {
        return { error: 'You must be signed in to create a team.' };
      }

      const trimmedName = name.trim();
      if (!trimmedName) {
        return { error: 'Team name is required.' };
      }

      const inviteCode = code?.trim().toUpperCase() || generateTeamCode(trimmedName);
      const { data: createdTeam, error: createTeamError } = await supabase
        .from('teams')
        .insert({
          name: trimmedName,
          invite_code: inviteCode,
          created_by: user.id,
        })
        .select('id, name, invite_code, created_by, created_at, updated_at')
        .single();

      if (createTeamError || !createdTeam) {
        return { error: createTeamError ? getCreateTeamErrorMessage(createTeamError) : 'Unable to create team right now.' };
      }

      const { error: membershipUpsertError } = await supabase.from('team_memberships').upsert(
        {
          team_id: createdTeam.id,
          user_id: user.id,
          role: 'coach',
          status: 'active',
        },
        { onConflict: 'team_id,user_id' }
      );

      if (membershipUpsertError) {
        console.error('Team created but coach membership upsert failed:', membershipUpsertError);
      }

      await loadTeams(createdTeam.id);

      return { error: null };
    },
    [loadTeams, user]
  );

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? teams[0] ?? emptySelectedTeam;

  const value = useMemo(
    () => ({
      teams,
      selectedTeamId,
      selectedTeam,
      isLoadingTeams,
      usingMockTeams,
      teamsError,
      setSelectedTeamId,
      reloadTeams: loadTeams,
      createTeam,
    }),
    [teams, selectedTeamId, selectedTeam, isLoadingTeams, usingMockTeams, teamsError, loadTeams, createTeam]
  );

  return (
    <CoachTeamContext.Provider value={value}>
      {children}
    </CoachTeamContext.Provider>
  );
}

export function useCoachTeam() {
  return useContext(CoachTeamContext);
}
