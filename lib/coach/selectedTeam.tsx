'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';

export interface CoachTeam {
  id: string;
  name: string;
  code: string;
}

interface CoachTeamContextValue {
  teams: CoachTeam[];
  selectedTeamId: string;
  selectedTeam: CoachTeam;
  setSelectedTeamId: (teamId: string) => void;
}

const mockTeams: CoachTeam[] = [
  { id: 'whitby-u19', name: 'Whitby FC U19', code: 'WHI-U19' },
  { id: 'whitby-u17', name: 'Whitby FC U17', code: 'WHI-U17' },
  { id: 'seattle-u23', name: 'Seattle Harbor U23', code: 'SEA-U23' },
  { id: 'ridgeview-w', name: 'Ridgeview Women', code: 'RDG-W' },
];

const defaultTeam = mockTeams[0];

const CoachTeamContext = createContext<CoachTeamContextValue>({
  teams: mockTeams,
  selectedTeamId: defaultTeam.id,
  selectedTeam: defaultTeam,
  setSelectedTeamId: () => {},
});

export function CoachTeamProvider({ children }: { children: React.ReactNode }) {
  const [selectedTeamId, setSelectedTeamId] = useState<string>(defaultTeam.id);

  const selectedTeam =
    mockTeams.find((team) => team.id === selectedTeamId) ?? defaultTeam;

  const value = useMemo(
    () => ({
      teams: mockTeams,
      selectedTeamId,
      selectedTeam,
      setSelectedTeamId,
    }),
    [selectedTeamId, selectedTeam]
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
