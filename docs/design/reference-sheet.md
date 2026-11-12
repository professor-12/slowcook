# Reference sheet: SlowCook web app (2026-11-12)

**Provenance note.** I (the agent) did not browse Pinterest, Dribbble or these sites visually in this session.
- **"From the standard":** observations recorded in the owner's design standard, with its sources.
- **"From research":** read during prior-art research (`research/01-prior-art.md`).
- Patterns only. No text, logos, illustrations or code were taken.

| Ref | Link | Source | Take | Becomes in SlowCook |
|---|---|---|---|---|
| Ontiver | ontiver.com | From the standard | Outcome + condition headline ("Verify once. Approve every share."); honest launch status; numbered steps; trust facts in the footer | Hero: "Memecoin launches where being first is worthless."; "Six steps. No race to be first." with 01–06; status line "Unaudited contracts on NEAR testnet. Test NEAR only." |
| Trustly (travel) | trustly.com/verticals/travel | From the standard | Short benefit headline, one primary CTA, a counted proof strip | One primary CTA per section; proof strip of counted, dated testnet numbers ("Launch 1 on testnet, 12 Nov 2026") |
| Vectura | vectura.se | From the standard | Two clear CTAs; named contacts with direct details | Primary/secondary CTA pairs; "Verify it yourself" names the exact contract account and links to the explorer |
| Nothin' | noth.in | From the standard | Strict typographic canvas; colour comes from the work | Near-monochrome page; colour reserved for data marks and one accent |
| QuickBite | quickbiteltd.org | From the standard | Numbered FAQ; descriptive alt text; reduced motion respected; checked at 320–1920 in both motion modes | Numbered FAQ (01–06); every animation has a reduced-motion path; QA matrix at 6 widths × 2 motion modes |
| Stripe / Wise pricing pages | stripe.com/pricing, wise.com/pricing | From the standard (fintech pack refs) | Fee transparency; what you pay and why | Create form shows the attached NEAR broken into token code, token storage and launch storage before signing |
| Uniswap Continuous Clearing Auction docs | developers.uniswap.org (CCA concepts) | From research | Tick book; clearing price shown against demand | Demand-curve histogram with the clearing tick marked and a table view |
| meme.cooking | docs.meme.cooking | From research | What **not** to take: a public running total of deposits during the window | During bidding the UI shows only commit counts; the bid view shows no price or quantity |
| Igloo Inc | igloo.inc | From the standard | What **not** to take: showcase motion with weak accessibility (Awwwards scores it 6.60) | Motion level 2 (reveals only); no scroll-driven scenes |
| Payaza | payaza.africa | From the standard | Not reviewed (it did not render through the standard author's tools) | None |

## Decisions recorded
- **Palette:** the fintech pack's cool-green neutrals, primary #0E5A43 and accent #19C37D. Every text pair checked ≥ 4.5:1 (`qa-report.md`).
- **Type:** Instrument Sans display + IBM Plex Sans body + IBM Plex Mono for accounts and hashes. These are the fintech pack's named options with free licences.
- **Blueprints:**
  - Home: H1 Split, F1, F4-style value rows, live table, trust row, FAQ, final CTA.
  - Launch page: status timeline, stat tiles, chart, action panel.
- **Motion:** level 2 on marketing (section reveal 16px/400ms, hero card entrance); level 1 on forms and the launch page.

**Side-by-side comparison at 1440/375 against the references:** not done, because I had no visual access to the references in this session.
