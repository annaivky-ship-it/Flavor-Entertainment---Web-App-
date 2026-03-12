// constants.ts

export const DEPOSIT_PERCENTAGE = 0.25; // 25%

const isDemoMode = import.meta.env.VITE_APP_MODE === 'demo';

export const PAY_ID_NAME = import.meta.env.VITE_PAY_ID_NAME || (isDemoMode ? 'Demo PayID Name' : '');
export const PAY_ID_EMAIL = import.meta.env.VITE_PAY_ID_EMAIL || (isDemoMode ? 'demo@example.com' : '');

if (!isDemoMode && (!import.meta.env.VITE_PAY_ID_NAME || !import.meta.env.VITE_PAY_ID_EMAIL)) {
  console.error('VITE_PAY_ID_NAME and VITE_PAY_ID_EMAIL must be configured for production. Payment flow will not work.');
}
