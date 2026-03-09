"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyTwilioSignature = exports.sendSms = exports.sendWhatsApp = void 0;
const twilio_1 = require("twilio");
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_TOKEN;
const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
const smsFrom = process.env.TWILIO_SMS_FROM;
const client = new twilio_1.Twilio(accountSid, authToken);
const sendWhatsApp = async (to, body) => {
    return client.messages.create({
        from: `whatsapp:${whatsappFrom}`,
        to: `whatsapp:${to}`,
        body
    });
};
exports.sendWhatsApp = sendWhatsApp;
const sendSms = async (to, body) => {
    return client.messages.create({
        from: smsFrom,
        to,
        body
    });
};
exports.sendSms = sendSms;
const verifyTwilioSignature = (req) => {
    const twilioSignature = req.headers['x-twilio-signature'];
    const url = `https://${req.get('host')}${req.originalUrl}`;
    const params = req.body;
    return (0, twilio_1.validateRequest)(authToken, twilioSignature, url, params);
};
exports.verifyTwilioSignature = verifyTwilioSignature;
//# sourceMappingURL=twilio.js.map