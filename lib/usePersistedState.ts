'use client';

import { Dispatch, SetStateAction, useEffect, useState } from 'react';

export function usePersistedState<T>(
  key: string,
  initialValue: T,
  options: { storage?: 'local' | 'session' } = {}
): [T, Dispatch<SetStateAction<T>>] {
  const storageType = options.storage ?? 'session';
  const storageIdentity = `${storageType}:${key}`;
  const [loadedStorageIdentity, setLoadedStorageIdentity] = useState<string | null>(null);
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    return initialValue;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const storage = storageType === 'local' ? window.localStorage : window.sessionStorage;
      const stored = storage.getItem(key);
      setValue(stored ? (JSON.parse(stored) as T) : initialValue);
    } catch {
      setValue(initialValue);
    } finally {
      setLoadedStorageIdentity(storageIdentity);
    }
  }, [initialValue, key, storageIdentity, storageType]);

  useEffect(() => {
    if (typeof window === 'undefined' || loadedStorageIdentity !== storageIdentity) return;

    try {
      const storage = storageType === 'local' ? window.localStorage : window.sessionStorage;
      const serialized = JSON.stringify(value);
      if (serialized === undefined) {
        storage.removeItem(key);
      } else {
        storage.setItem(key, serialized);
      }
    } catch {}
  }, [key, loadedStorageIdentity, storageIdentity, storageType, value]);

  return [value, setValue];
}
