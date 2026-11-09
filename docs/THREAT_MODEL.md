# Threat model

**Scope:** the `slowcook` and `slowcook-token` contracts on NEAR testnet. Test NEAR only; no audit.

| # | Threat | Mitigation | Residual risk |
|---|---|---|---|
| T1 | **Sniping and first-block buying** | No price exists before finalize. Supply is 0 until mint (I4). Swaps fail with `E_NOT_FINAL`. | None for price. A sniper can still bid, but pays the clearing price. |
| T2 | **Bundling and sybil wallets** | A uniform price means splitting gives no price advantage. Commits are capped (500 per launch) for storage. | One person can still hold many wallets and buy a large share if they bring the money. **Stated limit.** |
| T3 | **Copying or front-running a commit** | The bidder's account is part of the hash preimage, so another account cannot reveal your commit. | None. |
| T4 | **Brute-forcing a sealed bid** | A 32-byte random salt is in the preimage. | None, provided the client generates a strong salt (WebCrypto / `crypto.randomBytes`). |
| T5 | **Deposit leakage** | Over-depositing is allowed and refunded (the UI defaults to +20%). | The deposit is still an upper bound on the bid. **Stated limit.** |
| T6 | **Selective non-reveal** (the free option to reveal after seeing others) | A 5% penalty paid to the treasury (configurable up to 20%). | The option is priced, not removed. Fix in v2: threshold encryption (NEAR MPC CKD). |
| T7 | **Salt loss** | localStorage plus a downloadable receipt; reveal auto-loads it. | A lost salt means paying the penalty. |
| T8 | **Finalize fails or underflows** | LP and creator shares scale with the fill. The mint callback reopens finalize on failure. A no-demand launch goes to `Failed` with full refunds. | None known. Covered by proptests over random auctions. |
| T9 | **Claim token transfer fails** | The callback records `tokens_owed` and `claim` retries. The NEAR refund is sent once. | None known. |
| T10 | **Fake token calls `ft_on_transfer`** | The predecessor must be in `token_to_launch`; otherwise `E_AUTH`. | None. |
| T11 | **Floor Keeper farming** (push the price down, trigger, sell into the buyback) | 1. Interval TWAP from a swap-time accumulator. 2. Spot must also be below the floor. 3. Buy only up to clearing. 4. At most r% per epoch. 5. Streak reset after each defend. | A patient attacker holding the price down for K intervals can extract at most r% per epoch, minus their own slippage and the arbitrage against them. **Stated limit: it slows a sell-off, it can't stop one.** |
| T12 | **Creator pumps to unlock, then dumps** | The unlock requires `h_obs` consecutive interval TWAPs at or above clearing. The pump money goes into locked LP. | It is possible with enough capital. Set `h_obs` to days in production. |
| T13 | **Keeper liveness** (nobody pokes) | `poke` and `defend` are permissionless; the demo uses a script. | With no keeper there is no defence (fail-safe, not fail-open). A poke bounty is future work. |
| T14 | **Storage griefing via many commits** | 0.01 NEAR minimum deposit, a 0.005 NEAR refundable storage fee per commit, and a 500-commit cap. | Bounded. |
| T15 | **Arithmetic overflow** | `overflow-checks = true` in release; `checked_mul` and U256 for products; parameter validation bounds `p_top × sale`. | None known. |
| T16 | **Reentrancy across async receipts** | State is updated before every cross-contract call. Callbacks are `#[private]`. `claimed` is set before the transfer (`E_DUP` on a double claim). | None known. |
| T17 | **Owner powers** | The owner can only set the token code (embedded or global hash). It cannot touch escrow, the pool or the treasury, and the contract has no admin withdraw. | A malicious owner could point *new* launches at a malicious token code. Existing launches are unaffected. Production: lock the owner or use a DAO. |
| T18 | **Wasm/VM differences** | The same Rust code is unit-tested natively, run in the sandbox as wasm, and checked by parity tests against the TS model. | Testnet gas limits differ slightly from the sandbox. |
