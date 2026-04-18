# Developer Handoff: Flavor Entertainers — PayID / Monoova Integration

**Date:** April 2026
**Branch:** `claude/payid-monoova-integration-lgzsE`
**Status:** Core implementation complete — needs final configuration, testing, and deployment

---

## 1. What Has Been Built

A complete PayID deposit payment flow using Monoova webhooks, integrated into the existing Flavor Entertainers booking app.

### Completed Features

| Feature | Status | Files |
|---------|--------|-------|
| Booking reference generation (FE-XXXXXX) | Done | `functions/src/payments/bookingReference.ts` |
| Monoova webhook endpoint | Done | `functions/src/payments/webhookHandler.ts` |
| Monoova payload parser (field mapping) | Done | `functions/src/payments/monoova.ts` |
| Webhook signature verification | Done | `functions/src/payments/monoova.ts` |
| Idempotent payment processing | Done | `functions/src/payments/webhookHandler.ts` |
| Payment event audit trail (`payment_events` collection) | Done | `functions/src/payments/webhookHandler.ts` |
| Booking expiry scheduler (5-min interval) | Done | `functions/src/payments/expiryScheduler.ts` |
| Notification outbox (async SMS/WhatsApp) | Done | `functions/src/index.ts` (notificationOutboxWorker) |
| PayID payment UI with copy buttons + countdown | Done | `components/PayIDSimulationModal.tsx` |
| Real-time payment status via Firestore listener | Done | `components/BookingProcess.tsx` |
| Admin Reconciliation tab | Done | `components/PaymentReconciliation.tsx` |
| Firestore security rules for new collections | Done | `firestore.rules` |
| New booking statuses (`expired`, `payment_review`) | Done | `types.ts` + all dashboard components |
| Sanitized booking creation (allowlisted fields) | Done | `functions/src/index.ts` (createBookingRequest) |

### Payment Flow (End to End)

```
Client fills booking form
    |
    v
createBookingRequest (Cloud Function)
    - generates FE-XXXXXX reference
    - sets status=pending_performer_acceptance, payment_status=unpaid
    - sets expiresAt (30 min from now)
    |
    v
Admin moves booking to deposit_pending
    |
    v
Client sees PayID modal
    - PayID email + name (from env vars)
    - Exact deposit amount
    - Booking reference (FE-XXXXXX) with copy button
    - Countdown timer for hold expiry
    - Real-time status listener
    |
    v
Client pays via their bank app (PayID transfer)
    - includes FE-XXXXXX as reference
    |
    v
Monoova receives payment, sends webhook POST to:
    /monoovaWebhook
    |
    v
Webhook handler:
    1. Verifies signature (HMAC-SHA256 if secret configured)
    2. Parses payload (centralized field mapping)
    3. Stores raw event in payment_events (idempotent by transactionId)
    4. Matches booking by FE-XXXXXX reference
    5. Verifies amount matches depositAmount (1 cent tolerance)
    6. Updates booking: status=confirmed, payment_status=paid
    7. Creates notification_outbox job
    |
    v
notificationOutboxWorker (Firestore trigger)
    - Sends SMS/WhatsApp to client, performer, admin
    |
    v
Client sees real-time "Payment Confirmed!" in the modal
```

### Error Handling

| Scenario | Result |
|----------|--------|
| No booking reference found | Event stored as `unmatched` |
| Booking reference doesn't match any booking | Event stored as `unmatched` |
| Amount doesn't match deposit | Booking set to `payment_review`, event stored as `amount_mismatch` |
| Booking already paid | Event stored as `already_paid`, no duplicate processing |
| Booking not in `deposit_pending` state | Event stored as `booking_not_pending` |
| Same webhook received twice | Idempotent — second call returns `already_processed` |
| Unparseable payload | Event stored as `UNPARSEABLE` with full raw payload |

---

## 2. What Still Needs to Be Done

### CRITICAL (Must do before go-live)

