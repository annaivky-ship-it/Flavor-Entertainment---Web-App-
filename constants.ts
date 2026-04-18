// constants.ts

export const DEPOSIT_PERCENTAGE = 0.25; // 25%

export const TRAVEL_FEE_THRESHOLD_KM = 50; // No travel fee within 50km of Perth CBD
export const TRAVEL_FEE_RATE_PER_KM = 1; // $1 per km beyond threshold

export const PAY_ID_NAME = import.meta.env.VITE_PAY_ID_NAME || 'Demo PayID Name';
export const PAY_ID_EMAIL = import.meta.env.VITE_PAY_ID_EMAIL || 'demo@example.com';

export const BOOKING_PAYMENT_HOLD_MINUTES = 30;
export const BOOKING_REFERENCE_PREFIX = 'FE';

// Payment mode:
//   'manual'  = client clicks "I've sent payment" → admin confirms in dashboard (use while waiting for Monoova)
//   'monoova' = auto-confirm via Monoova webhook (requires Monoova account + MONOOVA_WEBHOOK_SECRET)
export const PAYMENT_MODE: 'manual' | 'monoova' =
  (import.meta.env.VITE_PAYMENT_MODE as 'manual' | 'monoova') || 'manual';

if (!import.meta.env.VITE_PAY_ID_NAME || !import.meta.env.VITE_PAY_ID_EMAIL) {
  console.warn('Missing required environment variables: VITE_PAY_ID_NAME, VITE_PAY_ID_EMAIL. Using fallback values.');
}
