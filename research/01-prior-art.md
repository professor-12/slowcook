# R2: Prior art and originality

All sources accessed 2026-11-09. Labels: VERIFIED / INFERRED / HYPOTHESIS / UNKNOWN.

## 1. meme.cooking (NEAR, built by Shitzu): closest prior art

**Source.** docs.meme.cooking is GitHub Pages hosting for `shitzu-apes/meme-cooking-docs`. The rendered site timed out from this network, so the markdown source was read through the GitHub API (VERIFIED). That repo was last pushed 2024-10-31, so the docs may lag the live contract (INFERRED).

### Mechanism (VERIFIED from the docs source)
- **Window.** The creator sets a countdown of 5 minutes to 1 day. During it, anyone can deposit NEAR and also withdraw it.
- **Withdrawal penalty.** Withdrawing early costs 2%. That 2% goes to whoever is still deposited when the countdown ends.
- **Caps.** If deposits are below the creator's soft cap at the end, the token does not launch and depositors withdraw (refund). An optional hard cap launches the token immediately when reached.
- **Single price.** Tokens are pro-rata to NEAR deposited: "If you deposit twice as much NEAR, you get twice as much tokens." Everyone pays total NEAR ÷ tokens for depositors.
  - A deposit carries **no price limit**. It is a price-blind buy at whatever the final price turns out to be.
- **LP seeding.** On success, the deposited NEAR (excluding fees) plus ~50% of the distributed supply go to Ref Finance at the auction price. The LP is locked for 69 years. The other ~50% is claimable by depositors. With a team allocation of X%, the LP and depositors each get (100−X)/2%.
- **4k NEAR threshold.** The README says the token launches on Ref "if at least 4k NEAR has been deposited". The How-It-Works page instead says the soft cap is configured per token. **This contradiction is unresolved; check the live UI or contract before quoting the 4k figure** (UNKNOWN).
- **Team allocation.** Optional, with a configurable cliff and linear vesting. It is time-based, not tied to price.
- **Fees.**
  - 0.5% deposit fee, taken even if the launch fails.
  - 2% launch fee.
  - 2% early-withdrawal fee.
  - 0.045 NEAR storage registration, refundable.
- **Contracts.** Mainnet `meme-cooking.near`; testnet `factory.v10.meme-cooking.testnet`.
  - The launchpad contract "is not yet open source" and "hasn't been audited yet".
  - The token contract was audited by BlockSec in Aug 2024.
- **API** (VERIFIED). https://api.meme.cooking/ serves Swagger UI, with the spec at `/doc`. Paths include `/meme`, `/meme/{id}`, `/trades`, `/info`, `/info/daily-stats`, `/profile/{accountId}` and `/leaderboard/*`.

### Is it live? Yes (VERIFIED)
- Checked via `https://api.nearblocks.io/v1/account/meme-cooking.near/txns`. Mainnet v1 still answers; nearblocks switches v1/v2 off on 2026-11-22.
- **Volume:** 72,674 transactions in total.
- **Latest transaction:** `finalize`, sent by `operator.0xshitzu.near` at 2026-11-09 02:32 UTC (tx `4NX7fb6yhuctGnQgiDkpDLuXb19DGJFw5RA3gZwsT8AL`).
- **Last 25 transactions** (2026-11-06 05:45 to 2026-11-09 02:32 UTC):
  - `create_meme` ×7
  - `finalize` ×6
  - `storage_deposit` ×5
  - `ft_on_transfer` ×4
  - other methods: `withdraw`, `ft_transfer`, `on_claim`
- **So it is actively used, with new launches every day.**
- **Testnet:** `meme-cooking.testnet` has had no transactions since 2024-08-26 (when it created `v10`) and holds no code (code_hash `111…1`). The factory itself was not checked.

