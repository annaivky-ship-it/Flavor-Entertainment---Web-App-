import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';
import type { AuditLog, Booking, Communication, DoNotServeEntry } from '../types';

const ADMIN_DEFAULT_PAGE_SIZE = 100;
const ADMIN_PAGE_STEP = 100;
const ADMIN_MAX_PAGE_SIZE = 1000;

interface BookingsContextValue {
  bookings: Booking[];
  communications: Communication[];
  auditLogs: AuditLog[];
  doNotServeList: DoNotServeEntry[];
  isLoading: boolean;
  error: string | null;

  // Optimistic setters for handlers that need to update local state
  // before the snapshot listener catches up. (Replaces direct App.tsx
  // setState calls inside booking action handlers.)
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
  setCommunications: React.Dispatch<React.SetStateAction<Communication[]>>;
  setDoNotServeList: React.Dispatch<React.SetStateAction<DoNotServeEntry[]>>;

  // Admin pagination. For non-admin roles these are no-ops.
  bookingsPageSize: number;
  loadMoreBookings: () => void;
  canLoadMoreBookings: boolean;

  // Previous-snapshot ref so consumers can detect status transitions.
  // Read-only — the provider owns updates.
  prevBookingsRef: React.MutableRefObject<Booking[]>;

  refetch: () => Promise<void>;
}

const BookingsContext = createContext<BookingsContextValue | null>(null);

export function useBookings(): BookingsContextValue {
  const ctx = useContext(BookingsContext);
  if (!ctx) throw new Error('useBookings must be used inside <BookingsProvider>');
  return ctx;
}

export const BookingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authedUser, firebaseUid } = useAuth();
  const role = authedUser?.role;
  const performerId = authedUser?.id;

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [doNotServeList, setDoNotServeList] = useState<DoNotServeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookingsPageSize, setBookingsPageSize] = useState<number>(ADMIN_DEFAULT_PAGE_SIZE);
  const prevBookingsRef = useRef<Booking[]>([]);

  // Reset page size whenever the active role changes (avoid carrying an
  // inflated limit across role switches).
  useEffect(() => {
    setBookingsPageSize(ADMIN_DEFAULT_PAGE_SIZE);
  }, [role, performerId, firebaseUid]);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { performers: _p, bookings: bData, doNotServeList: dData, communications: cData, auditLogs: aData } =
        await api.getInitialData(role, firebaseUid || undefined, performerId);
      void _p;
      if (bData.error) throw new Error(`Bookings error: ${bData.error.message}`);
      setBookings(bData.data as Booking[] || []);
      if (cData.error) throw new Error(`Communications error: ${cData.error.message}`);
      setCommunications(cData.data as Communication[] || []);
      if (dData.error) throw new Error(`DNS error: ${dData.error.message}`);
      setDoNotServeList(dData.data as DoNotServeEntry[] || []);
      if (aData.error) throw new Error(`Audit logs error: ${aData.error.message}`);
      setAuditLogs(aData.data as AuditLog[] || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Backend initialization error: ${msg}.`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [role, firebaseUid, performerId]);

  // Subscriptions. Resubscribes when the role/uid/pageSize changes — admin
  // pagination is implemented by bumping pageSize, which forces a new
  // onSnapshot with a wider limit.
  useEffect(() => {
    const uid = firebaseUid || undefined;
    const unsubBookings = api.subscribeToBookings((next) => {
      prevBookingsRef.current = next;
      setBookings(next);
      setIsLoading(false);
    }, role, uid, performerId, bookingsPageSize);

    const unsubComms = api.subscribeToCommunications((next) => {
      setCommunications(next);
    }, role, uid);

    const unsubDNS = api.subscribeToDoNotServe((next) => {
      setDoNotServeList(next);
    }, role);

    const unsubAudit = api.subscribeToAuditLogs((next) => {
      setAuditLogs(next);
    }, role);

    return () => {
      try { unsubBookings(); } catch { /* noop */ }
      try { unsubComms(); } catch { /* noop */ }
      try { unsubDNS(); } catch { /* noop */ }
      try { unsubAudit(); } catch { /* noop */ }
    };
  }, [role, firebaseUid, performerId, bookingsPageSize]);

  const loadMoreBookings = useCallback(() => {
    if (role !== 'admin') return;
    setBookingsPageSize((prev) => Math.min(prev + ADMIN_PAGE_STEP, ADMIN_MAX_PAGE_SIZE));
  }, [role]);

  const canLoadMoreBookings =
    role === 'admin' &&
    bookingsPageSize < ADMIN_MAX_PAGE_SIZE &&
    bookings.length >= bookingsPageSize;

  const value = useMemo<BookingsContextValue>(() => ({
    bookings,
    communications,
    auditLogs,
    doNotServeList,
    isLoading,
    error,
    setBookings,
    setCommunications,
    setDoNotServeList,
    bookingsPageSize,
    loadMoreBookings,
    canLoadMoreBookings,
    prevBookingsRef,
    refetch,
  }), [bookings, communications, auditLogs, doNotServeList, isLoading, error, bookingsPageSize, loadMoreBookings, canLoadMoreBookings, refetch]);

  return <BookingsContext.Provider value={value}>{children}</BookingsContext.Provider>;
};
