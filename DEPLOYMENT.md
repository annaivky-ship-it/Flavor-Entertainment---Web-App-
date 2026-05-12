# Deployment Instructions

## Prerequisites
1. [Firebase CLI](https://firebase.google.com/docs/cli) installed.
2. A Firebase project created in the console.
3. Firestore Database and Cloud Storage initialized in the console.

## Setup
```bash
# Login to Firebase
firebase login

# Initialize project in this directory
firebase init

# Select: Firestore, Storage, Functions, Rules
```

## Hosting

The Private Book is served from a single Firebase Hosting site:

| Site | Target | Purpose | Data Source |
|------|--------|---------|-------------|
| `studio-4495412314-3b1ce` | `production` | Live site (theprivatebook.au) | Firestore |

### Deploy
```bash
# Ensure .env.local has your Firebase credentials
npm run deploy:production
```

### Local Development
```bash
# Run against Firebase (needs .env.local with Firebase creds)
npm run dev

# Run with mock data only (no Firebase round-trips — handy for offline UI work)
npm run dev:demo
```

## Deploy Functions / Rules
```bash
firebase deploy --only firestore:rules
firebase deploy --only functions
```

## Critical Configuration
Ensure Cloud Functions environment variables are set for Twilio (if used in production):
```bash
firebase functions:config:set twilio.sid="YOUR_SID" twilio.token="YOUR_TOKEN"
```

## Failure Prevention
1. **Firestore Availability**: Ensure "Firestore" is enabled in the Firebase Console before first deployment.
2. **Component Errors**: Always use `getApps().length ? getApp() : initializeApp(config)` in browser code.
3. **Region**: Use `australia-southeast1` for Cloud Functions to minimize latency for WA clients.