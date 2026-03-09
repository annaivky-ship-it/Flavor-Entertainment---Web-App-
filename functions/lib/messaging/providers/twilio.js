"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTwilioMessage = sendTwilioMessage;
const twilio_1 = require("twilio");
async function sendTwilioMessage(to, body, channel, config) {
    const accountSid = config.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID;
    const authToken = config.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN;
    const fromSms = config.twilio_from_number || process.env.TWILIO_FROM_NUMBER;
    const fromWa = config.twilio_whatsapp_from || process.env.TWILIO_WHATSAPP_FROM;
    if (!accountSid || !authToken)
        throw new Error('Twilio credentials missing');
    const client = new twilio_1.Twilio(accountSid, authToken);
    const from = channel === 'whatsapp' ? `whatsapp:${fromWa}` : fromSms;
    const toFormatted = channel === 'whatsapp' ? `whatsapp:${to}` : to;
    const message = await client.messages.create({
        body,
        from,
        to: toFormatted
    });
    return { providerMessageId: message.sid };
}
//# sourceMappingURL=twilio.js.map