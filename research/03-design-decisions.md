# R3: Design decisions and Gate R

Written 2026-11-09. Labels: VERIFIED (measured or read at source today), INFERRED, HYPOTHESIS.
Every change from `SLOWCOOK-BRIEF.md` is listed in section 9 with its reason.

## Gate R

| Gate item | Status |
|---|---|
| (a) Differentiation in two sentences | Done. See below and `01-prior-art.md` §"Differentiation". |
| (b) Token deploy method and measured storage cost | Done. Wasm sizes VERIFIED by build; per-launch costs measured in the sandbox (`verification/test-report.md`). |
| (c) Treasury manipulation analysis | Done, §5. |

**Differentiation.**
- **vs meme.cooking:** meme.cooking deposits are price-blind, visible in real time, and always distribute the whole sale supply. SlowCook takes sealed price-and-quantity bids, sets one clearing price from the revealed demand curve, burns unsold supply, and keeps defending that price after launch.
- **vs Uniswap CCA:** CCA bids are public on-chain (`BidSubmitted` carries price and amount) and unsold tokens return to the issuer. SlowCook hides prices until reveal, burns unsold supply, and adds rules after launch that CCA leaves to the issuer.

**Honest originality claim.**
- The pieces are not new: the clearing walk is Gnosis-style, and the tick book is CCA-style.
- What is new is putting them together on NEAR for memecoins:
  - sealed bids;
  - a burn of unsold supply;
  - LP and creator shares that scale with what actually sold;
  - a TWAP-triggered, capped Floor Keeper;
  - a creator unlock gated on price.

## 1. Auction format: uniform price, 64 geometric ticks

**Choice: uniform-price, sealed-bid.**
- Every winner pays the marginal (lowest accepted) tick price.
- Bids are `(tick, qty)` plus a deposit.
- Ticks follow `p[i] = floor(p[i-1] * factor / 10000)` with a default factor of 1.15, so the top tick is about 6,670× `p_min`.

**Why ticks.**
- Finalize iterates at most 64 buckets plus one list of bids at the marginal tick (≤ 500), so it runs in bounded gas.
- The finalize walk is O(64), with no sort of bids.

**Known theory.**
- Uniform-price auctions invite *demand reduction*: a large bidder shades the quantity it asks for at the margin, because its own bid can set the price it pays.
- We accept this for three reasons:
  1. Memecoin bidders are small relative to supply. The simulation's insiders hold about 11% (§8).
  2. Shading lowers the clearing price for everyone equally. It does not redistribute toward fast or early bidders.
  3. The simulation has a shaded-bids variant to show its effect.

**Per-bidder caps: not added.**
- Splitting into many wallets (sybil) makes caps meaningless, and caps would push honest whales into sybil behaviour.
- We cap *commits per launch* (500) only, for bounded storage.

**Minimum price (`p_min`): kept.**
- It is the reserve price.
- It is also the price everyone pays if the launch is undersubscribed. That only happens when demand is weak, and the burn then shrinks supply to match demand.

## 2. Commit–reveal details

**Hash.**
- `sha256("<launch_id>:<bidder>:<tick>:<qty>:<salt_hex>")`, with a 32-byte random salt.
- **The bidder's account is in the preimage**, so nobody can copy someone else's commit and reveal it as their own.
- **The salt is required**, because 64 ticks × plausible quantities is a small space to brute-force without it.

**Deposit leakage.**
- The deposit is public and must be ≥ `tick_price × qty` at reveal.
- **Over-depositing is allowed and is refunded.** A bidder can hide their bid by depositing more than it costs. The UI defaults to +20%.

**Non-reveal griefing and the free option.**
- A bidder who sees the bids revealed so far can choose not to reveal. That is a free option to see demand before committing to buy.
- Sealwell's README calls this out, and it is a fair critique (`01-prior-art.md` §7).
- **Penalty raised from 1% to 5% of deposit** (`penalty_bps = 500`, creator-configurable up to 20%). The penalty goes to the Floor Keeper treasury, so it funds price defence.
- The penalty *prices* the option; it does not remove it. Removing it needs threshold encryption, for example NEAR MPC key derivation as Sealwell uses. That is noted as v2.

**Salt loss.**
- The web app stores the salt in localStorage and offers a "Download bid receipt" JSON. The reveal button auto-loads it.
- A lost salt means the bid cannot be revealed, so it pays the penalty.

