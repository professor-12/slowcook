# SLOWCOOK: Full Build Brief for the Coding Agent

**Lead:** Emmanuel (@professor-12). **Tracks:** `memecoins` (primary), `defi`. Read `COMMON-RULES.md` first; its guardrails override anything here.

> One sentence: **SlowCook is a NEAR memecoin launchpad where being first is worthless. Everyone pays one clearing price set by sealed bids, unsold supply burns, and a rule-bound treasury defends that price after launch.**

---

## PHASE 0: Set up context (≈30 min)
1. Confirm today's date and the hours left until 2026-11-14 23:59 UTC. Write them to `execution/task-ledger.md`.
2. Ask the human for:
   - the testnet account name to use (e.g. `slowcook-<name>.testnet`);
   - whether they have a mainnet account and a 1Click JWT (both optional).
3. Check the tools: `rustc`, `cargo near`, `near`, `node`, `pnpm`, git. Install whatever is missing.

## PHASE 1: RESEARCH FIRST (≈4–6 hours; do not write product code before Gate R)
This brief is a starting point, not the final truth. Research the idea yourself and improve the design wherever evidence supports a change. Label every finding VERIFIED / INFERRED / HYPOTHESIS / UNKNOWN, with URL and access date.

### R1. Problem evidence → `research/00-brief.md`
- Memecoin sniping, bundling and rugs. Starting points:
  - Solidus Labs / CoinDesk on pump.fun: 98.6% of tokens show rug traits. https://www.coindesk.com/business/2025/05/07/98-of-tokens-on-pump-fun-have-been-rug-pulls-or-an-act-of-fraud-new-report-says
  - Bundling explainer: https://madeonsol.com/blog/solana-bundling-explained
  - Sniper and bundler taxonomy: https://docs.webacy.com/glossary/snipers-bundlers
- Find 2026 data if it exists: share of supply bought in block 0, and how first-block buyers perform afterwards.

### R2. Prior art and originality → `research/01-prior-art.md`
Read and summarise each, then state exactly how SlowCook differs:
- **meme.cooking** (NEAR ecosystem partner; closest prior art). Docs: https://docs.meme.cooking/
  - Check whether the `meme-cooking.near` contract is live: look for recent txs on https://nearblocks.io.
  - Read its mechanism (deposit window, single price, LP seeding at ≥4k NEAR) and its API at https://api.meme.cooking/.
- **Uniswap Continuous Clearing Auctions** (Nov 2025): https://blog.uniswap.org/continuous-clearing-auctions
- **Skyward Finance** (NEAR, 2021, time-spread sale).
- **Gnosis / Fjord / Liquidity Bootstrapping Pools.**
- **Pump.fun bonding curve**, as the baseline.
- **Zaunchpad** (Zypherpunk hackathon): https://zypherpunk-results.pages.dev/project/zaunchpad-5e0f
- Search X for `#NEARHackathon` "fair launch" or "launchpad", and GitHub for repos created after 2026-10-18. Record any competitor.

### R3. Mechanism design research → `research/03-design-decisions.md`
- Uniform-price auction theory: bid shading and demand reduction. Decide whether per-bidder caps or a minimum price help or hurt, and justify the choice.
- Commit-reveal pitfalls:
  - non-reveal griefing → set a penalty size;
  - deposit leakage → over-deposit allowed;
  - salt loss → local storage plus a downloadable backup.
- Treasury "floor defence" design:
  - Trigger: a time-weighted price, not spot, so it can't be manipulated by one trade. Define the observation (`poke`) cadence.
  - Spend cap per epoch, and what happens when the treasury is empty.
  - Make sure `defend()` can't be farmed. Example attack: an attacker pushes the price down, triggers the buyback, and sells into it. Analyse it and add a cool-down and cap.
- Creator allocation lock: unlock only after the price holds at or above the clearing price for H hours.

### R4. Technical verification → `research/02-tech-verification.md` and `docs/VERIFIED.md`
- NEP-141 reference (near-contract-standards FT), deploying a token per launch:
  - (a) sub-account + deploy the wasm from the factory;
  - (b) a global contract by hash. Check the docs at https://docs.near.org/smart-contracts/global-contracts and pick one.
  - Measure the storage cost.
