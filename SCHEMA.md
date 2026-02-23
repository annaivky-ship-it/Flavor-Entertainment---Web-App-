# Firestore Database Schema - Flavor Entertainers

## /users
- `uid`: string (doc ID)
- `email`: string
- `role`: "admin" | "performer" | "client"
- `performerId`: number (optional, linked to /performers)
- `created_at`: timestamp

## /performers
- `id`: number (doc ID as string)
- `name`: string
- `tagline`: string
- `bio`: string
- `photo_url`: string
- `service_ids`: string[]
- `service_areas`: string[]
- `status`: "available" | "busy" | "offline"
- `created_at`: timestamp

## /availability
- `performerId`: string (doc ID)
- `schedule`: map (days of week to time ranges)
- `last_updated`: timestamp

## /vettingApplications
- `id`: string (doc ID)
- `clientEmail`: string
- `fullName`: string
- `idDocumentPath`: string (Cloud Storage ref)
- `status`: "pending" | "approved" | "rejected"
- `created_at`: timestamp

## /bookings
- `id`: string (doc ID)
- `performer_id`: number
- `client_name`: string
- `client_email`: string
- `client_phone`: string
- `event_date`: date string
- `event_time`: time string
- `status`: "pending_performer_acceptance" | "pending_vetting" | "deposit_pending" | "confirmed" | "rejected"
- `total_cost`: number
- `deposit_amount`: number
- `slotLock`: string (unique constraint: `${pId}_${date}_${time}`)
- `created_at`: timestamp

## /blacklist
- `id`: string (hashed email for privacy)
- `email`: string (optional, hashed preferred)
- `phone`: string
- `reason`: string
- `created_at`: timestamp

## /auditLogs
- `id`: string (doc ID)
- `action`: string
- `userId`: string
- `timestamp`: timestamp
- `details`: map

## /messages
- `id`: string (doc ID)
- `booking_id`: string
- `senderId`: string
- `recipientId`: string
- `text`: string
- `timestamp`: timestamp