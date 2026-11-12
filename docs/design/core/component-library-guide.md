# Component library guide

shadcn/ui is the foundation: Radix primitives plus Tailwind, copied into your repo and themed with CSS variables. Its registry format lets other libraries install through the same CLI (npx shadcn@latest add <registry-url>). Add at most one effects library per project and one hero effect per page. Restyle everything to tokens before shipping.

| Library | Take | Avoid |
|---|---|---|
| shadcn/ui | Button, Input, Form, Dialog, Sheet, Accordion, Tabs, Tooltip, Dropdown, Sonner, Table | Shipping the default neutral theme unchanged |
| Magic UI | Marquee, Number Ticker, Animated Beam, Blur Fade, Bento Grid (restyled) | Sparkles and shiny text on serious products |
| Aceternity UI | Spotlight, Sticky Scroll Reveal, Timeline, one Hero Parallax | Aurora and beam backgrounds; default purple glow |
| React Bits | Split/Blur Text, Click Spark, Magnet, one background (playful, gaming) | Several effects per page; check its MIT + Commons Clause licence |
| Cult UI | Expandable cards, floating panel, 3D carousel, texture buttons, AI chat UI | Glass panels for body content |
| 21st.dev | Finding community heroes, pricing, testimonials across registries | Copying whole pages; skipping licence checks |
| Uiverse | Loaders, toggles, checkboxes, press styles | Neon, glass and gradient variants |
| Shuffle | Section skeletons (pricing, footers, feature grids) to sketch structure | Shipping exported markup without a token pass |

Selection: controls always come from shadcn/ui (effect libraries often lack keyboard and ARIA support). Marketing effects: Magic UI for professional and fintech; React Bits or Aceternity for gaming and playful; Cult UI for product and AI interfaces. Small elements: Uiverse. Layout ideas: 21st.dev or Shuffle, rebuilt with your components.

Restyle procedure for every import:
1. Replace hard-coded colors (search #, rgb(, hsl(, oklch(, purple-, indigo-, violet-) with tokens.
2. Replace radii, shadows, durations and easings with tokens; delete bounce.
3. Add a reduced-motion branch.
4. Check focus, aria labels and 44px targets.
5. Check bundle cost and note source and licence in a file comment.
Keep one radius personality, one shadow style, one icon set and one easing family across imports. If two effects compete in a viewport, remove one.
