# AGENTS.md: frontend design standard

Follow this file before writing UI code. It applies to every project and niche.
(For SlowCook the niche is **fintech**; see docs/design/core/PRD.md. Contract, simulator and script work follow docs/COMMON-RULES.md instead.)

## Read order
1. docs/design/core/PRD.md (filled in)
2. docs/design/niches/<niche>/ (PRD.md, design-system.md, text-copy.md)
3. core/design-system.md, core/text-copy.md, core/motion-guidelines.md
4. core/component-library-guide.md, core/ux-principles-and-section-blueprints.md
5. core/frontend-standards.md, core/qa-checklist.md

## Procedure
1. Pick the niche from the table. If none fits, follow niches/_new-niche-method.md and write a niche file first.
2. Fill docs/design/reference-sheet.md (design-research-workflow.md): at least 8 references, each with what to take.
3. Write tokens first in globals.css. No raw hex, px font size or duration outside tokens.
4. Write copy in src/content/*.ts (typed) following text-copy.md.
5. Build sections from the blueprints, mobile first at 360px.
6. Add motion last, from motion tokens, with a reduced-motion path for each animation.
7. Run qa-checklist.md, fix failures, and report what you checked.

## Niche selection
| Signals in the brief | Pack |
|---|---|
| game, studio, esports, wishlist, Steam, trailer | gaming |
| payments, bank, wallet, lending, invest, KYC, identity, insurance | fintech |
| B2B, SaaS, agency, consulting, real estate, enterprise | professional |
| consumer app, creator tool, kids, brand campaign, event | playful |
| anything else | _new-niche-method.md |
If money or identity is involved, fintech trust and copy rules apply even when the look is playful.

## Hard rules
- No purple/violet/indigo gradients, gradient text, glow orbs or aurora backgrounds unless PRD.md names them as brand.
- No Inter, Roboto, Arial or Poppins by default. Max two font families plus one mono.
- One accent color, about 10% of any screen.
- No glassmorphism for content. Blur only on a sticky nav over imagery.
- No emoji as icons. One icon library (default Lucide).
- No three-identical-cards row as the default feature layout. No cards inside cards.
- No bounce or elastic easing on controls.
- Spacing only from the 4px scale.
- Every interactive element has hover, focus-visible, active, disabled and loading states.
- Targets 44×44px on touch, never under 24×24px.
- Text contrast ≥ 4.5:1 (≥ 3:1 for large text).
- Animate transform and opacity only, with a prefers-reduced-motion path.
- No lorem ipsum, fake names, fake metrics or fake logos. Unknown facts become TODOs for the user.
- Images: descriptive alt, width/height or aspect-ratio, AVIF/WebP, lazy below the fold.
- Copy follows text-copy.md. No em dashes in UI copy.
- Take patterns from references, never their text, logos, illustrations or code.

## Done means
qa-checklist.md passes, Lighthouse mobile accessibility 100 and performance 90+, checked at 320, 375, 768, 1024, 1440 and 1920px in normal and reduced motion.
