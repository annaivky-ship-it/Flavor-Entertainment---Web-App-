import type { Booking, Performer } from '../types';
import { calculateBookingCost } from './bookingUtils';
import { allServices } from '../data/mockData';

// RFC 4180 escape: wrap in double quotes when the value contains a comma,
// quote, CR or LF; double up any embedded quote.
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : String(value);
  if (/[",\r\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',');
}

function formatDate(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  // Firestore Timestamp serialization shape
  const v = value as { seconds?: number; toDate?: () => Date };
  if (v && typeof v.toDate === 'function') return v.toDate().toISOString();
  if (v && typeof v.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
  return String(value);
}

export function bookingsToCsv(bookings: Booking[], performers: Performer[]): string {
  const performerById = new Map<string | number, Performer>();
  for (const p of performers) performerById.set(p.id, p);

  const header = [
    'Booking Reference',
    'Booking ID',
    'Created',
    'Status',
    'Payment Status',
    'Client Name',
    'Client Email',
    'Client Phone',
    'Performer',
    'Event Date',
    'Event Time',
    'Event Type',
    'Duration (hrs)',
    'Guests',
    'Suburb',
    'Services',
    'Subtotal (AUD)',
    'Travel Fee (AUD)',
    'Total (AUD)',
    'Deposit (AUD)',
  ];

  const rows = bookings.map((b) => {
    const performer = b.performer_id != null
      ? performerById.get(b.performer_id) || performerById.get(Number(b.performer_id))
      : undefined;

    const serviceNames = (b.services_requested || [])
      .map((sid) => allServices.find((s) => s.id === sid)?.name || sid)
      .join('; ');

    let cost = { totalCost: 0, depositAmount: 0, travelFee: 0, asapSurcharge: 0 };
    try {
      cost = calculateBookingCost(
        b.duration_hours || 0,
        b.services_requested || [],
        1,
        b.eventSuburb || undefined,
        !!b.is_asap
      );
    } catch {
      // Pricing changes shouldn't block the export — leave zeroes if the
      // booking references a service that has since been removed.
    }
    const subtotal = cost.totalCost - cost.travelFee - cost.asapSurcharge;

    return csvRow([
      b.bookingReference || '',
      b.id,
      formatDate(b.created_at),
      b.status,
      b.payment_status || '',
      b.client_name || '',
      b.client_email || '',
      b.client_phone || '',
      performer?.name || (b.performer_id != null ? `#${b.performer_id}` : ''),
      b.event_date || '',
      b.event_time || '',
      b.event_type || '',
      b.duration_hours ?? '',
      b.number_of_guests ?? '',
      b.eventSuburb || '',
      serviceNames,
      subtotal.toFixed(2),
      cost.travelFee.toFixed(2),
      cost.totalCost.toFixed(2),
      cost.depositAmount.toFixed(2),
    ]);
  });

  return [csvRow(header), ...rows].join('\r\n');
}

export function downloadCsv(filename: string, csv: string) {
  // BOM for Excel UTF-8 detection
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on next tick so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function bookingsCsvFilename(): string {
  const d = new Date();
  const iso = d.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `bookings-${iso}.csv`;
}
