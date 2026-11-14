# Task ledger

- Started: 2026-11-09 15:06 UTC.
- Deadline: 2026-11-14 23:59 UTC, about 129 h from the start.
- Lead: Emmanuel (@professor-12), sole member.
- Mode: the agent works autonomously and the human supplies missing inputs at the end.

| # | Task | Status | Evidence |
|---|---|---|---|
| 0 | Toolchain installed and pinned: Rust 1.97.0 + wasm32, cargo-near 0.22.0, near-cli-rs 0.30.1, Node 24.17.0, pnpm 12.8.1 | done | `docs/VERIFIED.md` |
| 1 | R1–R2 research: problem stats, prior art, competitors | done | `research/00-brief.md`, `research/01-prior-art.md` |
| 2 | R3 design decisions + Gate R | done | `research/03-design-decisions.md` |
| 3 | R4 tech verification: global contracts, storage cost, Ref testnet, Intents, RPC | done | `research/02-tech-verification.md` |
| 4 | Token contract (NEP-141, mint at finalize, burn, auto-register) | done | 4 unit tests |
| 5 | SlowCook contract: factory, commit/reveal, finalize, claims, pool, Floor Keeper, creator lock | done | 62 unit tests (66 with property and parity) as of 2026-11-14 |
| 6 | Property tests (I1–I3, I6) | done | `proptests.rs` |
| 7 | TS model + parity (1000 pure-math cases, 100 full-flow cases) | done | `parity_tests.rs` |
| 8 | Simulator, 1000 seeds | done | `sim/README.md`, `results/sim-*-SIMULATED.*` |
| 9 | Sandbox integration tests (real wasm) | done: 4/4 pass | `verification/test-report.md` §2 |
| 10 | Testnet deploy + demo:launch + demo:dump | done | `results/*.json`, test report §3 |
| 11 | Web app (Next.js static export + near-connect) | built; headless check 6/6 clean locally; hosted check + real wallet signing pending | `apps/web`, test report §6 |
| 12 | README, docs, submission package | done (human fields pending) | `README.md`, `submission/` |
| 13 | Hosting (Vercel), video, X post, form submission | **needs human** | `submission/` |

## Cut order (from the brief)
1. 1Click
2. Creator-unlock UI
3. Treasury epochs
4. Swap UI polish

Nothing has been cut so far. 1Click is not started, because there is no testnet for Intents.

## Status at 2026-11-09 ~17:45 UTC

About 126 hours remain to the deadline.

**Next actions, in order**
1. ~~**Human:** create the public repo~~ Done 2026-11-13: https://github.com/professor-12/slowcook. Links filled by `scripts/set-repo-url.sh`.
2. **Human:** host `apps/web/out` (Vercel or any static host) and click through with a testnet wallet. This step is unverified.
3. **Human:** record the video (`submission/demo-script.md`), post on X, and fill `submission/submission.json`.
4. **Optional, agent:**
   - a second live launch with deeper liquidity, using a fresh faucet account;
   - a poke-bounty keeper;
   - the fresh-clone test on a truly clean machine (a fresh-clone test with a shared build cache passed on 2026-11-10; see test report §7).

## Status at 2026-11-12 ~07:35 UTC

About 64 hours remain to the deadline.

**Done today**
- **Launch 1 (deep pool)** on testnet: a 5.858 NEAR pool. The on-chain result equals the pre-launch TS prediction.
- **Dump/defend on launch 1**: `defend` capped at exactly 10%, then `E_EPOCH_CAP`, then the creator unlock.
- **Headless-browser check** (`scripts/check-web.ts`): 6/6 pages clean on the local build. Visual review found and fixed 5 presentation bugs.
- **README:** the related-projects section (Q-015), with Partner A's other entry still to be confirmed, and the launch 1 evidence table.
- **Video script:** updated to launch 1's numbers.
- **`scripts/set-repo-url.sh`** fills the repo links, adds the CI badge and sets `origin`.

