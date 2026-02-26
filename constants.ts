// constants.ts

export const DEPOSIT_PERCENTAGE = 0.25; // 25%

export const PAY_ID_NAME = import.meta.env.VITE_PAY_ID_NAME;
export const PAY_ID_EMAIL = import.meta.env.VITE_PAY_ID_EMAIL;

if (!PAY_ID_NAME || !PAY_ID_EMAIL) {
  throw new Error('Missing required environment variables: VITE_PAY_ID_NAME, VITE_PAY_ID_EMAIL');
}