- Gas for clearing with tick buckets (expected at most 64 iterations). Measure it in the sandbox.
- Rhea testnet status (`ref-finance-101.testnet`). If it's stale, use our own minimal AMM on testnet.
- Optional 1Click "bid from any chain": read https://docs.near-intents.org/llms.txt (quote, deposit address, status).

### Gate R (write the decision in `research/03-design-decisions.md`)
Proceed only when:
- (a) differentiation from meme.cooking and Uniswap CCA is stated in two sentences;
- (b) the token deploy method and its storage cost are measured;
- (c) the treasury manipulation analysis is written.

**If a visible competitor already ships the same thing on NEAR:** do not stop. Sharpen the differentiation (sim evidence, post-launch rules) and note it.

---

## PHASE 2: PRODUCT SPEC (adjust from research; record changes)

### User journey
1. **Creator → `create_launch`.** Sets name, ticker, icon URL, total supply, splits (sale % / LP % / creator %, with creator ≤ 10% and locked), `p_min`, commit and reveal durations, and the treasury params. The token is deployed, and nothing is tradable before finalize.
2. **Bidder → `commit`.** Sends `hash = sha256(launch_id ‖ bidder ‖ price_tick ‖ qty ‖ salt)` plus a NEAR deposit. Any amount can be deposited; it must be at least `price × qty` at reveal.
3. **Bidder → `reveal(price_tick, qty, salt)`** within the reveal window. The contract checks the hash and the deposit, then adds `qty` to `bucket[price_tick]`.
4. **Anyone → `finalize`.** The contract walks ticks from high to low until the cumulative qty reaches the sale supply. The clearing tick is the marginal tick.
   - If the launch is undersubscribed, the clearing price is `p_min`, and unsold sale tokens are **burned**.
   - The pool is seeded at the clearing price, and the treasury is funded.
5. **Bidder → `claim`:**
   - above the clearing tick: full fill;
   - at the clearing tick: pro-rata fill, `floor(qty × remaining / bucket_qty)` (document the rounding);
   - below it: refund.
   - Each bidder pays `clearing_price × filled` and is refunded `deposit − paid`. Unrevealed commits get `deposit − penalty(1%)` via `refund_unrevealed`.
6. **Trading:** users swap NEAR ↔ token in the launch's pool (x·y=k, 0.3% fee to the LPs held by the protocol, i.e. locked).
7. **Floor Keeper:**
   - `poke()` records the pool price into a ring buffer (callable by anyone, at most one per M blocks).
   - If the time-weighted price is below `clearing × (1 − band)` for K consecutive observations, `defend()` buys tokens with at most `r%` of the treasury per epoch and burns them. It then has a cool-down.
8. **Creator unlock:** `unlock_creator()` succeeds only when the price has held at or above `clearing` for `H` observations.

### Default parameters (tune and justify in research)
- 64 price ticks, geometric factor 1.15.
- Sale 60%, LP 30%, creator 10% (locked).
- Proceeds split: LP NEAR = `clearing × lp_tokens`; the remainder goes to the treasury.
- Penalty 1%. Band 10%. K = 6 observations. r = 10% per epoch. Epoch = 100 blocks. Max 500 commits per launch.
- Testnet timing: commit 10 min, reveal 10 min, so demos run fast. Make these configurable.

### Invariants (each must have a test)
- **I1:** `filled_total = min(sale_supply, demand_at_or_above_clearing)`. Burned = sale_supply − filled_total. Token total_supply after finalize = filled + lp + creator.
- **I2:** for every bidder, `paid = clearing_price × filled` and `paid + refund + penalty = deposit`.
- **I3:** NEAR solvency: contract balance ≥ outstanding refunds + pool NEAR + treasury NEAR (+ storage).
- **I4:** no token transfer or swap before `finalize`. The creator allocation is untransferable until unlocked.
- **I5:** `defend()` spends ≤ r% of the treasury per epoch, and only when the trigger condition holds.
- **I6:** a reveal that doesn't match its commit hash is always rejected. A commit can be revealed at most once.

### Non-goals and honest limits (put these in the README)
- **Deposits are public**, so a deposit reveals a bidder's maximum.
- **Sybil splitting can't be prevented**; it simply gives no price advantage.
- **The treasury slows sell-offs**; it does not prevent them.
- **Testnet and test NEAR only.** This is not an offering of real tokens.

---

## PHASE 3: ARCHITECTURE

