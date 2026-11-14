# QA report: SlowCook web app, 2026-11-12

Checklist: `core/qa-checklist.md`. Build: `apps/web` static export, served locally by `node scripts/serve-web.ts`.

**Tools**
- `node scripts/check-web.ts` (headless Chromium 1248, axe-core 4.14). Report: `results/web-check-2026-11-12T08-39-12-309Z.json`; screenshots in `verification/web-check/`.
- `node scripts/lighthouse.ts` (Lighthouse 13.6, Chromium 1228, mobile defaults). Report: `results/lighthouse-2026-11-12T08-40-18-686Z.json`.

**Re-check 2026-11-14** (creator-lock fix: new factory, timing-mode toggle on create, lock and vest rows and a "Demo timings" badge on the launch page): `node scripts/check-web.ts` on the local build gave 5/5 pages clean, axe 0 violations, 0 targets under 24px, and 60/60 page × width × motion combinations clean. There is now one launch page (launch 0 on the new factory) instead of two, so the matrix is 60 rather than 72. Report: `results/web-check-2026-11-14T02-16-27-879Z.json`. The same check on the hosted site after the deploy also passed 60/60 (`results/web-check-2026-11-14T02-54-15-696Z.json`). Lighthouse was not re-run.

**Hosted:** https://web-omega-dun-65.vercel.app. The hosted results are in `verification/test-report.md` §6: 6/6 pages, axe 0, 72/72 matrix, Lighthouse accessibility, best practices and SEO all 100, performance 74–92.

## Visual
| Item | Result | Evidence / notes |
|---|---|---|
| Only tokens used | **Pass** (1 exception) | All colours, type sizes, spacing, radii, shadows, durations and easings are custom properties in `app/globals.css`. Grep of `.ts`/`.tsx` for 6-digit hex finds one value: `#ffffff` in `viewport.themeColor`. A meta tag cannot reference a CSS variable. |
| ≤ 2 families + mono; scale; body ≥ 16px | **Pass** | Instrument Sans + IBM Plex Sans + IBM Plex Mono; scale tokens `--text-xs`…`--text-5xl`; body 16px. |
| One accent ~10%; no banned patterns | **Pass** | Accent green only on eyebrows, step numbers, badges and the current timeline step. No gradients, glass, glow, emoji, three-card rows or bounce easing. |
| Spacing rhythm checked with an overlay | **Not done** | Spacing comes only from `--space-*` (4px scale), but no visual overlay check was run. |
| One icon library; no emoji | **Pass** | Lucide only. The ▲/▼ signs on the price row are text glyphs paired with words. |
| All interactive states; empty, error and success states | **Pass** | `.btn`: hover, focus-visible ring (2px, offset 2px), active scale 0.98, disabled, loading (`aria-busy` spinner, static under reduced motion). Inputs: hover, invalid, disabled. Launch list: loading, error with retry, empty. Launch page: skeleton, error, success and error notices with an `aria-live` region. Forms: inline errors. |

