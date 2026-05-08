# Rebrand Audit — Flavor Entertainers → The Private Book

Generated: Phase 0 of the rebrand effort.
Branch: `rebrand/the-private-book` (off `origin/main`).

## Audit method

```
rg -i "flavor entertainers|flavor-entertainers|flavorentertainers|perth exotic entertainers|perth-exotic-entertainers|perthexoticentertainers" \
   --hidden -g '!node_modules' -g '!dist' -g '!build' -g '!.firebase' -g '!.vercel' -g '!.git'
```

## Brand-string occurrences (22 files, 47 matches)

### Customer-facing copy / UI
| File | Lines | Notes |
|---|---|---|
| `index.html` | 11, 14, 17, 20 | `<title>`, `og:title`, `og:url`, `twitter:title` |
| `components/Footer.tsx` | 32, 35, 38, 89 | IG link, mailto, copyright |
| `components/FAQ.tsx` | 57 | "Everything you need to know about Flavor Entertainers" |
| `components/Login.tsx` | 140 | Demo password hint references `firstname@flavorentertainers.com` |
| `components/PrivacyPolicy.tsx` | 22 | Body copy |
| `components/TermsOfService.tsx` | 22, 25, 48 | Body copy |

### Hosting / build / package metadata
| File | Lines | Notes |
|---|---|---|
| `vite.config.ts` | 21 | PWA manifest `name` |
| `firebase.json` | 44 | `oAuthBrandDisplayName` |
| `functions/package.json` | 2 | Package name `flavor-entertainers-functions` |
| `functions/package-lock.json` | 2, 7 | Mirrors above (regenerated on lock-file refresh) |
| `public/robots.txt` | 6 | `Sitemap:` URL |
| `public/sitemap.xml` | 4, 9 | Page URLs |
| `.env.production` | 17, 18 | Commented-out PayID examples |
| `services/firebaseClient.ts` | 12 | Comment header |

### Backend / Cloud Functions
| File | Lines | Notes |
|---|---|---|
| `functions/src/index.ts` | 567, 577, 587, 790 | SMS body strings |
| `functions/src/messaging/templates.ts` | 17 | `const business = "Flavor Entertainers"` |
| `functions/src/didit.ts` | 11 | `DIDIT_APP_URL` default |

### Docs / scripts
| File | Lines | Notes |
|---|---|---|
| `CLAUDE.md` | 1, 6, 120 | Project overview |
| `SCHEMA.md` | 1 | Heading |
| `DEVELOPER_HANDOFF.md` | 1, 11, 126 | PayID handoff doc |
| `PRESENTATION_OVERVIEW.md` | 1, 3, 5, 13, 85, 96, 116 | Sales pitch deck (7 occurrences) |
| `scripts/setup-firebase.sh` | 2, 16, 69 | Setup script comments + echo |

## Old colour-token / typography audit

The brief named `champagne`, `rose`, `charcoal`, `off-white` as old brand tokens to swap out. **None of those exist in this codebase.** What's actually here:

- **CSS variables** in `index.css`: `--color-primary: #F97316` (orange) and shades. These ARE the brand-accent tokens.
- **Tailwind stock classes**: heavy use of `text-orange-*`, `bg-orange-*`, `border-orange-*`, `from-orange-*` etc. across components (~80+ files). These are Tailwind's stock orange palette, not custom tokens.
- **No** `tailwind.config.ts` / `tailwind.config.js` — this project is on **Tailwind v4** (`@import "tailwindcss"` at the top of `index.css`). Configuration moved into CSS via `@theme` blocks.
- **Fonts** declared in `index.css`: `Inter` (body), `Poppins` (headings), `Anton` (logo main), `Special Elite` (logo sub). The new spec wants Jost / Cormorant Garamond / DM Mono.

## Rebrand approach decisions (recorded for the summary)

1. **Tailwind v4 config**: will add a `@theme` block at the top of `index.css` rather than creating `tailwind.config.ts` (the brief assumed v3). New tokens (`magenta`, `magenta-soft`, `grey`, `grey-mid`) will be registered there.
2. **Orange → magenta classname strategy**: instead of mass-renaming ~80 files of `text-orange-*` → `text-magenta`, override Tailwind's stock `--color-orange-*` in the `@theme` block to magenta values. Also register the proper `magenta` / `magenta-soft` tokens for new code. **Result**: zero classname churn, full visual swap. Documented as a pragmatic deviation; future cleanup can rename at leisure.
3. **CSS custom properties** in `:root` (`--color-primary` etc.) will be updated to magenta hex values too, so the `.btn-primary` / `.card-base` rules pick up the new accent.
4. **Fonts**: replace the four CSS-`@import` font-family declarations in `index.css` with the Jost / Cormorant Garamond / DM Mono families. Add the Google Fonts `<link>` block to `index.html` per the brief.

## Asset blocker

**`~/rebrand-package/` does not exist on this machine.** Phase 1 specified that source SVGs (`wordmark.svg`, `monogram.svg`, `monogram-favicon.svg`) and `brand.md` would be supplied at that path; they're not.

Mitigations:
- Phase 1 will create `public/brand/` and write **placeholder** SVGs (text-only "THE PRIVATE BOOK" wordmark + simple "PB" monogram) so layout/imports work and the build passes. The user can drop the real SVGs in at the same paths without code changes.
- Favicon binaries (PNG/ICO multi-res) cannot be generated without a source raster or working `sharp`/`imagemagick` to convert from SVG. Phase 1 will write a placeholder `monogram-favicon.svg` and reference it from `index.html` via `<link rel="icon" type="image/svg+xml" href="/brand/monogram-favicon.svg">` — modern browsers support SVG favicons. Legacy `.ico` will be flagged in the summary as a "manual next step".
- `BRAND.md` will be written from scratch using the design specs given in the brief itself (palette + fonts + tone), since the source `~/rebrand-package/brand.md` is unavailable.

These deviations will all be re-stated in the final `REBRAND_SUMMARY.md`.

## Files NOT in scope

Per the brief's failure-mode rules, the rebrand will NOT touch:
- Firebase project ID `studio-4495412314-3b1ce` (in `firebase.json`, function URLs, env vars)
- Cloud Function names (deployed live)
- Firestore collection names
- Vercel project ID
- Env var names (`VITE_FIREBASE_*`, `TWILIO_*`, `DIDIT_*`, `MONOOVA_*`)
- Twilio numbers, Didit KYC config, PayID config beyond brand-name display strings
- `.env`, `.env.local`, secrets files
- `node_modules`, `dist`, `build`, `.firebase`, `.vercel`
- Booking flow logic, auth, routing, business logic
