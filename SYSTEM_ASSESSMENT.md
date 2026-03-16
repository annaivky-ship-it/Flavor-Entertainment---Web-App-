# System Assessment & Security Review

**Project:** Flavor Entertainers — Premium Entertainment Booking Platform
**Date:** 2026-03-16
**Scope:** Full stack review — architecture, security, performance, code quality, and recommendations

---

## 1. Architecture Overview

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript 5.8, Vite 6.2, Tailwind CSS 4.2 |
| Backend | Firebase Cloud Functions (Node.js 22) |
| Database | Cloud Firestore (australia-southeast1) |
| Auth | Firebase Authentication (Email/Password, Google) |
| Storage | Firebase Cloud Storage |
| Messaging | Twilio (SMS/WhatsApp) |
| KYC | Didit identity verification |
| AI | Google Gemini (risk analysis) |
| CI/CD | GitHub Actions |

**Deployment targets:** Production + Demo (mock data, no backend required)

---

## 2. Security Findings

### CRITICAL

#### 2.1 Firebase API Key Committed to Version Control
- **File:** `.env.production:3`
- **Issue:** `VITE_FIREBASE_API_KEY=AIzaSyDJXlPBCyGfFkHwYLb_fw-lyJ1CJRpQLz8` is committed and excluded from `.gitignore`
- **Risk:** While Firebase API keys are designed to be public (client-side), committing production credentials to a repo means they persist in git history forever. Combined with weak Firestore rules, this could be exploited.
- **Fix:**
  1. Remove `.env.production` from the `!.env.production` gitignore exclusion
  2. Scrub the key from git history using `git filter-repo`
  3. Pass credentials only through CI/CD secrets (already done in `deploy.yml` — rely solely on that)
  4. Consider rotating the API key via Firebase Console

#### 2.2 Communications Collection — Data Leakage
- **File:** `firestore.rules:139-144`
- **Issue:** Any signed-in user can read **all** messages across **all** bookings
- **Risk:** Client contact details, negotiation details, and payment discussions are exposed to any authenticated user
- **Fix:** Denormalize `participant_uids` onto each communication document and restrict reads:
  ```
  allow read: if isAdmin() || (isSignedIn() && request.auth.uid in resource.data.participant_uids);
  ```

#### 2.3 Communications — Unrestricted Message Creation
- **File:** `firestore.rules:141`
- **Issue:** Any signed-in user can create messages for **any** booking — no participant verification
- **Risk:** Impersonation, spam, phishing messages injected into legitimate booking threads
- **Fix:** Validate `request.resource.data.sender_uid == request.auth.uid` and verify booking participation

### HIGH

#### 2.4 Booking Read Access Too Broad for Performers
- **File:** `firestore.rules:60`
- **Issue:** `isPerformer()` grants read access to **all** bookings, not just the performer's own
- **Risk:** Any performer can view all other performers' bookings and client details
- **Fix:** Check `resource.data.performer_id == request.auth.token.performerId` or similar scoping

#### 2.5 Missing IP-Based Rate Limiting on Booking Creation
- **File:** `functions/src/index.ts:258-267`
- **Issue:** Rate limiting is per-email only. An attacker using multiple emails bypasses limits entirely
- **Fix:** Add IP-based rate limiting (`context.rawRequest.ip`) alongside email-based limits

#### 2.6 `createBookingRequest` Does Not Require Authentication
- **File:** `functions/src/index.ts:222`
- **Issue:** No `context.auth` check — unauthenticated users can create bookings via Cloud Functions
- **Risk:** Bot-driven booking floods, spam entries
- **Fix:** Either require auth or add CAPTCHA verification for unauthenticated flows

#### 2.7 Vetting Application — Unbounded Data Accepted
- **File:** `functions/src/index.ts:84-101` (`createDraftApplication`)
- **Issue:** `...appData` spreads arbitrary user-controlled data into Firestore with no allowlisting
- **Risk:** Users can inject unexpected fields (e.g., `status: 'approved'`, `reviewedBy: 'me'`), though these get overwritten. Any field NOT explicitly overwritten persists.
- **Fix:** Allowlist accepted fields explicitly instead of spreading the entire input object

