# Self-hosted verification — architecture

## Why we built this

The platform handles non-contact entertainment bookings (lingerie/topless waitressing, strip shows). Under WA law these fall under liquor licensing rules, **not** the Prostitution Act 2000 — which means we don't need government-ID KYC for legal compliance. The actual requirement is age verification (18+).

Holding government IDs creates unnecessary breach risk and legal liability. We've replaced the (never-launched) Didit integration with a system that satisfies the real requirements without storing government IDs at rest.

## Three customer verification signals

| Signal | Provider | Cost | Purpose |
|---|---|---|---|
| SMS OTP | Twilio | ~AUD $0.05 / SMS | Confirms the phone number reaches the booker |
| On-device liveness (premium tier only) | face-api.js (browser) | $0 | Confirms a real human, age estimate ≥ 18 |
| PayID name match | Monoova | $0 (already collecting deposit) | Confirms the bank account holder name matches the booking name — bank-of-Australia has done their own KYC for us |

Combining all three gives us reasonable assurance against the dominant attack vector (drunk-by-throwaway-number bookings) without ever holding a government ID.

## Trust tiers

A customer's tier determines which signals are required:

- **Unverified** (new customer, 0 successful bookings): SMS OTP + (premium only) liveness + PayID match
- **Verified** (≥1 successful booking, no flags): SMS OTP + PayID match
- **Trusted** (≥5 successful bookings within 12 months, no flags): PayID match only

"Premium tier" = booking total ≥ AUD $500 (configurable as `PREMIUM_TIER_TOTAL_CENTS` in `functions/src/verification/customer.ts`).

Promotion happens automatically in `triggers/verification.ts:onBookingCompleted` when a booking transitions to `completed` or `confirmed`. Demotion happens when a performer flags the customer (`performerFlagCustomer` resets `trustTier` to `unverified` and increments `flagCount`). Trust tier is gated on `flagCount === 0`.

## Verification orchestration

```
Client books → createBookingAndScreenDns (existing)
            → DNS hash check (silent fail if matched)
            → Booking created with verification_status='pending'

Wizard's verification step → getCustomerVerificationStatus
            → resolves trust tier and required signals
            → Trusted: skip directly to "awaiting payment"
            → Standard/premium: SMS OTP step
            → Premium: liveness step

OTP send  → sendSmsOtp → DNS check → rate limit (3/15min) → Twilio SMS
                                  → otpAttempts doc with codeHash
OTP verify → verifySmsOtp → rate limit (5/15min) → match codeHash
                          → verificationRecord{signal:'sms_otp', result:'pass'}
                          → booking.smsOtpVerified = true

Liveness  → submitLivenessCheck → threshold 0.6 + age >= 18
                                → DNS face-hash check
                                → verificationRecord{signal:'liveness'}
                                → booking.livenessVerified = true
                                → faceEmbeddings/{customerId} (embedding only)

PayID     → Monoova webhook → namesLooselyMatch
                            → verificationRecord{signal:'payid_match'}
                            → booking.payIdMatched = true
                            → if mismatch: manualReviewQueue entry

Each verificationRecord triggers onVerificationRecordCreated, which checks
whether all required signals have cleared. If yes, booking auto-promotes
to verification_status='cleared' + status='CONFIRMED'.
```

## Performer onboarding

Performer state machine in `performers/{uid}.status`:

```
[applied] → awaiting_id → awaiting_id_review → awaiting_liveness →
awaiting_banking → awaiting_penny_drop → awaiting_portfolio →
awaiting_safety → awaiting_contract → awaiting_activation → active
```

Each step has a callable in `verification/performer.ts`. Admins act in the ID review queue and final activation step.

ID images are uniquely sensitive. Handling:

