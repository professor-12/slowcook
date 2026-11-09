# Architecture

## Components

```
                       ┌──────────────────────────── slowcook (one contract) ────────────────────────────┐
 creator ─create_launch─▶ factory   ──Promise: create_account + deploy/use_global + new()──▶ <sym>-<id>.<factory> (NEP-141)
 bidders ─commit/reveal─▶ auction   (buckets[64], bids, marginal lists, escrow)                        ▲ mint (finalize)
 anyone  ─finalize──────▶ auction ──────────────────────────────────────────────────────────────────────┘ ft_transfer (claim, buy)
 traders ─swap / ft_transfer_call─▶ pool (x·y=k, TWAP accumulator)                                       burn (defend)
 keeper  ─poke/defend───▶ treasury (Floor Keeper) ── buys from pool locally, burns via token
 creator ─unlock_creator▶ treasury (price-gated lock) ── ft_transfer creator allocation
                       └─────────────────────────────────────────────────────────────────────────────────┘
```

- **`contracts/slowcook`** holds the factory, the auction, the pool and the treasury in a single contract.
  - Every NEAR movement between them is a local state change, so it is atomic. Escrow becomes proceeds, proceeds split into pool and treasury, and the treasury buys from the pool, all inside one contract.
  - Cross-contract calls go only to the per-launch token, and each one has a `#[private]` callback that handles failure.
- **`contracts/token`** is a NEP-141 / NEP-145 / NEP-148 token.
  - Supply is 0 until finalize. Only the factory can mint.
  - Any holder can burn its own tokens.
  - When the factory (owner) transfers to an account that isn't registered, the token auto-registers it.
- **`sim/`** contains:
  - a bigint mirror of the clearing math (`clearing.ts`);
  - the bonding-curve vs SlowCook simulator (SIMULATED);
  - the parity-fixture generator.
- **`apps/web`** is a static Next.js 16 export. It reads through JSON-RPC and writes through `@hot-labs/near-connect`.
- **`scripts/`** contains testnet deploy and demo scripts built on near-api-js 7.4. They are testnet-only by construction.

## Walkthrough: one launch, start to finish

```
create_launch ──▶ Deploying ──on_token_deployed ok──▶ Open/Commit ──t≥commit_end──▶ Open/Reveal
                      └──fail──▶ Failed (refund creator)                                │ t≥reveal_end
                                                                                         ▼
Trading ◀──on_finalize_minted ok── Finalizing ◀──finalize (demand>0)── Open/AwaitingFinalize
   │                                    └──fail──▶ back to Open (retry finalize)         └─ no demand ─▶ Failed
   ├─ claim / refund_unrevealed (pull-based, per bidder)
   ├─ swap_near_for_token / ft_on_transfer (pool)
   ├─ poke ─▶ interval TWAP ─▶ streaks ─▶ defend (capped) ─▶ burn
   └─ unlock_creator (after h_obs intervals at/above clearing)
```

1. **`create_launch(args)`**, payable.
   - Validates the parameters: the shares sum to 100%, the creator share is ≤ 10%, the LP share is ≤ the sale share, ticks strictly increase, and nothing overflows.
   - Stores the `Launch` with status `Deploying`.
   - Sends one batch Promise to `<symbol>-<id>.<factory>` that creates the account, transfers funding, deploys the code (embedded bytes, or `use_global_contract(hash)`), and calls `new()`.
   - The callback `on_token_deployed` sets the status to `Open`. If the batch failed, it sets `Failed` and refunds the creator.
2. **`commit(launch_id, hash_hex)`**, payable, during the commit window.
   - Stores a `Bid { hash, deposit, storage_fee }`. `deposit = attached − 0.005 NEAR`.
   - Adds the deposit to `escrow`.
   - Rejects duplicates (`E_DUP`), commits over the cap (`E_CAP`), a deposit below 0.01 NEAR (`E_DEPOSIT`), and a malformed hash (`E_HASH`).
3. **`reveal(launch_id, tick, qty, salt_hex)`**, during the reveal window.
   - Recomputes `sha256("<id>:<bidder>:<tick>:<qty>:<salt>")` and compares it with the stored hash (`E_HASH`).
   - Checks `deposit ≥ price[tick] × qty` (`E_DEPOSIT`).
   - Then does `buckets[tick] += qty` and pushes `qty` onto `marginal[(id, tick)]`.