### MEDIUM

#### 2.8 Age Calculation Edge Cases
- **File:** `functions/src/index.ts:135-136`
- **Issue:** Naive age calculation using `365.25` days/year can incorrectly pass/fail users born near the 18th birthday boundary
- **Fix:** Use calendar-based comparison: check if today >= DOB + 18 years

#### 2.9 Consent Creation — No Auth Required
- **File:** `firestore.rules:97-101`
- **Issue:** Anyone (even unauthenticated) can create consent records with minimal validation
- **Risk:** Fake consent records could be injected
- **Fix:** Require `isSignedIn()` for consent creation and validate `booking_id` references a real booking

#### 2.10 CSP Uses `unsafe-inline` for Styles
- **File:** `firebase.json:33`
- **Issue:** `style-src 'self' 'unsafe-inline'` weakens CSP protections
- **Fix:** Use nonce-based or hash-based style loading instead of `unsafe-inline`

#### 2.11 Demo Hosting Missing Security Headers
- **File:** `firebase.json:58-67`
- **Issue:** Demo site only has 3 security headers vs production's full set (no CSP, HSTS, Permissions-Policy, XSS-Protection)
- **Fix:** Apply the same security headers to both hosting targets

#### 2.12 Twilio Webhook — No Processing Logic
- **File:** `functions/src/index.ts:349-359`
- **Issue:** After verifying the Twilio signature, the webhook returns `200 OK` without processing the payload
- **Fix:** Implement actual inbound message handling or remove the endpoint

#### 2.13 DNS Hash Pepper — No Existence Validation
- **File:** `functions/src/dns/index.ts`
- **Issue:** If `getDnsHashPepper()` returns empty, hashes are unsalted and trivially reversible
- **Fix:** Fail loudly at startup if pepper is not configured or below minimum length

---

## 3. Architectural Improvements

### 3.1 Introduce Client-Side Routing
- **Current:** State-based view management in `App.tsx:43` with 12+ view states managed via `useState`
- **Problem:** No URL support (no deep linking, back button breaks, no shareable URLs, no SEO)
- **Recommendation:** Adopt React Router. Map each view to a URL path. This also enables proper code-splitting per route.

### 3.2 Extract State Management from App.tsx
- **Current:** `App.tsx` manages ~20 state variables, all authentication logic, data fetching, and view routing
- **Problem:** The file is ~56K — a maintenance bottleneck and difficult to test
- **Recommendation:**
  - Extract auth into a dedicated `AuthContext` provider
  - Extract data fetching into custom hooks (`usePerformers`, `useBookings`, etc.)
  - Move notification logic into a `NotificationContext`
  - Consider Zustand for shared state if complexity grows

### 3.3 Add Component and Integration Tests
- **Current:** 5 test files covering only utility functions (~123 lines total)
- **Problem:** No component tests, no integration tests, no E2E tests
- **Recommendation:**
  - Add React Testing Library for component tests (especially booking flow, auth, role switching)
  - Add Playwright or Cypress for critical user journeys
  - Target 60%+ coverage on business-critical paths

### 3.4 Type Safety in Cloud Functions
- **Current:** Heavy use of `any` types (`fns.https.onCall(async (data: any, context: any)`)
- **Problem:** No compile-time validation of request/response shapes
- **Recommendation:** Define typed interfaces for each callable function's input/output. Use `zod` or similar for runtime validation.

### 3.5 API Service Decomposition
- **Current:** `services/api.ts` is ~20K lines — a single service handling all Firestore operations
- **Recommendation:** Split into domain-specific modules:
  - `services/bookings.ts`
  - `services/performers.ts`
  - `services/communications.ts`
  - `services/admin.ts`

---

## 4. Performance Improvements

