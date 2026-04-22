#!/bin/bash
# Flavor Entertainers — Firebase Setup Script
# Run this from the project root on your local machine.
#
# Prerequisites:
#   1. Node.js 20+ installed
#   2. Firebase Blaze plan activated (console.firebase.google.com → Upgrade)
#   3. Firestore database created in australia-southeast1 (Sydney)
#   4. Authentication enabled with Email/Password provider

set -e

PROJECT_ID="studio-4495412314-3b1ce"
REGION="australia-southeast1"

echo "=== Flavor Entertainers — Firebase Setup ==="
echo ""

# Step 1: Check Firebase CLI
if ! command -v firebase &> /dev/null; then
    echo "[1/6] Installing Firebase CLI..."
    npm install -g firebase-tools
else
    echo "[1/6] Firebase CLI already installed."
fi

# Step 2: Login
echo ""
echo "[2/6] Logging into Firebase..."
firebase login --no-localhost 2>/dev/null || firebase login

# Step 3: Select project
echo ""
echo "[3/6] Selecting project: $PROJECT_ID"
firebase use "$PROJECT_ID"

# Step 4: Deploy Firestore rules
echo ""
echo "[4/6] Deploying Firestore security rules..."
firebase deploy --only firestore:rules

# Step 5: Build and deploy Cloud Functions
echo ""
echo "[5/6] Building and deploying Cloud Functions..."
cd functions
npm install
npm run build
firebase deploy --only functions
cd ..

# Step 6: Deploy hosting (frontend)
echo ""
echo "[6/6] Building and deploying frontend..."
npm install
npm run build
firebase deploy --only hosting:production

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Go to https://console.firebase.google.com/u/0/project/$PROJECT_ID/authentication"
echo "     → Enable Email/Password sign-in"
echo "     → Create your admin account"
echo ""
echo "  2. Get your UID from the Authentication console, then run:"
echo "     firebase firestore:set admins/YOUR_UID '{\"email\":\"annaivky@gmail.com\"}'"
echo ""
echo "  3. Go to https://flavorentertainers.com → Log in → Click 'Seed Database'"
echo ""
echo "  4. Your site is live!"