4. **`finalize(launch_id)`**: anyone may call it after the reveal window.
   - `compute_clearing` walks from tick 63 down to 0 until the cumulative quantity reaches `sale_supply`.
   - `total_filled` sums the floored pro-rata fills over the bids at the marginal tick, using the marginal list.
   - LP and creator shares scale with `filled`.
   - The status goes to `Finalizing`, and the factory calls `token.mint(factory, (filled + lp + creator) × 10^18)`.
   - The callback `on_finalize_minted`:
     - moves `proceeds` out of escrow;
     - seeds the pool with `(clearing × lp NEAR, lp tokens)`, so its spot price equals clearing;
     - funds the treasury with `proceeds − lp_near`.
5. **`claim(launch_id)`** is a per-bidder pull, so no call ever loops over all bidders.
   - The bidder receives the computed fill via `ft_transfer`, plus a NEAR refund of `deposit − clearing × filled` and the storage fee.
   - The bid record is removed once the token transfer callback succeeds. If the transfer fails, `tokens_owed` is recorded and `claim` retries.
   - Anyone can call `refund_unrevealed(launch_id, bidder)`. It refunds `deposit − 5%` and sends the 5% to the treasury.
6. **Pool.**
   - `swap_near_for_token` is payable.
   - Selling goes through `token.ft_transfer_call(factory, amount, msg)`, which calls `ft_on_transfer`. That method checks that the caller is the launch's token (`E_AUTH`) and applies `min_out` (`E_SLIPPAGE`).
   - Each swap first runs `accumulate()`: `cumulative += spot × Δt_ms`.
7. **Floor Keeper.**
   - `poke` (rate-limited) computes the interval TWAP and updates `below_streak` and `above_streak`.
   - `defend` requires all of the following:
     - `below_streak ≥ k_obs` and spot below the floor (otherwise `E_TRIGGER`);
     - budget left in this epoch (otherwise `E_EPOCH_CAP`).
   - It then buys `min(budget, NEAR needed to reach clearing)` from the pool, burns what it bought, and resets the streak.
8. **`unlock_creator`** requires `above_streak ≥ h_obs` (otherwise `E_LOCKED`). It then transfers the creator allocation.

## Why these choices (mechanism → failure prevented)

| Choice | Mechanism | Failure it prevents |
|---|---|---|
| One contract for auction, pool and treasury | Local balance moves, no cross-contract NEAR | Half-applied money flows across async receipts |
| Pull-based claims | Each bidder settles itself; finalize is O(64 + marginal bids) | Gas blow-up from looping over 500 bidders |
| Marginal-tick qty list | Exact Σ floor(q·R/B) at finalize | Minting more than is ever claimable, or stranded dust |
| LP/creator scaled by fill | `lp_near ≤ proceeds` always | Treasury underflow → finalize panics → all deposits locked |
| Mint only what sold | Burn = never minted | An extra cross-contract burn that could fail |
| TWAP accumulator | Price weighted by time, updated on every swap | Cheap one-block manipulation of the trigger |
| Spot check + target ≤ clearing in `defend` | Buy only while price is low, only up to clearing | Buying into a restored price; overshoot to sell into |
| Per-epoch cap + streak reset | ≤ r% of treasury per epoch; K new observations between defends | Treasury drained in one go |
| Callbacks on mint/transfer/burn | Failure → retry state (`Open`, `tokens_owed`, `burn_pending`) | Stuck tokens or a stuck launch after a failed receipt |
| `overflow-checks = true` in release, checked/U256 math | Panic instead of wrapping | Silent arithmetic errors with money |

## Storage and gas (measured)

- Wasm sizes (from `cargo near build`):
  - factory: 306,187 bytes, so about 3.06 NEAR staked on the factory account;
  - token: 158,654 bytes.
- **Per-launch token deploy**, two modes:
  - embedded code stakes about 1.59 NEAR on each token account;
  - a global contract burns about 15.9 NEAR once, after which each launch stores only a code-hash reference.
- Sandbox numbers for both modes, and finalize gas, are in `verification/test-report.md`.