#### 2.1 Monoova Account Setup & Payload Mapping
- [ ] **Sign up for Monoova** and get a PayID-enabled account
- [ ] **Get the exact webhook payload schema** from Monoova's API docs
- [ ] **Update field mapping** in `functions/src/payments/monoova.ts` — the current parser tries common field names but the exact Monoova field names need to be confirmed:
  ```typescript
  // In parseMonoovaPayload() — verify these match Monoova's actual fields:
  transactionId:  payload.TransactionId ?? payload.UniqueIdentifier ?? ...
  amount:         payload.Amount ?? payload.TotalAmount ?? ...
  description:    payload.Description ?? payload.PaymentReference ?? ...
  ```
- [ ] **Register the webhook URL** with Monoova:
  ```
  https://us-central1-studio-4495412314-3b1ce.cloudfunctions.net/monoovaWebhook
  ```

#### 2.2 Set Firebase Functions Secrets
```bash
firebase functions:secrets:set MONOOVA_WEBHOOK_SECRET
# Enter the webhook signing secret from your Monoova dashboard

# Optional — defaults to 30 if not set:
firebase functions:config:set app.booking_payment_hold_minutes=30
```

#### 2.3 Set Frontend Environment Variables
In `.env.production`, ensure these are set to the real PayID details:
```
VITE_PAY_ID_NAME=<Your PayID recipient business name>
VITE_PAY_ID_EMAIL=<Your PayID email, e.g. payments@flavorentertainers.com.au>
```

#### 2.4 Create Firestore Indexes
These composite indexes are needed for the new queries:

```
# For webhook payment matching
Collection: bookings
  Field: bookingReference (Ascending)
  → Single-field index (auto-created, but verify)

# For expiry scheduler
Collection: bookings
  Fields: status (Ascending), expiresAt (Ascending)
  → Composite index required

# For admin reconciliation view
Collection: payment_events
  Field: createdAt (Descending)
  → Single-field index (auto-created, but verify)
```

Create via Firebase Console or add to `firestore.indexes.json`:
```json
{
  "indexes": [
    {
      "collectionGroup": "bookings",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "expiresAt", "order": "ASCENDING" }
      ]
    }
  ]
}
```

#### 2.5 Server-Side Deposit Calculation
Currently `depositAmount` and `totalAmount` are computed client-side and trusted on the backend. For production safety:
- [ ] Replicate `calculateBookingCost()` logic server-side in `createBookingRequest`
- [ ] Store computed `totalAmount` and `depositAmount` on the booking document
- [ ] The webhook handler already reads `booking.depositAmount` for amount matching — just needs the field populated server-side

