import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory state for the mocked Firestore
let stalebookings: any[] = [];
let allPerformers: any[] = [];
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
      if (name === 'performers') {
        return {
          empty: allPerformers.length === 0,
          docs: allPerformers.map(p => ({
            id: String(p.id),
            ref: { path: `performers/${p.id}` },
            data: () => p,
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

import {
  cascadeStaleAsapBookings,
  pickReassignmentCandidate,
  ASAP_CASCADE_TIMEOUT_MINUTES,
  ASAP_MAX_REASSIGNMENT_ATTEMPTS,
} from '../triggers/asapCascade';

describe('pickReassignmentCandidate', () => {
  const pool = [
    { id: 1, name: 'Anna', status: 'available', service_ids: ['waitress-topless', 'show-pearl'] },
    { id: 2, name: 'Bree', status: 'busy',      service_ids: ['waitress-topless'] },
    { id: 3, name: 'Cleo', status: 'available', service_ids: ['waitress-nude'], accepts_asap: false },
    { id: 4, name: 'Dani', status: 'available', service_ids: ['waitress-topless'], accepts_asap: true },
    { id: 5, name: 'Erin', status: 'offline',   service_ids: ['waitress-topless'] },
  ];

  it('skips the current performer', () => {
    expect(pickReassignmentCandidate(pool, 1, [], ['waitress-topless'])?.id).toBe(4);
  });

  it('skips already-attempted performers', () => {
    expect(pickReassignmentCandidate(pool, 1, [4], ['waitress-topless'])).toBeNull();
  });

  it('skips performers who are not available', () => {
    // Anna (1) and Dani (4) are the only available 'waitress-topless' performers;
    // exclude both, leaving Bree (busy) and Erin (offline) — picker must return null.
    expect(pickReassignmentCandidate(pool, 99, [1, 4], ['waitress-topless'])).toBeNull();
  });

  it('skips performers who have opted out of ASAP', () => {
    expect(pickReassignmentCandidate(pool, 99, [], ['waitress-nude'])).toBeNull();
  });

  it('requires service-set overlap', () => {
    expect(pickReassignmentCandidate(pool, 99, [], ['show-vip'])).toBeNull();
  });

  it('treats undefined accepts_asap as opted-in', () => {
    const c = pickReassignmentCandidate(pool, 99, [], ['show-pearl']);
    expect(c?.id).toBe(1);
  });
});

describe('cascadeStaleAsapBookings', () => {
  beforeEach(() => {
    stalebookings = [];
    allPerformers = [];
    writes.length = 0;
    slotDeletes.length = 0;
  });

  it('exposes a 10-minute cascade timeout default', () => {
    expect(ASAP_CASCADE_TIMEOUT_MINUTES).toBe(10);
  });

  it('caps reassignment attempts at 2 by default', () => {
    expect(ASAP_MAX_REASSIGNMENT_ATTEMPTS).toBe(2);
  });

  it('returns zero counts when there are no stale ASAP bookings', async () => {
    const result = await cascadeStaleAsapBookings();
    expect(result).toEqual({ reassigned: 0, cascaded: 0 });
  });

  it('reassigns to a fresh candidate before falling through to terminal cascade', async () => {
    stalebookings = [{
      id: 'b1',
      is_asap: true,
      status: 'pending_performer_acceptance',
      bookingReference: 'FE-001',
      performer_id: 7,
      performer: { name: 'Aurora' },
      services_requested: ['waitress-topless'],
      client_name: 'Pat',
      client_phone: '+61400000000',
      event_time: '19:45',
      event_address: '1 Test Rd',
      asap_attempted_performer_ids: [],
    }];
    allPerformers = [
      { id: 7, name: 'Aurora', status: 'available', service_ids: ['waitress-topless'] },
      { id: 9, name: 'Bria',   status: 'available', service_ids: ['waitress-topless'], accepts_asap: true },
    ];
    const result = await cascadeStaleAsapBookings();
    expect(result).toEqual({ reassigned: 1, cascaded: 0 });

    const update = writes.find(w => w.op === 'update' && w.path === 'bookings/b1');
    expect(update.data.performer_id).toBe(9);
    expect(update.data.performer.name).toBe('Bria');
    expect(update.data.performer_reassigned_from_id).toBe(7);
    expect(update.data.asap_attempted_performer_ids).toEqual([7]);
    expect(update.data.created_at).toBe('SERVER_TS');
    expect(update.data.status).toBeUndefined();

    const notif = writes.find(w => w.op === 'set' && w.path.startsWith('notification_outbox/'));
    expect(notif.data.type).toBe('asap_reassigned');
    expect(notif.data.previousPerformerName).toBe('Aurora');
    expect(notif.data.performerName).toBe('Bria');

    const audit = writes.find(w => w.op === 'set' && w.path.startsWith('audit_logs/'));
    expect(audit.data.action).toBe('ASAP_BOOKING_REASSIGNED');
    expect(audit.data.meta.fromPerformerId).toBe(7);
    expect(audit.data.meta.toPerformerId).toBe(9);
    expect(audit.data.meta.attemptNumber).toBe(1);
  });

  it('falls through to terminal cascade when no candidate matches', async () => {
    stalebookings = [{
      id: 'b2',
      is_asap: true,
      status: 'pending_performer_acceptance',
      bookingReference: 'FE-002',
      performer_id: 7,
      performer: { name: 'Aurora' },
      services_requested: ['waitress-topless'],
      client_name: 'Pat',
      client_phone: '+61400000000',
      event_time: '19:45',
      slotLock: 'slot-b2',
    }];
    allPerformers = [
      { id: 7, name: 'Aurora', status: 'available', service_ids: ['waitress-topless'] },
      // No other available performer with the requested service.
    ];
    const result = await cascadeStaleAsapBookings();
    expect(result).toEqual({ reassigned: 0, cascaded: 1 });

    const update = writes.find(w => w.op === 'update' && w.path === 'bookings/b2');
    expect(update.data.status).toBe('asap_cascaded');
    expect(update.data.cancellation_reason).toBe('asap_no_performer_response');

    expect(slotDeletes).toEqual(['booking_slots/slot-b2']);

    const notif = writes.find(w => w.op === 'set' && w.path.startsWith('notification_outbox/'));
    expect(notif.data.type).toBe('asap_cascaded');
    expect(notif.data.attemptedPerformerIds).toEqual([7]);
  });

  it('falls through to terminal cascade when reassignment cap is exhausted', async () => {
    stalebookings = [{
      id: 'b3',
      is_asap: true,
      status: 'pending_performer_acceptance',
      bookingReference: 'FE-003',
      performer_id: 9,
      performer: { name: 'Bria' },
      services_requested: ['waitress-topless'],
      // already tried 2 performers — at the cap, must terminate.
      asap_attempted_performer_ids: [7, 8],
    }];
    allPerformers = [
      { id: 9, name: 'Bria',   status: 'available', service_ids: ['waitress-topless'] },
      { id: 10, name: 'Cleo',  status: 'available', service_ids: ['waitress-topless'] },
    ];
    const result = await cascadeStaleAsapBookings();
    expect(result).toEqual({ reassigned: 0, cascaded: 1 });

    const update = writes.find(w => w.op === 'update' && w.path === 'bookings/b3');
    expect(update.data.status).toBe('asap_cascaded');

    const audit = writes.find(w => w.op === 'set' && w.path.startsWith('audit_logs/'));
    expect(audit.data.meta.attemptedPerformerIds).toEqual([7, 8, 9]);
  });

  it('handles a mixed batch of reassignable + cascading bookings in one run', async () => {
    stalebookings = [
      {
        id: 'b-reassign',
        is_asap: true,
        status: 'pending_performer_acceptance',
        bookingReference: 'FE-A',
        performer_id: 1,
        performer: { name: 'Anna' },
        services_requested: ['waitress-topless'],
      },
      {
        id: 'b-terminal',
        is_asap: true,
        status: 'pending_performer_acceptance',
        bookingReference: 'FE-B',
        performer_id: 1,
        performer: { name: 'Anna' },
        services_requested: ['show-vip'], // no performer offers this in pool
        slotLock: 'slot-b',
      },
    ];
    allPerformers = [
      { id: 1, name: 'Anna', status: 'available', service_ids: ['waitress-topless'] },
      { id: 2, name: 'Bree', status: 'available', service_ids: ['waitress-topless'] },
    ];
    const result = await cascadeStaleAsapBookings();
    expect(result).toEqual({ reassigned: 1, cascaded: 1 });

    const reassignUpdate = writes.find(w => w.op === 'update' && w.path === 'bookings/b-reassign');
    expect(reassignUpdate.data.performer_id).toBe(2);

    const terminalUpdate = writes.find(w => w.op === 'update' && w.path === 'bookings/b-terminal');
    expect(terminalUpdate.data.status).toBe('asap_cascaded');
  });
});