**Blocked on the human**
1. **Repo URL.** The instruction contained the literal placeholder `<Partner A's repo URL>`. Next steps once it arrives:
   - `bash scripts/set-repo-url.sh <url>`;
   - commit, then `git push -u origin main && git push origin hackathon-submission`;
   - watch CI.
2. **Hosted URL**, so the browser check can run against it: `node scripts/check-web.ts <url>`.
3. **Partner A's other NEAR HACKATHON entry** (or "none") for the README table.
4. **Submission form fields**, then the human's "yes".

## UI redesign to the owner's design standard (2026-11-12)
- **Done:**
  - fintech pack applied to `apps/web`;
  - `AGENTS.md` and `docs/design/` saved (core files plus the fintech pack, with the PRD and reference sheet filled in);
  - QA: axe 0 violations, matrix 72/72, Lighthouse accessibility and SEO 100.
- **Open:**
  - Lighthouse performance below 90 on launch (structural: about 5.5 s LCP), and on why and create under machine load;
  - home JS is 182 KB against the 180 KB budget;
  - screen reader, manual keyboard walk-through, real-wallet signing;
  - canonical and sitemap once the hosted URL is known.

## GitHub (2026-11-12/13)
- **Repo:** https://github.com/professor-12/slowcook (public). `main` and the `hackathon-submission` tag were pushed at `7cde628`.
- **Commit identity:** all commits rewritten before the first push to `Badejo Emmanuel <135185597+professor-12@users.noreply.github.com>`, at the human's choice.
- **CI:** green on the first run (both jobs, every step); the README badge shows "passing".
- **Next:** hosting. Then `node scripts/check-web.ts <url>` and `node scripts/lighthouse.ts <url>` against it, and set `NEXT_PUBLIC_SITE_URL`.

## Hosted (2026-11-13 23:00–23:45 UTC)
- **Live:** https://web-omega-dun-65.vercel.app. Vercel auto-deploys from `main`, about 30 s after a push.
- **Hosted QA:** 6/6 pages, axe 0, 72/72 matrix. Lighthouse: accessibility, best practices and SEO all 100; performance 74–92.
- **Fixed:** a 320px header overflow that appeared only with web fonts blocked. Canonical, Open Graph and sitemap are live.
- **Remaining for the human:** demo video, X post (draft has the live and repo links), form fields, Partner A's other entry, final "yes" to submit.

## Creator-lock fix (2026-11-14)
- **Review finding:** the creator lock could be bypassed (`h_obs = 1`, 1 s pokes, and "TWAP ≥ clearing" while the pool opens at clearing).
- **Done:**
  - failing tests first (`1c83075`; red output in `verification/creator-lock-red.txt`), then the fix (`5ad4575`): 7-day minimum lock, hold at clearing × 1.05 for ≥ 7 days, linear vest ≥ 7 days, minimums on `k_obs`, epoch and poke, demo timings only on `.testnet`, `get_config` view;
  - 66 + 4 contract tests with `PROPTEST_CASES=1000`, 4 sandbox tests, CI run 43542452926 green;
  - fresh factory `slowcook-674040.testnet` (code hash = build), launch 0 deep pool, dump/defend, creator release refused during the lock, 61,937 mid-vest, 38,063 after;
  - README (parameters table, security-fix section, new evidence, old launches labelled pre-fix), site, test report, QA report, video script and terminal excerpts.
- **Tag:** moved to the fix with the human's yes (2026-11-14).
- **Q-015:** sole member, Emmanuel (@professor-12), no other entry. The section about other people's entries was removed at the human's request.
- **Human does:** the form and the X post.
- **Real-wallet check (2026-11-14):** the human bought, sold and bought from the hosted site with Meteor Wallet; all three succeeded on-chain. Meteor's popup errors after sending ("reading 'name'"); the page now says the transaction may have gone through and refreshes, instead of "Not done".
