// constants.ts

export const DEPOSIT_PERCENTAGE = 0.25; // 25%

const isProduction = import.meta.env.PROD && import.meta.env.VITE_APP_MODE !== 'demo';

export const PAY_ID_NAME = import.meta.env.VITE_PAY_ID_NAME || (isProduction ? '' : 'Demo PayID Name');
export const PAY_ID_EMAIL = import.meta.env.VITE_PAY_ID_EMAIL || (isProduction ? '' : 'demo@example.com');

/** Whether PayID is properly configured for real payments. */
export const PAY_ID_CONFIGURED = Boolean(import.meta.env.VITE_PAY_ID_NAME && import.meta.env.VITE_PAY_ID_EMAIL);

if (isProduction && !PAY_ID_CONFIGURED) {
  console.error('FATAL: VITE_PAY_ID_NAME and VITE_PAY_ID_EMAIL must be set in production. Payments are disabled.');
}