#### 2.6 Deploy Cloud Functions
```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

#### 2.7 Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

### HIGH PRIORITY (Should do before go-live)

#### 2.8 Test the Full Flow End-to-End
1. Create a booking in the app
2. Advance it to `deposit_pending`
3. Simulate a Monoova webhook using curl:
   ```bash
   curl -X POST \
     https://us-central1-studio-4495412314-3b1ce.cloudfunctions.net/monoovaWebhook \
     -H "Content-Type: application/json" \
     -d '{
       "TransactionId": "TEST-001",
       "Amount": 100.00,
       "Description": "FE-ABC123",
       "EventType": "payment_received",
       "PayerName": "Test Customer"
     }'
   ```
4. Verify the booking auto-confirms in the UI
5. Verify `payment_events` document was created
6. Verify `notification_outbox` document was created

#### 2.9 Expiry Handling in the UI
- [ ] When a booking expires, the client currently sees the generic "rejected" screen. Consider adding a dedicated "Booking Expired" screen in `BookingProcess.tsx` with a "Rebook" button
- [ ] The `ClientDashboard.tsx` already shows expired status correctly

#### 2.10 Admin Manual Resolution for Mismatched Payments
- [ ] Add an admin action button on `payment_review` bookings to manually confirm or reject
- [ ] Currently admins can see the mismatch in the Reconciliation tab but need to update status manually via the Management tab

### MEDIUM PRIORITY (Nice to have)

#### 2.11 Email Notifications
- [ ] The notification outbox stores `clientEmail` but only sends SMS/WhatsApp currently
- [ ] Add email sending (via SendGrid, SES, or Firebase Extensions) in the `notificationOutboxWorker`

#### 2.12 Refund Handling
- [ ] No automated refund flow exists yet
- [ ] Add a Cloud Function to handle refund webhooks from Monoova
- [ ] Update `payment_status` to `refunded` and `status` to `cancelled`

#### 2.13 Payment Receipt/Confirmation Email
- [ ] Send a payment confirmation email with booking details after successful payment

#### 2.14 Retry Logic for Failed Notifications
- [ ] The notification outbox worker currently marks failures but doesn't retry
- [ ] Add a scheduled function to retry failed outbox jobs

#### 2.15 Rate Limiting on Webhook Endpoint
- [ ] Consider adding rate limiting or IP allowlisting for the Monoova webhook endpoint

---

## 3. Project Structure (Key Files)

```
├── types.ts                              # All TypeScript interfaces (Booking, PaymentEvent, etc.)
├── constants.ts                          # PayID config, deposit %, hold time
├── firestore.rules                       # Security rules (payment_events + notification_outbox added)
│
├── components/
│   ├── PayIDSimulationModal.tsx           # PayID payment instructions UI (rebuilt)
│   ├── PaymentReconciliation.tsx          # Admin reconciliation dashboard (new)
│   ├── BookingProcess.tsx                 # Booking wizard (updated with payment state)
│   ├── AdminDashboard.tsx                 # Admin dashboard (Reconciliation tab added)
│   ├── ClientDashboard.tsx               # Client dashboard (expired + review states)
│   └── PerformerDashboard.tsx            # Performer dashboard (expired + review states)
│
├── functions/src/
│   ├── index.ts                          # Cloud Functions exports (monoovaWebhook, scheduledBookingExpiry, notificationOutboxWorker added)
│   ├── payments/
│   │   ├── index.ts                      # Module exports
│   │   ├── bookingReference.ts           # FE-XXXXXX generator
│   │   ├── monoova.ts                    # Payload parser + signature verification
│   │   ├── webhookHandler.ts             # Webhook processing with Firestore transaction
│   │   └── expiryScheduler.ts            # Scheduled job for expiring unpaid bookings
│   ├── messaging/
│   │   ├── templates.ts                  # SMS/WhatsApp templates
│   │   └── send.ts                       # Multi-provider dispatcher
│   └── utils/
│       └── idempotency.ts                # Idempotency key management
│
├── services/
│   ├── api.ts                            # Frontend API layer
│   └── firebaseClient.ts                 # Firebase client init
│
└── .env.production                       # Frontend env vars (VITE_PAY_ID_NAME, VITE_PAY_ID_EMAIL)
```

## 4. Firestore Collections (New / Modified)

### `bookings` (modified — new fields)
| Field | Type | Description |
|-------|------|-------------|
| `bookingReference` | string | `FE-XXXXXX` unique reference for PayID |
| `totalAmount` | number | Total booking cost (needs server-side calc) |
| `depositAmount` | number | 25% deposit due (needs server-side calc) |
| `currency` | string | Always `AUD` |
| `paymentMethod` | string | Always `PAYID` |
| `payment_status` | string | `unpaid`, `paid`, `review`, `refunded` |
| `monoovaTransactionId` | string | Set by webhook on successful match |
| `paymentReceivedAt` | timestamp | Set by webhook on successful match |
| `expiresAt` | timestamp | Payment hold expiry (30 min default) |
| `updatedAt` | timestamp | Last modification time |

### `payment_events` (new)
| Field | Type | Description |
|-------|------|-------------|
| `transactionId` | string | Monoova transaction ID (document ID) |
| `bookingReference` | string | Extracted FE-XXXXXX reference |
| `amount` | number | Payment amount received |
| `status` | string | `matched`, `unmatched`, `amount_mismatch`, `already_paid`, `error` |
| `rawPayload` | map | Full Monoova webhook payload (for audit) |
| `processingResult` | string | Human-readable result description |
| `bookingId` | string | Matched booking document ID |
| `createdAt` | timestamp | When the event was received |

### `notification_outbox` (new)
| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `payment_confirmed`, `booking_expired`, `payment_review` |
| `bookingId` | string | Related booking ID |
| `bookingReference` | string | FE-XXXXXX reference |
| `clientName` | string | Client name |
| `clientPhone` | string | Client phone for SMS |
| `clientEmail` | string | Client email |
| `sent` | boolean | Whether notification was dispatched |

## 5. Cloud Functions (New)

| Function | Type | Trigger |
|----------|------|---------|
| `monoovaWebhook` | HTTP | POST from Monoova |
| `scheduledBookingExpiry` | Scheduled | Every 5 minutes |
| `notificationOutboxWorker` | Firestore | onCreate on `notification_outbox/{id}` |

## 6. Environment Variables Summary

### Frontend (.env.production)
```
VITE_PAY_ID_NAME=<PayID business name shown to client>
VITE_PAY_ID_EMAIL=<PayID email shown to client>
VITE_PAYMENT_MODE=manual   # 'manual' | 'monoova' — see Payment Mode section below
```

### Payment Mode Toggle

The app supports two payment flows via the `VITE_PAYMENT_MODE` env var:

| Mode | Behavior | When to use |
|------|----------|-------------|
| `manual` | Client sees "I've Sent Payment" button → admin manually confirms in dashboard | **Default.** Use while waiting for Monoova account activation |
| `monoova` | Monoova webhook auto-confirms booking when payment arrives | Use after Monoova account is active + `MONOOVA_WEBHOOK_SECRET` is set |

**Switch from manual → monoova:**
1. Set up Monoova account (5-10 business days)
2. Configure `MONOOVA_WEBHOOK_SECRET` in Firebase Functions
3. Register webhook URL with Monoova
4. Test end-to-end with a real payment
5. Update `.env.production`: `VITE_PAYMENT_MODE=monoova`
6. Redeploy frontend: `npm run deploy:production`

No code changes needed to switch modes — all Monoova code remains in place and inactive until toggled on.

### Backend (Firebase Functions secrets/config)
```
MONOOVA_WEBHOOK_SECRET=<webhook signing secret from Monoova>
BOOKING_PAYMENT_HOLD_MINUTES=30  (optional, defaults to 30)
```

### Existing (already configured)
```
TWILIO_SID / TWILIO_AUTH_TOKEN / TWILIO_SMS_FROM / TWILIO_WHATSAPP_FROM
DIDIT_API_KEY / DIDIT_WORKFLOW_ID / DIDIT_WEBHOOK_SECRET
```

## 7. Build & Deploy Commands

```bash
# Frontend
npm install
npm run build                    # TypeScript check + Vite build