**Failed launch** (no demand, or the token deploy failed): everyone is refunded in full with no penalty, because nothing was sold.

## 3. Finalize: supply, burn, pool, treasury

- `filled` is the exact sum of every winning fill.
  - Pro-rata at the marginal tick is `floor(qty × remaining / bucket)`.
  - The rounding dust (fewer than one whole token per marginal bid) is never minted.
  - Finalize gets this sum exactly by reading the list of marginal bids.
- **Change vs brief:** the LP and creator shares scale with `filled`: `lp = filled × lp_bps / sale_bps` and `creator = filled × creator_bps / sale_bps`.
  - **Why:** with a fixed LP share, `treasury = proceeds − clearing × lp` goes **negative** whenever the sale is less than about half sold. Finalize would then panic under checked arithmetic and **lock every deposit**.
  - With scaling, `lp_near = clearing × lp ≤ proceeds` always holds. `create_launch` enforces `lp_bps ≤ sale_bps`, so the pool can always be seeded at exactly the clearing price.
  - Test: `tiny_sale_cannot_underfund_pool`.
- Burned = `total − filled − lp − creator`. Unsold supply is **never minted**, which is equivalent to burning it, and the `finalized` event reports it.
  - The token's `ft_total_supply` after finalize equals `filled + lp + creator`, checked on-chain in the sandbox.
- The pool gets `lp` tokens and `clearing × lp` NEAR, so its spot price equals the clearing price.
  - The treasury gets `proceeds − lp_near`: half of proceeds under the default 60/30/10 split.
- The creator gets **no NEAR**. Their reward is the locked token allocation, which only unlocks if the price holds.
  - This is a product trade-off: it removes the creator's incentive to rug but also their cash upside. Noted in the README.

## 4. Pool

- Constant product with a 0.3% fee that stays in the reserves. LP shares are not issued, so the liquidity is permanently locked.
- **Why our own pool rather than Rhea/Ref.**
  - Ref testnet is active (`02-tech-verification.md` §c).
  - But a pool inside the contract makes the Floor Keeper's buyback a local state change:
    - no cross-contract swap that can fail halfway;
    - no external price oracle;
    - the TWAP accumulator lives next to the reserves.
  - Integrating with Ref would be a mainnet v2 step.

## 5. Floor Keeper: manipulation analysis

**Trigger in the brief.** `poke()` records **spot** into a ring buffer, and `defend()` fires after K consecutive low observations.

**Attack on that design.**
1. The attacker sells to push spot below the floor, calls `poke()` in the next block, and buys back.
2. Repeating this K times costs about 2K swap fees, and the price stays low for only a block each time.
3. Then `defend()` buys from the pool with treasury NEAR and lifts the price. The attacker sells into that lift.
4. Net effect: a leak from the treasury to the attacker, capped only by the per-epoch limit.

**Fix (implemented).**
1. **Time-weighted accumulator** (Uniswap-v2 style).
   - Every swap first does `cumulative += spot × Δt_ms`.
   - `poke()` closes an *interval* and records `TWAP = Δcumulative / Δt`.
   - A one-block dip in a 10 s interval moves the TWAP by about 10% of the dip. Test: `twap_ignores_a_one_block_dip`.
   - To trigger, the attacker must hold the price below the floor for K whole intervals, while arbitrageurs can buy their cheap tokens.
2. **Spot must also be below the floor at `defend()` time.**
   - This stops a buyback into a price the attacker has already restored.
3. **Buy only up to the clearing price.**
   - `spend = min(epoch budget, NEAR needed to lift spot to clearing)`.
   - The treasury never pushes the price above clearing, so there is no overshoot to sell into.
   - Test: `defend_never_lifts_spot_above_clearing`.
4. **Per-epoch cap.**
   - `budget = r% × treasury at epoch start` (default 10%).
   - Each `defend` resets the streak, so the next one needs K fresh observations.
   - Test: `dump_triggers_capped_defend_then_epoch_cap_then_next_epoch`.
5. **Bought tokens are burned** with a cross-contract `burn`. If that call fails, the amount goes to `burn_pending` and `flush_burn` retries it.

**What remains.**
- A patient attacker who really holds the price down for K intervals can then sell into at most r% of the treasury per epoch.
- That costs them the slippage of holding the price down, during which anyone can buy below clearing. We state this as a limit.
- "Slows a crash, can't stop one" is the honest framing.