```
slowcook/
├─ contracts/slowcook/     # factory + auction + pool + treasury (one contract, keeps money flows atomic)
│  └─ src/ lib.rs launch.rs auction.rs pool.rs treasury.rs events.rs errors.rs
├─ contracts/token/        # NEP-141 template wasm deployed per launch (mint only by factory at finalize)
├─ sim/                    # TypeScript model: bonding curve vs SlowCook, + parity harness against contract
├─ apps/web/               # Next.js 16 + near-connect
├─ scripts/                # setup-testnet.sh, deploy.sh, demo-launch.ts, demo-dump.ts
└─ (docs, research, execution, verification, submission, results)
```

### Contract interface (near-sdk 5.30)
- **Factory and launch:**
  - `new(owner)`
  - `create_launch(params) -> LaunchId` (payable: covers token deploy and storage)
  - `get_launch(id)`
  - `list_launches(from, limit)`
- **Auction:**
  - `commit(launch_id, hash_hex)` (payable)
  - `reveal(launch_id, tick: u8, qty: U128, salt_hex)`
  - `finalize(launch_id)`
  - `claim(launch_id)`
  - `refund_unrevealed(launch_id, bidder)`
- **Pool:**
  - `swap_near_for_token(launch_id, min_out)` (payable)
  - `swap_token_for_near`: through `ft_on_transfer` with `msg {"launch_id","min_out"}`; the caller must be the launch's token contract
  - `get_pool(id)`
  - `quote(id, side, amount)`
- **Treasury:**
  - `poke(launch_id)`
  - `defend(launch_id)`
  - `unlock_creator(launch_id)`
  - `get_treasury(id)`
- **Views:**
  - `get_buckets(id)` (64 values, for the chart)
  - `get_bid(id, account)`
  - `get_clearing(id)`
- **Errors** (panic with stable prefixes): `E_PHASE`, `E_HASH`, `E_DEPOSIT`, `E_DUP`, `E_CAP`, `E_NOT_FINAL`, `E_SLIPPAGE`, `E_TRIGGER`, `E_EPOCH_CAP`, `E_LOCKED`, `E_AUTH`.
- **Events** (NEP-297, `standard: "slowcook"`): `launch_created`, `bid_committed`, `bid_revealed`, `finalized{clearing_price, filled, burned}`, `claimed`, `swap`, `poked`, `defended{spent, burned}`, `creator_unlocked`.
- **Security:**
  - checked arithmetic, and `overflow-checks = true` in release;
  - callbacks `#[private]`;
  - no state change before all checks pass;
  - `ft_on_transfer` checks the predecessor is the launch token;
  - storage deposits for commits.

### Simulator (`sim/`): the impact evidence, labelled SIMULATED
- **Participants:**
  - 10 "first-block" bots;
  - 1 bundler controlling 20 wallets with a combined budget B;
  - 169 retail participants with random arrival times and valuations drawn from a log-normal distribution.
- **Mechanism A, bonding curve (pump.fun-style):** price rises with supply sold; arrival order decides price.
- **Mechanism B, SlowCook:** everyone bids their valuation (plus a bid-shading variant).
- **Outputs (to a JSON plus a chart PNG/SVG):**
  - bot and bundler share of supply;
  - average price paid by bots versus retail;
  - bot PnL if they dump at T+1;
  - retail PnL distribution.
- Run 1,000 seeds and report the median and the 5th–95th percentile. Publish the method in `sim/README.md`.
- **Parity test:** 1,000 random auctions through the TS model and through the contract in the sandbox must give identical clearing, fills and refunds.

### Web app (Next.js 16)
Pages:
1. **Launches list.**
2. **Create launch** form.
3. **Launch page:**
   - countdown and phase;
   - commit form (generates the salt, saves it to localStorage, and offers a "Download bid receipt" JSON);
   - reveal button that auto-loads the receipt;
   - live bucket histogram with the clearing line after finalize;
   - claim;
   - swap box;
   - treasury panel (trigger status, epoch cap remaining, defend button);
   - creator lock status.
4. **"Why SlowCook"** page with the simulation chart.

Login via near-connect. Use a dark, readable style with big numbers, built to read well on video.

---

