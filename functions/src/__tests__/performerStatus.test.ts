import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-admin', () => ({
  default: {
    firestore: {
      FieldValue: { serverTimestamp: () => 'SERVER_TS' },
    },
  },
  firestore: {
    FieldValue: { serverTimestamp: () => 'SERVER_TS' },
  },
}));

import {
  nextPerformerStatus,
  syncPerformerStatusOnBookingChange,
  ACTIVE_BOOKING_STATUSES,
} from '../triggers/performerStatus';

describe('nextPerformerStatus', () => {
  it('flips available → busy when performer just committed (accepted)', () => {
    expect(nextPerformerStatus({
      beforeBookingStatus: 'pending_performer_acceptance',
      afterBookingStatus: 'pending_vetting',
      performerStatus: 'available',
      otherActiveBookingsCount: 0,
    })).toBe('busy');
  });

  it('flips busy → available when last active booking releases', () => {
    expect(nextPerformerStatus({
      beforeBookingStatus: 'in_progress',
      afterBookingStatus: 'completed',
      performerStatus: 'busy',
      otherActiveBookingsCount: 0,
    })).toBe('available');
  });

  it('does NOT release performer to available if other active bookings remain', () => {
    expect(nextPerformerStatus({
      beforeBookingStatus: 'in_progress',
      afterBookingStatus: 'completed',
      performerStatus: 'busy',
      otherActiveBookingsCount: 2,
    })).toBeNull();
  });

  it('does NOT override offline performer status on accept', () => {
    expect(nextPerformerStatus({
      beforeBookingStatus: 'pending_performer_acceptance',
      afterBookingStatus: 'pending_vetting',
      performerStatus: 'offline',
      otherActiveBookingsCount: 0,
    })).toBeNull();
  });

  it('does NOT override offline performer status on release', () => {
    expect(nextPerformerStatus({
      beforeBookingStatus: 'in_progress',
      afterBookingStatus: 'completed',
      performerStatus: 'offline',
      otherActiveBookingsCount: 0,
    })).toBeNull();
  });

  it('does NOT override pending_verification performer status', () => {
    expect(nextPerformerStatus({
      beforeBookingStatus: 'pending_performer_acceptance',
      afterBookingStatus: 'pending_vetting',
      performerStatus: 'pending_verification',
      otherActiveBookingsCount: 0,
    })).toBeNull();
  });

  it('does not flip on transitions within the active set (busy stays busy)', () => {
    expect(nextPerformerStatus({
      beforeBookingStatus: 'confirmed',
      afterBookingStatus: 'in_progress',
      performerStatus: 'busy',
      otherActiveBookingsCount: 0,
    })).toBeNull();
  });

  it('does not flip when performer rejects (pending_acceptance → rejected stays available)', () => {
    expect(nextPerformerStatus({
      beforeBookingStatus: 'pending_performer_acceptance',
      afterBookingStatus: 'rejected',
      performerStatus: 'available',
      otherActiveBookingsCount: 0,
    })).toBeNull();
  });

  it('treats asap_cascaded as a release', () => {
    expect(nextPerformerStatus({
      beforeBookingStatus: 'pending_vetting',
      afterBookingStatus: 'asap_cascaded',
      performerStatus: 'busy',
      otherActiveBookingsCount: 0,
    })).toBe('available');
  });
});

describe('ACTIVE_BOOKING_STATUSES', () => {
  it('does NOT include pending_performer_acceptance', () => {
    expect(ACTIVE_BOOKING_STATUSES.has('pending_performer_acceptance')).toBe(false);
  });
  it('does NOT include any terminal status', () => {
    for (const terminal of ['completed', 'cancelled', 'rejected', 'expired', 'asap_cascaded']) {
      expect(ACTIVE_BOOKING_STATUSES.has(terminal)).toBe(false);
    }
  });
  it('includes the in-flight working states', () => {
    for (const s of ['pending_vetting', 'deposit_pending', 'pending_deposit_confirmation', 'confirmed', 'en_route', 'arrived', 'in_progress']) {
      expect(ACTIVE_BOOKING_STATUSES.has(s)).toBe(true);
    }
  });
});

