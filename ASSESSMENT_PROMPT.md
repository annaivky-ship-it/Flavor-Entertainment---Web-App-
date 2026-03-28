# Full System Assessment Prompt — Flavor Entertainers

Paste this into a fresh Claude Code session pointing at this repo.

---

You are a senior full-stack engineer performing a production readiness audit of the Flavor Entertainers booking platform. This is a live adult entertainment booking app for Western Australia (Perth) built with React 19 + TypeScript + Vite + Firebase (Firestore, Cloud Functions, Auth, Storage) + Tailwind CSS v4.

**Live site:** flavorentertainers.com
**Firebase project:** studio-4495412314-3b1ce
**Repo:** github.com/annaivky-ship-it/Flavor-Entertainment---Web-App-

---

## Your task

Perform a complete end-to-end assessment of the app. Work through each section below systematically. For every issue found, report:
- Severity (P0 critical / P1 high / P2 medium / P3 low)
- File path and line number
- What's wrong
- How to fix it

---

## 1. BUILD & TYPE SAFETY

Run these commands and report ALL errors or warnings:

```bash
npm install
npx tsc --noEmit                    # Frontend type check
npm run build                       # Full Vite production build
npx vitest run                      # Frontend tests
cd functions && npm install && npx tsc --noEmit  # Backend type check
cd functions && npm test            # Backend tests
```

For each failure:
- Is it a real bug or a config issue?
- Fix it or explain what's needed

---

## 2. LIVE SITE CHECK