### What it lacks (INFERRED from the mechanism above)
1. **No price discovery.** Bids carry no price, so there is no demand curve and no reserve price. Late whales and herding set the price.
2. **Demand is public in real time.** The running total is visible and anyone can withdraw (for 2%), which invites last-minute gaming.
3. **No unsold supply.** All sale supply always distributes, so the price simply floats down with weak demand.
4. **Nothing after launch.** There is no price defence (no treasury), and the team unlock depends on time, not on price.

## 2. Uniswap Continuous Clearing Auctions (CCA)

**Sources.**
- blog.uniswap.org timed out here. Its date, Nov 13 2025, comes from a search result (INFERRED).
- The mechanism is VERIFIED from these first-hand sources:
  - https://developers.uniswap.org/docs/liquidity/liquidity-launchpad/concepts/cca
  - https://github.com/Uniswap/continuous-clearing-auction, specifically `docs/TechnicalDocumentation.md` and `src/interfaces/IContinuousClearingAuction.sol`

**Findings (VERIFIED).**
- **Bids are NOT sealed.** A bid is `submitBid(maxPriceQ96, amount, owner, …)` and emits `event BidSubmitted(uint256 indexed id, address indexed owner, uint256 priceQ96, uint128 amount)`. Price and size are public on-chain. Its anti-sniping comes from spreading over time, not from secrecy.
- **Price is uniform and set per block.** "The clearing price of the auction in a block is the price which all bidders in that block pay."
  - Supply is released per block on a schedule, and each bid is spread across the remaining blocks.
  - Bids above clearing fill; bids at clearing fill pro rata. A bid is removed once the clearing price rises above its max price.
  - Prices sit on a tick-based bid book with `tickSpacing` above a `floorPrice`.
- **Graduation.** The auction graduates if `currencyRaised >= requiredCurrencyRaised`; otherwise bidders get a full refund through `exitBid`. After graduation, the final clearing price initializes a Uniswap v4 pool through `liquidity-launcher`.
- **Unsold tokens** go back to `tokensRecipient` via `sweepUnsoldTokens()`. They are **not burned**.
- **Other facts.** EVM only. Audited by OpenZeppelin and Spearbit (v2.0.0, 2026-06-16). The factory v2.1.0 is at `0x000000001F26a0044BaA66024e7b6599c61963F8`.
- **Takeaway: SlowCook's 64-tick bucket design is close to CCA's tick book. Tick-based uniform clearing is not novel.**

## 3. Skyward Finance (NEAR, 2021): streaming sale
- **Mechanism** (VERIFIED from `skyward-finance/contracts` `skyward/src/sale.rs`):
  - `touch()` releases `out_token.remaining × time_diff / remaining_duration` and splits it per share among in-token depositors.
  - In-tokens are consumed linearly in the same way.
  - The effective price at each moment is in-flow ÷ out-flow. Deposits are public.
- **Status:** the repo was last pushed 2022-02-26, so it is inactive (INFERRED). Shitzu has a `launchpad` repo described as "forked from Skyward Finance" (2024-01) (VERIFIED: repo description).

## 4. Gnosis Auction (EasyAuction) and Fjord / LBPs
- **Gnosis Auction** (VERIFIED, `gnosis/ido-contracts` README):
  - It is a batch auction of limit orders (price, amount) with a minimum price and an order-cancellation deadline.
  - At the end, "the buy volumes from the highest bids are getting added up until this sum reaches the initial sell volume." The marginal bid sets the uniform clearing price, and lower bids are refunded.
  - **This is exactly SlowCook's `finalize` walk.** Orders are on-chain and public (INFERRED: the README never mentions sealing).
- **Fjord / Balancer LBP** (INFERRED: Balancer docs timed out, the Fjord help URL returned 404, and the details come from search results):
  - It is a weighted pool whose weights shift linearly over time, so the price starts high and decays unless people buy.
  - Its anti-bot effect comes from punishing early buys. Bids are public AMM trades, and the result is a price path, not one clearing price.

## 5. pump.fun bonding curve (baseline)
- **Mechanism** (VERIFIED, `pump-fun/pump-public-docs`, docs/PUMP_PROGRAM_README.md):
  - "The bonding curve formula is based on Uniswap V2 and uses synthetic x and y reserves", that is, virtual reserves.
  - When the curve completes, liquidity migrates to PumpSwap.