### 4.1 Remove Tailwind CDN from index.html
- **File:** `index.html`
- **Issue:** Tailwind is already installed as a Vite plugin (`@tailwindcss/vite`) but the CDN script may still be loaded in `index.html`, causing duplicate CSS processing and larger payloads
- **Fix:** Remove any Tailwind CDN `<script>` or `<link>` tags from `index.html`

### 4.2 Optimize Font Loading
- **Current:** Multiple Google Fonts loaded (Anton, Inter, Poppins, Special Elite)
- **Issue:** Each font adds render-blocking requests
- **Fix:**
  - Use `font-display: swap` for all fonts
  - Subset fonts to required characters only
  - Preconnect to `fonts.googleapis.com` and `fonts.gstatic.com`
  - Consider self-hosting fonts for better caching control

### 4.3 Add Firestore Composite Indexes
- **Current:** `firestore.indexes.json` may be incomplete
- **Issue:** Missing indexes cause full collection scans and slower queries
- **Fix:** Review Cloud Functions logs for index creation suggestions and add them

### 4.4 Implement Pagination for List Views
- **Current:** Performers and bookings appear to be loaded in full
- **Fix:** Use Firestore cursor-based pagination (`startAfter`, `limit`) for large datasets

---

## 5. Reliability Improvements

### 5.1 Add Error Boundaries Per Feature
- **Current:** Single top-level `ErrorBoundary` catches all errors
- **Issue:** One component crash takes down the entire app
- **Fix:** Wrap each lazy-loaded feature in its own `ErrorBoundary` with feature-specific fallback UI

### 5.2 Add Input Validation Library
- **Current:** Manual validation in Cloud Functions with repetitive if/throw patterns
- **Fix:** Adopt `zod` for declarative schema validation — reduces code, improves consistency, generates TypeScript types

### 5.3 Add Structured Logging
- **Current:** Custom logger in Cloud Functions — good. Frontend uses `console.error` in some places.
- **Fix:** Ensure all frontend errors go through the Sentry error tracking service consistently

### 5.4 Add Health Check Endpoint
- **Fix:** Create a simple Cloud Function health endpoint for uptime monitoring

---

## 6. Developer Experience Improvements

### 6.1 Add Pre-commit Hooks
- **Fix:** Use `husky` + `lint-staged` to run ESLint and TypeScript checks before commits, preventing broken code from being pushed

### 6.2 Add Environment Variable Validation at Build Time
- **Current:** `firebaseClient.ts:22-28` validates at runtime
- **Fix:** Add a Vite plugin or build-time script that fails the build if required env vars are missing

### 6.3 Standardize Error Handling Pattern
- **Current:** Mix of try/catch, `.catch(() => {})` (silent swallow at `index.ts:204`), and thrown HttpsErrors
- **Fix:** Define a consistent error handling strategy. Never silently swallow errors — at minimum log them.

---

## 7. Priority Action Items

| Priority | Item | Effort |
|----------|------|--------|
| P0 | Fix communications data leakage (2.2, 2.3) | 2-4 hours |
| P0 | Remove `.env.production` from git tracking (2.1) | 1 hour |
| P0 | Scope performer booking reads (2.4) | 1-2 hours |
| P1 | Add IP-based rate limiting (2.5) | 2 hours |
| P1 | Require auth or CAPTCHA for booking creation (2.6) | 2-3 hours |
| P1 | Allowlist fields in `createDraftApplication` (2.7) | 1 hour |
| P1 | Fix consent creation auth requirement (2.9) | 30 min |
| P2 | Introduce React Router (3.1) | 1-2 days |
| P2 | Decompose App.tsx state management (3.2) | 1-2 days |
| P2 | Add component tests (3.3) | Ongoing |
| P2 | Split api.ts into domain modules (3.5) | 1 day |
| P3 | Fix CSP unsafe-inline (2.10) | 2-3 hours |
| P3 | Add pre-commit hooks (6.1) | 1 hour |
| P3 | Performance optimizations (4.x) | 1-2 days |