# Cloud Functions
cd functions
npm install
npm run build                    # Compile TypeScript to lib/
firebase deploy --only functions # Deploy to Firebase

# Rules + Indexes
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes

# Full production deploy
npm run deploy:production        # Frontend to Firebase Hosting
```

## 8. Testing Checklist

- [ ] Create a new booking — verify `bookingReference` appears (FE-XXXXXX)
- [ ] Advance to `deposit_pending` — verify PayID modal shows reference, amount, PayID, countdown
- [ ] Click copy buttons — verify clipboard content is correct
- [ ] Simulate successful Monoova webhook — verify booking auto-confirms
- [ ] Simulate amount mismatch webhook — verify `payment_review` status
- [ ] Simulate duplicate webhook (same transactionId) — verify no double-processing
- [ ] Simulate unmatched reference webhook — verify event stored as `unmatched`
- [ ] Wait for hold expiry (set to 1 min for testing) — verify booking expires
- [ ] Check admin Reconciliation tab — verify summary cards, event table, filters
- [ ] Check notification_outbox — verify jobs created after webhook processing
- [ ] Check all dashboards show `expired` and `payment_review` statuses correctly
- [ ] Verify Firestore rules — client cannot write to `payment_events` or `notification_outbox`

---

## 9. Key Technical Decisions

1. **Monoova payload mapping is centralized** in `functions/src/payments/monoova.ts` — when you get the real schema, update `parseMonoovaPayload()` only
2. **Raw webhook payloads are always saved** in `payment_events.rawPayload` for audit/debugging
3. **Webhook processing uses Firestore transactions** to prevent race conditions between payment matching and booking updates
4. **The old "Confirm Payment Sent" button is removed** — payments are now confirmed automatically via webhook, not manually by the client
5. **Booking creation now allowlists form fields** instead of spreading arbitrary client data to Firestore
6. **Signature verification gracefully degrades** — if `MONOOVA_WEBHOOK_SECRET` is not set, webhooks are accepted with a console warning (so you can test before having the secret)