1. Performer requests a 15-minute signed PUT URL (`performerRequestIdUploadUrl`). Bucket: `studio-4495412314-3b1ce-id-uploads`, path: `pending-review/{uid}/{filename}`.
2. Performer uploads directly to GCS — never through our function.
3. `performerNotifyIdUploaded` enqueues an `idReviewQueue` entry.
4. Admin opens the entry → `adminGetIdImageReviewUrl` issues a **5-minute** signed READ URL.
5. Admin submits decision via `adminReviewId` (approve/reject + checklist).
6. `triggers/verification.ts:onIdReviewDecision` **force-deletes the GCS object** within seconds of the decision.
7. Belt-and-braces: bucket lifecycle rule deletes any `pending-review/*` object older than 1 day; `forceDeleteStaleIdUploads` runs every 5 minutes to sweep abandoned entries.

Result: at no point is a government ID retained beyond the review window (typically minutes).

## Data model

| Collection | Sensitivity | Read | Write |
|---|---|---|---|
| `customers/{customerId}` | Personal | self or admin | server-only |
| `performers/{performerId}` | Mixed (some public) | public for `status==active`; full for self/admin | server-only |
| `verificationRecords/{recordId}` | High (audit) | admin | server-only |
| `faceEmbeddings/{subjectId}` | High (biometric) | nobody | server-only |
| `doNotServeList/{entryId}` | High (privacy) | admin | server-only |
| `manualReviewQueue/{bookingId}` | Mixed | admin | server-only |
| `idReviewQueue/{queueId}` | High (until decision) | admin | server-only |
| `pennyDrops/{dropId}` | Sensitive | nobody | server-only |
| `riskSignals/{signalId}` | Mixed | admin | server-only |
| `otpAttempts/{otpId}` | High (codes) | nobody | server-only |
| `rateLimits/{bucketKey}` | Internal | nobody | server-only |
| `auditLog/{eventId}` | Compliance | admin (read-only) | server append-only |
| `bookings/{bookingId}` | Mixed | self / performer / admin | restricted |

All hashing uses HMAC-SHA256 with `HASH_SECRET` (see `docs/secrets-rotation.md`).

## DNS register matching

A DNS entry is a `{ matchType, value, severity, active, expiresAt }` document. Match types:

- `phone_hash` — HMAC of E.164 phone
- `email_hash` — HMAC of normalised email
- `face_hash` — quantised hash of the 128-dim face embedding (see `hashFaceEmbedding`)

Severity:

- `silent` (default): customer sees a generic "we can't proceed with this booking". Performer + admin are notified. The customer cannot tell they are flagged.
- `explicit`: customer sees a clear "this account has been declined". Use rarely — only for legal-liability cases (e.g. court orders).

A DNS hit short-circuits multiple paths:

- `createBookingAndScreenDns` (legacy, pre-OTP): silently writes a `DENIED` booking and returns success=false with a generic message
- `sendSmsOtp`: returns success without sending an SMS, audit logs `CUSTOMER_DENIED`
- `submitLivenessCheck`: face-hash match → result=fail → throws

## Audit log

Every privacy-sensitive action writes a row to `auditLog`:

```
{
  actorUid, actorRole: 'system' | 'admin' | 'customer' | 'performer',
  action: AuditAction,
  subjectType, subjectId,
  bookingId,
  meta: {...},
  createdAt: ServerTimestamp,
}
```

Append-only — no client can edit or delete. Admins read it. Indexed by `action+createdAt` and `subjectId+createdAt`.

## App Check

All callables enforce App Check in production via `requireAppCheck()`. Toggle off only in staging by setting the function-level env var `APP_CHECK_REQUIRED=false` (see deployment checklist). Never disable in production.

## Region

Everything runs in `australia-southeast1`. Anna must enable App Check in the Firebase console for that region (manual step in deployment checklist).

## Cost rough estimate

- Twilio SMS (AU): ~AUD$0.05 per OTP. 1000 customers/month × 1.2 OTPs/customer ≈ AUD $60/mo
- Twilio carrier lookup: ~AUD$0.01 per lookup, optional, async-fired
- Monoova: depends on contract; PayID receive is typically free, penny-drop is a few cents
- Firebase Functions: invocation costs negligible at <100k/month
- GCS egress: ID review images cap at ~5MB × few-per-day, so cents/month
- face-api.js model weights: ~6MB one-time download per unique browser, served from your CDN/hosting

Expect <AUD $100/mo at moderate volume. Major cost driver is Twilio.
