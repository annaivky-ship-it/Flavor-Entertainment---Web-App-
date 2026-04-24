import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

export type RecipientType = 'admin' | 'performer' | 'client';
export type NotificationProvider = 'twilio_whatsapp' | 'twilio_sms';
export type NotificationStatus = 'success' | 'failed';

export interface NotificationLogEntry {
  bookingId: string;
  recipientType: RecipientType;
  recipientPhone: string;
  provider: NotificationProvider;
  messageType: string;
  status: NotificationStatus;
  providerMessageId: string | null;
  errorMessage: string | null;
  fallbackUsed: boolean;
  attempts?: number;
  mock?: boolean;
}

const COLLECTION = 'notification_logs';

/**
 * Append a single delivery attempt to the immutable notification log.
 * Failures here are swallowed — the booking flow must never break because
 * Firestore logging hiccupped.
 */
export async function logNotification(entry: NotificationLogEntry): Promise<void> {
  try {
    const db = getFirestore('default');
    await db.collection(COLLECTION).add({
      booking_id: entry.bookingId,
      recipient_type: entry.recipientType,
      recipient_phone: entry.recipientPhone,
      provider: entry.provider,
      message_type: entry.messageType,
      status: entry.status,
      provider_message_id: entry.providerMessageId,
      error_message: entry.errorMessage,
      fallback_used: entry.fallbackUsed,
      attempts: entry.attempts ?? null,
      mock: entry.mock ?? false,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('[notification-log] failed to write log entry', error);
  }
}

export const NOTIFICATION_LOGS_COLLECTION = COLLECTION;