## Accessibility (WCAG 2.2 AA)
| Item | Result | Evidence / notes |
|---|---|---|
| Contrast | **Pass** | Computed 2026-11-12: foreground 17.9:1; muted 6.6:1 on white and 6.1:1 on surface-2; white on primary 8.2:1; accent text 5.4:1; error 5.3:1; warning 5.0:1; interactive borders 3.1:1 on white. The accent fill (#19C37D, 2.3:1) carries only ink text (7.8:1). Charts use dataviz reference slots 1–3, validated by `validate_palette.js`: all checks pass; aqua below 3:1, so direct labels and the table view are present. |
| Keyboard access, focus, skip link | **Partial** | Skip link to `#main`; visible focus ring everywhere; chart bars focusable with tooltips; mobile menu closes on Esc and returns focus. A full manual keyboard walk-through was **not done**. |
| Focus not hidden by sticky header (2.4.11) | **Pass** | `scroll-padding-top: calc(var(--header-h) + 16px)`. |
| Targets ≥ 24px; 44px on touch | **Pass** | `check-web` measured every visible control on all 6 pages: 0 under 24×24 (inline text links exempt). Buttons are 44/52px. Under `pointer: coarse`, small buttons, footer links and the table toggle become 44px. |
| Headings, landmarks, lang | **Pass** | One h1 per page; ordered h2/h3; header, nav (labelled), main, footer; `lang="en"`. axe found 0 violations. |
| Alt text; icon-button labels | **Pass** | No raster images. Decorative icons are `aria-hidden`. The menu button has `aria-label` and `aria-expanded`. Charts carry `role="img"` with labels and a hidden figcaption. |
| Labelled fields with linked errors | **Pass** | Every input has `<label for>`, helper text via `aria-describedby`, and an error linked with `aria-invalid`. |
| Reduced motion; pause; flashing | **Pass** | Global reduced-motion rule; reveals show immediately; the spinner is static. No autoplay and no flashing. All 72 matrix runs include the reduced-motion variants. |
| Reflow at 320px / 200% zoom | **Pass at 320px** | 0px horizontal overflow at 320px on every page. Data tables scroll inside their own wrapper (allowed for tables). 200% zoom was not tested separately. |
| Screen-reader pass | **Not done** | No screen reader is available in this environment. |

## Responsive, performance, SEO
| Item | Result | Evidence / notes |
|---|---|---|
| 320/375/768/1024/1440/1920 × normal/reduced motion | **Pass** | 72 of 72 page × width × motion combinations have no console or page errors and no overflow. |
| No horizontal overflow | **Pass** | Same run. |
| Lighthouse mobile: performance ≥ 90, accessibility 100, SEO 100 | **Fail on performance** | Accessibility 100, best practices 100 and SEO 100 on all four pages. Performance varies with machine load (see below). |
| Meta, OG, canonical, structured data, sitemap | **Pass** | Unique title and description per route; per-page canonical (home, create, why; none on query-based launch pages); Open Graph and Twitter image (1200×630); FAQPage JSON-LD; `sitemap.xml`; `robots.txt` with its sitemap line. Verified on the hosted site. |

### Lighthouse performance in detail

This machine was shared with another project's builds during testing, so blocking time (TBT) moved by up to 3× between runs with no code change. Lighthouse's CPU benchmark index is recorded per run.

| Page | Saved run 08:40 (benchmark 482–740) | Earlier run 08:23 (benchmark 909–1495; printed in the session, file not kept) |
|---|---|---|
| Home | 91 (LCP 1.1 s, TBT 370 ms, CLS 0) | 99 (LCP 0.9 s, TBT 120 ms, CLS 0) |
| Launch 1 | 61 (LCP 5.7 s, TBT 740 ms, CLS 0) | 79 (LCP 5.2 s, TBT 170 ms, CLS 0) |
| Why | 74 (LCP 0.9 s, TBT 1,610 ms, CLS 0) | 88 (LCP 1.0 s, TBT 470 ms, CLS 0) |
| Create | 81 (LCP 0.9 s, TBT 800 ms, CLS 0) | 100 (LCP 0.9 s, TBT 80 ms, CLS 0) |

**Stable findings across runs**
- LCP is ≤ 1.1 s on home, why and create.
- CLS is 0 everywhere. It was 0.689 on the launch page and 0.269 on the why page before the fixes below.
- The **launch page LCP of about 5.5 s** is structural: its largest paint is the launch name, which comes from an RPC call. The page can only render it after React hydrates, because a static export has no server rendering. An inline early fetch removed the RPC round trip from the critical path, but the JS download and hydration remain. Fixing it needs server rendering (a Node host), which is out of scope for a static export.
- **JS budget:** home loads 182 KB gzipped JS against a budget of 180 KB. Of that, 153 KB is react-dom plus two framework chunks.

**Fixes made during QA**
1. **Wallet library lazy-loaded** (about 94 KB of near-connect JS plus its manifest fetch). It now loads on connect, on the first transaction, or after idle for returning users. This cut the home page's blocking time.
2. **Hero headline no longer animated.** It is the LCP element, and the entrance animation held it at opacity 0. Home LCP went from 8.0 s to 0.9 s.
3. **Launch page skeleton** matching the final layout. CLS went from 0.689 to 0.
4. **Why page data imported at build time** instead of fetched, so it is prerendered. CLS went from 0.269 to 0.
5. **Charts sized to their measured container width.** Axis text had shrunk to about 6px at 375px.
6. **Histogram labels placed by collision checks** (clearing price first).
7. **Hamburger hidden on desktop.** A cascade bug showed it at all widths.
8. **Token-account link** given a 44px target.
9. **"Tokens sold" tile** no longer wraps.
10. **Tables** keep readable columns on mobile.

## Copy
| Item | Result | Evidence / notes |
|---|---|---|
| Humanizer rules | **Pass** | Grep of `apps/web/content/site.ts` for em dashes and the banned-word list returns nothing. "Unlock" appears only as the contract method name `unlock_creator`; the copy says "release". No "not X but Y" constructions. |
| CTAs verb + object, ≤ 3 words | **Pass** | "See a launch", "Create a launch", "Seal my bid", "Reveal my bid", "Finalize auction", "Claim tokens", "Claim refund", "Buy tokens", "Sell tokens", "Record price", "Run buyback", "Read the code", "See launch 0". "Release creator tokens" is 3 words. |
| Every number sourced | **Pass** | Sources are listed in `core/PRD.md`, "Number sources". Simulated figures are labelled SIMULATED. |

## Open items, in priority order
1. ~~Hosted URL~~ Done: checks pass on the hosted site. PageSpeed Insights is still to run once its quota resets or with an API key.
2. ~~Real-wallet click-through~~ Done 2026-11-14 with Meteor Wallet: buy, sell and buy succeeded on-chain from the hosted site; Meteor shows an error in its own popup after sending (test report §6). Other wallets not tried.
3. **Screen-reader pass and manual keyboard walk-through.**
4. **Launch page LCP:** needs server rendering if a sub-2.5 s lab LCP is required.
