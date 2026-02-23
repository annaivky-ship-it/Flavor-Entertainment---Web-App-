
import * as functions from 'firebase-functions';
import { Twilio, validateRequest } from 'twilio';

// Use any cast to satisfy the compiler in environments where v2 types make config() look uncallable.
const config = (functions as any).config();
const accountSid = config.twilio?.sid;
const authToken = config.twilio?.token;
const whatsappFrom = config.twilio?.whatsapp_from;
const smsFrom = config.twilio?.sms_from;

const client = new Twilio(accountSid, authToken);

export const sendWhatsApp = async (to: string, body: string) => {
  return client.messages.create({
    from: `whatsapp:${whatsappFrom}`,
    to: `whatsapp:${to}`,
    body
  });
};

export const sendSms = async (to: string, body: string) => {
  return client.messages.create({
    from: smsFrom,
    to,
    body
  });
};

export const verifyTwilioSignature = (req: any) => {
  const twilioSignature = req.headers['x-twilio-signature'];
  const url = `https://${req.get('host')}${req.originalUrl}`;
  const params = req.body;
  return validateRequest(authToken, twilioSignature, url, params);
};
