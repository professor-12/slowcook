# Design system: core
Every value is a token. Niche packs override specific tokens. (QB) = from QuickBite; (proposed) = set by this pack.

## 1. Color
Rules: 60-30-10 (neutral / secondary surfaces and text / accent). One accent hue; extra hues only for semantic states or data. Neutrals tinted toward the brand hue. Use 12-step scales by role (Radix): 1–2 page backgrounds, 3–5 component backgrounds (normal/hover/pressed), 6–8 borders (subtle/interactive/strong or focus), 9–10 solid fills (normal/hover), 11–12 text (low/high contrast).

Core neutrals (proposed, warm):
| Token | Light | Dark |
|---|---|---|
| --background | #FAFAF7 | #11100E |
| --surface | #FFFFFF | #1A1916 |
| --surface-2 | #F2F1EC | #23211D |
| --border | #E4E2DA | #34312B |
| --border-strong | #CFCBC0 | #4A463E |
| --foreground | #1A1814 | #F4F2EC |
| --muted-foreground | #5E5A52 | #A9A498 |

Accent: generate a 12-step scale from the brand hue; --primary = step 9, hover = step 10, --accent-subtle = step 3, --accent-text = step 11, --ring = step 8. If no brand color exists (proposed): ink #1A1814 buttons with orange signal #E4572E. Avoid hue 260–300 unless it is the brand.

Semantic: success #15803D / #4ADE80, warning #B45309 / #FBBF24, destructive oklch(0.577 0.245 27.325) (shadcn default) / #F87171, info #1D4ED8 / #60A5FA.

Palette workflow:
1. Explore in Coolors (coolors.co): lock the brand hue, generate, keep palettes with one saturated color and near-neutrals.
2. Preview on a live layout in Realtime Colors (realtimecolors.com).
3. Build scales with Radix custom colors (radix-ui.com/colors/custom) or the Tailwind v4 palette; convert with oklch.com.
4. Optional: Huemint, Adobe Color.
5. Check every text pair (WebAIM or DevTools contrast picker).
6. Write into globals.css (OKLCH or hex).

Dark mode: same token names under .dark (next-themes). Background 8–12% lightness, not pure black (except gaming). Lower accent chroma slightly. Elevation via lighter surfaces and borders, not shadows. Ship it only if PRD.md asks.

## 2. Typography
Sources: Google Fonts (open licences); Fontshare (Indian Type Foundry, free for personal and commercial use: Satoshi, General Sans, Cabinet Grotesk, Clash Display, Switzer, Chillax); Vercel Geist. Self-host woff2, subset, preload only the above-the-fold font, font-display: swap, size-adjusted fallbacks (next/font).

| Pairing | Display | Body | When |
|---|---|---|---|
| A (default) | General Sans 600 | Satoshi 400/500 | Most landing pages |
| B (editorial) | Fraunces or Instrument Serif | Satoshi | Food, lifestyle, storytelling |
| C (product) | Geist Sans 600 | Geist Sans + Geist Mono | SaaS, dev tools |

Scale (proposed, base 16px):
| Token | Size | Line height | Tracking |
|---|---|---|---|
| xs | 12px | 1.5 | 0.01em |
| sm | 14px | 1.5 | 0 |
| base | 16px | 1.6 | 0 |
| lg | 18px | 1.6 | 0 |
| xl | 20px | 1.5 | -0.005em |
| 2xl | 24px | 1.35 | -0.01em |
| 3xl | clamp(1.75rem, 1.4rem + 1.2vw, 2.25rem) | 1.2 | -0.015em |
| 4xl | clamp(2.25rem, 1.7rem + 2vw, 3rem) | 1.1 | -0.02em |
| 5xl | clamp(2.75rem, 1.9rem + 3.2vw, 4.5rem) | 1.05 | -0.025em |
| display | clamp(3.25rem, 2rem + 5vw, 6.5rem) | 0.95 | -0.035em |
Body ≥ 16px on mobile; 60–75ch line length; eyebrows xs/500/0.08em uppercase; tabular-nums for numbers; text-wrap: balance on headings.

## 3. Spacing, grid, breakpoints
Scale: 0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 160px. Inside components 4–24; between blocks 24–48; section padding 64 (mobile) / 96 (tablet) / 128–160 (desktop). Space inside a group is at most half the space between groups.
Containers: 1280 wide, 1120 default, 720 prose; side padding 20/32/48. Grid 4/8/12 columns, gutters 16/24/32. Breakpoints: Tailwind defaults (640, 768, 1024, 1280, 1536).

## 4. Shape and elevation
Radius personalities (pick one): sharp 2/4/6/8px; soft (default) 6/10/16/24px; round 10/16/24/32px; plus full. Inner radius = outer radius − padding.
Shadows (ink-tinted):
--shadow-xs: 0 1px 2px rgb(26 24 20 / 0.06)
--shadow-sm: 0 1px 3px rgb(26 24 20 / 0.08), 0 1px 2px rgb(26 24 20 / 0.04)
--shadow-md: 0 4px 12px -2px rgb(26 24 20 / 0.10), 0 2px 4px -2px rgb(26 24 20 / 0.06)
--shadow-lg: 0 12px 32px -8px rgb(26 24 20 / 0.16), 0 4px 8px -4px rgb(26 24 20 / 0.06)
Use a border or a shadow on a card, not both at full strength. Z-index: sticky 100, overlay 1000, modal 1100, toast 1200.

## 5. Icons
Default Lucide (24px grid, 2px stroke, ISC). Sizes 16/20/24. Tabler (MIT, same grid and stroke) when Lucide lacks a glyph. Phosphor (six weights, 256 grid) only as the sole library. Brand logos from official SVGs or Simple Icons. Icon-only buttons get aria-label and a 44px hit area. No emoji in UI.

## 6. Imagery and illustration
Priority: real photography > product UI > one illustration family. Editorial photos, natural light, consistent grading, descriptive alt (Ontiver, QuickBite). Use only owned or licensed images; Pinterest is for direction only. unDraw (undraw.co) for SVG spot illustrations, recolored to --primary; one style per site. AVIF/WebP, hero ≤ 200KB, explicit aspect-ratio. Ambient video: muted, small, with pause and poster (Vectura). Narrative video: play button and captions (Ontiver).

## 7. Components and states
All interactive components define default, hover, focus-visible, active, disabled, loading (and selected/error/success where relevant).
- Button: heights 36/44/52; padding-x 16/20/24; primary, secondary (surface + border), ghost; focus ring 2px --ring, 2px offset; press scale 0.98.
- Input: height 44, label above, helper below, error text + icon in --destructive.
- Card: padding 24 (20 mobile), radius lg, one click target.
- Nav: 64–72px, sticky; mobile Sheet with 48px rows; mega-menu items get one-line descriptions.
- Accordion: shadcn, 240ms. Badge: real states only. Toast: 4–6s, pausable. Dialog/Sheet: focus trap, Esc, focus return.

## 8. Tokens as code (Tailwind v4)
See the original standard for the full Tailwind v4 `globals.css` example (tokens under :root and .dark, mapped through `@theme inline`, with the prefers-reduced-motion block). SlowCook's implementation is `apps/web/app/globals.css`.
