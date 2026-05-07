/**
 * Twilio integration for the verification system.
 *
 * Provides:
 *   - sendTwilioSms: send a single SMS
 *   - fetchCarrierType: line_type_intelligence lookup (helps spot VoIP numbers)
 *
 * Secrets are declared via defineSecret so they can be attached to callables
 * via the `secrets: [...]` option. Set them with:
 *   firebase functions:secrets:set TWILIO_ACCOUNT_SID
 *   firebase functions:secrets:set TWILIO_AUTH_TOKEN
 *   firebase functions:secrets:set TWILIO_PHONE_NUMBER
 */

import { defineSecret } from 'firebase-functions/params';

export const TWILIO_ACCOUNT_SID = defineSecret('TWILIO_ACCOUNT_SID');
export const TWILIO_AUTH_TOKEN = defineSecret('TWILIO_AUTH_TOKEN');
export const TWILIO_PHONE_NUMBER = defineSecret('TWILIO_PHONE_NUMBER');

export const TWILIO_SECRETS = [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER];

function getClient(): any {
  // Lazy require so functions that don't need Twilio don't pay the import cost.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const twilio = require('twilio');
  return twilio(TWILIO_ACCOUNT_SID.value(), TWILIO_AUTH_TOKEN.value());
}

export async function sendTwilioSms(to: string, body: string): Promise<void> {
  if (process.env.FUNCTIONS_EMULATOR === 'true' && !TWILIO_ACCOUNT_SID.value()) {
    console.log(`[twilio:emulator] SMS to ${to}: ${body}`);
    return;
  }
  const client = getClient();
  await client.messages.create({
    to,
    from: TWILIO_PHONE_NUMBER.value(),
    body,
  });
}

/**
 * Returns the carrier line type ("mobile" | "voip" | "landline" | "unknown").
 * Used as a soft risk signal — VoIP numbers are more often disposable.
 */
export async function fetchCarrierType(phoneE164: string): Promise<string> {
  if (process.env.FUNCTIONS_EMULATOR === 'true' && !TWILIO_ACCOUNT_SID.value()) {
    return 'mobile';
  }
  try {
    const client = getClient();
    const lookup = await client.lookups.v2.phoneNumbers(phoneE164).fetch({
      fields: 'line_type_intelligence',
    });
    return lookup.lineTypeIntelligence?.type ?? 'unknown';
  } catch (err) {
    console.warn('Twilio carrier lookup failed:', (err as Error).message);
    return 'unknown';
  }
}