## PHASE 4: TESTS AND CI
- **Unit tests:** every error code; tick walking; pro-rata rounding; penalty; burn; pool math; trigger logic; epoch cap.
- **Property tests (`proptest`, 1,000 cases):** random commits and reveals (including bad reveals and non-reveals), then finalize and claims. Assert I1–I3 and I6 after each step.
- **Sandbox integration (near-workspaces 0.24):**
  - full launch with 30 bidders;
  - undersubscribed launch (burn path);
  - scripted dump → `defend()` fires once, then is blocked by the epoch cap;
  - creator unlock blocked, then allowed.
- **CI** (GitHub Actions):
  - Rust: fmt, clippy `-D warnings`, test, `cargo near build`, integration tests.
  - Node 24 / pnpm: typecheck, vitest, sim smoke run, web build.
- **Testnet evidence:**
  - `pnpm demo:launch` runs a real launch with ≥ 10 wallets and writes `results/launch-<ts>.json` with every tx hash.
  - `pnpm demo:dump` triggers `defend()`.

## PHASE 5: DAY PLAN (deadline 14 Nov 23:59 UTC)
| Day | Work | Exit check |
|---|---|---|
| 8 Nov (rest of day) | Phase 0–1 research, Gate R | Research files written |
| 9 Nov | Token template; factory; commit/reveal; buckets; unit tests | Unit tests green |
| 10 Nov | Finalize, claim, refunds, burn; proptests; sandbox launch test | I1–I3 and I6 hold |
| 11 Nov | Pool, poke, defend, unlock; I4–I5 tests; simulator + parity | Parity passes 1,000 cases |
| 12 Nov | Web app; testnet deploy; real testnet launch; evidence JSON | Live URL works |
| 13 Nov | README; fresh-clone test; video; optional 1Click quote demo | Done-checklist ✓ |
| 14 Nov | Buffer; X post (human); submission JSON (human confirms) | Submitted before 23:59 UTC |

**Cut order:** 1Click → creator-unlock UI → treasury epochs (keep a single defend) → swap UI polish. **Never cut** the clearing logic, tests, the sim or the README.

## PHASE 6: SUBMISSION PACKAGE

### README skeleton
1. **Title:** "SlowCook: memecoin launches where being first is worthless"
2. **Problem:** with the cited stats.
3. **How it works:** a diagram plus the 6 steps.
4. **Evidence:** the simulation results table (SIMULATED) and testnet tx links (REAL).
5. **Try it in 5 minutes:**
   - `pnpm i && pnpm build:contracts` → `pnpm test` → see all green.
   - `pnpm demo:launch` → see the clearing price and burned supply.
   - `pnpm demo:dump` → see `defend()`.
   - Open `<hosted url>`.
6. **NEAR features used:** NEP-141, sub-account token deploy (or global contracts), promises, events. Optionally NEAR Intents (1Click).
7. **vs prior art:** meme.cooking, Uniswap CCA, pump.fun.
8. **Limits and trust assumptions.**
9. **Built with / AI disclosure.**
10. **Related projects (Q-015).**
11. **License:** MIT.

### Demo video script (about 2 minutes)
1. **(0:00)** "On pump.fun, 98.6% of tokens show rug or pump-and-dump traits, and bots buy the very first block. SlowCook makes being first worthless."
2. **(0:15)** Simulation chart: "Same 200 participants. Bonding curve: bots take X%. SlowCook: Y%." (Read real numbers from `sim`.)
3. **(0:40)** Live testnet: three wallets commit sealed bids. "Nobody can see the prices, including bots and the creator."
4. **(1:00)** Reveal, then finalize. "One clearing price for everyone; the unsold supply just burned; trading opens at exactly that price."
5. **(1:25)** A scripted dump. "Price falls below clearing. The Floor Keeper buys and burns, within its cap. The creator's tokens stay locked."
6. **(1:50)** "Judged on the mechanic: every rule is a contract method with a test. Repo and a 5-minute reproduction below. Built at NEAR HACKATHON."

### X post draft
"Built at #NEARHackathon: SlowCook, memecoin launches where being first is worthless. Sealed bids → one clearing price for everyone → unsold supply burns → a rule-bound treasury defends the price. Sim: bots' share drops from X% to Y%. Repo + 5-min repro: <link> @NEARProtocol"

### Submission fields
- **tracks:** `["memecoins","defi"]`
- **idea** (≤ 2000 chars): problem, mechanism, evidence, how NEAR fits.
- **The human provides:** name, email, payout account, X link.
- **Print the JSON and wait for "yes".**
