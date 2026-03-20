/* eslint-disable no-console */
import { Twilio } from 'twilio';

// TODO: Ensure these environment variables are set in Firebase:
//   TWILIO_ACCOUNT_SID — Twilio Account SID (starts with AC...)
//   TWILIO_AUTH_TOKEN  — Twilio Auth Token
//   TWILIO_FROM_NUMBER — Twilio phone number for SMS (E.164 format, e.g. +61...)
//   TWILIO_WHATSAPP_FROM — Twilio WhatsApp sender number

function maskPhone(phone: string): string {
  return phone.replace(/\d(?=\d{4})/g, '*');
}

export async function sendTwilioMessage(to: string, body: string, channel: 'sms' | 'whatsapp', config: Record<string, string | undefined>): Promise<{ providerMessageId: string }> {
  const accountSid = config.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID;
  const authToken = config.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN;
  const fromSms = config.twilio_from_number || process.env.TWILIO_FROM_NUMBER;
  const fromWa = config.twilio_whatsapp_from || process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken) throw new Error('Twilio credentials missing');

  const client = new Twilio(accountSid, authToken);
  const from = channel === 'whatsapp' ? `whatsapp:${fromWa}` : fromSms;
  const toFormatted = channel === 'whatsapp' ? `whatsapp:${to}` : to;

  console.log('[SMS] Sending to:', maskPhone(to), '| channel:', channel, '| from:', from ? maskPhone(from) : 'NOT SET');

  const message = await client.messages.create({
    body,
    from,
    to: toFormatted
  });

  console.log('[SMS] Success: SID', message.sid);
  return { providerMessageId: message.sid };
}
