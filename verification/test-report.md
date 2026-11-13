# Test report (real results only)

- **Machine:** WSL2, 4 cores, 8 GB RAM, Rust 1.97.0, Node 24.17.0.
- **Date:** 2026-11-09.
- **Rule:** every number below comes from a run whose output is quoted here or saved in `results/`. Nothing is estimated.

## 1. Contract unit, property and parity tests

Command:
```bash
node sim/src/parity.ts --cases 1000 && PROPTEST_CASES=1000 cargo test -p slowcook -p slowcook-token -j 2
```

Output:
```
wrote 1000 parity cases { Over: 912, Under: 88 }
running 54 tests
test result: ok. 54 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 217.92s
running 4 tests
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s
```

**`slowcook` (54 tests)** breaks down as:
- **51 unit tests**: 6 for `math.rs` and 45 for contract flows.
- **1 property test** over **1000 random auctions**.
- **2 parity tests**: 1000 cases through the pure math, and 100 cases through the full contract flow in the mocked VM.

**`slowcook-token`** has 4 unit tests.

**Coverage by rule**

| Rule / invariant | Tests |
|---|---|
| Error codes | E_PHASE ×4, E_HASH ×2 (+ property), E_DEPOSIT ×3 (+ property), E_DUP ×3 (+ property), E_CAP, E_NOT_FINAL ×3, E_SLIPPAGE, E_TRIGGER, E_EPOCH_CAP, E_LOCKED, E_AUTH ×2, E_PARAMS ×4, E_NO_BID, E_TOO_SOON |
| I1 (supply = filled + lp + creator; burn) | `undersubscribed_burns_and_scales_shares`, property |
| I2 (paid + refund + penalty = deposit) | `oversubscribed_uniform_price_and_pro_rata`, property, parity |
| I3 (escrow → 0; pool + treasury = proceeds + penalties) | property, sandbox `get_solvency` |
| I4 (no transfer or swap before finalize) | `no_swaps_before_finalize`, `no_sells_before_finalize`, token `supply_starts_at_zero`, sandbox |
| I5 (defend ≤ r% per epoch, only on trigger) | `dump_triggers_capped_defend_then_epoch_cap_then_next_epoch`, `defend_requires_trigger`, sandbox, testnet |
| I6 (a bad reveal is always rejected; at most one reveal) | `reveal_mismatch_rejected_and_bid_stays_sealed`, `reveal_twice_rejected`, property |
| TWAP resists one-block manipulation | `twap_ignores_a_one_block_dip` |
| Failure callbacks | `failed_token_deploy_marks_launch_failed`, `failed_mint_reopens_finalize`, `failed_token_transfer_on_claim_can_be_retried`, `failed_buy_transfer_is_reversed` |

**What these tests do not prove**
- They run on the near-sdk mocked VM, natively. Gas and the real async receipt ordering are covered only by the sandbox and testnet runs below.
- The property tests draw up to 23 bidders per auction. The 500-commit cap is not stress-tested.

## 2. Sandbox integration (real wasm, near-sandbox 2.14.0)

Command:
```bash
pnpm build:contracts && cargo test -p slowcook-integration-tests -- --nocapture --test-threads 1
```

Output:
```
test dump_defend_epoch_cap_and_creator_unlock ... defend: spent 121366732071237304680000 yocto, burned 99625094101755740488560 base units
test full_launch_30_bidders ... finalize gas burnt: 7.05 Tgas
solvency after 30-bidder launch: {"balance":"502887729011410133507399985","owed":"2791434837638458007400000","solvent":true,"storage_locked":"4680890000000000000000000"}
test measure_token_deploy_costs ... embedded: creator paid 3.9580 NEAR, token account storage 159011 bytes, balance 2.9000 NEAR
global publish cost (one-off): 16.8468 NEAR
global: creator paid 1.9764 NEAR, token account storage 389 bytes
test undersubscribed_burn_path ... ok
test result: ok. 4 passed; 0 failed; ... finished in 161.58s
```

**Readings**
- **Finalize gas.** Finalize for 30 bidders burns **7.05 Tgas**, far below the 300 Tgas limit.
- **Token deploy mode.**
  - With **embedded** code, each token account stores **159,011 bytes**, about 1.59 NEAR staked.
  - With a **global** contract, it stores **389 bytes**. The global publish cost **16.85 NEAR once**: the documented 10 NEAR per 100 KB on 158,654 bytes, plus gas.
