# Task ledger

- Started: 2026-11-09 15:06 UTC.
- Deadline: 2026-11-14 23:59 UTC, about 129 h from the start.
- Lead: Partner A.
- Mode: the agent works autonomously and the human supplies missing inputs at the end.

| # | Task | Status | Evidence |
|---|---|---|---|
| 0 | Toolchain installed and pinned: Rust 1.97.0 + wasm32, cargo-near 0.22.0, near-cli-rs 0.30.1, Node 24.17.0, pnpm 12.8.1 | done | `docs/VERIFIED.md` |
| 1 | R1–R2 research: problem stats, prior art, competitors | done | `research/00-brief.md`, `research/01-prior-art.md` |
| 2 | R3 design decisions + Gate R | done | `research/03-design-decisions.md` |
| 3 | R4 tech verification: global contracts, storage cost, Ref testnet, Intents, RPC | done | `research/02-tech-verification.md` |
| 4 | Token contract (NEP-141, mint at finalize, burn, auto-register) | done | 4 unit tests |
| 5 | SlowCook contract: factory, commit/reveal, finalize, claims, pool, Floor Keeper, creator lock | done | 51 unit tests |
| 6 | Property tests (I1–I3, I6) | done | `proptests.rs` |
| 7 | TS model + parity (1000 pure-math cases, 100 full-flow cases) | done | `parity_tests.rs` |
| 8 | Simulator, 1000 seeds | done | `sim/README.md`, `results/sim-*-SIMULATED.*` |
| 9 | Sandbox integration tests (real wasm) | done: 4/4 pass | `verification/test-report.md` §2 |
| 10 | Testnet deploy + demo:launch + demo:dump | done | `results/*.json`, test report §3 |
| 11 | Web app (Next.js static export + near-connect) | built + smoke-tested; wallet flow NOT browser-tested | `apps/web`, test report §6 |
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
1. **Human:** create the public repo, push, and fill the `REPLACE_ME` repo URLs (`Cargo.toml`, `apps/web/app/layout.tsx`).
2. **Human:** host `apps/web/out` (Vercel or any static host) and click through with a testnet wallet. This step is unverified.
3. **Human:** record the video (`submission/demo-script.md`), post on X, and fill `submission/submission.json`.
4. **Optional, agent:**
   - a second live launch with deeper liquidity, using a fresh faucet account;
   - a poke-bounty keeper;
   - the fresh-clone test on a clean machine.
