# Flavor Entertainers — Setup & Deployment Guide

## Architecture Overview

```
flavor-app/
├── index.tsx              ← Live (Firebase) app entry point
├── App.tsx                ← Shared app (demo mode enabled via VITE_APP_MODE)
├── vite.config.ts         ← Live Vite config (port 3000)
├── vite.config.demo.ts    ← Demo Vite config (port 3001, aliases mockData → demoData)
│
├── data/
│   ├── mockData.ts        ← Base mock data (fallback for live when Firebase unavailable)
│   └── demoData.ts        ← Rich demo data (12 performers, 20+ bookings, 7 DNS entries)
│
├── demo/
│   ├── DemoTour.tsx       ← 7-step guided product tour
│   └── DemoControls.tsx   ← Demo badge, Start Tour, Reset buttons
│
├── services/
│   ├── api.ts             ← Firebase API layer (with mock fallback)
│   ├── firebaseClient.ts  ← Firebase SDK initialisation
│   ├── firebaseAuth.ts    ← Complete auth service (email, Google, role resolution)
│   └── geminiService.ts   ← Gemini AI vetting analysis
│
├── scripts/
│   └── seedFirestore.ts   ← Production Firestore seed script
│
├── functions/             ← Cloud Functions (shared between demo and live)
├── firestore.rules        ← Production-hardened security rules
├── storage.rules          ← Cloud Storage rules
├── .env.demo              ← Demo environment (no Firebase required)
└── .env.live.example      ← Live environment template
```

---

## Version 1: Demo Environment

### What it does
- Uses rich in-memory seed data (12 performers, 20+ bookings, 7 DNS entries)
- Zero Firebase dependency — works immediately without any configuration
- Shows a 7-step guided product tour on first load
- Includes "Demo Environment" badge, Start Tour, and Reset buttons
- Safe to share publicly — no real data, no real payments

### Run locally
```bash
npm install
npm run dev:demo
# Opens at http://localhost:3001
```

### Build for deployment
```bash
npm run build:demo
# Output in dist-demo/
```

### Deploy to Firebase Hosting (demo target)
```bash
# First, add a hosting target named "demo" to firebase.json (see below)
npm run deploy:demo
```

### firebase.json hosting targets for demo
```json
{
  "hosting": [
    {
      "target": "live",
      "public": "dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [{ "source": "**", "destination": "/index.html" }]
    },
    {
      "target": "demo",
      "public": "dist-demo",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [{ "source": "**", "destination": "/index.html" }]
    }
  ]
}
```

Then run:
```bash
firebase target:apply hosting live your-live-site-id
firebase target:apply hosting demo your-demo-site-id
```

### Demo tour flow (3–5 minute presentation)
1. Welcome — platform overview
2. Gallery — browse performers, filters, availability
3. Booking flow — 4-step wizard, deposit calculation
4. Performer dashboard — availability, accept/decline, DNS submission
5. Admin dashboard — 5-tab control centre
6. Payments & reporting — deposit tracking, PayID, CSV export
7. DNS / safety system — hashed screening, audit log

---

## Version 2: Live Firebase Production

### Prerequisites
- Node.js 18+
- Firebase CLI: `npm install -g firebase-tools`
- Firebase project created at console.firebase.google.com
- Firestore, Auth, Storage, and Functions enabled

### Step 1 — Firebase project setup
```bash
firebase login
firebase use --add   # Select or create your project
```

### Step 2 — Environment configuration
```bash
cp .env.live.example .env.local
# Edit .env.local and fill in all VITE_FIREBASE_* values
```

### Step 3 — Firestore indexes
```bash
firebase deploy --only firestore:indexes
```

### Step 4 — Security rules
```bash
firebase deploy --only firestore:rules
firebase deploy --only storage:rules
```

### Step 5 — Seed the database (first run only)
```bash
# Option A: Using service account JSON
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
npm run seed

# Option B: Using Application Default Credentials (if gcloud is configured)
export FIREBASE_PROJECT_ID=your-project-id
npm run seed
```

The seed script writes:
- 12 performers across all service areas
- 8 bookings spanning every status
- 5 DNS entries (3 approved, 2 pending)
- 4 system communications

### Step 6 — Firebase Auth setup
In Firebase Console → Authentication → Sign-in methods:
- Enable **Email/Password**
- Enable **Google** (for admin convenience)

Create the admin account:
```
Email: admin@flavorentertainers.com.au
Password: (set a strong password)
```

Create performer accounts (one per performer):
```
Email: april@flavorentertainers.com.au   → April Flavor
Email: anna@flavorentertainers.com.au    → Anna Ivky
Email: scarlett@flavorentertainers.com.au → Scarlett
... etc.
```

The system auto-detects roles from email domain. For production, set **custom claims** instead:

```javascript
// Run this via Firebase Admin SDK (e.g. in a script or Cloud Shell)
const admin = require('firebase-admin');
admin.auth().setCustomUserClaims(uid, { role: 'admin' });
admin.auth().setCustomUserClaims(uid, { role: 'performer', performerId: 5 });
```

### Step 7 — Cloud Functions
```bash
cd functions
npm install
```

