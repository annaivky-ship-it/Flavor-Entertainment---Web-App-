import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../services/firebaseClient';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export function useAvailability(performerId: string | number) {
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const pidStr = String(performerId);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel any pending debounced save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!performerId || !db) return;

    setIsLoading(true);
    const docRef = doc(db, 'performers', pidStr, 'availability', 'blocked_dates');

    getDoc(docRef)
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data() as { dates?: string[] };
          setBlockedDates(data.dates ?? []);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load availability:', err);
        setIsLoading(false);
      });
  }, [pidStr]);

  const saveAvailability = useCallback(
    async (dates: string[]) => {
      if (!db) return;
      try {
        const docRef = doc(db, 'performers', pidStr, 'availability', 'blocked_dates');
        await setDoc(docRef, { dates, updatedAt: serverTimestamp() });
      } catch (err) {
        console.error('Failed to save availability:', err);
      }
    },
    [pidStr]
  );

  // Debounced save — waits 800ms after last change before writing to Firestore
  const debouncedSave = useCallback(
    (dates: string[]) => {
      if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveAvailability(dates);
      }, 800);
    },
    [saveAvailability]
  );

  const toggleDate = useCallback(
    (dateStr: string) => {
      setBlockedDates((prev) => {
        const updated = prev.includes(dateStr)
          ? prev.filter((d) => d !== dateStr)
          : [...prev, dateStr];
        debouncedSave(updated);
        return updated;
      });
    },
    [debouncedSave]
  );

  const blockRange = useCallback(
    (startDate: string, endDate: string) => {
      // Anchor to local noon to avoid UTC-offset date shifting
      const a = new Date(startDate + 'T12:00:00');
      const b = new Date(endDate + 'T12:00:00');
      const [from, to] = a <= b ? [a, b] : [b, a];
      const dates: string[] = [];
      const cur = new Date(from);
      while (cur <= to) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        dates.push(`${y}-${m}-${d}`);
        cur.setDate(cur.getDate() + 1);
      }
      setBlockedDates((prev) => {
        const updated = [...new Set([...prev, ...dates])];
        debouncedSave(updated);
        return updated;
      });
    },
    [debouncedSave]
  );

  return { blockedDates, toggleDate, blockRange, isLoading, saveAvailability };
}
