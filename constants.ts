// constants.ts

export const DEPOSIT_PERCENTAGE = 0.25; // 25%

// PayID details — must be set via environment variables. No fallback to avoid leaking demo data.
export const PAY_ID_NAME = import.meta.env.VITE_PAY_ID_NAME ?? '';
export const PAY_ID_EMAIL = import.meta.env.VITE_PAY_ID_EMAIL ?? '';

export const SERVICE_AREAS = ['Perth North', 'Perth South', 'Southwest', 'Northwest'] as const;

// Booking event type options (single source of truth — also used in BookingProcess)
export const EVENT_TYPES = [
  'Bucks Party',
  'Birthday Party',
  'Corporate Event',
  'Hens Party',
  'Private Gathering',
  'Other',
] as const;

export type EventType = typeof EVENT_TYPES[number];
