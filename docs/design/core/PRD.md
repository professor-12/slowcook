# PRD: SlowCook (web app)
Fill every field. Write "Unknown, ask" when a fact is missing. Do not invent facts.
Filled 2026-11-12 for `apps/web`. Template: the core standard's PRD.md.

## 1. Summary
- **What it does, for whom:** SlowCook runs memecoin launches on NEAR testnet where bids are sealed and every winner pays one clearing price, for memecoin buyers and creators who want launches that bots cannot snipe.
- **Stage:** live demo on NEAR testnet (hackathon submission, 2026-11-14 deadline); not on mainnet.
- **Niche pack:** fintech. Money moves, so fintech trust and copy rules apply.
- **Primary goal:** a visitor (judge, buyer) checks that the mechanism works on-chain. **Secondary goal:** a visitor places a sealed bid or creates a launch on testnet.
- **Primary CTA:** "See a launch". **Secondary CTA:** "Create a launch".

## 2. Audience
| Segment | What they must believe before acting | Main objection | Main device |
|---|---|---|---|
| Hackathon judges (crypto investors, protocol founders) | The mechanism is sound, enforced by the contract, tested and live | Commit-reveal leaks; the treasury can be farmed; a simulation is not evidence | Desktop |
| Memecoin buyers | They will not pay more than a bot, and their bid stays hidden | The deposit is public; sybil wallets; testnet only | Mobile |
| Token creators | A fair launch still works for them | The creator gets no NEAR from the sale; their tokens are locked | Desktop |

## 3. Brand inputs
- **Logo:** none. A text wordmark ("Slow" + "Cook") in the display font.
- **Brand colours:** none supplied. Fintech pack defaults: primary #0E5A43, accent #19C37D, cool-green neutrals.
- **Fonts:** Instrument Sans (display), IBM Plex Sans (body) and IBM Plex Mono (account IDs and hashes), all OFL, self-hosted (`apps/web/app/fonts/LICENSES.md`).
- **Photography:** none. Imagery is real product UI: the live launch card and the demand curve.
- **Words used:** sealed bid, clearing price, Floor Keeper, testnet.
- **Words never used:** guaranteed, risk-free, moon, instant (unless true).
- **Legal facts to display:** testnet only, unaudited contracts, MIT licence, not an offer of tokens.
- **Legal operator and registration:** Unknown, ask. It is a hackathon project with no registered operator.

## 4. Pages and sections
| Page | Purpose | Sections in order (blueprint IDs) |
|---|---|---|
| Home `/` | Explain and prove | Nav, Hero (H1 Split with live product card), Proof (real dated testnet metrics), How it works (F1 numbered steps), Value blocks (F4-style rows), Detail (live launches table), Trust ("Verify it yourself"), FAQ, Final CTA, Footer |
| Launch `/launch/?id=N` | Take part in, or inspect, one launch | Breadcrumb, header with status, status timeline, stat tiles, demand curve (chart and table), action panel by phase, trade, Floor Keeper and creator lock |
| Create `/create/` | Start a launch | Three fieldsets (token, split and auction, Floor Keeper), cost breakdown, submit |
| Why `/why/` | SIMULATED evidence | Chart (two small multiples), full results table, what it fixes and what it does not |
| 404 | Recover | Message and two routes back |

## 5. User flows
- **Bid:**
  1. Connect wallet.
  2. Choose a max price (tick), a quantity and the extra deposit.
  3. "Seal my bid": the receipt downloads, the wallet signs, then "done" with a transaction link.
  - Errors: deposit too small, commit cap reached, phase closed, wallet rejected. Each message says what happened and confirms that attached NEAR was returned.
- **Reveal:** the receipt loads from the browser, or you load the file; then "Reveal my bid".
  - Errors: hash mismatch, already revealed, file not a receipt.
- **Finalize:** anyone can do it once the reveal window closes.
- **Claim:** shows tokens, payment and refund, then "Claim tokens" or "Claim refund".
- **Trade:** buy or sell with a 1% slippage guard. Error: the price moved.
- **Floor Keeper:** "Record price", "Run buyback" and "Release creator tokens" are enabled only when the contract would accept them.
- **Create:**
  1. Fill the form; inline validation runs.
  2. See the cost breakdown.
  3. Sign in the wallet, then get redirected to the new launch.
  - The draft is saved in the browser.
