# Frontend standards, SEO and performance

Structure (from QuickBite): src/app (routes, metadata, globals.css), components/layout, components/sections, components/ui, content (typed copy), lib, hooks.

Code: strict TypeScript; sections take content via props from src/content; Tailwind classes from tokens, cn() and cva for variants; server components by default; semantic HTML (one h1, ordered headings, landmarks, button vs link); react-hook-form + zod with server validation; LCP image gets fetchpriority="high"; error monitoring (Ontiver uses Sentry). Lint, type-check and build pass before merge (QuickBite runs "pnpm check" and "pnpm build").

SEO: unique title and description per route; canonical, OG and Twitter tags with a 1200×630 image (as on Ontiver); Organization and FAQPage structured data; sitemap and robots; prerender marketing routes for Vite SPAs.

Budget: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 at p75 mobile (lab targets 2.0s / 150ms / 0.05). Home JS ≤ 180KB gzipped, hero image ≤ 200KB, fonts ≤ 120KB. Lazy-load GSAP, Three.js and Lottie below the fold.
