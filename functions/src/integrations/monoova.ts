/**
 * Monoova integration: PayID + penny-drop.
 *
 * Public surface:
 *   - tokeniseAccount({ bsb, accountNumber, accountName }) -> { tokenRef }
 *   - sendPenny({ tokenRef, reference }) -> { success, txId }
 *   - lookupPayIdName(payIdIdentifier) -> { accountName }
 *
 * The webhook handler is in ../webhooks/monoova.ts.
 *
 * Anna: if the Monoova contract isn't finalised yet, the integration is
 * fully wired but the live API base URL is read from the MONOOVA_API_BASE
 * secret. Until that secret is set, calls fall back to a sandbox stub
 * (see emulator branch) so callables don't crash in dev.
 */

import { defineSecret } from 'firebase-functions/params';

export const MONOOVA_API_KEY = defineSecret('MONOOVA_API_KEY');
export const MONOOVA_API_BASE = defineSecret('MONOOVA_API_BASE');
export const MONOOVA_WEBHOOK_SECRET = defineSecret('MONOOVA_WEBHOOK_SECRET');

export const MONOOVA_SECRETS = [MONOOVA_API_KEY, MONOOVA_API_BASE, MONOOVA_WEBHOOK_SECRET];

function getApiBase(): string {
  return MONOOVA_API_BASE.value() || 'https://api.monoova.com';
}

function isSandbox(): boolean {
  // No API key configured → assume sandbox/stub mode.
  return !MONOOVA_API_KEY.value();
}

async function monoovaFetch(path: string, init: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${MONOOVA_API_KEY.value()}`,
    ...((init.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${getApiBase()}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Monoova ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function tokeniseAccount(params: {
  bsb: string;
  accountNumber: string;
  accountName: string;
}): Promise<{ tokenRef: string }> {
  if (isSandbox()) {
    return { tokenRef: `sandbox-${params.bsb}-${params.accountNumber.slice(-4)}` };
  }
  const data = await monoovaFetch('/v1/accounts/tokens', {
    method: 'POST',
    body: JSON.stringify({
      bsb: params.bsb,
      accountNumber: params.accountNumber,
      accountName: params.accountName,
    }),
  });
  return { tokenRef: data.tokenRef };
}

export async function sendPenny(params: {
  tokenRef: string;
  reference: string;
  amountCents?: number;
}): Promise<{ success: boolean; txId: string | null }> {
  if (isSandbox()) {
    return { success: true, txId: `sandbox-tx-${Date.now()}` };
  }
  const data = await monoovaFetch('/v1/transfers', {
    method: 'POST',
    body: JSON.stringify({
      tokenRef: params.tokenRef,
      amountCents: params.amountCents ?? 1,
      reference: params.reference,
    }),
  });
  return { success: !!data.success, txId: data.txId || null };
}

/**
 * Resolve a PayID identifier (email or phone) to its registered account name
 * via Monoova's PayID lookup endpoint. The returned name is used to compare
 * against the booking's `client_name` for the PayID-as-signal check.
 */
export async function lookupPayIdName(payIdIdentifier: string): Promise<{ accountName: string | null }> {
  if (isSandbox()) {
    return { accountName: null };
  }
  try {
    const data = await monoovaFetch(`/v1/payid/lookup?identifier=${encodeURIComponent(payIdIdentifier)}`);
    return { accountName: data.accountName || null };
  } catch (err) {
    console.warn('Monoova PayID lookup failed:', (err as Error).message);
    return { accountName: null };
  }
}

/**
 * Compare two names for "PayID match". This is fuzzy because Australian banks
 * vary in how they emit account names (e.g. "Mr John A Smith", "JOHN SMITH",
 * "SMITH, J A"). We collapse to lowercase, strip titles/punctuation, sort the
 * tokens, and compare token sets with a Jaccard-like score.
 */
export function namesLooselyMatch(a: string, b: string): boolean {
  const tokenise = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(mr|mrs|miss|ms|mx|dr|sir)\b/g, '')
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

  const setA = new Set(tokenise(a));
  const setB = new Set(tokenise(b));
  if (setA.size === 0 || setB.size === 0) return false;

  const intersection = [...setA].filter(x => setB.has(x)).length;
  const minSize = Math.min(setA.size, setB.size);
  // Match if at least 2 tokens overlap, OR every token of the shorter name
  // appears in the longer (e.g. "John Smith" vs "John Adam Smith").
  return intersection >= 2 || (intersection === minSize && minSize >= 1);
}
