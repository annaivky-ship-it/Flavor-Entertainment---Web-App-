/**
 * Monoova webhook payload parser and signature verification.
 *
 * The exact Monoova payload shape is not known in advance.
 * This module centralizes field mapping so it can be adjusted easily.
 * Raw payload is always preserved for audit.
 */

import * as crypto from 'crypto';

// --- Payload field mapping (adjust these if Monoova changes their schema) ---

export interface ParsedMonoovaEvent {
  transactionId: string;
  bookingReference: string;
  amount: number;
  eventType: string;
  payerName: string | null;
  payerBSB: string | null;
  payerAccount: string | null;
  receivedAt: string | null;
}

/**
 * Extract relevant fields from a Monoova webhook payload.
 * Tries multiple known field paths to be resilient to schema changes.
 */
export function parseMonoovaPayload(payload: any): ParsedMonoovaEvent | null {
  if (!payload) return null;

  // Transaction ID: try common field names
  const transactionId =
    payload.TransactionId ??
    payload.transactionId ??
    payload.UniqueIdentifier ??
    payload.id ??
    null;

  if (!transactionId) return null;

  // Booking reference: typically in the description/reference field
  const rawReference =
    payload.Description ??
    payload.description ??
    payload.PaymentReference ??
    payload.paymentReference ??
    payload.Reference ??
    payload.reference ??
    '';

  // Extract FE-XXXXXX pattern from the reference string
  const refMatch = String(rawReference).match(/FE-[A-Z0-9]{6}/);
  const bookingReference = refMatch ? refMatch[0] : String(rawReference).trim();

  // Amount
  const amount = parseFloat(
    payload.Amount ?? payload.amount ?? payload.TotalAmount ?? payload.totalAmount ?? '0'
  );

  // Event type
  const eventType =
    payload.EventType ??
    payload.eventType ??
    payload.Status ??
    payload.status ??
    payload.Type ??
    'payment_received';

  // Payer info (optional, for admin visibility)
  const payerName =
    payload.PayerName ?? payload.payerName ?? payload.SourceAccountName ?? null;
  const payerBSB =
    payload.PayerBSB ?? payload.payerBSB ?? payload.SourceBSB ?? null;
  const payerAccount =
    payload.PayerAccount ?? payload.payerAccount ?? payload.SourceAccountNumber ?? null;

  const receivedAt =
    payload.DateTime ?? payload.dateTime ?? payload.CreatedDateTime ?? payload.Timestamp ?? null;

  return {
    transactionId: String(transactionId),
    bookingReference,
    amount: isNaN(amount) ? 0 : amount,
    eventType: String(eventType),
    payerName,
    payerBSB,
    payerAccount,
    receivedAt,
  };
}

/**
 * Verify Monoova webhook signature if a secret is configured.
 * Returns true if no secret is set (graceful degradation) or if signature is valid.
 */
export function verifyMonoovaSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string | undefined
): boolean {
  // If no secret configured, reject in production, warn in development
  if (!secret) {
    if (process.env.NODE_ENV === 'production' || process.env.FUNCTIONS_EMULATOR !== 'true') {
      console.error('MONOOVA_WEBHOOK_SECRET not configured — rejecting webhook in production');
      return false;
    }
    console.warn('MONOOVA_WEBHOOK_SECRET not configured — allowing in emulator only');
    return true;
  }

  if (!signatureHeader) {
    console.error('Missing webhook signature header');
    return false;
  }

  // HMAC-SHA256 signature verification (common pattern for webhook providers)
  const computed = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(signatureHeader, 'hex')
    );
  } catch {
    // If the signature is a different format, try base64
    try {
      const computedB64 = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('base64');
      return crypto.timingSafeEqual(
        Buffer.from(computedB64),
        Buffer.from(signatureHeader)
      );
    } catch {
      return false;
    }
  }
}
