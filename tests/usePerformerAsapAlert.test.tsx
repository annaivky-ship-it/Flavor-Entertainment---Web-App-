import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePerformerAsapAlert } from '../components/usePerformerAsapAlert';
import type { Booking } from '../types';

// --- Stubs ---

const notificationCtor = vi.fn();
let permissionState: NotificationPermission = 'default';
const requestPermissionMock = vi.fn(async () => permissionState);

class FakeNotification {
  static get permission() { return permissionState; }
  static requestPermission = requestPermissionMock;
  constructor(...args: unknown[]) { notificationCtor(...args); }
}

const oscillators: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
class FakeAudioContext {
  state: 'running' | 'suspended' = 'running';
  currentTime = 0;
  destination = {};
  createOscillator() {
    const osc = {
      type: '', frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    oscillators.push(osc as any);
    return osc as any;
  }
  createGain() {
    return {
      connect: vi.fn(),
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
    };
  }
  async resume() { this.state = 'running'; }
}

beforeEach(() => {
  permissionState = 'default';
  notificationCtor.mockClear();
  requestPermissionMock.mockClear();
  oscillators.length = 0;
  (window as any).Notification = FakeNotification;
  (window as any).AudioContext = FakeAudioContext;
});

const makeBooking = (overrides: Partial<Booking>): Booking => ({
  id: 'b-default',
  performer_id: 7,
  client_name: 'Pat',
  client_email: 'pat@x.com',
  client_phone: '+61400000000',
  event_date: '2026-02-15',
  event_time: '20:30',
  event_address: '1 Test Rd',
  event_type: 'Birthday',
  status: 'pending_performer_acceptance',
  id_document_path: null,
  selfie_document_path: null,
  deposit_receipt_path: null,
  created_at: '2026-02-15T20:00:00Z',
  duration_hours: 1,
  number_of_guests: 5,
  services_requested: [],
  is_asap: true,
  verified_by_admin_name: null,
  verified_at: null,
  ...overrides,
} as Booking);

describe('usePerformerAsapAlert', () => {
  it('does not fire on initial render — pre-existing bookings are seeded as "seen"', () => {
    const initial = [makeBooking({ id: 'b1' })];
    permissionState = 'granted';
    renderHook(() => usePerformerAsapAlert(initial, 7));
    expect(notificationCtor).not.toHaveBeenCalled();
    expect(oscillators.length).toBe(0);
  });

  it('fires a Notification when a NEW asap booking arrives after first render', async () => {
    permissionState = 'granted';
    const { rerender, result } = renderHook(({ b }: { b: Booking[] }) => usePerformerAsapAlert(b, 7), {
      initialProps: { b: [] as Booking[] },
    });
    // Warm up the AudioContext via enable() (simulates user gesture).
    await act(async () => { await result.current.enable(); });
    // New booking arrives
    rerender({ b: [makeBooking({ id: 'b-new' })] });
    expect(notificationCtor).toHaveBeenCalledTimes(1);
    expect(notificationCtor.mock.calls[0][0]).toBe('ASAP booking request');
    expect(notificationCtor.mock.calls[0][1]).toMatchObject({ tag: 'asap-b-new', requireInteraction: true });
  });

  it('plays a chime when a new asap booking arrives (after enable() warms the AudioContext)', async () => {
    permissionState = 'granted';
    const { rerender, result } = renderHook(({ b }: { b: Booking[] }) => usePerformerAsapAlert(b, 7), {
      initialProps: { b: [] as Booking[] },
    });
    await act(async () => { await result.current.enable(); });
    const oscCountAfterEnable = oscillators.length;
    rerender({ b: [makeBooking({ id: 'b-new' })] });
    // 3 beeps in the chime
    expect(oscillators.length - oscCountAfterEnable).toBe(3);
  });

  it('does not fire for non-asap bookings', () => {
    permissionState = 'granted';
    const { rerender } = renderHook(({ b }: { b: Booking[] }) => usePerformerAsapAlert(b, 7), {
      initialProps: { b: [] as Booking[] },
    });
    rerender({ b: [makeBooking({ id: 'b1', is_asap: false })] });
    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it('does not fire for bookings assigned to a different performer', () => {
    permissionState = 'granted';
    const { rerender } = renderHook(({ b }: { b: Booking[] }) => usePerformerAsapAlert(b, 7), {
      initialProps: { b: [] as Booking[] },
    });
    rerender({ b: [makeBooking({ id: 'b1', performer_id: 99 })] });
    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it('does not fire for bookings already past pending_performer_acceptance', () => {
    permissionState = 'granted';
    const { rerender } = renderHook(({ b }: { b: Booking[] }) => usePerformerAsapAlert(b, 7), {
      initialProps: { b: [] as Booking[] },
    });
    rerender({ b: [makeBooking({ id: 'b1', status: 'confirmed' })] });
    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it('does not duplicate-fire for the same booking ID across re-renders', () => {
    permissionState = 'granted';
    const { rerender } = renderHook(({ b }: { b: Booking[] }) => usePerformerAsapAlert(b, 7), {
      initialProps: { b: [] as Booking[] },
    });
    const newBooking = makeBooking({ id: 'b1' });
    rerender({ b: [newBooking] });
    rerender({ b: [newBooking] });
    rerender({ b: [{ ...newBooking }] });
    expect(notificationCtor).toHaveBeenCalledTimes(1);
  });

  it('skips Notification when permission is denied but still plays sound', async () => {
    permissionState = 'denied';
    const { rerender, result } = renderHook(({ b }: { b: Booking[] }) => usePerformerAsapAlert(b, 7), {
      initialProps: { b: [] as Booking[] },
    });
    await act(async () => { await result.current.enable(); });
    const oscCountAfterEnable = oscillators.length;
    rerender({ b: [makeBooking({ id: 'b-new' })] });
    expect(notificationCtor).not.toHaveBeenCalled();
    expect(oscillators.length).toBeGreaterThan(oscCountAfterEnable);
  });

  it('reports unsupported when Notification API is missing', () => {
    delete (window as any).Notification;
    const { result } = renderHook(() => usePerformerAsapAlert([], 7));
    expect(result.current.permission).toBe('unsupported');
  });
});
