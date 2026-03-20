-- Flavor Entertainers - Database Schema Reference
-- Note: This application uses Firebase Firestore (NoSQL).
-- See SCHEMA.md for the complete Firestore collection definitions.
-- This file is provided as a relational reference for documentation purposes.

CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT CHECK(role IN ('admin', 'performer', 'client')) NOT NULL,
  performer_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS performers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  tagline TEXT,
  bio TEXT,
  photo_url TEXT,
  status TEXT CHECK(status IN ('available', 'busy', 'offline')) DEFAULT 'offline',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  performer_id INTEGER NOT NULL REFERENCES performers(id),
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  client_phone TEXT,
  event_date DATE NOT NULL,
  event_time TIME NOT NULL,
  status TEXT CHECK(status IN (
    'pending_performer_acceptance', 'pending_vetting', 'deposit_pending',
    'pending_deposit_confirmation', 'confirmed', 'en_route', 'arrived',
    'in_progress', 'completed', 'cancelled', 'rejected'
  )) DEFAULT 'pending_performer_acceptance',
  total_cost DECIMAL(10,2),
  deposit_amount DECIMAL(10,2),
  slot_lock TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blacklist (
  id TEXT PRIMARY KEY,
  email TEXT,
  phone TEXT,
  reason TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  user_id TEXT,
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS communications (
  id TEXT PRIMARY KEY,
  booking_id TEXT REFERENCES bookings(id),
  sender_id TEXT,
  recipient_id TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
