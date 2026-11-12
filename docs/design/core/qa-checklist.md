# Accessibility and design QA checklist
Report each item as pass or fail with notes.

## Visual
- [ ] Only tokens used (grep for raw hex and arbitrary values).
- [ ] Two font families max; scale followed; body ≥ 16px on mobile.
- [ ] One accent at about 10%; no banned patterns.
- [ ] Spacing rhythm and grid alignment checked with an overlay.
- [ ] One icon library; no emoji in UI.
- [ ] All interactive states present; empty, error and success states designed.

## Accessibility (WCAG 2.2 AA)
- [ ] Text contrast ≥ 4.5:1 (large ≥ 3:1); UI and focus contrast ≥ 3:1.
- [ ] Full keyboard access, logical order, visible focus, skip link.
- [ ] Focus not hidden by sticky elements (2.4.11); scroll-padding-top set.
- [ ] Targets ≥ 24×24 (2.5.8), 44×44 on touch.
- [ ] Ordered headings, landmarks, lang attribute.
- [ ] Alt text and aria-labels on icon buttons.
- [ ] Labelled form fields with linked errors.
- [ ] Reduced-motion path works; pause controls; no flashing over 3 per second.
- [ ] Reflow at 320px and zoom 200% without loss.
- [ ] Screen-reader pass on hero, nav and main form.

## Responsive, performance, SEO
- [ ] 320, 375, 768, 1024, 1440, 1920 in normal and reduced motion.
- [ ] No horizontal overflow.
- [ ] Lighthouse mobile: performance ≥ 90, accessibility 100, SEO 100.
- [ ] Meta, OG, canonical, structured data, sitemap.

## Copy
- [ ] Humanizer rules pass; CTAs are verb + object; every number has a source in PRD.md.
