import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory state for the mocked Firestore
let stalebookings: any[] = [];
const writes: any[] = [];
const slotDeletes: string[] = [];

const mockBatch = () => {
  const ops: any[] = [];
  return {
    update: vi.fn((ref: any, data: any) => ops.push({ op: 'update', path: ref.path, data })),
    set: vi.fn((ref: any, data: any) => ops.push({ op: 'set', path: ref.path, data })),
    delete: vi.fn((ref: any) => { slotDeletes.push(ref.path); ops.push({ op: 'delete', path: ref.path }); }),
    commit: vi.fn(async () => writes.push(...ops)),
  };
};

const mockDb = {
  collection: vi.fn((name: string) => ({
    where: vi.fn(function chain(this: any) { return this; }),
    get: vi.fn(async () => {
      if (name === 'bookings') {
        return {
          empty: stalebookings.length === 0,
          docs: stalebookings.map(b => ({
            id: b.id,
            ref: { path: `bookings/${b.id}` },
            data: () => b,
          })),
        };
      }
      return { empty: true, docs: [] };
    }),
    doc: (id?: string) => ({ path: `${name}/${id ?? 'auto'}` }),
  })),
  batch: () => mockBatch(),
};

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mockDb,
}));

vi.mock('firebase-admin', () => ({
  default: {
    firestore: {
      Timestamp: {
        now: () => ({ toDate: () => new Date(), seconds: Math.floor(Date.now()/1000) }),
        fromDate: (d: Date) => ({ toDate: () => d, seconds: Math.floor(d.getTime()/1000) }),
      },
      FieldValue: {
        serverTimestamp: () => 'SERVER_TS',
      },
    },
  },
  firestore: {
    Timestamp: {
      now: () => ({ toDate: () => new Date(), seconds: Math.floor(Date.now()/1000) }),
      fromDate: (d: Date) => ({ toDate: () => d, seconds: Math.floor(d.getTime()/1000) }),
    },
    FieldValue: { serverTimestamp: () => 'SERVER_TS' },
  },
}));

import { cascadeStaleAsapBookings, ASAP_CASCADE_TIMEOUT_MINUTES } from '../triggers/asapCascade';

describe('cascadeStaleAsapBookings', () => {
  beforeEach(() => {
    stalebookings = [];
    writes.length = 0;
    slotDeletes.length = 0;
  });

  it('exposes a 10-minute cascade timeout default', () => {
    expect(ASAP_CASCADE_TIMEOUT_MINUTES).toBe(10);
  });

  it('returns 0 when there are no stale ASAP bookings', async () => {
    const count = await cascadeStaleAsapBookings();
    expect(count).toBe(0);
  });

  it('cascades each stale booking with status, audit log, and outbox entry', async () => {
    stalebookings = [
      {
        id: 'b1',
        is_asap: true,
        status: 'pending_performer_acceptance',
        bookingReference: 'FE-001',
        performer_id: 7,
        performer: { name: 'Aurora' },
        client_name: 'Pat',
        client_phone: '+61400000000',
        client_email: 'pat@x.com',
        event_time: '19:45',
        event_address: '1 Test Rd',
        slotLock: 'slot-lock-id',
      },
    ];
    const count = await cascadeStaleAsapBookings();
    expect(count).toBe(1);

    const updates = writes.filter(w => w.op === 'update' && w.path === 'bookings/b1');
    expect(updates).toHaveLength(1);
    expect(updates[0].data.status).toBe('asap_cascaded');
    expect(updates[0].data.cancellation_reason).toBe('asap_no_performer_response');
    expect(updates[0].data.cancelled_by).toBe('system');

    expect(slotDeletes).toEqual(['booking_slots/slot-lock-id']);

    const notif = writes.find(w => w.op === 'set' && w.path.startsWith('notification_outbox/'));
    expect(notif).toBeDefined();
    expect(notif.data.type).toBe('asap_cascaded');
    expect(notif.data.bookingId).toBe('b1');
    expect(notif.data.performerName).toBe('Aurora');
    expect(notif.data.eventTime).toBe('19:45');
    expect(notif.data.sent).toBe(false);

    const audit = writes.find(w => w.op === 'set' && w.path.startsWith('audit_logs/'));
    expect(audit).toBeDefined();
    expect(audit.data.action).toBe('ASAP_BOOKING_CASCADED');
    expect(audit.data.subjectId).toBe('b1');
    expect(audit.data.meta.timeoutMinutes).toBe(10);
  });

  it('skips slot deletion if no slotLock is set', async () => {
    stalebookings = [{
      id: 'b2',
      is_asap: true,
      status: 'pending_performer_acceptance',
      bookingReference: 'FE-002',
      performer_id: 9,
      // no slotLock
    }];
    const count = await cascadeStaleAsapBookings();
    expect(count).toBe(1);
    expect(slotDeletes).toEqual([]);
  });
});
