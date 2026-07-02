'use client';

import { Dispatch, SetStateAction, useEffect, useState } from 'react';

export function usePersistedState<T>(
  key: string,
  initialValue: T,
  options: { storage?: 'local' | 'session' } = {}
): [T, Dispatch<SetStateAction<T>>] {
  const storageType = options.storage ?? 'session';
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;

    try {
      const storage = storageType === 'local' ? window.localStorage : window.sessionStorage;
      const stored = storage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const storage = storageType === 'local' ? window.localStorage : window.sessionStorage;
      const serialized = JSON.stringify(value);
      if (serialized === undefined) {
        storage.removeItem(key);
      } else {
        storage.setItem(key, serialized);
      }
    } catch {}
  }, [key, storageType, value]);

  return [value, setValue];
}
