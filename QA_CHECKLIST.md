# QA Checklist — Flavor Entertainers

Run through this checklist before any demo or production release.
Check each item in both DEMO mode and LIVE mode where applicable.

---

## DEMO VERSION

### Initial load
- [ ] App loads on port 3001 without errors
- [ ] "Demo Environment" badge visible top-right
- [ ] Guided tour auto-starts on first load (tour card appears bottom-right)
- [ ] Tour shows Step 1 of 7

### Tour flow
- [ ] Each "Next" button advances the step
- [ ] App navigates to the correct view on each step
- [ ] "Back" button returns to previous step
- [ ] "Skip tour" dismisses the overlay
- [ ] "Explore Live Demo" on last step closes tour
- [ ] "Start Tour" button in DemoControls restarts from step 1

### Demo data
- [ ] Gallery shows 12 performers
- [ ] At least 5 performers show as "Available"
- [ ] At least 1 performer shows as "Busy"
- [ ] At least 1 performer shows as "Offline"
- [ ] Bookings show across all statuses (confirmed, pending, etc.)
- [ ] DNS list shows 7 entries (3 approved, 2 pending, 1 rejected, 1 other)
- [ ] Communications list shows at least 10 entries
- [ ] Audit log shows entries

### Reset function
- [ ] "Reset Demo" button first ask for confirmation ("Confirm Reset?")
- [ ] Second click triggers page reload / data restore
- [ ] After reset, all data returns to original state

---

## BOTH VERSIONS — Core Workflows

### Gallery
- [ ] Gallery loads performers from data source
- [ ] "Available Now" filter shows only available performers
- [ ] Search by name works
- [ ] Filter by service area works
- [ ] Filter by category (Waitressing / Strip Show / Promotional) works
- [ ] Clicking a performer card opens their profile
- [ ] "Add to Booking" button toggles selection
- [ ] Booking sticky footer appears when performer selected
- [ ] Sticky footer shows correct count

### Performer Profile
- [ ] Profile shows name, bio, tagline, rating, review count
- [ ] Service list displays correctly
- [ ] Service area badges display
- [ ] "Book Now" button works
- [ ] "Back to Gallery" button works

### Booking Flow
- [ ] Step 1: Service selection loads correctly
- [ ] Services grouped by category
- [ ] Pricing updates dynamically as services selected
- [ ] 25% deposit calculation is correct
- [ ] Duration summary accurate
- [ ] Step 2: Event details form validates required fields
- [ ] Date picker works, rejects past dates
- [ ] Step 3: ID upload shows file input
- [ ] Step 4: Review summary shows all details
- [ ] Submit creates booking entry

### Client Dashboard
- [ ] Accessible via email lookup
- [ ] Shows bookings associated with that email
- [ ] Booking status badges correct
- [ ] "Submit Deposit" action shown for deposit_pending bookings

### Performer Dashboard
- [ ] Login as performer shows correct performer's bookings
- [ ] Status toggle (Available / Busy / Offline) works
- [ ] Accept booking shows ETA input
- [ ] Decline booking updates status to rejected
- [ ] Submit DNS report form works
- [ ] DNS submissions appear in list

### Admin Dashboard
- [ ] Login as admin shows all 5 tabs
- [ ] **Bookings tab**: All bookings listed; status change buttons work
- [ ] **Performers tab**: Performer list loads; edit/status change works
- [ ] **Vetting tab**: Pending vetting applications listed
- [ ] **Payments tab**: Bookings awaiting deposit confirmation listed
- [ ] **Reports tab**: Revenue stats display; CSV export works

### Do Not Serve List
- [ ] Accessible via Admin Dashboard
- [ ] Shows all entries with correct status badges
- [ ] Admin can approve pending entries
- [ ] Admin can reject pending entries
- [ ] Approved entries show in "Active" state

### Communications
- [ ] Chat icon in header shows unread count
- [ ] Messages list opens correctly
- [ ] Messages display sender, time, content
- [ ] Admin sees all messages

---

## LIVE VERSION — Firebase-Specific

### Authentication
- [ ] Login modal opens
- [ ] Email + password login works
- [ ] Google sign-in works (if configured)
- [ ] Admin login routes to admin dashboard
- [ ] Performer login routes to performer dashboard
- [ ] Client/user login routes to gallery
- [ ] Logout clears session and returns to gallery
- [ ] Unauthenticated user cannot access admin/performer routes

### Firestore
- [ ] Real-time updates: change booking status → other sessions update within 2 seconds
- [ ] Real-time updates: performer changes status → gallery updates
- [ ] Booking creation writes to Firestore
- [ ] DNS entry creation writes to Firestore
- [ ] Communication writes to Firestore

### Security Rules
- [ ] Unauthenticated user cannot read `/bookings`
- [ ] Client cannot read another client's booking (test with different emails)
- [ ] Performer cannot read bookings assigned to different performer
- [ ] Admin can read all collections
- [ ] Performer cannot write to `/blacklist`
- [ ] Audit logs cannot be updated or deleted

### Cloud Functions
- [ ] `createBookingRequest` — creates booking, runs DNS check
- [ ] `onBookingCreated` — queues notifications on new booking
- [ ] `onBookingStatusChanged` — sends appropriate messages on status change
- [ ] `analyzeVettingRisk` — returns risk flags (requires Gemini key)
- [ ] `notificationsWorker` — delivers SMS/WhatsApp (requires Twilio)

### File Uploads
- [ ] ID document uploads to Firebase Storage
- [ ] Selfie uploads to Firebase Storage
- [ ] Upload paths are user-scoped (`vetting/{uid}/...`)
- [ ] Uploaded files retrievable

---

## Performance & UX

- [ ] Initial load under 3 seconds on broadband
- [ ] Gallery loads with 12 performers without visible lag
- [ ] No console errors or unhandled promise rejections
- [ ] Age gate appears on first visit and clears on acceptance
- [ ] Age gate does not appear after localStorage set
- [ ] Mobile layout correct on 375px viewport
- [ ] Booking sticky footer does not obscure content on mobile
- [ ] DemoPhone notification appears and auto-dismisses after 7 seconds
- [ ] Toast notifications appear and auto-dismiss after 5 seconds

---

## Pre-Launch Checklist (Live)

- [ ] `.env.local` populated with production Firebase credentials
- [ ] Firebase Blaze plan enabled (required for Cloud Functions)
- [ ] Firestore security rules deployed
- [ ] Storage security rules deployed
- [ ] Cloud Functions deployed
- [ ] Cloud Function environment variables set (Twilio, Gemini, DNS pepper)
- [ ] Firestore indexes deployed
- [ ] Admin user created in Firebase Auth
- [ ] Performer accounts created in Firebase Auth
- [ ] Firestore seeded with initial performer data
- [ ] Custom domain configured (if applicable)
- [ ] Age gate legal text reviewed by legal counsel
- [ ] Privacy policy reviewed and accurate
- [ ] Terms of service reviewed and accurate
