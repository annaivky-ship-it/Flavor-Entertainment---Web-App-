/** Demo mode utilities for presenting the platform without real transactions */

export const isDemoMode = import.meta.env.VITE_APP_MODE === 'demo';

/** Simulate async operation with realistic delay */
export const simulateDelay = (ms: number = 1200) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

/** Demo mode booking submission - returns fake success */
export const simulateBookingSubmission = async () => {
  await simulateDelay(1500);
  return {
    success: true,
    bookingIds: [`demo-${Date.now()}`],
    message: 'Booking request submitted successfully.',
  };
};

/** Demo mode payment - returns fake success */
export const simulatePayment = async () => {
  await simulateDelay(2000);
  return {
    success: true,
    transactionId: `txn-demo-${Date.now()}`,
    message: 'Deposit payment received.',
  };
};

/** Demo mode admin approval - returns fake success */
export const simulateAdminApproval = async () => {
  await simulateDelay(800);
  return {
    success: true,
    message: 'Booking approved by admin.',
  };
};

/** Demo mode notification */
export const simulateNotification = (type: 'client' | 'performer' | 'admin') => {
  const notifications = {
    client: 'Your booking has been confirmed. You will receive an email with details.',
    performer: 'New booking assigned to you. Check your dashboard for details.',
    admin: 'New booking request requires your review.',
  };
  return notifications[type];
};
