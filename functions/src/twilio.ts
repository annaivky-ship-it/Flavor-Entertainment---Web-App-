
import { Twilio, validateRequest } from 'twilio';

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_TOKEN;
const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
const smsFrom = process.env.TWILIO_SMS_FROM;

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
  return validateRequest(authToken!, twilioSignature, url, params);
};
