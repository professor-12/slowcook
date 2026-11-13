# SlowCook: memecoin launches where being first is worthless

[![CI](https://github.com/professor-12/slowcook/actions/workflows/ci.yml/badge.svg)](https://github.com/professor-12/slowcook/actions/workflows/ci.yml)

**Live demo:** https://web-omega-dun-65.vercel.app · **Testnet contract:** `slowcook-0dd752.testnet`

SlowCook is a memecoin launchpad on NEAR:
- **Sealed bids** go into a **single clearing price** that everyone pays.
- **Unsold supply burns.**
- Trading opens **at exactly that price**.
- A rule-bound **Floor Keeper** treasury defends the price.
- The creator's allocation stays locked until the price holds.

Tracks: **Memecoins** (primary) and **DeFi**. Network: **NEAR testnet** (test NEAR, no real value).

> **For automated reviewers:** every claim below has a command that reproduces it. Simulated numbers are labelled **SIMULATED**. Testnet transactions are labelled **REAL** and link to the explorer.

---

## The problem

On bonding-curve launchpads (pump.fun and clones), every buy raises the price, so **the first buyer pays the least**:
- **More than 50%** of pump.fun tokens are sniped in the same block they are created, and deployer-funded same-block snipers were profitable 87% of the time (Pine Analytics, 2025-04-21).
- Coordinated (bundled) accounts hold **36.5%** of supply on average across 41k+ Solana launchpad launches (MELT dataset, arXiv 2602.13480, 2026).
- **98.6%** of 7M+ pump.fun tokens fell below $1,000 of liquidity (Solidus Labs, 2025 Rug Pull Report). That is their definition, not "98.6% are frauds".

Sources and caveats: [`research/00-brief.md`](research/00-brief.md).

## How it works

```
 create_launch ─▶ COMMIT (hash only) ─▶ REVEAL (contract checks hash) ─▶ finalize ─▶ TRADING
                                                                          │
              one clearing price for all winners ◀───────────────────────┤
              unsold supply never minted (burned) ◀───────────────────────┤
              pool seeded at exactly the clearing price ◀─────────────────┤
              treasury = rest of proceeds ─▶ Floor Keeper (poke → TWAP → defend → burn)
              creator allocation locked ─▶ unlocks after h intervals at/above clearing
```

1. **Create.** The creator sets name, ticker, supply, split (sale/LP/creator, creator ≤ 10%), minimum price, the commit/reveal windows and the Floor Keeper parameters. A NEP-141 token is deployed at `<ticker>-<id>.<factory>` with **zero supply**.
2. **Seal.** Each bidder sends `sha256("<launch>:<bidder>:<tick>:<qty>:<salt>")` plus a deposit. Only the hash is on-chain. Depositing more than the bid costs hides the real bid.
3. **Reveal.** The contract recomputes the hash (`E_HASH` on mismatch) and checks `deposit ≥ price × qty`.
4. **Clear.**
   - `finalize` walks 64 price ticks from high to low until demand covers the sale supply. That tick's price is **the price everyone pays**.
   - Bids at the marginal tick are filled pro rata.
   - If demand is short, the price is the minimum and the unsold supply is **never minted** (burned).
5. **Claim.** Winners get tokens plus `deposit − clearing × filled` back. Losers get everything back. Unrevealed bids lose a 5% penalty, which goes to the treasury.
6. **After launch.**
   - Part of the proceeds and the LP tokens seed a constant-product pool at the clearing price; that liquidity is locked.
   - The rest funds the **Floor Keeper**. If the *time-weighted* price stays below `clearing − 10%` for k observations, anyone can call `defend()`. It buys tokens back with at most 10% of the treasury per epoch, never pushes the price above clearing, and burns what it buys.
   - The creator's tokens unlock only after h consecutive observations at or above clearing.

Mechanism details and every deviation from the original brief: [`research/03-design-decisions.md`](research/03-design-decisions.md). Contract internals: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Evidence

### SIMULATED: the same 200 wallets through a bonding curve and through SlowCook (1000 seeds)

The 200 wallets are 10 sniper bots, 1 bundler with 20 wallets, and 170 retail buyers. In SlowCook the insiders get the *strongest* strategy we could build: perfect knowledge of retail demand, bidding one tick above the clearing price.

| median (p5–p95) | Bonding curve | SlowCook |
|---|---|---|
| Insider (bots + bundler) share of supply | **40.3%** (39.0–41.6) | **10.7%** (6.9–14.3) |
| Insider ROI after dumping at T+1 | **+437%** (385–501) | **−9.2%** (−19.3 to −0.1) |
| Price retail paid ÷ price insiders paid | **4.26×** | **1.00×** |
| Median retail ROI after the dump | **−57.6%** | **−8.3%** |
| Price drop caused by the dump | 81.0% | 17.8% |

![SIMULATED chart](results/sim-chart-SIMULATED.svg)

Reproduce with `pnpm sim` (about 3 s). Method, assumptions and what the sim does *not* show: [`sim/README.md`](sim/README.md).

Honest reading:
- When insiders dump, holders are still down, just far less.
- If retail shade their bids, insiders can exit at a small profit (median +7.6%, against +437% on the curve).

### REAL: NEAR testnet

Factory: **`slowcook-0dd752.testnet`**. Its on-chain code hash `9A6qZZvajAXpEfa7UCrzNuZ1HF1ushD8wb7TdCSiSsEy` equals this repo's build.

#### Launch 1: deep pool (`deep-1.slowcook-0dd752.testnet`, 2026-11-12)

12 wallets with 1.3 NEAR of buying power each.

**Prediction.** Before anything was sent, the TS model (the parity-tested mirror of the contract math) predicted the clearing price, tokens sold and pool depth. **The on-chain result matched all three exactly**: `onchain_matches_prediction` in the log.

| Step | Result | Tx |
|---|---|---|
| 12 wallets commit sealed bids | Only hashes and deposits are on-chain; the bid view shows `tick=null qty=null` | [create_launch](https://testnet.nearblocks.io/txns/GN3STC17XBWJFXiGmpfoq1HWQtfwFcy1NmHzAWcS9fGs) · [a commit](https://testnet.nearblocks.io/txns/8qS9zG6ibYxFNr8muTHFx6VBULYjBxBujRC31rscsLs2) |
| Reveal with a wrong salt | Rejected `E_HASH` | [tx](https://testnet.nearblocks.io/txns/EtCZhXJW4A8HDhZ5xYn8Uw2No8RZuv3bYeyDAys5qrgF) |
| `finalize` | **One clearing price: 1.953e-5 NEAR/token** (tick 6). All 600,000 sale tokens sold, 0 burned. **The pool opens at exactly that price with 5.858 NEAR + 300,000 tokens.** Treasury 5.93 NEAR | [tx](https://testnet.nearblocks.io/txns/so2LEkqWAMjBxJwyFYuXQsUjLtAEFppxfqgKLVyCKCT) |
| The "sniper" (bid ~7× above clearing) claims | Paid exactly clearing × 9,409 = 0.1837 NEAR, **the same price per token as everyone**; the rest of the deposit refunded | [tx](https://testnet.nearblocks.io/txns/GSMddvWnuJjV5M7hwjWLUa3Ckg5bjn5LHz5Q5pth1ps9) |
| Unrevealed bid | 0.0715 NEAR (5%) penalty → treasury | [tx](https://testnet.nearblocks.io/txns/8uU6DuB91Gq1djY8GNPCetTkrRc4v8TPDnEi2dSkBWzg) |
| Creator unlock right after launch | `E_LOCKED` | [tx](https://testnet.nearblocks.io/txns/3AUwtZ8vChDJ4KTr1H9Q7zC4DsU5D4Zb63atzPZw3xJN) |
| 6 holders dump 308,480 tokens: spot falls to 24% of clearing. Then `defend` before the trigger | `E_TRIGGER` | [tx](https://testnet.nearblocks.io/txns/DtdN6JUAgpW8p47AqbgArCrNL283DeKHDEkZ6k3q5fiG) |
| 3 TWAP intervals below the floor → `defend` | Spent **0.5929 NEAR = exactly the 10% epoch cap**. Bought and **burned 103,215 tokens**; supply 1,000,000 → 896,784 | [tx](https://testnet.nearblocks.io/txns/CaWtxdoqnjjLRqHXHSYJpwQvEPxHNv8f2BWU8pRLXLmh) |
| `defend` again in the same epoch | `E_EPOCH_CAP` | [tx](https://testnet.nearblocks.io/txns/D3KCfRbkMJECbjdWqwa4Bjk5fzdXGKwsk4xFDuqYjPcX) |
| A 2.69 NEAR buy lifts spot to 1.11× clearing; it holds for 6 intervals → `unlock_creator` | Creator receives 100,000 tokens | [buy](https://testnet.nearblocks.io/txns/DfCA1VXMZWbUCFGdAoHFpazXd3AGedHAvjmYFb5npd8o) · [unlock](https://testnet.nearblocks.io/txns/FnVVh9KXAxgDzSw553H9wQTdP15eQjTTMFT7nWY7za6H) |

Logs with every transaction: [`results/launch-1-*.json`](results/), [`results/dump-1-*.json`](results/).

<details><summary>Launch 0: first run, thin pool (~0.7 NEAR), 2026-11-09</summary>

Launch 0 token: `slow-0.slowcook-0dd752.testnet`.

| Step | Result | Tx |
|---|---|---|
| 12 wallets commit sealed bids | Bid view shows `tick=null qty=null`; only the deposit is visible | [create_launch](https://testnet.nearblocks.io/txns/BRWxRMsAb1HeWKDFLUbmQ6i9Z8ms2ScatNrfuzHQ4ykP) · [a commit](https://testnet.nearblocks.io/txns/dKd9kguwzDQadd6nTDk2uws61h3NmKUKzbPaJyEzFHL) |
| Reveal with a wrong salt | Rejected `E_HASH` | [tx](https://testnet.nearblocks.io/txns/F6niuojx8Ebn6BXaix1K161Zxg4fB2wf22kKX6NcgoBb) |
| `finalize` | One clearing price, tick 6 = 2.313e-6 NEAR/token; 599,999 of 600,000 sold; 3 tokens of rounding dust burned | [tx](https://testnet.nearblocks.io/txns/HMH1GLb3rhSq3AYaihM5gfCWKC6dfZeMVXYmBfSZ5if4) |
| The "sniper" (bid ~5× higher) claims | Paid exactly clearing × 18,330 = 0.0424 NEAR, the same price as everyone | [tx](https://testnet.nearblocks.io/txns/bZgHTwYrGA4HM8Joz5GHWXvfxgMP6tYcTymxT79VwBf) |
| Losing bid claims | Full 0.36 NEAR refund | [tx](https://testnet.nearblocks.io/txns/AjaxVcSQVJyK6zD6nuPCUSU3o1DQgVnG87rKXaDwb8vL) |
| Unrevealed bid | 5% penalty → treasury | [tx](https://testnet.nearblocks.io/txns/FsdkyHFZGzMUbjj9qQWgTL2DoyeEQnDLz7nQEYwmexiS) |
| Creator unlock right after launch | `E_LOCKED` | [tx](https://testnet.nearblocks.io/txns/6imfP3nqDpeSh9aiyUucVBsUcMSmjkLB5Kj5TBevcLfG) |
| Holders dump 363,761 tokens; `defend` before trigger | `E_TRIGGER` | [tx](https://testnet.nearblocks.io/txns/8Ng2JnkuAZ4CGxawfGw8AUPdPJa38igcoxPTU9ML7yW2) |
| 3 TWAP intervals below floor → `defend` | Spent 0.0712 NEAR (= the 10% cap), bought and **burned 122,278 tokens** (supply 999,997 → 877,718) | [tx](https://testnet.nearblocks.io/txns/Wp1ajEf447JynvrHj9DowExuh2NcLR2QV88j6STB4jv) |
| `defend` again, same epoch | `E_EPOCH_CAP` | [tx](https://testnet.nearblocks.io/txns/exkZu2KgAushWQcfDVpp24SGsKVw5CWxWEjxAuCG45N) |
| Price recovers and holds 6+ intervals → `unlock_creator` | Creator receives 99,999 tokens | [tx](https://testnet.nearblocks.io/txns/C7GCT6rJGsBz3AnGJNoF9fWfsRY4zKSqy74zPiAxerPk) |

Logs: [`results/launch-0-*.json`](results/), [`results/dump-0-*.json`](results/). Launch 0 ran on the build just before a lint-only refactor; the factory was then redeployed with this repo's build ([`verification/test-report.md`](verification/test-report.md) §3).
</details>

**Caveats**
- Every wallet, the keeper and the buyer were script-controlled.
- Two launches are not a market.
- With the default split, the pool holds LP tokens equal to half the tokens sold. So dumping a given share of the sold supply moves the price by about the same proportion in any launch.
- The pool's NEAR depth sets how much NEAR it takes to move the price back. Launch 1 needed 2.69 NEAR to reach 1.11× clearing; on launch 0's thin pool, 2 NEAR overshot to about 11×.

### Tests: every rule is a contract function with a test

| Suite | What it proves | Command |
|---|---|---|
| 51 contract unit tests (54 incl. property + parity) | Every error code (`E_PHASE E_HASH E_DEPOSIT E_DUP E_CAP E_NOT_FINAL E_SLIPPAGE E_TRIGGER E_EPOCH_CAP E_LOCKED E_AUTH E_PARAMS E_NO_BID E_TOO_SOON E_NOT_FOUND`), tick walking, pro-rata rounding, penalty, burn, pool math, TWAP trigger, epoch cap, creator lock, failed-callback recovery | `cargo test -p slowcook` |
| Property tests (1000 random auctions) | I1 supply/burn, I2 `paid + refund + penalty = deposit`, I3 solvency, I6 bad or duplicate reveals always rejected, plus an independent brute-force clearing oracle | `PROPTEST_CASES=1000 cargo test -p slowcook proptests` |
| Parity (1000 + 100 auctions) | The TS model and the contract agree exactly on clearing, fills, payments, refunds and commit hashes. 1000 cases through the contract math and 100 through the full contract flow | `pnpm parity && cargo test -p slowcook parity` |
| Token unit tests | Zero supply at start, owner-only mint, burn, auto-registration | `cargo test -p slowcook-token` |
| Sandbox integration (real wasm, real runtime) | A 30-bidder launch; the undersubscribed burn path; dump → defend fires once → the epoch cap blocks it; creator unlock blocked then allowed; on-chain solvency; embedded vs global token deploy costs | `pnpm test:sandbox` |
| Simulator tests | Clearing vectors, determinism, the insider-share result | `node --test sim/test/*.test.ts` |

Results with numbers and limits: [`verification/test-report.md`](verification/test-report.md).

## Try it in 5 minutes

Prerequisites:
- Rust 1.97 with `wasm32-unknown-unknown` (`rust-toolchain.toml` pins it);
- [cargo-near](https://github.com/near/cargo-near) 0.22;
- Node ≥ 24 and pnpm.

```bash
pnpm install
pnpm build:contracts          # → target/near/slowcook/slowcook.wasm, target/near/slowcook_token/slowcook_token.wasm
pnpm test                     # → sim tests + parity fixtures + contract unit/property/parity tests: "ALL CONTRACT TESTS PASSED"
pnpm sim                      # → SIMULATED table above, written to sim/out/
pnpm test:sandbox             # → real-wasm launches in a local NEAR sandbox (first compile ~15 min)
```

Live testnet run, using your own faucet accounts in `.env` (see `.env.example`):

```bash
near account create-account sponsor-by-faucet-service <name>.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
node scripts/deploy-testnet.ts   # → deploys factory, uploads token code
pnpm demo:launch                 # → 12 wallets bid sealed, reveal, finalize: prints the single clearing price and burned supply
pnpm demo:dump <launch_id>       # → dump, poke, defend() buys back and burns, epoch cap blocks a second defend, creator unlocks after recovery
```

Web app (static Next.js; connect a testnet wallet through near-connect):

```bash
pnpm -C apps/web build && npx serve apps/web/out   # or: pnpm dev:web
```

**Live demo:** https://web-omega-dun-65.vercel.app (static export on Vercel, reading the testnet contract live; connect a NEAR testnet wallet to bid or trade).

## Frontend

`apps/web` is built to a written design standard ([`AGENTS.md`](AGENTS.md), [`docs/design/`](docs/design/)) using its fintech pack:
- **Tokens:** every colour, size, space and duration is a token.
- **Copy:** typed and sourced; every on-page number links back to a results file.
- **Accessibility:** WCAG 2.2 AA; axe finds 0 violations and Lighthouse accessibility is 100.
- **Charts:** follow a dataviz spec, with a validated palette, legends, tooltips and table views.

**Check it:**
- `node scripts/serve-web.ts 8765`, then `node scripts/check-web.ts http://127.0.0.1:8765` runs the QA matrix: 6 pages × 6 widths × 2 motion modes, axe, and touch-target sizes.
- `node scripts/lighthouse.ts` runs Lighthouse.
- Results and open items: [`docs/design/qa-report.md`](docs/design/qa-report.md).

## NEAR features used

- **NEP-141 / NEP-145 / NEP-148** fungible token per launch, built on `near-contract-standards` 5.30.1.
- **Sub-account factory.** Each token is deployed with one batch Promise: `create_account`, `transfer`, `deploy_contract` or `use_global_contract`, then `new`.
- **Global contracts.** `publish_token_code_globally` deploys the token once by hash. Measured trade-off: 15.9 NEAR burned once, against about 1.6 NEAR staked per launch.
- **Promises with `#[private]` callbacks** for deploy, mint, claim transfers, buy transfers, burns and the creator unlock. Every failure path is handled and tested.
- **`ft_transfer_call` / `ft_on_transfer`** for selling into the pool.
- **NEP-297 events** (`standard: "slowcook"`): `launch_created`, `bid_committed`, `bid_revealed`, `finalized`, `claimed`, `swap`, `poked`, `defended`, `creator_unlocked`.
- **Wallets:** `@hot-labs/near-connect`.
- Not used: NEAR Intents / 1Click. Intents has no testnet (Q-007), and we did not spend mainnet funds. It is listed as future work.

## Compared with prior art

| | Price discovery | Bids sealed | Unsold supply | After launch |
|---|---|---|---|---|
| pump.fun bonding curve | Price rises per buy | n/a | n/a | Nothing |
| **meme.cooking** (NEAR, live) | One price = total deposits ÷ tokens; deposits carry no price limit | No (running total public) | All distributed | LP locked; team vests by time |
| **Uniswap CCA** (2025) | Uniform price per block on a tick book | **No** (`BidSubmitted` emits price and amount) | Returned to issuer | Pool seeded at the clearing price |
| **SlowCook** | Uniform price from sealed limit bids on 64 ticks | **Yes** (commit-reveal) | **Burned** | Pool at clearing + Floor Keeper + price-gated creator lock |

The clearing walk (Gnosis Auction) and tick books (CCA) are established. SlowCook's contribution is the combination on NEAR: sealed bids, burn, LP/creator shares scaled to real demand, a TWAP-triggered capped Floor Keeper, and a price-gated creator lock. Details: [`research/01-prior-art.md`](research/01-prior-art.md).

## Trust assumptions and limits (stated openly)

- **Deposits are public.** A deposit caps a bid without revealing it; over-depositing helps hide the bid.
- **Not revealing is an option.** It is priced by a 5% penalty, not removed. Threshold encryption is v2.
- **Sybil wallets can't be prevented.** They just give no price advantage.
- **The Floor Keeper slows a sell-off; it can't stop one.**
  - It needs someone to `poke`. That is permissionless, and the demo uses a script.
  - A patient attacker who really holds the price down can extract at most r% of the treasury per epoch.
- **A creator with enough capital** can hold the price up for h intervals to unlock. Production should set h to days.
- **The creator receives no NEAR from the sale.** Proceeds go to the locked LP and the treasury.
- **Owner power** is limited to choosing the token code for *new* launches. The owner has no access to escrow, the pool or the treasury.
- **Testnet and test NEAR only.** This is not an offering of real tokens, and the code is **unaudited**.

Full threat model: [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

## Built with and AI disclosure

- **Libraries:**
  - Rust: `near-sdk` 5.30.1, `near-contract-standards` 5.30.1, `uint` 0.10, `hex`, `proptest`, `near-workspaces` 0.24, `tokio`, `sha2`, `futures`, `openssl` (vendored, test-only).
  - JS: `near-api-js` 7.4.0, `@hot-labs/near-connect` 0.12.0, `next` 16.4.5, `react` 19.3.1, `typescript` 5.9.3.
- **Tools:** cargo-near 0.22.0, near-cli-rs 0.30.1, Node 24, pnpm.
- **Templates:** none. The token wraps `near-contract-standards`' `FungibleToken`.
- **AI:** built with substantial assistance from **Claude Code** (Anthropic), covering research, contract code, tests, simulator, web app and docs, with human direction. All results in this README come from runs logged in `verification/` and `results/`.

## Related projects (Q-015)

NEAR HACKATHON rule Q-015: a person may be on **at most 2** submissions, and each README names the other.

| Member | Role in SlowCook | Other NEAR HACKATHON entry |
|---|---|---|
| Partner A | Lead | **[to confirm: "none", or project name + repo URL]** |

- The project owner is **not** a SlowCook member. They already lead two entries, so they are at the limit:
  - **FRONTIER**;
  - an invoice-clearing project (https://github.com/willy264/near).
- SlowCook is an independent submission with its own repo and code.

## License

MIT. See [LICENSE](LICENSE).
