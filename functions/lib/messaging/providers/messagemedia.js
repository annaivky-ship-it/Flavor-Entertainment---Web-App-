"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessageMediaSms = sendMessageMediaSms;
const crypto = __importStar(require("crypto"));
async function sendMessageMediaSms(to, body, config) {
    const apiKey = config.messagemedia_api_key || process.env.MESSAGEMEDIA_API_KEY;
    const apiSecret = config.messagemedia_api_secret || process.env.MESSAGEMEDIA_API_SECRET;
    if (!apiKey || !apiSecret)
        throw new Error('MessageMedia credentials missing');
    const url = 'https://messages-api.messagemedia.com/v1/messages';
    const payload = JSON.stringify({
        messages: [
            {
                content: body,
                destination_number: to,
                format: "SMS"
            }
        ]
    });
    const now = new Date().toUTCString();
    const signatureString = `Date: ${now}\nPOST /v1/messages HTTP/1.1`;
    const hmac = crypto.createHmac('sha1', apiSecret).update(signatureString).digest('base64');
    const authHeader = `hmac username="${apiKey}", algorithm="hmac-sha1", headers="Date request-line", signature="${hmac}"`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Date': now,
            'Authorization': authHeader
        },
        body: payload
    });
    if (!response.ok) {
        throw new Error(`MessageMedia API error: ${response.statusText}`);
    }
    const data = await response.json();
    return { providerMessageId: data.messages[0].message_id };
}
//# sourceMappingURL=messagemedia.js.map