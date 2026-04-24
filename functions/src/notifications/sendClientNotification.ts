import { sendWhatsApp } from '../whatsapp/sendWhatsApp';
import { renderClientWhatsApp, BookingTemplateData } from '../whatsapp/templates';
import { sendSms } from '../sms/sendSms';
import { renderClientBackupSms } from '../sms/templates';
import { logNotification } from './logNotification';
import { tryFormatAustralianMobile } from '../utils/phone';

export interface SendClientNotificationResult {
  whatsappSucceeded: boolean;
  smsFallbackUsed: boolean;
  smsSucceeded: boolean | null;
}

/**
 * Client notification flow:
 *   1. Try WhatsApp once.
 *   2. If WhatsApp fails, retry WhatsApp once more.
 *   3. If WhatsApp still fails, send SMS backup.
 *   4. Never send SMS when WhatsApp succeeded.
 *   5. Every attempt is logged to `notification_logs`.
 */
export async function sendClientNotification(opts: {
  bookingId: string;
  data: BookingTemplateData;
}): Promise<SendClientNotificationResult> {
  const { bookingId, data } = opts;
  const phone = tryFormatAustralianMobile(data.client_phone);

  if (!phone) {
    console.error(`[client-notify] booking ${bookingId} has invalid client phone: ${data.client_phone}`);
    await logNotification({
      bookingId,
      recipientType: 'client',
      recipientPhone: String(data.client_phone || ''),
      provider: 'twilio_whatsapp',
      messageType: 'BOOKING_RECEIVED_CLIENT',
      status: 'failed',
      providerMessageId: null,
      errorMessage: 'Invalid Australian mobile number',
      fallbackUsed: false,
    });
    return { whatsappSucceeded: false, smsFallbackUsed: false, smsSucceeded: null };
  }

  const whatsappBody = renderClientWhatsApp(data);
  // sendWhatsApp itself retries once internally; that satisfies "try then retry".
  const whatsappResult = await sendWhatsApp({ to: phone, body: whatsappBody, maxAttempts: 2 });

  await logNotification({
    bookingId,
    recipientType: 'client',
    recipientPhone: phone,
    provider: 'twilio_whatsapp',
    messageType: 'BOOKING_RECEIVED_CLIENT',
    status: whatsappResult.success ? 'success' : 'failed',
    providerMessageId: whatsappResult.providerMessageId,
    errorMessage: whatsappResult.errorMessage,
    fallbackUsed: false,
    attempts: whatsappResult.attempts,
    mock: whatsappResult.mock,
  });

  if (whatsappResult.success) {
    return { whatsappSucceeded: true, smsFallbackUsed: false, smsSucceeded: null };
  }

  console.warn(`[client-notify] WhatsApp failed for booking ${bookingId}; falling back to SMS.`);
  const smsBody = renderClientBackupSms(data);
  const smsResult = await sendSms({ to: phone, body: smsBody, maxAttempts: 1 });

  await logNotification({
    bookingId,
    recipientType: 'client',
    recipientPhone: phone,
    provider: 'twilio_sms',
    messageType: 'BOOKING_RECEIVED_CLIENT_SMS_BACKUP',
    status: smsResult.success ? 'success' : 'failed',
    providerMessageId: smsResult.providerMessageId,
    errorMessage: smsResult.errorMessage,
    fallbackUsed: true,
    attempts: smsResult.attempts,
    mock: smsResult.mock,
  });

  return {
    whatsappSucceeded: false,
    smsFallbackUsed: true,
    smsSucceeded: smsResult.success,
  };
}
