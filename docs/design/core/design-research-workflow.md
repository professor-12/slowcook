# Design research workflow
Ontiver's redesign recorded Pinterest boards in its docs; this makes that step required. Time box 45–90 minutes. Output: docs/design/reference-sheet.md.

## Sources
Pinterest for mood, photography and color. Dribbble for UI sections and details (treat shots as concepts; many are not built). Built sites: Awwwards, Lapa Ninja, Land-book, Godly, details.so, Mobbin. The user's set: Ontiver, QuickBite, Nothin', Igloo Inc, Vectura, Trustly, Phenomenon Studio, Payaza, Palletio.

## Search terms
<niche> + <section> + <quality word> ("minimal", "editorial", "swiss", "typography", "whitespace"). Examples: "fintech landing page minimal", "game launch website key art", "saas hero section clean", "food delivery app warm palette", "pricing table minimal". On Pinterest use "More like this" two levels deep. On Dribbble filter Web Design, sort Popular, and check the designer's other work.

## Scoring (0–2 each; keep 8+ of 12)
Clear hierarchy in 2 seconds; restrained palette; type does the work; consistent spacing; real content; buildable and accessible. Reject purple blobs, glass everywhere, 3D emoji, thin unreadable text, fake charts.

## From reference to decision
Label 8–20 references by what to take (palette, type, hero, section, card, motion, photography, copy), and note what not to take. Record each:
| Ref | Link | Take | Becomes |
|---|---|---|---|
| Nothin' | noth.in | black/white canvas, color from work | --background #FFFFFF, --foreground #0A0A0A |
Then: sample 5–6 colors and rebuild them as 12-step scales with contrast checks; match the type style to a licensed free font from the pack; measure padding and container widths in DevTools and round to the scale; choose blueprints; set motion level.

## Rules
Take patterns, never assets or copy. After the first build, compare page and reference side by side at 1440px and 375px, list three differences and fix the mistakes.
