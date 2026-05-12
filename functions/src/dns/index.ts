import * as functions from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import * as crypto from 'crypto';

const getDb = () => getFirestore('default');
// Kept so existing callers that reference `functions` continue to compile.
void functions;

// Pepper resolved at first call (not module load) so a missing secret raises
// a clear runtime error visible in Functions logs rather than a known-bad
// fallback hash. Emulator/test runs use a deterministic dev value.
function getPepper(): string {
  const fromEnv = process.env.DNS_HASH_PEPPER;
  if (fromEnv) return fromEnv;
  if (process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV === 'test') {
    return 'emulator-only-dns-pepper-do-not-use-in-prod';
  }
  throw new Error('DNS_HASH_PEPPER is not configured. Refusing to compute DNS hashes with a known fallback.');
}

// --- Helpers (consumed by createBookingRequest in functions/src/index.ts) ---

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function normalizePhoneToE164(phone: string, defaultCountryCode: string = '+61'): string {
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = defaultCountryCode + cleaned.substring(1);
  } else if (!cleaned.startsWith('+')) {
    cleaned = defaultCountryCode + cleaned;
  }
  return cleaned;
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value + getPepper()).digest('hex');
}

export async function dnsLookup(emailHash: string, phoneHash: string): Promise<boolean> {
  const dnsQuery = await getDb().collection('dns_entries')
    .where('status', '==', 'ACTIVE')
    .where('match_keys', 'array-contains-any', [emailHash, phoneHash])
    .limit(1)
    .get();

  return !dnsQuery.empty;
}

// Legacy callables removed in the production-readiness pass:
//   - createBookingAndScreenDns: superseded by createBookingRequest in
//     functions/src/index.ts (strict validation + server-resolved trust
//     tier + /bookingPII forward-write).
//   - confirmPayidPayment: superseded by the Monoova webhook handler
//     (payments/webhookHandler.ts) which marks bookings paid in response
//     to bank events rather than admin click-to-confirm.
//   - runDnsMigration: one-shot migration that backfilled match_keys +
//     hashes on /dns_entries. Already run in production.
//   - hasPreviousSuccessfulBooking + writeAuditLog: helpers only those
//     callables used.
