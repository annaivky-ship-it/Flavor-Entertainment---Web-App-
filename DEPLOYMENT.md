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

## Multi-Site Hosting

The project is configured with two Firebase Hosting sites:

| Site | Target | Purpose | Data Source |
|------|--------|---------|-------------|
| `studio-4495412314-3b1ce` | `production` | Live site with real Firebase backend | Firestore |
| `flavor-demo` | `demo` | Showcase site with mock data | Mock data (no Firebase needed) |

### Deploy Demo Site
```bash
npm run deploy:demo
```

### Deploy Production Site
```bash
# Ensure .env.local has your Firebase credentials
npm run deploy:production
```

### Deploy Both Sites
```bash
npm run deploy:all
```

### Local Development
```bash
# Run in demo mode (mock data)
npm run dev:demo

# Run in production mode (needs .env.local with Firebase creds)
npm run dev
```

### Firebase Hosting Setup
Before first deploy, create the demo hosting site in the Firebase Console:
1. Go to Firebase Console > Hosting
2. Click "Add another site"
3. Enter site ID: `flavor-demo`

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