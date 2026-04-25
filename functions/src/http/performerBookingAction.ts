import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';

import { consumeActionToken, TokenError } from '../utils/createActionToken';

interface RateLimitState {
  count: number;
  windowStart: number;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateLimitMap = new Map<string, RateLimitState>();

function rateLimitOk(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

function htmlPage(title: string, body: string, statusEmoji: string): string {
  // Inline CSS, no scripts. Safe to render to a public visitor.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} • Flavor Entertainers</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #0a0a0a; color: #fafafa; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { max-width: 460px; width: 100%; background: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 32px; text-align: center; }
    h1 { font-size: 22px; margin: 8px 0 16px; }
    p { color: #d4d4d8; line-height: 1.5; }
    .badge { font-size: 48px; line-height: 1; }
    a { color: #fb923c; }
  </style>
</head>
<body>
  <main class="card">
    <div class="badge" aria-hidden="true">${statusEmoji}</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${body}</p>
    <p style="margin-top: 24px; font-size: 13px; color: #71717a;">You can close this window.</p>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * `GET /booking-action?token=…` — landing page hit by the performer when they
 * tap Accept or Decline in WhatsApp.
 *
 * The token is single-use, expires after 24 hours, and is consumed in a
 * Firestore transaction so two concurrent taps cannot both succeed.
 */
export const performerBookingAction = onRequest(
  {
    region: 'us-central1',
    cors: false,
    invoker: 'public',
  },
  async (req, res) => {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';

    if (!rateLimitOk(ip)) {
      res.status(429).type('html').send(htmlPage('Too many requests', 'Please wait a moment and try again.', '⏳'));
      return;
    }

    if (req.method !== 'GET') {
      res.status(405).type('html').send(htmlPage('Method not allowed', 'Open the link from your WhatsApp message.', '🚫'));
      return;
    }

    const token = (req.query.token || '').toString().trim();
    if (!token) {
      res.status(400).type('html').send(htmlPage('Missing token', 'The link is missing a token. Please tap the original message link.', '⚠️'));
      return;
    }

    try {
      const tokenData = await consumeActionToken(token);
      const db = getFirestore('default');
      const bookingRef = db.collection('bookings').doc(tokenData.booking_id);

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(bookingRef);
        if (!snap.exists) {
          throw new Error('booking_not_found');
        }
        const newStatus = tokenData.action === 'accept' ? 'performer_accepted' : 'performer_declined';
        tx.update(bookingRef, {
          status: newStatus,
          performer_action_at: admin.firestore.FieldValue.serverTimestamp(),
          performer_action_by: tokenData.performer_id,
        });
      });

      logger.info(`[performer-action] booking ${tokenData.booking_id} → ${tokenData.action} by ${tokenData.performer_id}`);

      if (tokenData.action === 'accept') {
        res
          .status(200)
          .type('html')
          .send(
            htmlPage(
              'Booking accepted',
              'Thanks — the admin team will confirm the booking before you attend. Please do not contact the client until confirmed.',
              '✅',
            ),
          );
      } else {
        res
          .status(200)
          .type('html')
          .send(
            htmlPage(
              'Booking declined',
              'Got it — the admin team has been notified and will reassign or cancel this booking.',
              '👋',
            ),
          );
      }
    } catch (error: any) {
      if (error instanceof TokenError) {
        const status = error.code === 'not_found' ? 404 : 410;
        res.status(status).type('html').send(htmlPage('Link unavailable', error.message, '⚠️'));
        return;
      }
      if (error?.message === 'booking_not_found') {
        res.status(404).type('html').send(htmlPage('Booking not found', 'This booking no longer exists.', '⚠️'));
        return;
      }
      logger.error('[performer-action] unexpected error', error);
      res.status(500).type('html').send(htmlPage('Something went wrong', 'Please try again or contact admin.', '⚠️'));
    }
  },
);
