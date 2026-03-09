// constants.ts

export const DEPOSIT_PERCENTAGE = 0.25; // 25%

export const PAY_ID_NAME = import.meta.env.VITE_PAY_ID_NAME || 'Demo PayID Name';
export const PAY_ID_EMAIL = import.meta.env.VITE_PAY_ID_EMAIL || 'demo@example.com';

if (!import.meta.env.VITE_PAY_ID_NAME || !import.meta.env.VITE_PAY_ID_EMAIL) {
  console.warn('Missing required environment variables: VITE_PAY_ID_NAME, VITE_PAY_ID_EMAIL. Using fallback values.');
}
