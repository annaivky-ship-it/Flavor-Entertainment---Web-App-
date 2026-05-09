# The Private Book — Brand Spec

> Synthesised from the rebrand prompt at Phase 1. The original `~/rebrand-package/brand.md` was not available at the time this file was written. Treat this as the authoritative spec until a designer-supplied version replaces it.

## Voice

- **Tone**: discreet, confident, by-invitation. Never crass, never desperate. We don't shout — we name-drop quietly.
- **Tagline**: *By invitation only.*
- **Avoid**: emoji, exclamation marks, "premier", "best", "elite" — these read as protest-too-much. Let the typography do the talking.

## Logo system

| Asset | File | Usage |
|---|---|---|
| Wordmark | `public/brand/wordmark.svg` | Auth screens, footer, large hero placements |
| Monogram | `public/brand/monogram.svg` | Header, side-nav mark, app icon, loading splash, favicons (large) |
| Favicon source | `public/brand/monogram-favicon.svg` | Browser tab icon (SVG-native; PWA fallbacks live at `/pwa-{192,512}.svg`) |

**Placement rules**:
- Always on solid black (`#000000`) when possible.
- Minimum clear-space: one cap-height of the wordmark in every direction.
- Never tint, recolour, drop-shadow, or rotate. Never place on a photographic background without a black scrim.

## Colour palette

| Token | Hex | Use |
|---|---|---|
| `black` | `#000000` | Primary background |
| `white` | `#FFFFFF` | Primary text on dark, surface highlights |
| `magenta` | `#FF0080` | Brand accent — primary CTA, active states, links |
| `magenta-soft` | `#FF66B3` | Hover states, subtle highlights, illustrations |
| `grey` | `#1A1A1A` | Card surfaces, secondary backgrounds |
| `grey-mid` | `#2A2A2A` | Borders, dividers, muted surfaces |

**Accent rules**:
- Magenta is rare and deliberate. One primary CTA per screen.
- Never two magenta elements next to each other unless they form one composition (e.g., underline beneath a heading).
- Body copy is white-on-black or `#A1A1AA`-on-black; magenta is for action, not for body.

## Typography

| Family | Weights | Use |
|---|---|---|
| **Pinyon Script** | 400 | Calligraphic *The* in the wordmark lockup. **Logo only** — never in body or UI copy. |
| **Playfair Display** | 900 (Black) | High-contrast caps for *PRIVATE BOOK* in the wordmark and major editorial headings. |
| **Jost** | 200, 300, 400, 500 | Display + UI sans-serif. Headings, navigation, buttons, body, the *PERTH* tagline under the wordmark. |
| **Cormorant Garamond** | 300, 400 (also italics 300, 400) | Pull quotes, hero subtitles, editorial moments outside the lockup. |
| **DM Mono** | 300, 400, 500 | Code, references, microscopic UI labels (e.g., booking IDs). |

**CSS classes** (defined in `index.css`):
- `.font-logo-script` — Pinyon Script for *The*
- `.font-logo-main` — Playfair Display 900 for *PRIVATE BOOK*
- `.font-logo-sub` — Jost 300 with `letter-spacing: 0.35em` for *PERTH* / *BY INVITATION ONLY*

**Wordmark composition** (mirrors `public/brand/wordmark.svg`):
1. *The* — Pinyon Script, larger than the caps line. Slight overlap with the line below (`-mb-2` to `-mb-4`).
2. *PRIVATE BOOK* — Playfair Display 900, all-caps, `letter-spacing: 0.04em`.
3. *PERTH* — Jost 300, smaller, `letter-spacing: 0.35em`, sits below the caps line.

**Type-style anchors** (outside the wordmark):
- Section heading: Jost 400, `tracking-tag`, all-caps.
- Body: Jost 300, regular tracking, line-height 1.6.
- Pull quote: Cormorant Garamond italic 300.

## Imagery (forward-looking, not yet in code)

- Black-and-white photography only, with one selectively coloured magenta detail when used for hero composition.
- Grain, soft shadow, low-contrast — not glossy.

## Don'ts

- Don't use orange, gold, "champagne", or rose-gold anywhere. The previous brand was orange-on-zinc; that palette is retired.
- Don't use Inter, Anton, Poppins, Special Elite, or any of the previous brand fonts.
- Don't add gradients to text. Solid colour only.
- Don't put the monogram on white — only on black or magenta.

## Domain & social (forward-looking, manual steps)

| Item | Status |
|---|---|
| Domain `theprivatebook.au` | Not yet registered — manual step |
| `@theprivatebook` on IG / TikTok / X | Not yet claimed — manual step |
| OG share image (1200×630 PNG) | Not yet rendered — current `wordmark.svg` won't render reliably on social |
| Trademark search (IP Australia, classes 41 + 45) | Recommended before public launch |
