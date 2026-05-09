import { useEffect, useRef, useState } from 'react';
import type { Booking } from '../types';

/**
 * In-app alert for new ASAP booking requests on the performer dashboard.
 *
 * - Plays a short two-tone chime via Web Audio (no audio file dependency).
 * - Shows a browser Notification if permission is granted.
 * - Fires only for bookings that are NEW since the last render (tracked via
 *   a Set of seen booking IDs in a ref). Bookings already on screen when the
 *   dashboard first loads are seeded into the seen set so the alert doesn't
 *   fire on initial render.
 *
 * Sound + browser notifications both require a user gesture to enable —
 * the dashboard exposes a toggle button that calls `enable()` once on
 * click. Browsers gate AudioContext on a gesture; once warmed up, it can
 * play sounds for any later background event.
 */

export type AsapAlertPermission = 'default' | 'granted' | 'denied' | 'unsupported';

interface UseAsapAlertResult {
  permission: AsapAlertPermission;
  enable: () => Promise<void>;
}

const playChime = (ctx: AudioContext) => {
  const now = ctx.currentTime;

  const beep = (frequency: number, startOffset: number, duration: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0, now + startOffset);
    gain.gain.linearRampToValueAtTime(0.25, now + startOffset + 0.02);
    gain.gain.linearRampToValueAtTime(0, now + startOffset + duration);
    osc.start(now + startOffset);
    osc.stop(now + startOffset + duration);
  };

  // Two-tone urgent chime: high-low-high (~0.5s total)
  beep(880, 0, 0.18);
  beep(660, 0.20, 0.18);
  beep(880, 0.40, 0.20);
};

export function usePerformerAsapAlert(
  bookings: Booking[] | undefined,
  performerId: number | null | undefined,
): UseAsapAlertResult {
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [permission, setPermission] = useState<AsapAlertPermission>(() => {
    if (typeof window === 'undefined') return 'unsupported';
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission as AsapAlertPermission;
  });
  const seenRef = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const seededRef = useRef(false);

  // Seed seen-set with whatever's on screen when the dashboard first
  // mounts so we don't beep for existing bookings.
  useEffect(() => {
    if (seededRef.current || !bookings) return;
    for (const b of bookings) seenRef.current.add(b.id);
    seededRef.current = true;
  }, [bookings]);

  useEffect(() => {
    if (!seededRef.current || !bookings || performerId === null || performerId === undefined) return;

    for (const b of bookings) {
      if (seenRef.current.has(b.id)) continue;
      seenRef.current.add(b.id);

      const isAsapForMe =
        b.is_asap === true &&
        b.status === 'pending_performer_acceptance' &&
        b.performer_id === performerId;
      if (!isAsapForMe) continue;

      if (audioCtxRef.current) {
        try { playChime(audioCtxRef.current); } catch { /* ignore */ }
      }

      if (supported && Notification.permission === 'granted') {
        try {
          new Notification('ASAP booking request', {
            body: `${b.client_name} — arrival needed by ${b.event_time}. Tap to review.`,
            tag: `asap-${b.id}`,
            requireInteraction: true,
          });
        } catch { /* ignore */ }
      }
    }
  }, [bookings, performerId, supported]);

  const enable = async () => {
    // Warm up an AudioContext on the user gesture. Browsers refuse to
    // create/resume one outside a click handler.
    if (typeof window !== 'undefined' && !audioCtxRef.current) {
      const Ctor: typeof AudioContext | undefined =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        try {
          const ctx = new Ctor();
          if (ctx.state === 'suspended') await ctx.resume();
          audioCtxRef.current = ctx;
          // Play a tiny test chime so the performer hears that alerts work.
          playChime(ctx);
        } catch { /* ignore */ }
      }
    }

    if (!supported) {
      setPermission('unsupported');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result as AsapAlertPermission);
    } catch {
      setPermission('denied');
    }
  };

  return { permission, enable };
}
