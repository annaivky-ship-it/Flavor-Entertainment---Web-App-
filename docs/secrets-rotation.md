# Secrets rotation — HASH_SECRET

## What `HASH_SECRET` does

`HASH_SECRET` is the HMAC-SHA256 key used to derive privacy-preserving hashes
of customer phones, emails, and face embeddings for the Do-Not-Serve register.
It's defined in `functions/src/utils/shared.ts` via:

```ts
export const HASH_SECRET = defineSecret('HASH_SECRET');
```

## When to rotate

- **Quarterly** as routine hygiene (recommended)
- **Immediately** if the secret is suspected of leaking (e.g. checked into git, leaked via logs, employee with access leaves)
- **Before** the first production deploy if the staging value was used during testing

## Why rotation is non-trivial

Every entry in `doNotServeList` stores the hash of the matched value, not the raw value. If you change `HASH_SECRET`, every existing hash becomes stale — DNS lookups will silently miss matches. We can't recompute the hashes without the original raw values, and we deliberately don't store those.

That makes rotation a one-shot decision: rotate before the DNS register has real entries you care about.

## Rotation procedure

### Step 1 — Decide

Confirm with the team:
- Is the leak real, or just a precaution?
- How many `doNotServeList` entries does this branch need to invalidate?
- Are there active bookings depending on a specific match (e.g. an in-flight ban)?

### Step 2 — Generate the new secret

```bash
NEW_HASH_SECRET=$(openssl rand -hex 32)
echo "$NEW_HASH_SECRET"   # copy somewhere safe before continuing
```

### Step 3 — Snapshot the existing DNS register

```bash
# Use Firestore export (configured via functions/src/backup.ts) or a manual export
firebase firestore:export gs://<backup-bucket>/dns-rotation-$(date -u +%Y%m%dT%H%M%S)
```

If you also have raw values (e.g. you maintain them in a separate admin
spreadsheet or password manager because legal compliance requires audit
trail), keep them ready — you'll re-hash with the new secret in step 5.

### Step 4 — Set the new secret

```bash
firebase functions:secrets:set HASH_SECRET
# (paste the new value when prompted)
```

Redeploy any function that consumes `HASH_SECRET` (this re-pins the secret version):

```bash
firebase deploy --only functions
```

### Step 5 — Re-hash existing DNS entries

The migration script at `scripts/rotate-hash-secret.ts` (committed alongside this doc) rebuilds the register's hashes from the raw-values map you provide.

```bash
# Inputs:
#   - data/dns-raw-values.json (NOT committed): { entryId: { rawValue: "..." }, ... }
#   - the new HASH_SECRET as env var
HASH_SECRET=$NEW_HASH_SECRET node scripts/rotate-hash-secret.js
```

Run in dry-run mode first (`--dry-run`) to print the planned updates without writing.

> **As of this branch the DNS register is empty**, so the migration is a no-op. The script is wired up correctly for future use.

### Step 6 — Audit

After rotation, write an audit log entry:

```ts
await writeAudit({
  actorUid: '<your-admin-uid>',
  actorRole: 'admin',
  action: 'HASH_SECRET_ROTATED',
  meta: {
    rotatedAt: new Date().toISOString(),
    entriesRehashed: <count>,
  },
});
```

(Or run the script with `--write-audit` and it'll do this automatically.)

### Step 7 — Verify

- [ ] DNS entries with known raw values still match (manually book with one to confirm)
- [ ] `auditLog` contains the rotation entry
- [ ] Old secret revoked from any test environments

## What NOT to do

- ❌ Don't rotate `HASH_SECRET` if you can't recompute the hashes — you'll silently void the DNS register.
- ❌ Don't commit the secret to git, even into `.env.example`. Only the **name** goes into example files.
- ❌ Don't share via email/Slack — use 1Password / vault.
- ❌ Don't reuse a previous secret value.

## Related secrets

- `MONOOVA_WEBHOOK_SECRET`: rotation just requires updating both Firebase and Monoova merchant dashboard simultaneously.
- `TWILIO_AUTH_TOKEN`: rotate via Twilio console; the new value can be set with `firebase functions:secrets:set` and the old one revoked at Twilio.
- `DNS_HASH_PEPPER`: legacy pepper used by `functions/src/dns/index.ts:sha256`. Migrating away from it (consolidating into `HASH_SECRET`) is a future cleanup.
