# Cloud Functions Environment Variables

All environment variables should be set via Firebase secrets or runtime config:
```bash
firebase functions:secrets:set VARIABLE_NAME
```

## Required — Twilio SMS/WhatsApp (Primary messaging provider)

| Variable | Description | Example |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio Account SID (messaging/providers/twilio.ts) | `AC...` |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token (messaging/providers/twilio.ts) | `...` |
| `TWILIO_FROM_NUMBER` | Twilio SMS sender phone number (E.164) | `+61400000000` |
| `TWILIO_WHATSAPP_FROM` | Twilio WhatsApp sender number | `+14155238886` |

## Required — Twilio Legacy (notificationsWorker, inbound webhook)

| Variable | Description | Example |
|---|---|---|
| `TWILIO_SID` | Twilio Account SID (twilio.ts legacy client) | `AC...` |
| `TWILIO_TOKEN` | Twilio Auth Token (twilio.ts legacy client + webhook signature verification) | `...` |
| `TWILIO_SMS_FROM` | Legacy SMS sender number (E.164) | `+61400000000` |

> Note: `TWILIO_SID`/`TWILIO_TOKEN` are used by the legacy `notificationsWorker` and `twilioInboundWebhook`. The newer messaging system in `messaging/providers/twilio.ts` uses `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`.

## Required — ClickSend (Alternative SMS provider)

| Variable | Description | Example |
|---|---|---|
| `CLICKSEND_USERNAME` | ClickSend API username | `user@example.com` |
| `CLICKSEND_API_KEY` | ClickSend API key | `...` |

## Optional — MessageMedia (Fallback SMS provider)

| Variable | Description | Example |
|---|---|---|
| `MESSAGEMEDIA_API_KEY` | MessageMedia API key | `...` |
| `MESSAGEMEDIA_API_SECRET` | MessageMedia API secret | `...` |

## Required — Didit KYC

| Variable | Description | Example |
|---|---|---|
| `DIDIT_API_KEY` | Didit verification API key | `...` |
| `DIDIT_API_SECRET` | Didit API secret | `...` |
| `DIDIT_WEBHOOK_SECRET` | Didit webhook signature secret | `...` |

## Required — Google Gemini AI (Risk analysis)

| Variable | Description | Example |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API key for vetting risk analysis | `AIza...` |

## Required — Security

| Variable | Description | Example |
|---|---|---|
| `DNS_HASH_PEPPER` | Secret pepper for one-way hashing of client PII in DNS system | Random 32+ char string |

## Optional — Messaging Behaviour

| Variable | Description | Default |
|---|---|---|
| `MESSAGING_DRY_RUN` | Set to `"true"` to log SMS without actually sending | `false` |

## Firestore Settings (not env vars)

The following are configured via the `settings` Firestore collection, not env vars:

- `settings/messaging.providerPrimary` — Primary SMS provider (`clicksend`, `twilio`, or `messagemedia`)
- `settings/messaging.providerFallback` — Fallback SMS provider
- `settings/messaging.adminNotifyNumbers` — Array of admin phone numbers for notifications
- `settings/payments.auto_confirm_enabled` — Enable automatic payment confirmation
- `settings/payments.auto_confirm_delay_minutes` — Delay before auto-confirming payments
