/**
 * Shared helper for resolving booking PII regardless of split state.
 *
 * After BOOKING_OMIT_PII_FROM_PARENT is flipped on in production, the
 * parent /bookings doc stops carrying PII. Server-side code that needs
 * client_name, client_email, client_phone, etc. must route through this
 * helper so legacy bookings (PII on parent) and split bookings (PII on
 * sibling) both resolve.
 */

import { getFirestore } from 'firebase-admin/firestore';

const getDb = () => getFirestore('default');

export interface BookingPII {
  client_name: string;
  client_email: string;
  client_phone: string;
  client_dob: string;
  event_address: string;
  eventSuburb: string;
  client_message: string | null;
  id_document_path: string | null;
  selfie_document_path: string | null;
}

export async function resolveBookingPII(bookingId: string, parentBooking: any): Promise<BookingPII> {
  let pii: any = null;
  try {
    const piiSnap = await getDb().collection('bookingPII').doc(bookingId).get();
    if (piiSnap.exists) pii = piiSnap.data();
  } catch {
    pii = null;
  }
  const source = pii || parentBooking || {};
  return {
    client_name: source.client_name || parentBooking?.fullName || '',
    client_email: source.client_email || parentBooking?.email || '',
    client_phone: source.client_phone || parentBooking?.phone || parentBooking?.mobile || '',
    client_dob: source.client_dob || '',
    event_address: source.event_address || '',
    eventSuburb: source.eventSuburb || '',
    client_message: source.client_message ?? null,
    id_document_path: source.id_document_path ?? null,
    selfie_document_path: source.selfie_document_path ?? null,
  };
}
