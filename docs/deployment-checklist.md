# Deployment checklist — self-hosted verification

This is a manual checklist Anna needs to run through before this branch is safe to merge to `master-update` and deploy to production. Each item is **manual**: I (Claude) wrote the code, but you need credentials and console access for these steps.

> ⚠️ **Do not deploy this to production until every box is ticked and staging passes the verification checklist at the bottom.**

---

## 1. Firebase project setup

### 1.1 Region check
- [ ] All new functions deploy to `australia-southeast1`. Existing v1 functions (legacy index.ts callables) remain in `us-central1` — that's fine for now. The new system is region-isolated.
- [ ] Firestore is already in `australia-southeast1` ✓ (per `firebase.json`)

### 1.2 Enable App Check
At the Firebase project level, enable App Check for the web app:

- [ ] Open Firebase Console → App Check → Apps → register the web app
- [ ] Choose **reCAPTCHA Enterprise** as the provider (recommended for production)
- [ ] In the Cloud Console, enable reCAPTCHA Enterprise API for the project
- [ ] Create a reCAPTCHA Enterprise key for `flavorentertainers.com` and the staging domain
- [ ] Add to GitHub repo secrets and Vercel env: `VITE_RECAPTCHA_SITE_KEY`
- [ ] In `src/firebase.ts` (or `services/firebaseClient.ts`), wire it up:

```typescript
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

if (typeof window !== 'undefined' && import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}
```

