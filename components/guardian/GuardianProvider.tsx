'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadLinkedPlayers } from '@/lib/guardian/api';
import type { GuardianLinkedPlayer } from '@/lib/guardian/types';

interface GuardianContextValue {
  players: GuardianLinkedPlayer[];
  activePlayers: GuardianLinkedPlayer[];
  selectedPlayerId: string;
  setSelectedPlayerId: (value: string) => void;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const GuardianContext = createContext<GuardianContextValue | null>(null);

export function GuardianProvider({ children }: { children: React.ReactNode }) {
  const [players, setPlayers] = useState<GuardianLinkedPlayer[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const result = await loadLinkedPlayers();
    setPlayers(result.data);
    setError(result.error);
    setIsLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const activePlayers = useMemo(
    () => players.filter((player) => player.relationship_status === 'active'),
    [players],
  );

  const value = useMemo(() => ({
    players, activePlayers, selectedPlayerId, setSelectedPlayerId, isLoading, error, refresh,
  }), [players, activePlayers, selectedPlayerId, isLoading, error, refresh]);

  return <GuardianContext.Provider value={value}>{children}</GuardianContext.Provider>;
}

export function useGuardian() {
  const value = useContext(GuardianContext);
  if (!value) throw new Error('useGuardian must be used inside GuardianProvider.');
  return value;
}
