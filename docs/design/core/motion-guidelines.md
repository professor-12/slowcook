# Motion guidelines: core
Motion explains change. Decoration stays inside the niche intensity budget.

## 1. Tokens
Durations: instant 80ms (press), fast 150ms (hover, toggles), base 240ms (dropdowns, accordions), slow 400ms (section reveals, modals), slower 600ms (hero entrance), page 500–700ms (only where the pack allows). Material Design 3's 50–600ms range supports these bands.
Easing: --ease-out cubic-bezier(0.22, 1, 0.36, 1) default; --ease-enter cubic-bezier(0.05, 0.7, 0.1, 1); --ease-exit cubic-bezier(0.3, 0, 0.8, 0.15); --ease-standard cubic-bezier(0.2, 0, 0, 1); --ease-in-out cubic-bezier(0.65, 0, 0.35, 1); linear only for progress, marquees and scroll-linked values.
Springs (Motion): UI { stiffness: 400, damping: 40 }; panels { stiffness: 260, damping: 32 }; playful decoration only { stiffness: 300, damping: 18 }.

## 2. Rules
Exits about 70% of entrance duration. Reveals move 12–24px with opacity; never from scale 0. Stagger 40–80ms, max 6 items. Animate transform and opacity; use layout animations for size. One focal animation per viewport. Scroll reveals run once at 15–25% visibility. Hover effects need a touch equivalent. Nothing blocks input over 1.5s; intro loaders are skippable (QuickBite's is about 1.3s) and skipped for reduced-motion users. Autoplay over 5s needs a pause control (WCAG 2.2.2).

## 3. Patterns
| Pattern | Spec |
|---|---|
| Hero entrance | lines rise 24px + fade, 600ms ease-enter, 80ms stagger; CTA and media +200ms |
| Section reveal | children rise 16px + fade, 400ms ease-out, 60ms stagger |
| Button | color 150ms; press scale 0.98 at 80ms |
| Magnetic button (QB) | max 6–8px pull, spring, off on touch and reduced motion, focus ring visible |
| Card hover | image scale 1.03 over 400ms in overflow-hidden; shadow sm→md |
| Modal/Sheet | backdrop 200ms; panel 300ms ease-enter; exit 200ms ease-exit |
| Counter | real numbers only, 800–1200ms, tabular-nums, final value in HTML |
| Marquee | linear 30–60s, pauses on hover and reduced motion |
| Scrubbed scene | GSAP ScrollTrigger scrub, pinned ≤ 2 viewport heights, readable without it |
| Page transition | View Transitions API or AnimatePresence crossfade 300–500ms |

## 4. Libraries
- CSS transitions first for hover, focus and color.
- Motion (motion/react): enter/exit, layout, gestures, in-view reveals. Use LazyMotion; wrap the app in <MotionConfig reducedMotion="user">.
- GSAP + ScrollTrigger (free commercially since 3.13, released April 2025, SplitText included): timelines, pinned/scrubbed scroll, split text, SVG. Use gsap.matchMedia() for a reduced-motion branch and useGSAP for cleanup.
- Lenis: motion-led pages only (playful, gaming, agency). Off for fintech, forms, dashboards, docs, and under reduced motion.
- Three.js / R3F: one lazy-loaded scene max, with poster fallback, tested on mid-range Android.
- Lottie / Rive: illustrative loops; Rive for interactive state machines.

## 5. Reduced motion and performance
Replace movement with opacity fades ≤ 150ms; pause video and marquees; test both modes. Keep INP ≤ 200ms (no heavy scroll handlers; use IntersectionObserver), CLS ≤ 0.1 (reserve space), will-change only during animation, lazy-load heavy libraries.

## 6. Intensity levels
1 Quiet: hovers, focus, accordions, one hero fade (fintech forms, dashboards).
2 Considered: + section reveals, staggers, subtle hero sequence (fintech marketing, SaaS, Ontiver).
3 Expressive: + magnetic buttons, parallax < 40px, one signature interaction (QuickBite, agencies).
4 Showcase: + smooth scroll, pinned scenes, WebGL, page transitions (gaming launch, playful brand, Igloo, Nothin').