**Keeper liveness.**
- `poke` and `defend` are permissionless. If nobody pokes, nothing triggers, but nothing breaks either.
- The demo uses a script as keeper. A production version would add a small poke bounty (future work).

**When the treasury is empty.** `spend = min(…, treasury)`. At 0 NEAR, `defend` reverts with `E_TRIGGER`.

## 6. Creator lock

- `unlock_creator` needs `h_obs` consecutive interval TWAPs ≥ clearing. The demo default is 12; tests use 3–4.
- The pool opens at the clearing price, so with no trading the TWAP equals clearing and the streak grows.
  - So `h_obs × poke_interval` is effectively a *minimum* lock time (demo: 12 × 10 s).
  - Any interval below clearing resets the streak.
- **Attack.** A creator buys to hold the TWAP at or above clearing for H intervals, then dumps.
  - Doing so requires buying at or above clearing for the whole period. That money goes into locked LP and does not come back.
  - Mitigation: a large H (days in production). Stated as a limit.

## 7. Token deployment: embedded wasm (testnet) vs global contract (mainnet)

- Token wasm is 158,654 bytes and factory wasm is 306,187 bytes (VERIFIED, `cargo near build`, 2026-11-09).
- Storage costs 1e19 yocto per byte (VERIFIED, `02-tech-verification.md` §b).
  - **Embedded** stakes about 1.59 NEAR on each token account, plus 0.3 NEAR of state funding and a 0.1 NEAR launch fee.
  - **Global** burns 10× the per-byte rate once: about 15.9 NEAR. After that, each launch needs only the 0.3 + 0.1 NEAR.
- The contract supports both. `set_token_code` stores the bytes, and `publish_token_code_globally` switches to a global contract by hash.
  - **Testnet uses embedded**, because faucet NEAR is scarce.
  - The break-even is about 10 launches, so **mainnet should use global**.
- Measured in the sandbox: `measure_token_deploy_costs`. Numbers are in `verification/test-report.md`.

## 8. Simulation (SIMULATED) calibration

- **Bonding curve:** virtual reserves of 30 NEAR / 1.073B tokens, the same shape as pump.fun's curve (`01-prior-art.md` §5). Insiders buy in block 0.
- **Calibration check:** the simulated bundler share (about 32%) lands near MELT's 36.5% average across 41k launches (`00-brief.md` #4).
- **Insiders in SlowCook** get the strongest strategy we could think of: perfect knowledge of retail demand, bidding one tick above the clearing price retail alone would set.
- After launch, only demand the auction left unfilled may buy.
  - The first draft let retail spend whole leftover budgets into the pool. That inflated everyone's mark-to-market returns, and the draft was discarded.

## 9. Changes vs `SLOWCOOK-BRIEF.md`

| Brief | Now | Reason |
|---|---|---|
| LP/creator = fixed 30%/10% of supply | Scaled by `filled / sale_supply` | A fixed LP share makes the treasury negative under ~50% fill, so finalize panics and deposits lock (§3). |
| Unsold sale tokens are minted, then burned | Never minted; reported as burned | Same supply outcome, one fewer cross-contract call and no failure mode. |
| Non-reveal penalty 1% | 5% (configurable ≤ 20%) | It prices the free option not to reveal (§2). |
| `poke` records spot | `poke` records an interval TWAP from a swap-time accumulator | Cherry-picked spot samples can be manipulated cheaply (§5). |
| `defend` on the TWAP condition only | TWAP **and** spot below floor; buys only up to clearing | Prevents buying into a restored price and prevents overshoot (§5). |
| Epoch counted in blocks | Epoch and poke interval in milliseconds of block time | NEAR block time varies; time-based windows match the TWAP math. |
| Penalties: unspecified | Go to the treasury; no penalty in failed launches | Penalties fund price defence; nothing to protect when nothing was sold. |
| Claims: unspecified failure handling | Callback records `tokens_owed`; `claim` retries | An `ft_transfer` failure must not strand tokens. |
| Parity: 1000 auctions through the sandbox contract | 1000 through the contract's own math and settlement code; 100 through the full contract flow in the mocked VM; full flows on real wasm in the sandbox | 1000 real-wasm sandbox auctions would take hours on this machine. The same Rust code runs in both. |
| vitest for TS | `node --test` (built in) for the simulator | No extra dependencies on a resource-constrained machine. |
