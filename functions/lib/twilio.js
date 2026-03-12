"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyTwilioSignature = exports.sendSms = exports.sendWhatsApp = void 0;
const twilio_1 = require("twilio");
let _client = null;
function getClient() {
    if (!_client) {
        const accountSid = process.env.TWILIO_SID;
        const authToken = process.env.TWILIO_TOKEN;
        if (!accountSid || !authToken) {
            throw new Error('Twilio credentials not configured (TWILIO_SID, TWILIO_TOKEN)');
        }
        _client = new twilio_1.Twilio(accountSid, authToken);
    }
    return _client;
}
const sendWhatsApp = async (to, body) => {
    const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
    if (!whatsappFrom)
        throw new Error('TWILIO_WHATSAPP_FROM not configured');
    return getClient().messages.create({
        from: `whatsapp:${whatsappFrom}`,
        to: `whatsapp:${to}`,
        body
    });
};
exports.sendWhatsApp = sendWhatsApp;
const sendSms = async (to, body) => {
    const smsFrom = process.env.TWILIO_SMS_FROM;
    if (!smsFrom)
        throw new Error('TWILIO_SMS_FROM not configured');
    return getClient().messages.create({
        from: smsFrom,
        to,
        body
    });
};
exports.sendSms = sendSms;
const verifyTwilioSignature = (req) => {
    const authToken = process.env.TWILIO_TOKEN;
    if (!authToken) {
        console.error('TWILIO_TOKEN not configured — rejecting signature verification');
        return false;
    }
    const twilioSignature = req.headers['x-twilio-signature'];
    const url = `https://${req.get('host')}${req.originalUrl}`;
    const params = req.body;
    return (0, twilio_1.validateRequest)(authToken, twilioSignature, url, params);
};
exports.verifyTwilioSignature = verifyTwilioSignature;
//# sourceMappingURL=twilio.js.map