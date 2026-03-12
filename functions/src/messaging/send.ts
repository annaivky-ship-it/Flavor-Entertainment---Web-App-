import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { sendClickSendSms } from './providers/clicksend';
import { sendTwilioMessage } from './providers/twilio';
import { sendMessageMediaSms } from './providers/messagemedia';
import { normalizePhone } from '../utils/phone';

export interface SendMessageParams {
  bookingId: string;
  templateKey: string;
  to: string;
  body: string;
  channel?: 'sms' | 'whatsapp';
}

export async function sendMessage(params: SendMessageParams): Promise<void> {
  const db = getFirestore('default');
  const normalizedTo = normalizePhone(params.to);
  
  if (!normalizedTo) {
    console.error(`Invalid phone number: ${params.to}`);
    return;
  }

  const settingsDoc = await db.collection('settings').doc('messaging').get();
  const settings = settingsDoc.data() || {};
  
  const primary = settings.providerPrimary || 'clicksend';
  const fallback = settings.providerFallback || 'twilio';
  const dryRun = process.env.MESSAGING_DRY_RUN === 'true';
  const channel = params.channel || 'sms';

  const logRef = db.collection('message_logs').doc();
  const logData: Record<string, unknown> = {
    bookingId: params.bookingId,
    to: normalizedTo,
    templateKey: params.templateKey,
    bodyPreview: params.body.substring(0, 120),
    channel,
    status: 'QUEUED',
    attempt: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await logRef.set(logData);

  if (dryRun) {
    await logRef.update({ status: 'SENT', provider: 'dry_run', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return;
  }

  let attempt = 0;
  let success = false;
  let currentProvider = primary;

  while (attempt < 4 && !success) {
    attempt++;
    try {
      let result;
      if (currentProvider === 'clicksend') {
        result = await sendClickSendSms(normalizedTo, params.body, settings);
      } else if (currentProvider === 'twilio') {
        result = await sendTwilioMessage(normalizedTo, params.body, channel, settings);
      } else if (currentProvider === 'messagemedia') {
        result = await sendMessageMediaSms(normalizedTo, params.body, settings);
      } else {
        throw new Error(`Unknown provider: ${currentProvider}`);
      }

      success = true;
      await logRef.update({
        status: 'SENT',
        provider: currentProvider,
        providerMessageId: result.providerMessageId,
        attempt,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error: any) {
      console.error(`Attempt ${attempt} failed with ${currentProvider}:`, error);
      
      if (attempt === 3 && fallback && fallback !== primary) {
        currentProvider = fallback; // Switch to fallback for final attempt
      } else if (attempt === 4) {
        await logRef.update({
          status: 'FAILED',
          errorCode: error.code || 'UNKNOWN',
          errorMessage: error.message,
          attempt,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        // Exponential backoff (simplified)
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
  }
}
