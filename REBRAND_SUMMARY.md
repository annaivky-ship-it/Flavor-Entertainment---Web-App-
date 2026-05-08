# Rebrand Summary — Flavor Entertainers → The Private Book

## Branch
`rebrand/the-private-book` (off `origin/main`).

## Commits
6 commits in the rebrand series:

| # | SHA | Message |
|---|---|---|
| 1 | `516481f` | chore(brand): audit existing brand references |
| 2 | `e183bdd` | chore(brand): add new logo, favicon, and brand spec |
| 3 | `834c8e4` | chore(brand): swap colour palette and typography tokens |
| 4 | `cc4b40e` | chore(brand): update meta tags, manifest, and package metadata |
| 5 | `fcef318` | chore(brand): rebrand components, copy, and logo references |
| 6 | `3266a05` | chore(brand): verification and cleanup |

## Diff size
**36 files changed, 229 insertions(+), 188 deletions(-)** vs. `main`.

## What changed
- **Logo lockups** in `Header.tsx`, `Footer.tsx`, `AgeGate.tsx`, `PresentationVideo.tsx` swapped from `FLAV🍑R / entertainers` to `the / PRIVATE BOOK` typography stack (Jost 500, `tracking-[0.18em]`).
- **Brand assets** placed at `public/brand/{wordmark,monogram,monogram-favicon}.svg`. Existing `public/pwa-{192,512}x{192,512}.svg` (peach emojis) replaced with monogram PNG-equivalents in SVG form.
- **Tailwind v4 `@theme`** block in `index.css` registers `magenta`, `magenta-soft`, `grey`, `grey-mid`, `tracking-brand`, `tracking-tag`, plus `font-display`/`font-serif`/`font-mono`/`font-sans` aliases.
- **CSS custom props** in `:root` (`--color-bg`, `--color-primary`, etc.) flipped from zinc/orange to black/magenta.
- **Fonts**: Inter / Anton / Poppins / Special Elite removed; Jost / Cormorant Garamond / DM Mono added via Google Fonts `<link>` in `index.html`.
- **Meta tags + PWA manifest** (managed by `vite-plugin-pwa` in `vite.config.ts`) updated: title, description, OG, Twitter, theme-color (`#000000`), name (`The Private Book`), short_name (`Private Book`).
- **Customer-facing copy** in `FAQ.tsx`, `Login.tsx`, `PrivacyPolicy.tsx`, `TermsOfService.tsx`, `PerformerOnboarding.tsx`, `Footer.tsx` updated.
- **Backend SMS/WhatsApp templates** in `functions/src/index.ts`, `functions/src/messaging/templates.ts`: sender brand prefix `[Flavor Entertainers]` → `[The Private Book]`.
- **URLs** in `firebase.json` (`oAuthBrandDisplayName`), `functions/src/didit.ts` (`DIDIT_APP_URL` default), `public/robots.txt`, `public/sitemap.xml`, `.env.production` (commented examples), `scripts/setup-firebase.sh`, `services/firebaseClient.ts` (header comment), all docs (`CLAUDE.md`, `SCHEMA.md`, `DEVELOPER_HANDOFF.md`, `PRESENTATION_OVERVIEW.md`) updated to `theprivatebook.au`.
- **Package metadata**: `package.json` `"name": "the-private-book"`, `functions/package.json` and `functions/package-lock.json` `"name": "the-private-book-functions"`.
- **One stray peach emoji** in `App.tsx:442` (admin notification "🍑 Performer:") swapped to `👥` — it was decorative residue from the old wordmark, not a contextual emoji.

## Preserved by design (not changed)

| Item | Reason |
|---|---|
| Firebase project ID `studio-4495412314-3b1ce` | Renaming requires creating a new Firebase project + data migration. Out of scope. |
| Cloud Function names (`scheduledBookingExpiry`, `notificationOutboxWorker`, `diditKycWebhook`, etc.) | Renaming breaks live deployments and webhook URLs. |
| Firestore collection names (`bookings`, `performers`, `audit_logs`, `notification_outbox`, `booking_slots`, etc.) | Renaming requires a migration job, out of scope. |
| Vercel project ID `prj_skeJs9EfIc4IfnHDWx1kY7NOv30b` | Infra ID, not branding. |
| Env var names (`VITE_FIREBASE_*`, `TWILIO_*`, `DIDIT_*`, `MONOOVA_*`, `STORAGE_BUCKET`, etc.) | Infra contracts. Only their **values** changed where the value was a brand display string. |
| Twilio numbers, Didit KYC config, PayID setup | Infra/credential bindings, not branding. |
| Booking flow logic, auth, routing, business logic | Out of rebrand scope. |
| `Perth` references in service-area copy and suburb data | Functional, not brand — the platform still serves Perth + WA geographically. |
| Tailwind classnames `text-orange-*`, `bg-orange-*`, etc. (~80+ files) | Not mass-renamed to `text-magenta`. Instead, `--color-orange-*` is overridden in the Tailwind v4 `@theme` block to magenta hex values, so existing classnames render in the new accent without a sweeping refactor. Future cleanup can rename at leisure. |

