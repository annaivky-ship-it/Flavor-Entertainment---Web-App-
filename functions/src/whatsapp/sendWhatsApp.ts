import { Twilio } from 'twilio';
import { defineSecret } from 'firebase-functions/params';
import { formatAustralianMobile, toWhatsAppAddress } from '../utils/phone';

export const TWILIO_ACCOUNT_SID = defineSecret('TWILIO_ACCOUNT_SID');
export const TWILIO_AUTH_TOKEN = defineSecret('TWILIO_AUTH_TOKEN');
export const TWILIO_WHATSAPP_FROM = defineSecret('TWILIO_WHATSAPP_FROM');

export interface WhatsAppResult {
  success: boolean;
  providerMessageId: string | null;
  errorMessage: string | null;
  attempts: number;
  mock: boolean;
}

export interface SendWhatsAppOptions {
  to: string;
  body: string;
  /** Number of total attempts including the first try. Defaults to 2. */
  maxAttempts?: number;
}

const DEFAULT_MAX_ATTEMPTS = 2;
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
 * Send a single WhatsApp message via Twilio with bounded retries.
 *
 * In emulator mode (`FUNCTIONS_EMULATOR=true`) the payload is logged and a
 * fake `mock_…` provider id is returned, so local tests never bill Twilio.
 */
export async function sendWhatsApp(opts: SendWhatsAppOptions): Promise<WhatsAppResult> {
  const e164 = formatAustralianMobile(opts.to);
  const maxAttempts = Math.max(1, opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);

  if (isEmulator()) {
    console.log('[mock-whatsapp] →', e164, '\n', opts.body);
    return {
      success: true,
      providerMessageId: `mock_wa_${Date.now()}`,
      errorMessage: null,
      attempts: 1,
      mock: true,
    };
  }

  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;
  const client = buildClient();
  if (!client || !fromNumber) {
    const message = 'Twilio WhatsApp not configured (missing secrets).';
    console.error(`[whatsapp] ${message}`);
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
        from: toWhatsAppAddress(fromNumber.replace(/^whatsapp:/, '')),
        to: toWhatsAppAddress(e164),
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
      console.error(`[whatsapp] attempt ${attempt}/${maxAttempts} to ${e164} failed:`, lastError);
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
