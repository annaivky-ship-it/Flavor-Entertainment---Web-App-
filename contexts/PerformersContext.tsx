import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import type { Performer } from '../types';

interface PerformersContextValue {
  performers: Performer[];
  isLoading: boolean;
  error: Error | null;
  setPerformers: React.Dispatch<React.SetStateAction<Performer[]>>;
}

const PerformersContext = createContext<PerformersContextValue | null>(null);

export function usePerformers(): PerformersContextValue {
  const ctx = useContext(PerformersContext);
  if (!ctx) throw new Error('usePerformers must be used inside <PerformersProvider>');
  return ctx;
}

/**
 * Subscribes to /performers on mount. The performer list is public, so this
 * provider does not depend on auth state — it can mount before AuthProvider
 * has resolved.
 */
export const PerformersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    const unsub = api.subscribeToPerformers((next) => {
      if (!active) return;
      setPerformers(next);
      setIsLoading(false);
    });
    return () => {
      active = false;
      try { unsub(); } catch { /* noop */ }
    };
  }, []);

  // Suppress unused-error warning while we still keep the field for future use.
  void error;
  void setError;

  const value = useMemo(
    () => ({ performers, isLoading, error, setPerformers }),
    [performers, isLoading, error]
  );

  return <PerformersContext.Provider value={value}>{children}</PerformersContext.Provider>;
};