Set required environment variables:
```bash
firebase functions:config:set \
  twilio.account_sid="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  twilio.auth_token="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  twilio.whatsapp_from="whatsapp:+61XXXXXXXXX" \
  twilio.sms_from="+61XXXXXXXXX" \
  gemini.api_key="AIzaSyXXXXXXXXXXXXXXXXXXXXXX" \
  dns.hash_pepper="$(openssl rand -hex 32)" \
  payid.reference_prefix="FLV-"
```

Deploy functions:
```bash
npm run functions:deploy
# or: firebase deploy --only functions
```

### Step 8 — Build and deploy frontend
```bash
npm run build          # TypeScript check + Vite build → dist/
firebase deploy --only hosting:live
```

Or use the convenience script:
```bash
npm run deploy:live
```

---

## Firebase Collections Schema

| Collection | Description | Key fields |
|---|---|---|
| `users` | User profiles + roles | uid, email, role, performerId |
| `performers` | Performer gallery | id, name, status, service_ids, service_areas |
| `availability` | Weekly schedules | performerId, schedule |
| `bookings` | Full booking lifecycle | status, performer_id, client_email, services_requested |
| `do_not_serve` | Safety / DNS list | client_email (hashed in blacklist), status, reason |
| `blacklist` | Hashed emails/phones | sha256_email, sha256_phone |
| `vetting_applications` | KYC applications | userId, status, idFilePath, riskFlags |
| `communications` | System messages | sender, recipient, booking_id, type |
| `audit_logs` | Immutable activity log | actorUid, actorRole, action, details |
| `slot_locks` | Booking collision prevention | performerId, date, ttl |
| `notifications_queue` | Outbound SMS/WhatsApp | recipient, message, status |

---

## Workflow Completion Status

| Workflow | Demo | Live | Notes |
|---|---|---|---|
| Client gallery browse | ✅ | ✅ | Filters: area, service, availability |
| Performer profile view | ✅ | ✅ | |
| Multi-performer selection | ✅ | ✅ | |
| Booking wizard (4 steps) | ✅ | ✅ | |
| ID document upload | ✅ (simulated) | ✅ (Firebase Storage) | |
| DNS screening at booking | ✅ (simulated) | ✅ (Cloud Function) | |
| Performer accept/decline | ✅ | ✅ | With ETA input |
| VIP fast-track (verified clients) | ✅ | ✅ | Skips vetting step |
| Admin vetting review | ✅ | ✅ | |
| Deposit calculation (25%) | ✅ | ✅ | |
| PayID payment instructions | ✅ (simulated) | ✅ | |
| Admin deposit confirmation | ✅ | ✅ | |
| Booking confirmation flow | ✅ | ✅ | |
| SMS/WhatsApp notifications | ✅ (DemoPhone) | ⚠️ Requires Twilio credentials | |
| Performer status updates | ✅ | ✅ | Real-time via Firestore |
| Real-time booking updates | ✅ | ✅ | onSnapshot listeners |
| Client dashboard | ✅ | ✅ | Email-based lookup |
| Performer dashboard | ✅ | ✅ | |
| Admin dashboard (5 tabs) | ✅ | ✅ | |
| DNS/Do Not Serve list | ✅ | ✅ | |
| DNS submission by performer | ✅ | ✅ | |
| Admin DNS approve/reject | ✅ | ✅ | |
| Hashed DNS screening | — | ✅ (Cloud Function) | |
| Gemini AI risk analysis | — | ⚠️ Requires Gemini API key | |
| CSV export | ✅ | ✅ | |
| Audit logging | ✅ | ✅ | |
| Firebase Auth (real login) | — | ✅ | |
| Role-based access control | — | ✅ | Custom claims |
| Firestore security rules | — | ✅ | |
| Storage security rules | — | ✅ | |
| Performer onboarding | ✅ (form only) | ⚠️ Backend submission pending | |
| Didit KYC | — | ⚠️ Requires Didit credentials | |
| Stripe/payment processor | — | ⚠️ Not wired (PayID used instead) | |

---

## External Credentials Required for Full Production

| Service | Purpose | Where to get it |
|---|---|---|
| Firebase project | Backend infrastructure | console.firebase.google.com |
| Twilio Account SID + Auth Token | SMS/WhatsApp notifications | twilio.com |
| Twilio WhatsApp number | Outbound WhatsApp | Twilio Console → Messaging |
| Google Gemini API key | AI vetting risk analysis | aistudio.google.com |
| Didit API key | ID verification (KYC) | didit.me |
| Custom domain (optional) | Production URL | Domain registrar |
| Firebase Blaze plan | Cloud Functions + Storage | Firebase Console |

---

## Deploying to Vercel (alternative to Firebase Hosting)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy live version
vercel --build-env VITE_APP_MODE=live \
       --build-env VITE_FIREBASE_API_KEY=xxx \
       ... (all VITE_FIREBASE_* vars)

# Deploy demo version
vercel --build-env VITE_APP_MODE=demo
```

Set environment variables in Vercel Dashboard → Project → Settings → Environment Variables.

---

## Local Development

```bash
# Install all dependencies
npm install

# Run DEMO version (port 3001 — no Firebase needed)
npm run dev:demo

# Run LIVE version (port 3000 — requires .env.local with Firebase config)
npm run dev

# Type-check everything
npm run typecheck

# Build both versions
npm run build        # → dist/
npm run build:demo   # → dist-demo/
```
