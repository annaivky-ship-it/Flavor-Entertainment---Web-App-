import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import {
  sendWhatsApp,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_FROM,
} from '../whatsapp/sendWhatsApp';
import {
  renderAdminWhatsApp,
  renderPerformerWhatsApp,
  BookingTemplateData,
} from '../whatsapp/templates';
import { TWILIO_SMS_FROM } from '../sms/sendSms';
import { sendClientNotification } from '../notifications/sendClientNotification';
import { logNotification } from '../notifications/logNotification';
import { createActionToken } from '../utils/createActionToken';
import { tryFormatAustralianMobile } from '../utils/phone';

export const ADMIN_WHATSAPP_NUMBER = defineSecret('ADMIN_WHATSAPP_NUMBER');
export const APP_BASE_URL = defineSecret('APP_BASE_URL');

const SECRETS = [
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_FROM,
  TWILIO_SMS_FROM,
  ADMIN_WHATSAPP_NUMBER,
  APP_BASE_URL,
];

interface BookingDoc {
  performer_id?: string;
  performer_name?: string;
  client_name?: string;
  client_phone?: string;
  client_email?: string;
  event_date?: string;
  event_time?: string;
  duration?: string;
  service?: string;
  location?: string;
  total_price?: number;
  deposit_amount?: number;
  status?: string;
  payment_status?: string;
}

function buildTemplateData(bookingId: string, booking: BookingDoc): BookingTemplateData {
  return {
    booking_id: bookingId,
    performer_name: booking.performer_name || '',
    client_name: booking.client_name || '',
    client_phone: booking.client_phone || '',
    client_email: booking.client_email || '',
    event_date: booking.event_date || '',
    event_time: booking.event_time || '',
    duration: booking.duration || '',
    service: booking.service || '',
    location: booking.location || '',
    total_price: booking.total_price ?? 0,
    deposit_amount: booking.deposit_amount ?? 0,
    payment_status: booking.payment_status || 'unpaid',
  };
}

async function notifyAdmin(bookingId: string, data: BookingTemplateData): Promise<void> {
  const adminNumber = process.env.ADMIN_WHATSAPP_NUMBER;
  const phone = tryFormatAustralianMobile(adminNumber);
  if (!phone) {
    logger.error(`[notify] admin WhatsApp number missing or invalid: ${adminNumber}`);
    return;
  }

  const result = await sendWhatsApp({
    to: phone,
    body: renderAdminWhatsApp(data),
    maxAttempts: 2,
  });

  await logNotification({
    bookingId,
    recipientType: 'admin',
    recipientPhone: phone,
    provider: 'twilio_whatsapp',
    messageType: 'BOOKING_RECEIVED_ADMIN',
    status: result.success ? 'success' : 'failed',
    providerMessageId: result.providerMessageId,
    errorMessage: result.errorMessage,
    fallbackUsed: false,
    attempts: result.attempts,
    mock: result.mock,
  });
}

async function notifyPerformer(
  bookingId: string,
  performerId: string,
  data: BookingTemplateData,
): Promise<void> {
  const db = getFirestore('default');
  const performerSnap = await db.collection('performers').doc(performerId).get();

  if (!performerSnap.exists) {
    logger.error(`[notify] performer ${performerId} not found for booking ${bookingId}`);
    return;
  }

  const performer = performerSnap.data() as {
    whatsapp_number?: string;
    active?: boolean;
    availability_status?: string;
    name?: string;
  };

  if (performer.active === false) {
    logger.warn(`[notify] performer ${performerId} is inactive; skipping WhatsApp.`);
    return;
  }

  const phone = tryFormatAustralianMobile(performer.whatsapp_number);
  if (!phone) {
    logger.error(`[notify] performer ${performerId} has invalid whatsapp_number: ${performer.whatsapp_number}`);
    return;
  }

  const appBaseUrl = process.env.APP_BASE_URL || 'https://flavorentertainers.com';
  const [acceptLink, declineLink] = await Promise.all([
    createActionToken({ bookingId, performerId, action: 'accept', appBaseUrl }),
    createActionToken({ bookingId, performerId, action: 'decline', appBaseUrl }),
  ]);

  const body = renderPerformerWhatsApp({
    ...data,
    accept_url: acceptLink.url,
    decline_url: declineLink.url,
  });

  const result = await sendWhatsApp({ to: phone, body, maxAttempts: 2 });

  await logNotification({
    bookingId,
    recipientType: 'performer',
    recipientPhone: phone,
    provider: 'twilio_whatsapp',
    messageType: 'BOOKING_RECEIVED_PERFORMER',
    status: result.success ? 'success' : 'failed',
    providerMessageId: result.providerMessageId,
    errorMessage: result.errorMessage,
    fallbackUsed: false,
    attempts: result.attempts,
    mock: result.mock,
  });
}

/**
 * v2 Firestore trigger: fan out admin / performer / client notifications when
 * a booking document is created. The trigger never throws — partial failures
 * are logged but do not block booking creation.
 */
export const onBookingCreatedV2 = onDocumentCreated(
  {
    document: 'bookings/{bookingId}',
    region: 'us-central1',
    secrets: SECRETS,
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.warn('[onBookingCreated] missing snapshot data');
      return;
    }
    const bookingId = event.params.bookingId;
    const booking = snapshot.data() as BookingDoc;

    logger.info(`[onBookingCreated] booking ${bookingId} created — fanning out notifications.`);

    const data = buildTemplateData(bookingId, booking);

    const tasks: Promise<unknown>[] = [
      notifyAdmin(bookingId, data).catch((err) => {
        logger.error(`[notify-admin] booking ${bookingId} failed`, err);
      }),
      sendClientNotification({ bookingId, data }).catch((err) => {
        logger.error(`[notify-client] booking ${bookingId} failed`, err);
      }),
    ];

    if (booking.performer_id) {
      tasks.push(
        notifyPerformer(bookingId, booking.performer_id, data).catch((err) => {
          logger.error(`[notify-performer] booking ${bookingId} failed`, err);
        }),
      );
    } else {
      logger.warn(`[onBookingCreated] booking ${bookingId} has no performer_id`);
    }

    await Promise.allSettled(tasks);
    logger.info(`[onBookingCreated] booking ${bookingId} fan-out complete.`);
  },
);