Fetch the live site at flavorentertainers.com (try both direct fetch and Vercel deployment URLs). Check:
- Does it return 200 or an error?
- Does the HTML contain the expected React app shell?
- Are all assets (JS, CSS, fonts) loading?
- Is the Tailwind CDN script still present (it shouldn't be — it was removed)?
- Are Open Graph meta tags present?
- Is robots.txt and sitemap.xml accessible?

---

## 3. FIRESTORE RULES AUDIT

Read `firestore.rules` and verify:
- Every collection used in the app has a matching rule
- No collection is accidentally world-writable
- The `communications` rule correctly restricts reads to participants + admins
- The `audit_logs` rule allows admin writes (not just Cloud Functions)
- `client_verifications` and `webhook_payloads` are admin-read, system-write only
- Performers can only self-update `availability` and `status` fields
- Bookings allow public create but restrict update to admins
- The default deny-all rule exists at the bottom

---

## 4. FIRESTORE INDEXES

Read `firestore.indexes.json` and cross-reference with every query in `services/api.ts` and `functions/src/`. Check:
- Every composite query has a matching index
- No unused indexes
- The `communications` collection has indexes for:
  - `participant_uids` (array-contains) + `created_at` (desc)
  - `booking_id` + `created_at` (asc)
- The `audit_logs` collection has an index for `createdAt` (desc)

---

## 5. BOOKING FLOW (end-to-end)

Trace the complete booking flow through the code:

1. **BookingProcess.tsx** — Verify the 3-step wizard works:
   - Step 1: "You & Your Event" — 11 fields, all validated
   - Step 2: "Choose Your Services" — service cards, min 1 required
   - Step 3: "Confirm & Verify" — inline summary + terms + Didit KYC

2. **Booking creation** — `services/api.ts` → `createBookingRequest` Cloud Function:
   - DNS check runs
   - Slot locking prevents double-booking
   - Risk scoring auto-runs on creation
   - Notifications queue entry created

3. **KYC/Verification** — `DiditVerification.tsx` + `functions/src/didit.ts`:
   - Existing verification reuse works (client_verifications collection, 90-day window)
   - iframe embed loads correctly
   - All Didit statuses handled (Approved, Declined, In Review, Expired, Resubmitted)
   - Webhook is idempotent
   - Raw payloads stored for audit

4. **Booking cancellation** — verify `cancelBooking` in api.ts:
   - Updates status to cancelled
   - Stores reason, timestamp, who cancelled
   - Slot lock gets cleaned up by `onBookingStatusChanged`

5. **Conflict detection** — verify BookingProcess step 1 validation checks for overlapping bookings

---

## 6. PERFORMER AVAILABILITY SYSTEM

Verify the availability system works end-to-end:

1. **Types** — `PerformerAvailability` in types.ts
2. **Dashboard toggle** — PerformerDashboard.tsx has availability controls
3. **API** — `setPerformerAvailableNow` and `updatePerformerAvailability` in api.ts
4. **Gallery display** — EntertainerCard.tsx shows green/blue/grey badges
5. **Gallery sorting** — Available Now performers sort first in App.tsx
6. **Auto-expire** — `autoExpireAvailability` Cloud Function in functions/src/index.ts
7. **Auto-busy on confirm** — `onBookingStatusChanged` sets performer to busy
8. **Admin overview** — AdminDashboard.tsx shows live availability panel
9. **Firestore rules** — Performers can self-update availability + status only

---

## 7. ADMIN DASHBOARD

Check AdminDashboard.tsx for:
- Booking management with status transitions
- Performer management (create, edit, photos)
- Do Not Serve register
- Verification status badges on bookings
- Live availability overview panel
- All admin actions create audit log entries

---

## 8. CLIENT DASHBOARD

Check ClientDashboard.tsx for:
- Email lookup flow
- Booking status display with all 11 statuses
- Cancel booking button (with confirmation modal)
- Message performer button
- Booking grouping (action required / upcoming / history)

---

## 9. SECURITY AUDIT

Check for:
- No `firebase-admin` in frontend package.json
- No hardcoded admin emails in Login.tsx
- All catch blocks use `unknown` type (not `any`)
- File upload validation (type + size limits) in api.ts
- Didit API key never exposed to frontend
- Webhook signature verification in diditKycWebhook
- DNS hash pepper is not the default value
- No console.log with sensitive data in production
- Error messages shown to users don't leak internal details
- CORS headers properly configured on Cloud Functions

---

## 10. PERFORMANCE

Check:
- Heavy components are lazy-loaded (AdminDashboard, PerformerDashboard, ClientDashboard, FAQ, etc.)
- React.Suspense wraps lazy components
- Code splitting produces separate chunks for firebase, vendor, and lazy components
- Images use `loading="lazy"`
- No Tailwind CDN script in index.html
- Google Fonts use `display=swap`

---

## 11. ACCESSIBILITY

Check:
- All modals have `role="dialog"` and `aria-modal="true"`
- Mobile menu button has `aria-label`
- Form inputs have associated labels
- AgeGate validates invalid dates (Feb 30, future dates)
- Login modal closes on Escape key
- Color contrast meets WCAG AA for text on dark backgrounds

---

## 12. SEO

Check index.html for:
- Title tag
- Meta description
- Open Graph tags (og:title, og:description, og:type, og:url)
- Twitter Card tags
- robots.txt in public/
- sitemap.xml in public/
- Theme color meta tag

---

## 13. CI/CD

Check `.github/workflows/firebase-hosting-deploy.yml`:
- Tests run before build
- Build uses environment secrets
- Firebase deploy uses token
- Triggers on push to main

---

## 14. CLOUD FUNCTIONS

Check `functions/src/index.ts` for:
- All exports are properly typed
- `createBookingRequest` uses transactions
- `onBookingCreated` runs risk scoring
- `onBookingStatusChanged` handles slot cleanup + auto-busy
- `autoExpireAvailability` scheduled every 15 minutes
- `diditKycWebhook` validates signatures and is idempotent
- `notificationsWorker` processes queued messages
- All functions have error handling

---

## 15. DATA MODEL CONSISTENCY

Cross-reference `types.ts` with:
- Firestore rules (every type has matching rules)
- Firestore indexes (every queried field has indexes)
- API methods (every type field is used somewhere)
- Cloud Functions (field names match between frontend and backend)

Check for field name mismatches like:
- `audit_log` vs `audit_logs` (collection name)
- `client_phone` vs `phone` vs `mobile`
- `client_email` vs `email`

---

## Deliverables

After completing all checks, produce:

1. **Issue table** — Every issue found, sorted by severity:
   | # | Severity | File | Issue | Fix |
   |---|----------|------|-------|-----|

2. **Health scorecard** — Rate each section 1-5:
   | Section | Score | Notes |
   |---------|-------|-------|

3. **Recommended fixes** — Prioritized list of what to fix, with estimated effort

4. **Things that work well** — Acknowledge what's solid

5. **Blockers for production launch** — Any P0 issues that must be fixed before going live

Fix all P0 and P1 issues you find. For P2/P3, list them but don't fix unless trivial.
