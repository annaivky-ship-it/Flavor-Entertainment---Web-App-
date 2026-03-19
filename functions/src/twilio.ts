
import { Twilio, validateRequest } from 'twilio';

// Unified Twilio credentials — uses TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN (primary)
// with fallback to legacy TWILIO_SID/TWILIO_TOKEN for backward compatibility
let _client: Twilio | null = null;

function maskPhone(phone: string): string {
  return phone.replace(/\d(?=\d{4})/g, '*');
}

function getClient(): Twilio {
  if (!_client) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_TOKEN;
    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN or TWILIO_SID/TWILIO_TOKEN)');
    }
    _client = new Twilio(accountSid, authToken);
  }
  return _client;
}

function getAuthToken(): string | undefined {
  return process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_TOKEN;
}

export const sendWhatsApp = async (to: string, body: string) => {
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
  if (!whatsappFrom) throw new Error('TWILIO_WHATSAPP_FROM not configured');
  console.log('[SMS] Sending WhatsApp to:', maskPhone(to));
  const message = await getClient().messages.create({
    from: `whatsapp:${whatsappFrom}`,
    to: `whatsapp:${to}`,
    body
  });
  console.log('[SMS] Success: SID', message.sid);
  return message;
};

export const sendSms = async (to: string, body: string) => {
  const smsFrom = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_SMS_FROM;
  if (!smsFrom) throw new Error('TWILIO_FROM_NUMBER/TWILIO_SMS_FROM not configured');
  console.log('[SMS] Sending to:', maskPhone(to));
  const message = await getClient().messages.create({
    from: smsFrom,
    to,
    body
  });
  console.log('[SMS] Success: SID', message.sid);
  return message;
};

export const verifyTwilioSignature = (req: { headers: Record<string, string>; get: (name: string) => string; originalUrl: string; body: Record<string, string> }) => {
  const authToken = getAuthToken();
  if (!authToken) {
    console.error('TWILIO_AUTH_TOKEN not configured — rejecting signature verification');
    return false;
  }
  const twilioSignature = req.headers['x-twilio-signature'];
  const url = `https://${req.get('host')}${req.originalUrl}`;
  const params = req.body;
  return validateRequest(authToken, twilioSignature, url, params);
};
