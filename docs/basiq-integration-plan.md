# Basiq integration plan (replace manual PayID confirmation later)

The platform currently runs **without an automated payment provider**. Admins manually
confirm each PayID deposit in the admin dashboard (`PayIdConfirmQueue`). This works
but doesn't scale beyond ~10–20 bookings/day. When that becomes painful, swap in
**Basiq** (Australian Open Banking provider) to automate the inbound-PayID side.

## Why Basiq, not Monoova?

| | Monoova | Basiq |
|---|---|---|
| Real-time inbound PayID notifications | ✅ Native | ✅ ~minutes-latency via webhooks |
| Bank-supplied payer name (PayID match signal) | ✅ | ✅ |
| Account tokenisation / penny drop | ✅ | ❌ (read-only data) |
| Pricing | Per-transaction + monthly minimums | Pay-per-use, no minimums |
| AFSL / regulated | Payments licence | Accredited CDR Data Recipient |
| Onboarding effort | Heavier (KYC, contract) | Lighter (sandbox in hours) |
| Lock-in | Higher | Lower |

We don't need penny drop / tokenisation any more (performer banking is now
self-attested), so Basiq covers everything we need from a PSP and is easier to
swap out later.

## What changes when Basiq goes in

The unified `payIdWebhook` is already structured to accept any provider's POST as
long as the payload can be normalised by `parseMonoovaPayload`. To switch to Basiq:

1. **Set Basiq secrets** alongside (not instead of) Monoova:
   ```bash
   firebase functions:secrets:set BASIQ_API_KEY
   firebase functions:secrets:set BASIQ_WEBHOOK_SECRET
   ```
2. **Add a Basiq client module** at `functions/src/integrations/basiq.ts` exposing
   `verifyBasiqSignature(rawBody, signatureHeader, secret)`.
3. **Add a `parseBasiqPayload` function** in `functions/src/payments/basiq.ts` that
   maps Basiq's transaction-event shape to the same `ParsedMonoovaEvent` interface
   already used by `payIdWebhook`. Basiq's `transactions/{id}/notifications` event
   includes `description`, `amount`, `account.name` (the payer-side account name
   when available), and a unique transaction id — direct field-for-field mapping.
4. **Register a connection to your business bank account** in the Basiq dashboard:
   - Connect via the Basiq Connect UI flow
   - Subscribe the connection to `transaction.created` events for the business account
   - Point the webhook URL at `payIdWebhook` (same URL as before — no code change there)
5. **Add a provider-detection step** at the top of `payIdWebhook`: read a header
   like `x-payment-provider: basiq` and dispatch to the right parser/verifier.
   Pseudo:
   ```ts
   const provider = req.headers['x-payment-provider'] || 'monoova';
   const verifier = provider === 'basiq' ? verifyBasiqSignature : verifyMonoovaSignature;
   const parser   = provider === 'basiq' ? parseBasiqPayload    : parseMonoovaPayload;
   ```
6. **Decommission `adminConfirmPayIdDeposit`'s primacy** — it stays in the codebase
   as a manual fallback for bank holidays and webhook outages, but it's no longer the
   default. Update `docs/verification-architecture.md` to reflect this.

## What stays the same

Once the parser maps Basiq fields into `ParsedMonoovaEvent`:

- The whole pipeline in `payIdWebhook` (idempotency, amount validation, name match,
  manual-review fallback, audit log, notification outbox) works unchanged.
- The frontend admin UIs (`ReviewQueue`, `PayIdConfirmQueue`) keep working — the
  webhook just starts taking the load off `PayIdConfirmQueue` automatically.
- Trust tier auto-promotion via `triggers/verification.ts:onBookingCompleted` is
  agnostic to who confirmed the payment.

## Effort estimate

- Basiq sandbox + first connection: ~half a day
- `integrations/basiq.ts` + `payments/basiq.ts` + provider dispatch: ~1 day
- Integration testing through the emulator + against Basiq sandbox: ~half a day
- Production rollout (real bank connection, webhook registration, monitor for a week
  alongside manual mode as fallback): ~1 week wall-clock

## What Basiq will not do

These remain manual / handled elsewhere:

- **Performer payouts**: Basiq is read-only. Pay performers from your bank app or via
  Wise/Airwallex/etc. Out of scope for this integration.
- **Penny-drop / "performer-owns-this-account" proof**: Basiq doesn't originate funds.
  If you ever want this back (e.g. legal/compliance pressure), you'd need a real PSP
  (Monoova, Stripe Issuing, NAB Connect) only for that step.
- **Refunds**: Basiq can't initiate them. Issue refunds from your bank app.

## Decision point: when to switch

Switch when:

- Manual confirmation takes more than ~30 minutes/day total, OR
- You miss a confirmation window and a customer's booking expires due to admin lag, OR
- Volume is consistently >20 bookings/day for a week

Until then, the manual flow is fine and gives you human eyes on every payment — which
is actually a stronger fraud-prevention posture than auto-confirmation.