- **Follow-up:** none (no email). Unknown, ask whether it is wanted.

## 6. Functional requirements
- **Forms:** create launch (validation mirrors the contract's `validate()`), commit, reveal (receipt file) and swap.
- **Endpoint:** NEAR testnet RPC; writes go through near-connect.
- **Spam protection:** the contract's minimum deposit and commit cap.
- **Navigation:** desktop inline links, plus a mobile disclosure menu with 48px rows and Esc to close.
- **Content source:** `apps/web/content/*.ts` (typed) plus live contract views.
- **Analytics events:** none. Unknown, ask.
- **Legal pages:** none beyond the footer line. Unknown, ask.

## 7. Non-functional requirements
Targets from the standard, with current status (`docs/design/qa-report.md`):
- **WCAG 2.2 AA:** axe finds 0 violations on all pages; Lighthouse accessibility is 100.
- **Core Web Vitals:** LCP ≤ 2.5 s is met on home, why and create, but the launch page is about 5.5 s in lab mode. CLS is 0. INP has not been measured in the field.
- **JS budget:** home JS ≤ 180 KB gzipped is **not met**. Measured initial JS is 182 KB gzipped on home and 187 KB on the launch page. Of that, 153 KB is the three largest chunks: react-dom (70 KB) and two framework chunks (44 KB and 39 KB; contents not attributed). Fonts are 88 KB (budget 120 KB).
- **Browsers:** last 2 versions of major browsers; checked in Chromium only.
- **SEO:**
  - unique titles and descriptions per route: done;
  - FAQPage structured data: done;
  - robots.txt: done;
  - Open Graph image (1200×630): built and switched on once `NEXT_PUBLIC_SITE_URL` is set;
  - canonical and sitemap: done once the hosted URL was known (per-page canonical; `sitemap.xml`).
- **Motion:** level 2 on marketing pages, level 1 on the launch page and forms.
- **Error monitoring:** none. Unknown, ask.

## 8. Stack defaults
- **Next.js 16 App Router + TypeScript, static export** (`output: "export"`), because any static host works.
- **Deviation:** plain CSS custom-property tokens instead of Tailwind v4 + shadcn/ui.
  - The app has no dialogs, menus or tabs that need Radix primitives.
  - Each control is a native element (button, input, details) styled from tokens.
  - This avoids a second styling system in a five-day sprint.
- **Icons:** Lucide. **Wallets:** near-connect, loaded lazily. **Motion:** CSS only, no Motion or GSAP. **Package manager:** pnpm.

## 9. Component libraries
- **Foundation:** none (hand-written components on the tokens). See §8.
- **Effects library:** none. **Hero effect:** none. The hero media is the live product card.

## 10. Acceptance criteria
- [x] Every section in §4 is built with real copy from `apps/web/content`.
- [ ] Every flow in §5 works, including errors. The UI and error mapping are built, and the read paths are tested in headless Chromium; **signing with a real wallet has not been tested in a browser**.
- [ ] `qa-checklist.md` passes: see `qa-report.md`. Performance and screen-reader items are open.
- [x] The build matches the `reference-sheet.md` decisions.

## 11. Out of scope
Dark mode (the standard says ship it only if PRD asks), internationalisation, mainnet, analytics, email follow-up, 1Click / Intents bidding.

## Number sources
Every number shown in the UI:
- **Launch 0 figures** (factory `slowcook-674040.testnet`, 2026-11-14): `results/launch-0-2026-11-14T01-51-38-296Z.json` (1 price, 11 winning bids, 7× bid, 600,000 sold, 0 burned, 5.86 NEAR pool, 0.1837 NEAR for 9,409 tokens).
- **Dump, defend and creator-lock figures:** `results/dump-0-2026-11-14T02-08-47-558Z.json` (0.5929 NEAR, 103,215 tokens, epoch-cap refusal, release refused during the lock, 61,937 then 38,063 vested).
- **"0 yocto" difference:** `onchain_matches_prediction` in the launch 0 log.
- **Test counts:** `verification/test-report.md` §1–2.
- **SIMULATED figures:** `results/sim-summary-SIMULATED.json`.
- **Create-form costs:** `research/03-design-decisions.md` §7 (token code 158,654 bytes at 1e19 yocto per byte).
