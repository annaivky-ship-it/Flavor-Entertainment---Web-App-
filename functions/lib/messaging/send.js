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
exports.sendMessage = sendMessage;
const admin = __importStar(require("firebase-admin"));
const clicksend_1 = require("./providers/clicksend");
const twilio_1 = require("./providers/twilio");
const messagemedia_1 = require("./providers/messagemedia");
const phone_1 = require("../utils/phone");
async function sendMessage(params) {
    const db = admin.firestore();
    const normalizedTo = (0, phone_1.normalizePhone)(params.to);
    if (!normalizedTo) {
        console.error(`Invalid phone number: ${params.to}`);
        return;
    }
    const settingsDoc = await db.collection('settings').doc('messaging').get();
    const settings = settingsDoc.data() || {};
    const primary = settings.providerPrimary || 'clicksend';
    const fallback = settings.providerFallback || 'twilio';
    const dryRun = process.env.MESSAGING_DRY_RUN === 'true';
    const channel = params.channel || 'sms';
    const logRef = db.collection('message_logs').doc();
    const logData = {
        bookingId: params.bookingId,
        to: normalizedTo,
        templateKey: params.templateKey,
        bodyPreview: params.body.substring(0, 120),
        channel,
        status: 'QUEUED',
        attempt: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await logRef.set(logData);
    if (dryRun) {
        await logRef.update({ status: 'SENT', provider: 'dry_run', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        return;
    }
    let attempt = 0;
    let success = false;
    let currentProvider = primary;
    while (attempt < 4 && !success) {
        attempt++;
        try {
            let result;
            if (currentProvider === 'clicksend') {
                result = await (0, clicksend_1.sendClickSendSms)(normalizedTo, params.body, settings);
            }
            else if (currentProvider === 'twilio') {
                result = await (0, twilio_1.sendTwilioMessage)(normalizedTo, params.body, channel, settings);
            }
            else if (currentProvider === 'messagemedia') {
                result = await (0, messagemedia_1.sendMessageMediaSms)(normalizedTo, params.body, settings);
            }
            else {
                throw new Error(`Unknown provider: ${currentProvider}`);
            }
            success = true;
            await logRef.update({
                status: 'SENT',
                provider: currentProvider,
                providerMessageId: result.providerMessageId,
                attempt,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        catch (error) {
            console.error(`Attempt ${attempt} failed with ${currentProvider}:`, error);
            if (attempt === 3 && fallback && fallback !== primary) {
                currentProvider = fallback; // Switch to fallback for final attempt
            }
            else if (attempt === 4) {
                await logRef.update({
                    status: 'FAILED',
                    errorCode: error.code || 'UNKNOWN',
                    errorMessage: error.message,
                    attempt,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
            else {
                // Exponential backoff (simplified)
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
            }
        }
    }
}
//# sourceMappingURL=send.js.map