## Flags / warnings

### 1. Asset package missing
`~/rebrand-package/assets/` did not exist on this machine, so the three SVG files were generated as **typographic placeholders** (text-only "the / PRIVATE BOOK" wordmark, "PB" monogram). They render correctly and the build passes, but they are not the designer-supplied logos.

**Action**: drop the real `wordmark.svg`, `monogram.svg`, `monogram-favicon.svg` into `public/brand/` (overwriting the placeholders). No code changes required.

### 2. Favicon binaries not generated
Neither `sharp` nor `imagemagick` was available, and per the brand-rebrand scope rules I avoided installing new dependencies. Modern browsers use the SVG favicon natively (`<link rel="icon" type="image/svg+xml" href="/brand/monogram-favicon.svg">`). However:
- Legacy IE/older Safari versions need `.ico` and `.png` fallbacks.
- Apple home-screen icon prefers a 180×180 PNG.

**Action**: once the real SVGs are in place, run a one-off conversion (`sharp` or design-tool export) to produce `favicon.ico`, `apple-touch-icon.png` (180×180), `icon-{192,512}.png`, `icon-maskable-512.png`. Drop them in `public/` and add corresponding `<link>` tags to `index.html`.

### 3. OG share image
The OG `og:image` is currently set to no value (the brief said the og:image should be 1200×630 PNG; the placeholder SVG won't render reliably on Slack/Twitter/iMessage previews).

**Action**: render a 1200×630 PNG version of the wordmark on black. Drop at `public/og-image.png` and add `<meta property="og:image" content="https://theprivatebook.au/og-image.png">` (and `twitter:image`) to `index.html`.

### 4. `BRAND.md` is synthesised
The original `~/rebrand-package/brand.md` was unavailable, so the committed `BRAND.md` was written from the design specs in the rebrand prompt itself. It captures palette, typography, voice rules, and don'ts, but a designer-supplied version may have additional spec (imagery rules, illustration system, motion system) that's not yet documented.

**Action**: replace `BRAND.md` with the canonical version when supplied.

### 5. Manifest delivery
There is no `public/manifest.json` file in the repo — the manifest is **generated at build time** by `vite-plugin-pwa` from `vite.config.ts`. The brief requested a static `manifest.json`; this codebase uses the plugin pattern instead. The generated manifest at `dist/manifest.webmanifest` matches the spec (name, short_name, theme/background black, icons).

## Manual next steps

1. **Register `theprivatebook.au`** domain via auDA-accredited registrar.
2. **File trademark search** at IP Australia for "The Private Book" — classes 41 (entertainment services) and 45 (introduction/personal services).
3. **Claim social handles** `@theprivatebook` (or `@theprivatebook.au`) on Instagram, TikTok, X, Threads.
4. **Firebase Hosting custom domain** — add `theprivatebook.au` and `www.theprivatebook.au` in the Firebase console; update any DNS verification records.
5. **Vercel project alias** — point `prj_skeJs9EfIc4IfnHDWx1kY7NOv30b` at the new domain via Vercel dashboard.
6. **Twilio sender ID display name** — update the alphanumeric sender ID (and the Australian alphanumeric sender registration) from "FLAVOR" to "PRIVATBK" or similar (max 11 chars, A-Z/0-9 only).
7. **Didit KYC company display name** — update the verification flow's company branding in the Didit dashboard so KYC-verified users see "The Private Book" on the consent screen.
8. **Generate proper OG share image** — see flag #3 above.
9. **Drop real logo SVGs** into `public/brand/` — see flag #1 above.
10. **Generate favicon binaries** for legacy browser support — see flag #2 above.
11. **PayID display name** — update the PayID account display name and any printable transfer instructions referencing the old brand.
12. **Update presentation deck** (`PRESENTATION_OVERVIEW.md`) — strings have been swapped, but the narrative + visual examples may still describe "Flavor"-era messaging tone. Worth a copywriter review pass.

## Push instruction

This branch has **NOT** been pushed to remote (per the rebrand brief's failure-mode rules). To publish for review:

```
git push origin rebrand/the-private-book
```

Then open a pull request against `main` for review **before** merging. Recommended reviewers: design lead (logo + colour spot-check), product lead (copy + voice), and one engineer (build / type-check / asset paths).

## Done condition checklist

- [x] `rg -i "flavor entertainers|perth exotic entertainers|flavorentertainers"` returns no matches
- [x] `npm run build` succeeds (verified on commit `fcef318`)
- [ ] `npm run dev` visual spot-check — **skipped**: this rebrand was executed in a headless environment. Browser-based verification is part of the manual review pass.
- [x] Six commits exist on `rebrand/the-private-book`
- [x] `REBRAND_SUMMARY.md` exists at repo root