(I left this commented out / not added because the App Check provider initialization belongs in your `firebaseClient.ts` and I didn't want to ship a half-wired config. Add it after you have a reCAPTCHA key.)

- [ ] In **staging only**, register a debug token and set the SDK debug flag:
```javascript
// Browser console, staging only
self.FIREBASE_APPCHECK_DEBUG_TOKEN = '<your-debug-token>';
```
- [ ] Until App Check is fully enrolled, deploy with `APP_CHECK_REQUIRED=false` (env var on functions). Set it to `true` (or remove) before production.

### 1.3 Storage bucket
- [ ] Create the dedicated ID upload bucket:
```bash
gsutil mb -l australia-southeast1 gs://studio-4495412314-3b1ce-id-uploads
```
- [ ] Apply the lifecycle rule (file is committed at repo root):
```bash
gsutil lifecycle set storage-lifecycle-id-uploads.json gs://studio-4495412314-3b1ce-id-uploads
```
- [ ] Verify with: `gsutil lifecycle get gs://studio-4495412314-3b1ce-id-uploads`

### 1.4 Storage rules deploy
- [ ] `firebase deploy --only storage`

---

## 2. Secrets

All secrets are declared via `defineSecret()` in `functions/src/`. Set them with `firebase functions:secrets:set <NAME>`.

### 2.1 Required for verification system

```bash
# HMAC pepper for phone/email/face hashing in the DNS register.
# Generate: openssl rand -hex 32
firebase functions:secrets:set HASH_SECRET

# Twilio (SMS OTP + carrier lookup). Get these from console.twilio.com.
firebase functions:secrets:set TWILIO_ACCOUNT_SID
firebase functions:secrets:set TWILIO_AUTH_TOKEN
firebase functions:secrets:set TWILIO_PHONE_NUMBER

# Monoova / PayID PSP — NO LONGER REQUIRED.
#
# The platform runs in manual-mode by default: admins confirm each PayID deposit
# in the admin dashboard. If you wire in a PSP later (Basiq recommended — see
# docs/basiq-integration-plan.md), set its secrets here. The webhook path in
# functions/src/webhooks/payid.ts already handles HMAC-verified inbound events
# from any provider that maps to ParsedMonoovaEvent.
#
# Optional, only if you wire in a PSP:
# firebase functions:secrets:set MONOOVA_WEBHOOK_SECRET   # or BASIQ_WEBHOOK_SECRET
```

### 2.2 Existing secrets (keep)

```bash
DNS_HASH_PEPPER       # legacy, still read by functions/src/dns/index.ts
GEMINI_API_KEY        # used by analyzeVettingRisk callable
```

### 2.3 Decommissioned secrets (delete)

```bash
firebase functions:secrets:destroy DIDIT_API_KEY
firebase functions:secrets:destroy DIDIT_WORKFLOW_ID
firebase functions:secrets:destroy DIDIT_WEBHOOK_SECRET
firebase functions:secrets:destroy DIDIT_API_BASE
firebase functions:secrets:destroy DIDIT_APP_URL
```

Also remove from Vercel env (`vercel env rm`) and any GitHub Actions repo secrets (`gh secret delete`) if you set them there.

---

## 3. face-api.js model weights

The liveness check loads four model weight files from `/models/`:

- [ ] Download from the face-api.js repo:
```bash
mkdir -p public/models
cd public/models
WEIGHTS_BASE="https://github.com/justadudewhohacks/face-api.js/raw/master/weights"
for FILE in \
  tiny_face_detector_model-weights_manifest.json \
  tiny_face_detector_model-shard1 \
  face_landmark_68_model-weights_manifest.json \
  face_landmark_68_model-shard1 \
  face_recognition_model-weights_manifest.json \
  face_recognition_model-shard1 \
  face_recognition_model-shard2 \
  age_gender_model-weights_manifest.json \
  age_gender_model-shard1; do
    curl -L -o "$FILE" "$WEIGHTS_BASE/$FILE"
done
```
- [ ] Commit `public/models/*` to the repo (~6MB total, one-time)
- [ ] Verify they serve correctly from your hosting at `/models/tiny_face_detector_model-weights_manifest.json`

---

## 4. Deploy

### 4.1 Staging (do first)
- [ ] `firebase use <staging-project-id>` (if you have a separate staging project — otherwise re-use prod with feature gating)
- [ ] `firebase deploy --only functions,firestore:rules,firestore:indexes,storage` (australia-southeast1 callables will deploy)
- [ ] Vercel preview will auto-build on push to `claude/self-hosted-verification-system-D8iif`

### 4.2 Webhook URLs to register

After staging deploy, the new webhook is at:
```
https://australia-southeast1-studio-4495412314-3b1ce.cloudfunctions.net/verificationMonoovaWebhook
```

- [ ] Register this URL in the Monoova merchant dashboard for `payid.payment.received` and `penny_drop.confirmed` events
- [ ] Confirm the HMAC signing key Monoova uses matches `MONOOVA_WEBHOOK_SECRET`

The legacy `monoovaWebhook` (us-central1) is still exported from `payments/` for backward compatibility — leave it registered until any in-flight bookings clear. **Do not point Monoova at both URLs simultaneously**; pick one based on your active payment flow.

### 4.3 Production
- [ ] Wait for staging to pass the manual verification checklist (below)
- [ ] Get Anna's explicit go-ahead
- [ ] `firebase use studio-4495412314-3b1ce`
- [ ] `firebase deploy --only functions,firestore:rules,firestore:indexes,storage`
- [ ] Update Vercel production env vars

---

## 5. Manual staging verification checklist

Run through every item before signing off:

- [ ] New customer can complete a standard-tier booking (SMS OTP + PayID, no liveness)
- [ ] New customer attempting a premium-tier booking (>= AUD $500) gets the liveness step
- [ ] Liveness rejection (eyes closed throughout, no face, multiple faces) shows the right error
- [ ] DNS list match silently fails the booking (manually add a phone hash to `doNotServeList`, then book with that number — should see generic "couldn't process" with no SMS sent)
- [ ] Rate-limited OTP returns the right error after 3 sends in 15 minutes
- [ ] PayID name mismatch routes booking to manual review queue
- [ ] PayID name match auto-confirms the booking
- [ ] Admin can view manual review queue with real-time updates
- [ ] Admin approve writes a `verificationRecord` and `auditLog` entry
- [ ] Admin decline + DNS adds entries to `doNotServeList`
- [ ] Performer can apply, upload ID via signed URL
- [ ] Admin can view ID via 5-minute signed URL with countdown
- [ ] After admin completes review, the storage object is deleted within 30 seconds (verify in GCS console)
- [ ] `forceDeleteStaleIdUploads` scheduled function runs every 5 minutes and clears stale uploads
- [ ] PayID confirm flow: admin opens PayID Confirm Queue → enters payer name → ticks "matches" → booking auto-confirms (manual mode replaces the old penny-drop verification)
- [ ] Trust tier promotion test: simulate 5 clean completed bookings, verify `customers/{id}.trustTier == 'trusted'`
- [ ] Performer flag customer: customer's phone+email hashes added to DNS, trust tier demoted to 'unverified'
- [ ] `auditLog` contains expected events for every action above (admin can query by action+createdAt)

If anything fails: fix on the branch, redeploy, retest.

---

## 6. Pricing decision (out of scope but flagged)

The Phase 1 cleanup commit removed the `amount_kyc_fee` field from booking pricing. That fee is no longer charged to clients. If you'd like to charge a different verification fee, it must be added back as a separate field — don't reuse the `kyc` naming.

---

## 7. Things I did NOT do (intentionally)

- I did not run any `firebase`, `gsutil`, `vercel`, or `gh` CLI commands. All credential operations are listed above for you to run.
- I did not enable App Check at the Firebase project level (manual console step).
- I did not download face-api.js model weights (~6MB binary commit; you commit them).
- I did not deploy to staging or production.
- I did not migrate any existing customer/booking data — none was needed (Didit was never live).
- I did not initialize App Check in `services/firebaseClient.ts` because it requires a reCAPTCHA site key that doesn't exist yet. See section 1.2.