describe('syncPerformerStatusOnBookingChange (I/O)', () => {
  let performerStatus: string | undefined;
  let performerExists = true;
  let otherActiveBookingDocs: Array<{ id: string }>;
  const performerWrites: any[] = [];
  const auditWrites: any[] = [];

  const makeDb = () => ({
    collection: vi.fn((name: string) => {
      if (name === 'performers') {
        return {
          doc: (_id: string) => ({
            get: vi.fn(async () => ({
              exists: performerExists,
              data: () => (performerStatus ? { status: performerStatus } : undefined),
            })),
            update: vi.fn(async (data: any) => { performerWrites.push(data); }),
          }),
        };
      }
      if (name === 'bookings') {
        return {
          where: vi.fn(function chain(this: any) { return this; }),
          get: vi.fn(async () => ({
            docs: otherActiveBookingDocs.map(d => ({ id: d.id })),
          })),
        };
      }
      if (name === 'audit_logs') {
        return {
          add: vi.fn(async (data: any) => { auditWrites.push(data); }),
        };
      }
      return {} as any;
    }),
  });

  beforeEach(() => {
    performerStatus = 'available';
    performerExists = true;
    otherActiveBookingDocs = [];
    performerWrites.length = 0;
    auditWrites.length = 0;
  });

  it('writes performer.status=busy + audit log on accept', async () => {
    const db = makeDb() as any;
    const result = await syncPerformerStatusOnBookingChange(
      db, 'b1', 7, 'pending_performer_acceptance', 'pending_vetting',
    );
    expect(result).toBe('busy');
    expect(performerWrites).toHaveLength(1);
    expect(performerWrites[0].status).toBe('busy');
    expect(performerWrites[0].statusAutoUpdatedReason).toBe('auto:booking_accepted:b1');
    expect(auditWrites).toHaveLength(1);
    expect(auditWrites[0].action).toBe('PERFORMER_STATUS_AUTO_FLIPPED');
    expect(auditWrites[0].meta.from).toBe('available');
    expect(auditWrites[0].meta.to).toBe('busy');
  });

  it('writes performer.status=available on completion when no other active bookings', async () => {
    performerStatus = 'busy';
    otherActiveBookingDocs = [];
    const db = makeDb() as any;
    const result = await syncPerformerStatusOnBookingChange(
      db, 'b1', 7, 'in_progress', 'completed',
    );
    expect(result).toBe('available');
    expect(performerWrites[0].status).toBe('available');
    expect(performerWrites[0].statusAutoUpdatedReason).toBe('auto:booking_released:b1');
  });

  it('does NOT write performer.status=available when another active booking exists', async () => {
    performerStatus = 'busy';
    otherActiveBookingDocs = [{ id: 'b2' }]; // different booking, still active
    const db = makeDb() as any;
    const result = await syncPerformerStatusOnBookingChange(
      db, 'b1', 7, 'in_progress', 'completed',
    );
    expect(result).toBeNull();
    expect(performerWrites).toHaveLength(0);
    expect(auditWrites).toHaveLength(0);
  });

  it('excludes the current booking from the active-count check', async () => {
    performerStatus = 'busy';
    // The query result includes b1 itself — defensive filter must drop it.
    otherActiveBookingDocs = [{ id: 'b1' }];
    const db = makeDb() as any;
    const result = await syncPerformerStatusOnBookingChange(
      db, 'b1', 7, 'in_progress', 'completed',
    );
    expect(result).toBe('available');
  });

  it('returns null + no writes when performer doc is missing', async () => {
    performerExists = false;
    const db = makeDb() as any;
    const result = await syncPerformerStatusOnBookingChange(
      db, 'b1', 999, 'pending_performer_acceptance', 'pending_vetting',
    );
    expect(result).toBeNull();
    expect(performerWrites).toHaveLength(0);
  });
});