- **Implication:** price rises with every buy, so being first means a lower price. That is the incentive SlowCook removes.

## 6. Zaunchpad (Zypherpunk hackathon)
- **Source** (VERIFIED): https://zypherpunk-results.pages.dev/project/zaunchpad-5e0f
- **What it is:** "first ever cross chain privacy launchpad". Stack: Zcash, Solana, NEAR Intents 1Click, a Phala TEE, zkSNARKs/Circom.
- **Awards:** $5,000 from NEAR (Cross-Chain Privacy Solutions) and $2,000 from Unstoppable Wallet.
- **Focus:** mixing funds, plus private, ticket-based access to early-stage sales. It does **not** describe a price-discovery or clearing mechanism.
- It notes "NEAR Intents not having a testnet" and that they used mainnet with small amounts.
- **Overlap with SlowCook:** low. Privacy of buyer identity is not the same as sealed price discovery.

## 7. NEAR HACKATHON (Nov 2026) competitors

**Method.** GitHub search for repos created after 2026-10-18. Five of eight queries ran before an anonymous rate limit stopped the rest. X/#NEARHackathon could not be searched, so that is UNKNOWN.

| Repo | What it is | Overlap |
|---|---|---|
| `Godwin-web3/sealwell` (2026-10-26) | Sealed-bid uniform-price **batch auctions for NEAR Intents solver quotes**. Bids are encrypted with IBE to a key from NEAR MPC Confidential Key Derivation, and the key is released only when the contract closes the batch. It explicitly criticises commit-reveal as giving "a free option" not to reveal. | **Same auction primitive on NEAR, different product** (solver quotes, not token launches). It is the strongest mechanism critique of our commit-reveal. VERIFIED (README). |
| `jaywon111/near-antirug-launchpad` (2026-10-29) | Anti-rug launchpad scaffold: LP lock, vesting, fixed supply. The README says entry points are `todo!()` stubs. | Same problem, no mechanism shipped yet. VERIFIED (README). |
| `yeheskieltame/solidon` (2026-11-08) | NEAR memecoin launchpad where each meme is a treasury company holding tokenized stocks through Chain Signatures. Testnet factory `solidon.testnet`. Tracks: defi and memecoins. | Same tracks plus a treasury idea; no auction. VERIFIED (README). |
| `kangmochi/Swarmpad`, `Lokmali/NearMyst`, `alibenyezza/warband-near`, `ChrisTu117/staghunt` | Mining launchpad, gacha launchpad, a memecoin with a "rule-bound war chest", a stag-hunt token | Low; titles and descriptions only (INFERRED). |

**Conclusion: no hackathon repo found that ships a sealed-bid token launch on NEAR** (INFERRED; the search was partial).

## Differentiation in two sentences
**vs meme.cooking:** meme.cooking deposits are price-blind, visible in real time, and always distribute the whole sale supply. SlowCook instead takes sealed price-and-quantity bids on 64 ticks, sets one clearing price from the revealed demand curve, burns any unsold supply, and keeps enforcing that price after launch with a capped Floor Keeper and a creator unlock gated on price.

**vs Uniswap CCA:** CCA bids are public on-chain (`BidSubmitted` emits price and amount), and unsold tokens are swept back to the issuer. SlowCook hides prices until reveal, clears once on NEAR, burns rather than returns unsold supply, and adds post-launch rules that CCA leaves to the issuer.

**Honest note for the README.** The clearing walk (Gnosis) and tick books (CCA) are established. SlowCook's originality is the combination on NEAR: sealed bids, burn, Floor Keeper and a price-gated creator lock. Commit-reveal leaks that a commit exists and how big its deposit is, and it gives bidders a free option not to reveal. The non-reveal penalty prices that option; it does not remove it. Sealwell's MPC-CKD encryption is a possible v2 for this (HYPOTHESIS, not verified for our use).
