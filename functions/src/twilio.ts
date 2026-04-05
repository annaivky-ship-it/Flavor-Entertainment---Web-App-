
let _client: any = null;

const getClient = () => {
  if (!_client) {
    const { Twilio } = require('twilio');
    _client = new Twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
  }
  return _client;
};

export const sendWhatsApp = async (to: string, body: string) => {
  return getClient().messages.create({
    from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
    to: `whatsapp:${to}`,
    body
  });
};

export const sendSms = async (to: string, body: string) => {
  return getClient().messages.create({
    from: process.env.TWILIO_SMS_FROM,
    to,
    body
  });
};

export const verifyTwilioSignature = (req: any) => {
  const { validateRequest } = require('twilio');
  const twilioSignature = req.headers['x-twilio-signature'];
  const url = `https://${req.get('host')}${req.originalUrl}`;
  const params = req.body;
  return validateRequest(process.env.TWILIO_TOKEN!, twilioSignature, url, params);
};
