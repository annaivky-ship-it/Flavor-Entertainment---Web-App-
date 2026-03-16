# Flavor Entertainers - System Security Assessment

**Date:** 2026-03-17
**Scope:** Full security audit of Firebase rules, Cloud Functions, frontend, and infrastructure
**Status:** Critical fixes applied (see Fix Status column)

---

## Critical Security Issues (P0)

| # | Issue | Location | Fix Status |
|---|-------|----------|------------|
| 1 | `.env.production` committed with Firebase API keys | `.env.production`, `.gitignore:20` | FIXED - removed from git tracking, .gitignore updated |
| 2 | Communications data leakage - any signed-in user can read ALL messages across ALL bookings | `firestore.rules:139-144` | FIXED - added `participant_uids` scoping |
| 3 | Unrestricted message creation - any authenticated user can inject messages into any booking thread | `firestore.rules:141` | FIXED - `sender_uid` must match `auth.uid`, required fields enforced |

### 1. `.env.production` Committed with Real API Keys

**Before:** `.gitignore` had `!.env.production` exception, exposing:
- `VITE_FIREBASE_API_KEY=AIzaSyDJXl...`
- `VITE_FIREBASE_PROJECT_ID=studio-4495412314-3b1ce`
- `VITE_FIREBASE_MESSAGING_SENDER_ID=387015361731`
- `VITE_FIREBASE_APP_ID=1:387015361731:web:...`

**Fix applied:** Removed `!.env.production` from `.gitignore`, ran `git rm --cached .env.production`.

**Remaining action:** Rotate all exposed Firebase API keys and scrub git history with `git filter-branch` or BFG Repo-Cleaner.

### 2. Communications Collection Data Leakage

**Before:** Any signed-in user could read ALL communications:
```
allow read: if isSignedIn();
allow create: if isSignedIn();
```

**Fix applied:** Added `participant_uids` array to every message. Security rules now enforce:
- Read: only participants listed in `participant_uids` or admins
- Create: `sender_uid` must match `auth.uid`, sender must be in `participant_uids`
- Update: only participants can mark messages as read

### 3. Unrestricted Message Creation

**Before:** Any authenticated user could write to any booking's communication thread.

**Fix applied:** Create rule now requires:
- `sender_uid == request.auth.uid` (no impersonation)
- Sender in `participant_uids`
- Required fields: `booking_id`, `sender_uid`, `participant_uids`, `message`

---

## High Security Issues (P1)

| # | Issue | Location | Fix Status |
|---|-------|----------|------------|
| 4 | Performers can read ALL bookings (not just their own) | `firestore.rules:58-60` | FIXED - scoped to `performer_id == auth.uid` |
| 5 | No IP-based rate limiting on booking creation | `functions/src/index.ts:258-267` | FIXED - added IP-based rate limit (10/hr) |
| 6 | `createBookingRequest` had no auth requirement | `functions/src/index.ts:222` | FIXED - requires `context.auth` |
| 7 | `createDraftApplication` spreads arbitrary user input | `functions/src/index.ts:84-101` | FIXED - explicit field allowlist |
| 8 | `createBookingRequest` spreads arbitrary formState into Firestore | `functions/src/index.ts:301-307` | FIXED - explicit field allowlist |

### 4. Performer Booking Read Scope

**Before:** `isPerformer()` alone was sufficient to read any booking.

**Fix:** Changed to `isPerformer() && resource.data.performer_id == request.auth.uid`.

### 5-6. Booking Creation Security

**Before:** `createBookingRequest` had no auth check and only email-based rate limiting.

**Fix:**
- Added `context.auth` requirement
- Added IP-based rate limiting (10 requests/hour per IP)
- Added `client_uid: context.auth.uid` to booking data

### 7-8. Input Allowlisting

**Before:** Both `createDraftApplication` and `createBookingRequest` used `...appData` / `...formState` spread, allowing attackers to inject arbitrary fields (e.g., `status: 'confirmed'`, `isAdmin: true`).

**Fix:** Replaced with explicit field allowlists. Only known, safe fields are written to Firestore.

---

## Medium Security Issues (P2)

| # | Issue | Location | Fix Status |
|---|-------|----------|------------|
| 9 | Insecure email "hash" (hex encoding, not hashing) | `functions/src/index.ts:270` | FIXED - replaced with SHA-256 |
| 10 | Silent file upload failure (no user feedback for >10MB) | `components/DiditVerification.tsx:44` | FIXED - error message shown |

### 9. Insecure Email Hashing

**Before:** `Buffer.from(email).toString('hex')` - trivially reversible encoding.

**Fix:** `createHash('sha256').update(email).digest('hex')` - proper one-way hash.

**Note:** Existing blacklist entries using the old hex format will need to be migrated to SHA-256 hashes.

### 10. DiditVerification File Upload

**Before:** Silently returned when file exceeded 10MB with no error feedback. No `reader.onerror` handler.

**Fix:** Added `fileError` state, visible error banner, and `reader.onerror` handler.

---

## Architecture Improvements (P3 - Non-Security)

These are quality and performance issues that should be addressed but are not security-critical.

### Code Organization
- **App.tsx (~1,124 lines):** Should be decomposed - extract auth context, custom hooks, split routing into separate modules
- **services/api.ts (~22K):** Should be split into domain modules (bookings, performers, communications, etc.)
- **No client-side routing:** State-based view switching breaks URLs, browser back button, and deep linking. Consider React Router.

### Testing
- **Only 5 test files** covering utilities only (`bookingUtils`, `dnsHelpers`, `logger`, `phoneUtils`, `templates`)
- **No component tests** or integration tests
- **No Cloud Functions tests**

### TypeScript
- Heavy `any` usage in Cloud Functions (`fns.https.onCall(async (data: any, context: any)`)
- Should define typed request/response interfaces per function

### Performance
- Possible duplicate Tailwind loading (CDN + Vite plugin)
- Multiple render-blocking Google Fonts
- Missing pagination for large list views (bookings, communications, audit logs)

### Accessibility
- SVG icons in ChatDialog.tsx missing `aria-hidden="true"`
- Status indicators in EntertainerCard.tsx rely on color alone (problematic for color-blind users)

---

## Remaining Actions (Post-Fix)

1. **Rotate Firebase API keys** - the keys in `.env.production` were committed to git history
2. **Scrub git history** - use BFG Repo-Cleaner to remove `.env.production` from all historical commits
3. **Migrate blacklist hashes** - existing hex-encoded email entries need re-hashing with SHA-256
4. **Backfill `participant_uids`** - existing communications documents need `participant_uids` added via a migration script
5. **Backfill `client_uid`** - existing bookings need `client_uid` populated for the new performer-scoped read rules
6. **Add Supabase RLS policies** - if Supabase is in use, all tables currently have `using (true)` policies
