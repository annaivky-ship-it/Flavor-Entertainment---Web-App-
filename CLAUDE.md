# Flavor Entertainers — Web App

## Project Overview
Premium entertainment booking platform for Western Australia (Perth). Clients browse performer profiles, select services, book and pay deposits via PayID. Includes admin dashboard, performer dashboard, self-hosted age/identity verification (SMS OTP + on-device liveness + PayID-as-signal), SMS/WhatsApp notifications (Twilio + ClickSend), and Do Not Serve list.

**Live site:** flavorentertainers.com
**Firebase Project ID:** studio-4495412314-3b1ce
**Region:** us-central1 (functions), australia-southeast1 (Firestore)

## Tech Stack
- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Vite, Lucide icons
- **Backend:** Firebase Cloud Functions (Node 20), Firestore, Firebase Auth, Cloud Storage
- **Hosting:** Vercel (frontend) + Firebase Hosting (dual: production + demo)
- **Messaging:** Twilio (SMS + WhatsApp) + ClickSend (primary SMS)
- **Verification:** Self-hosted (Twilio SMS OTP, face-api.js liveness, Monoova PayID-as-signal). No government IDs collected.
- **Payments:** PayID (manual transfer simulation)
- **Testing:** Vitest + Testing Library

## Quick Start
```bash
npm install              # Frontend deps
cd functions && npm install && cd ..  # Backend deps
npm run dev              # Start Vite dev server (production mode)
npm run dev:demo         # Start in demo mode (mock data, no Firebase)
npm run build            # TypeScript check + Vite build
npm test                 # Run Vitest tests
cd functions && npm test # Run backend tests
```

## Project Structure
```
├── App.tsx                    # Root component, routing, auth state
├── index.tsx                  # Entry point
├── constants.ts               # Deposit %, travel fee, PayID config
├── types.ts                   # All TypeScript interfaces
├── components/
│   ├── BookingProcess.tsx     # 4-step booking wizard (main form)
│   ├── BookingCostCalculator.tsx  # Real-time cost summary sidebar
│   ├── BookingConfirmationDialog.tsx  # Final review before submit
│   ├── PayIDSimulationModal.tsx  # Deposit payment flow
│   ├── AdminDashboard.tsx     # Admin: bookings, vetting, DNS list
│   ├── PerformerDashboard.tsx # Performer: manage bookings
│   ├── ClientDashboard.tsx    # Client: track bookings
│   ├── EntertainerProfile.tsx # Public performer profile + services
│   ├── EntertainerCard.tsx    # Performer grid card
│   ├── verification/          # Self-hosted verification UI (SMS OTP, liveness)
│   ├── Header.tsx / Footer.tsx
│   ├── AgeGate.tsx            # 18+ age verification gate
│   └── ...
├── data/
│   ├── mockData.ts            # Services, performers, mock bookings
│   └── suburbs.ts             # Perth suburbs + CBD distances (travel fee)
├── utils/
│   └── bookingUtils.ts        # Cost calculation, duration, travel fee
├── services/
│   ├── api.ts                 # Frontend API layer (Firebase calls)
│   └── firebaseClient.ts      # Firebase client init
├── functions/src/
│   ├── index.ts               # All Cloud Functions exports
│   ├── twilio.ts              # Twilio client, SMS, WhatsApp, webhook verify
│   ├── verification/          # Self-hosted verification callables (customer + performer)
│   ├── admin/                 # Admin review queue + ID review callables
│   ├── triggers/              # Firestore triggers (cleanup, auto-promote trust)
│   ├── webhooks/              # External webhook handlers (Monoova PayID)
│   ├── integrations/          # Twilio + Monoova wrapper modules
│   ├── messaging/
│   │   ├── send.ts            # Multi-provider message dispatcher
│   │   ├── providers/twilio.ts
│   │   └── templates.ts       # SMS/WhatsApp message templates
│   ├── risk/                  # Risk scoring for vetting
│   ├── consent/               # Consent management
│   ├── dns/                   # Do Not Serve list logic
│   └── incidents/             # Incident reporting
└── tests/
    └── bookingUtils.test.ts   # Booking cost + travel fee tests
```

## Key Business Logic

### Booking Flow
1. Client fills 4-step form: Personal Details → Event Details → Services → Identity & Safety
2. Status flow: `pending_performer_acceptance` → `pending_vetting` → `deposit_pending` → `pending_deposit_confirmation` → `confirmed`
3. Deposit is 25% of total cost (non-refundable)
4. Verification: SMS OTP for all new customers; on-device liveness for premium tier; PayID name match acts as a third signal. Trusted (5+ successful bookings within 12 months) skip verification entirely.

### Pricing
- **Hourly services** (Waitressing): Lingerie $110/hr, Topless $160/hr, Nude $260/hr
- **Flat-rate services** (Strip Shows): $380–$1,000 per show
- **Promotional services**: $90–$120/hr
- **Travel fee:** $1/km for locations over 50km from Perth CBD (calculated from suburb selector)
- **Deposit:** 25% of total (including travel fee)

### Webhook Endpoints (Firebase Cloud Functions)
```
Twilio:   https://us-central1-studio-4495412314-3b1ce.cloudfunctions.net/twilioInboundWebhook
Monoova:  https://us-central1-studio-4495412314-3b1ce.cloudfunctions.net/monoovaWebhook
```
(Phase 2 introduces `australia-southeast1` deployments — see `docs/deployment-checklist.md`.)

## Environment Variables

### Frontend (.env.production)
```
VITE_APP_MODE=production
VITE_FIREBASE_API_KEY=AIzaSyDJXlPBCyGfFkHwYLb_fw-lyJ1CJRpQLz8
VITE_FIREBASE_AUTH_DOMAIN=studio-4495412314-3b1ce.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=studio-4495412314-3b1ce
VITE_FIREBASE_STORAGE_BUCKET=studio-4495412314-3b1ce.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=387015361731
VITE_FIREBASE_APP_ID=1:387015361731:web:1f9bf616548947cc3a4e76
VITE_PAY_ID_NAME=<PayID recipient name>
VITE_PAY_ID_EMAIL=<PayID email>
```

### Backend (Firebase Functions secrets)
```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
TWILIO_WHATSAPP_FROM
MONOOVA_API_KEY
MONOOVA_API_BASE
MONOOVA_WEBHOOK_SECRET
HASH_SECRET                  # 32-byte hex pepper for PII / DNS hashing
DNS_HASH_PEPPER              # legacy alias still read by dns/index.ts
```

## Commands Reference
```bash
npm run build              # Full build (typecheck + vite)
npm run dev                # Dev server (production mode)
npm run dev:demo           # Dev server (demo/mock mode)
npm test                   # Run frontend tests
npm run lint               # TypeScript type check
npm run deploy:production  # Build + deploy to Firebase hosting (production)
npm run deploy:demo        # Build + deploy to Firebase hosting (demo)
npm run functions:build    # Compile Cloud Functions
npm run functions:deploy   # Deploy Cloud Functions
```

## Code Style
- React functional components with TypeScript
- Tailwind CSS v4 for styling (dark theme, zinc + orange palette)
- Lucide React for icons
- No semicolons in some files (mixed — follow existing file style)
- Component files are PascalCase, utility files are camelCase
- Tests use Vitest with `describe`/`it`/`expect` pattern
- Keep changes minimal and focused — avoid over-engineering
