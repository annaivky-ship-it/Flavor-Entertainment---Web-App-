// constants.ts

export const DEPOSIT_PERCENTAGE = 0.25; // 25%

const isDemoMode = import.meta.env.VITE_APP_MODE === 'demo';

export const PAY_ID_NAME = import.meta.env.VITE_PAY_ID_NAME || (isDemoMode ? 'Demo PayID Name' : '');
export const PAY_ID_EMAIL = import.meta.env.VITE_PAY_ID_EMAIL || (isDemoMode ? 'demo@example.com' : '');

if (!isDemoMode && (!import.meta.env.VITE_PAY_ID_NAME || !import.meta.env.VITE_PAY_ID_EMAIL)) {
  console.error('VITE_PAY_ID_NAME and VITE_PAY_ID_EMAIL must be configured for production. Payment flow will not work.');
}

export const ASAP_SURCHARGE_MULTIPLIER = 1.3; // 30% premium for instant bookings
export const ASAP_MAX_ETA_MINUTES = 60; // Performer arrives within 1 hour
export const ASAP_DEFAULT_DURATION_HOURS = 2; // Default duration for ASAP bookings
