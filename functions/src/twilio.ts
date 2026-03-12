
import { Twilio, validateRequest } from 'twilio';

let _client: Twilio | null = null;

function getClient(): Twilio {
  if (!_client) {
    const accountSid = process.env.TWILIO_SID;
    const authToken = process.env.TWILIO_TOKEN;
    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured (TWILIO_SID, TWILIO_TOKEN)');
    }
    _client = new Twilio(accountSid, authToken);
  }
  return _client;
}

export const sendWhatsApp = async (to: string, body: string) => {
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
  if (!whatsappFrom) throw new Error('TWILIO_WHATSAPP_FROM not configured');
  return getClient().messages.create({
    from: `whatsapp:${whatsappFrom}`,
    to: `whatsapp:${to}`,
    body
  });
};

export const sendSms = async (to: string, body: string) => {
  const smsFrom = process.env.TWILIO_SMS_FROM;
  if (!smsFrom) throw new Error('TWILIO_SMS_FROM not configured');
  return getClient().messages.create({
    from: smsFrom,
    to,
    body
  });
};

export const verifyTwilioSignature = (req: any) => {
  const authToken = process.env.TWILIO_TOKEN;
  if (!authToken) {
    console.error('TWILIO_TOKEN not configured — rejecting signature verification');
    return false;
  }
  const twilioSignature = req.headers['x-twilio-signature'];
  const url = `https://${req.get('host')}${req.originalUrl}`;
  const params = req.body;
  return validateRequest(authToken, twilioSignature, url, params);
};