- **Unexplained cost.** In both modes, "creator paid" is about 0.96 NEAR above the attached deposit (3 NEAR and 1 NEAR respectively). The test attaches `max_gas()` (300 Tgas), so this is most likely the prepaid-gas reservation at the sandbox's gas price. **Not investigated further.**
  - On testnet, the creator's real cost for launch 0 was the 2.1 NEAR deposit plus gas. Compare `sc-creator-b44c88.testnet`'s balance history.

## 3. NEAR testnet (REAL, test NEAR)

- **Factory:** `slowcook-0dd752.testnet`.
  - Deploy: [FH1qe61C…](https://testnet.nearblocks.io/txns/FH1qe61Cj89NWQsSYtsGjgwgd8jEBpEGTp3T5SN5BHSB).
  - Init: [HAYL3NDg…](https://testnet.nearblocks.io/txns/HAYL3NDgapGCvgLpH622Mmm7jZpTsdYUv41mHDiEWiuU).
  - Token code upload: [DnV3zxs1…](https://testnet.nearblocks.io/txns/DnV3zxs1gYGRdZViQYmJByBjU3AgTyuAJuzynTgR7AH1).
- **Redeployed after launch 0** with the post-clippy build: [DLYzt322…](https://testnet.nearblocks.io/txns/DLYzt322WjJVv4pnvinY14nNuVcUgfC1yvnUXhhqRVZd).
  - The on-chain `code_hash` is now **`9A6qZZvajAXpEfa7UCrzNuZ1HF1ushD8wb7TdCSiSsEy`**, which equals the base58 sha256 of the repo's `target/near/slowcook/slowcook.wasm`. Checked with RPC `view_account`.
  - Launch 0 ran on the previous build (code hash `As9PhnQbhw4etQB15CaVHp7ABmo8TaUQMyKgVuGCZ3Gw`).
  - The only source differences between the two builds:
    - `validate()`'s supply range check rewritten as `RangeInclusive::contains`, which is the same predicate;
    - the `uint` macro wrapped in a module to scope a lint allowance.
  - State stayed readable after the redeploy.

### Launch 0: `pnpm demo:launch` → `results/launch-0-2026-11-09T17-25-20-089Z.json`

**Setup:** 12 throwaway wallets with 0.3 NEAR of buying power each, 90 s commit and 90 s reveal windows.

**Steps**
- **Commits.** All 12 were sealed; the bid view showed `tick=null qty=null`.
- **Wrong-salt reveal** was rejected: [F6niuojx…](https://testnet.nearblocks.io/txns/F6niuojx8Ebn6BXaix1K161Zxg4fB2wf22kKX6NcgoBb).
- **Reveals.** 11 revealed and 1 deliberately did not.
- **Client crash.** The first run of the script crashed on an RPC timeout (`ETIMEDOUT`) after all 11 reveals had landed on-chain. `demo-launch.ts --resume 0` then finished finalize and the claims. The first-run tx links are saved under `steps_first_run`.
- **Finalize:** [HMH1GLb3…](https://testnet.nearblocks.io/txns/HMH1GLb3rhSq3AYaihM5gfCWKC6dfZeMVXYmBfSZ5if4). Verified via RPC `tx`: `finalize` returned `SuccessValue`.

**Outcome**
- **Clearing price:** **2,313,060,765,625,000,000 yocto/token** (tick 6).
- **Supply:** filled 599,999 of 600,000. Burned 3: 1 token of pro-rata dust plus 2 from flooring the LP and creator shares. Token `ft_total_supply` = 999,997 × 10^18.
- **Sniper** (`b0`, tick 20, about 5× the clearing price) paid **0.0424 NEAR for 18,330 tokens**: exactly clearing × 18,330. Claim: [bZgHTwYr…](https://testnet.nearblocks.io/txns/bZgHTwYrGA4HM8Joz5GHWXvfxgMP6tYcTymxT79VwBf).
- `every_winner_paid_clearing_price: true`.
- **Losing bids** below the clearing tick (b1, b7, b8) were refunded 0.36 NEAR in full. Example: [AjaxVcSQ…](https://testnet.nearblocks.io/txns/AjaxVcSQVJyK6zD6nuPCUSU3o1DQgVnG87rKXaDwb8vL).
- **No-show** `b11` was penalised 0.0180 NEAR (5% of 0.36) into the treasury: [FsdkyHFZ…](https://testnet.nearblocks.io/txns/FsdkyHFZGzMUbjj9qQWgTL2DoyeEQnDLz7nQEYwmexiS).
- **Pool** opened at spot = **2,313,060,765,625,000,000**, equal to the clearing price. Treasury: 0.7119 NEAR.

### Dump and defend: `pnpm demo:dump 0` → `results/dump-0-2026-11-09T17-30-11-731Z.json`

1. **Creator unlock right after launch:** `E_LOCKED`. [6imfP3nq…](https://testnet.nearblocks.io/txns/6imfP3nqDpeSh9aiyUucVBsUcMSmjkLB5Kj5TBevcLfG)
2. **The dump.**
   - Five holders sold 363,761 tokens.
   - Spot fell from 2.313e18 to 4.74e17, below the floor of 2.08e18.
   - `defend` before the trigger: `E_TRIGGER`. [8Ng2Jnku…](https://testnet.nearblocks.io/txns/8Ng2JnkuAZ4CGxawfGw8AUPdPJa38igcoxPTU9ML7yW2)
3. **Trigger and buyback.**
   - Three pokes at 10 s+ intervals recorded interval TWAPs of 1.05e18, then 4.74e17 and 4.74e17. The first interval included pre-dump time, which is the TWAP working as designed.
   - **`defend` #1** spent **0.0712 NEAR**. That is exactly 10% of the 0.7119 NEAR treasury, i.e. the r_bps cap. It bought and **burned 122,278 tokens**; supply went from 999,997 to 877,718. Spot rose to 7.12e17 and stayed below clearing.
   - Transaction: [Wp1ajEf4…](https://testnet.nearblocks.io/txns/Wp1ajEf447JynvrHj9DowExuh2NcLR2QV88j6STB4jv). Verified via RPC: `SuccessValue`.
4. **Epoch cap.** Three more pokes in the same epoch, then **`defend` #2 → `E_EPOCH_CAP`**. [exkZu2Ka…](https://testnet.nearblocks.io/txns/exkZu2KgAushWQcfDVpp24SGsKVw5CWxWEjxAuCG45N) Verified via RPC: `Failure`, "Smart contract panicked: E_EPOCH_CAP".
5. **Creator unlock.**
   - A buyer swapped 2 NEAR. The pool is thin (about 0.7 NEAR), so spot jumped to about 11× clearing.
   - The TWAP then held at or above clearing for 7 pokes.
   - **`unlock_creator`** succeeded; the creator now holds **99,999 tokens**. [C7GCT6rJ…](https://testnet.nearblocks.io/txns/C7GCT6rJGsBz3AnGJNoF9fWfsRY4zKSqy74zPiAxerPk)
6. **Solvency** (`get_solvency` after everything): balance 13.120 NEAR ≥ owed 3.026 NEAR + storage 4.681 NEAR → `solvent: true`.

**What the testnet run does not prove**
- **Scale.** It is one launch with 12 wallets.
- **Who called.** All wallets, the keeper and the buyer were controlled by the script.
- **Pool depth.** About 0.7 NEAR of liquidity is tiny, so price moves are exaggerated.

### Launch 1, deep pool: `results/launch-1-2026-11-12T07-16-28-408Z.json` (2026-11-12)

**Command:**
```bash
DEMO_BUDGET_NEAR=1.3 DEMO_TICKS=6,7,8 DEMO_OVERDEPOSIT_PCT=10 DEMO_MIN_POOL_NEAR=5 DEMO_SYMBOL=DEEP DEMO_NAME="SlowCook Deep Pool" pnpm demo:launch
```

**Funding.** About 28 testnet NEAR in total: two new faucet accounts (`sc-fund1-c288b5`, `sc-fund2-cc12fd`) transferred 9.95 NEAR each to the funder, and 5 NEAR came from the creator account.

**Prediction before launch.** `--plan-only` used the TS model to pick the highest `p_min` (on a 2% grid) at which the sale is still oversubscribed.
- `p_min` = 8,441,866,397,879,956,656 yocto.
- Predicted: clearing 19,526,549,953,584,173,415 yocto/token (tick 6), 600,000 filled, pool **5.8580 NEAR**.

**On-chain result.**
- **Matches the prediction exactly** on clearing price, amount filled and pool NEAR: `onchain_matches_prediction: {clearing_price: true, filled: true, pool_near: true}`.
- Burned 0. The pool opened at exactly the clearing price, with 5.858 NEAR + 300,000 tokens. Treasury 5.9295 NEAR, including a 0.0715 NEAR penalty.
- Finalize: [so2LEkqW…](https://testnet.nearblocks.io/txns/so2LEkqWAMjBxJwyFYuXQsUjLtAEFppxfqgKLVyCKCT), verified via RPC `tx`: `SuccessValue`.
- **Uniform price.** `every_winner_paid_clearing_price: true`. The sniper (tick 20, about 7× clearing) paid 0.1837 NEAR for 9,409 tokens.
- **Pro rata at the margin.** The four tick-6 bids each got 66,473 of the 66,576 tokens they asked for.

**Incident: two clients ran at once (no on-chain harm).**
- The original run logged an RPC `ETIMEDOUT` but kept running. My log-watcher matched the word "Error" and treated it as a crash, so I started `--resume 1`. Both clients then revealed.
- Wallet b2's reveal landed via the resume run ([FBeJDUsR…](https://testnet.nearblocks.io/txns/FBeJDUsRXu79Umc3T9bxEM3LfbFBuzhti6D6TrMar4U1)).
- **Every duplicate reveal was rejected `E_DUP`.** Example: [N48P2E1F…](https://testnet.nearblocks.io/txns/N48P2E1FTyRLTt1bdpnMgnAmeUL8vrd7YAKYW7xURr9). This is invariant I6 holding on testnet.
- I stopped the resume run before finalize; finalize and all claims came from the original run.
- Fixes: `--resume` now handles the reveal phase, and the retry filter in `scripts/lib.ts` now also treats near-api-js's `Exceeded N providers` failover error as a network error.

### Dump and defend on launch 1: `results/dump-1-2026-11-12T07-21-36-824Z.json`

1. **Creator unlock right after launch:** `E_LOCKED` ([3AUwtZ8v…](https://testnet.nearblocks.io/txns/3AUwtZ8vChDJ4KTr1H9Q7zC4DsU5D4Zb63atzPZw3xJN)).
2. **The dump.** Six holders sold 308,480 tokens; spot fell from 1.953e19 to 4.756e18 (24% of clearing). `defend` before the trigger: `E_TRIGGER` ([DtdN6JUA…](https://testnet.nearblocks.io/txns/DtdN6JUAgpW8p47AqbgArCrNL283DeKHDEkZ6k3q5fiG)).
3. **Trigger and buyback.** Three interval TWAPs: 9.33e18, then 4.76e18 and 4.76e18.
   - **`defend` #1** spent **0.5929 NEAR**, which is 10.0% of the 5.9295 NEAR treasury, i.e. the cap.
   - It bought and **burned 103,215 tokens**: supply 1,000,000 → 896,784. Spot rose to 6.90e18 and stayed below clearing.
   - Transaction: [CaWtxdoq…](https://testnet.nearblocks.io/txns/CaWtxdoqnjjLRqHXHSYJpwQvEPxHNv8f2BWU8pRLXLmh). RPC: `SuccessValue`.
4. **Epoch cap.** Three more pokes, then **`defend` #2 → `E_EPOCH_CAP`** ([D3KCfRbk…](https://testnet.nearblocks.io/txns/D3KCfRbkMJECbjdWqwa4Bjk5fzdXGKwsk4xFDuqYjPcX)). RPC: `Failure`, "E_EPOCH_CAP: epoch budget spent".
5. **Recovery and creator unlock.**
   - The script now sizes the recovery buy from the pool reserves, targeting 1.10× clearing. It bought **2.6914 NEAR** worth, and spot reached 2.164e19 (1.108× clearing).
   - After 6 intervals at or above clearing, **`unlock_creator`** succeeded and the creator holds 100,000 tokens ([FnVVh9KX…](https://testnet.nearblocks.io/txns/FnVVh9KXAxgDzSw553H9wQTdP15eQjTTMFT7nWY7za6H)). RPC: `SuccessValue`.

**What launch 1 adds over launch 0.**
- A 5.86 NEAR pool instead of 0.7 NEAR.
- An on-chain result predicted exactly in advance.
- A realistic recovery: 2.69 NEAR lifts the price to 1.11× clearing, where on launch 0 a 2 NEAR buy overshot to about 11×.

**Same limits as launch 0:** script-controlled wallets, and a single run.

## 4. Simulator (SIMULATED)

- **Tests:** `node --test sim/test/*.test.ts` → 8 pass, 0 fail.
- **Run:** `node sim/src/run.ts --seeds 1000` → 2.6 s.
- **Results:** in `results/sim-summary-SIMULATED.json`, with the table in `sim/README.md`.

## 5. Static checks

- `cargo clippy -p slowcook -p slowcook-token --tests -- -D warnings` → clean.
- `cargo fmt --all --check` → clean.
- `apps/web`: `tsc --noEmit` → clean.
- **Not run:** the GitHub Actions workflow (`.github/workflows/ci.yml`). The repo has no remote yet.

## 6. Web app

**Redesign (2026-11-12).** The app was rebuilt to the owner's design standard (fintech pack): tokens, typed copy, accessibility, motion level 2, and dataviz-spec charts. Full report: [`docs/design/qa-report.md`](../docs/design/qa-report.md).

**Headless QA:** `node scripts/serve-web.ts 8765`, then `node scripts/check-web.ts http://127.0.0.1:8765`.
- **Pages:** home, create, launch 0, launch 1, why and 404.
- **Content:** all pages pass, and the wallet selector opens.
- **axe-core 4.14 (WCAG 2.2 AA tags):** **0 violations** on every page.
- **Controls under 24px:** 0.
- **Matrix:** **72 of 72** page × width (320/375/768/1024/1440/1920) × motion (normal/reduced) runs have no console or page errors and no horizontal overflow.
- Report: `results/web-check-2026-11-12T08-39-12-309Z.json`. Screenshots: `verification/web-check/` (1440 and 375).

**Lighthouse 13.6** (mobile defaults): `node scripts/lighthouse.ts`, report `results/lighthouse-2026-11-12T08-40-18-686Z.json`.
- **Accessibility, best practices, SEO:** 100 on all four pages.
- **Performance:**
  - home 91–99, create 81–100 and why 74–88, depending on machine load (CPU benchmark 482–1495 across runs);
  - **launch 61–79**, with LCP of about 5.5 s, because the page renders live chain data after hydration in a static export.
- **CLS:** 0 on all pages.

**Not tested:**
- a hosted URL (nothing is hosted yet);
- signing with a real wallet;
- a screen reader.

## 7. Fresh-clone test (2026-11-10)

**Method.**
- `git clone` of commit `d6131c1` into a new directory, then the README steps: `pnpm install` → `pnpm build:contracts` → `pnpm test` → `pnpm sim` → `pnpm -C apps/web build`.
- It is **not a clean machine**: the toolchain, the pnpm store and the Cargo build cache (`CARGO_TARGET_DIR` pointed at the main checkout's `target/`) were shared, to avoid about 6 GB of duplicate build artifacts.
- What it proves: the *committed files* plus the README commands are enough. Nothing depends on git-ignored local files.

**Results.**
- `pnpm install`: 95 packages, OK.
- `pnpm test`:
  - **ALL CONTRACT TESTS PASSED**: 54 + 4 tests, `PROPTEST_CASES=1000`, 243.6 s;
  - simulator tests passed;
  - 1000 parity fixtures generated.
- `pnpm sim`: same table as before (insider share 40.3% vs 10.7%).
- Web build: 5 static routes.
- **Bug found and fixed:** `pnpm build:contracts` failed (exit 2) when `CARGO_TARGET_DIR` is set, because the wasm went to that directory while the scripts and sandbox tests read `<repo>/target/near`.
  - Fixed in commit `c24e29c`: `build-contracts.sh` now passes `--out-dir <repo>/target/near/<crate>`.
  - Re-run in the clone: exit 0. The clone's wasm is **byte-identical** to the main checkout's: sha256 `793252aa…` for the factory, `440d1fb0…` for the token.
- **Deployed code matches the repo:** the base58 sha256 of the factory wasm, `9A6qZZvajAXpEfa7UCrzNuZ1HF1ushD8wb7TdCSiSsEy`, equals `slowcook-0dd752.testnet`'s on-chain `code_hash` (RPC `view_account`, 2026-11-10).

**Not covered in the fresh clone:**
- `pnpm test:sandbox`: it passed in the main checkout on 2026-11-09 (§2) and is heavy to re-run;
- the testnet scripts, which need keys.
