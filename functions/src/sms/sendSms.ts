import { Twilio } from 'twilio';
import { defineSecret } from 'firebase-functions/params';
import { formatAustralianMobile } from '../utils/phone';

export const TWILIO_SMS_FROM = defineSecret('TWILIO_SMS_FROM');

export interface SmsResult {
  success: boolean;
  providerMessageId: string | null;
  errorMessage: string | null;
  attempts: number;
  mock: boolean;
}

export interface SendSmsOptions {
  to: string;
  body: string;
  /** Total attempts including the first try. Defaults to 1 (no retry). */
  maxAttempts?: number;
}

const DEFAULT_MAX_ATTEMPTS = 1;
const RETRY_BACKOFF_MS = 1000;

function isEmulator(): boolean {
  return process.env.FUNCTIONS_EMULATOR === 'true';
}

function buildClient(): Twilio | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return new Twilio(sid, token);
}

/**
 * Send a single SMS via Twilio. Used only as the client-side WhatsApp
 * fallback — admin and performer never receive SMS from this module.
 */
export async function sendSms(opts: SendSmsOptions): Promise<SmsResult> {
  const e164 = formatAustralianMobile(opts.to);
  const maxAttempts = Math.max(1, opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);

  if (isEmulator()) {
    console.log('[mock-sms] →', e164, '\n', opts.body);
    return {
      success: true,
      providerMessageId: `mock_sms_${Date.now()}`,
      errorMessage: null,
      attempts: 1,
      mock: true,
    };
  }

  const fromNumber = process.env.TWILIO_SMS_FROM;
  const client = buildClient();
  if (!client || !fromNumber) {
    const message = 'Twilio SMS not configured (missing secrets).';
    console.error(`[sms] ${message}`);
    return {
      success: false,
      providerMessageId: null,
      errorMessage: message,
      attempts: 0,
      mock: false,
    };
  }

  let lastError: string | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await client.messages.create({
        from: fromNumber,
        to: e164,
        body: opts.body,
      });
      return {
        success: true,
        providerMessageId: result.sid,
        errorMessage: null,
        attempts: attempt,
        mock: false,
      };
    } catch (error: any) {
      lastError = error?.message || String(error);
      console.error(`[sms] attempt ${attempt}/${maxAttempts} to ${e164} failed:`, lastError);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS * attempt));
      }
    }
  }

  return {
    success: false,
    providerMessageId: null,
    errorMessage: lastError,
    attempts: maxAttempts,
    mock: false,
  };
}
