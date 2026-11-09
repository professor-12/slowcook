# R1: Problem evidence (memecoin sniping, bundling, rugs)

All sources accessed 2026-11-09. Labels: VERIFIED (read at the URL today), INFERRED (derived, or read only via a secondary source / search result), HYPOTHESIS, UNKNOWN.

Access note: from this machine, coindesk.com, docs.webacy.com, blog.uniswap.org and docs.near.org timed out. Where the brief named one of these, the primary source behind it was used instead and the label says so.

## Numbers the README can cite (pick 3–5)

| # | Claim (exact wording to use) | Source | Label |
|---|---|---|---|
| 1 | "Of 7M+ pump.fun tokens (Jan 2024–Mar 2025), only 97,000 kept more than $1,000 of liquidity: 98.6% collapsed." | Solidus Labs, *2025 Rug Pull Report* (May 2025): https://www.soliduslabs.com/reports/solana-rug-pulls-pump-dumps-crypto-compliance | VERIFIED |
| 2 | "Over 50% of pump.fun tokens are sniped in the same block they are created." | Pine Analytics, *Exit Liquidity Machines* (2025-04-21): https://pineanalytics.substack.com/p/exit-liquidity-machines | VERIFIED |
| 3 | "Deployer-funded same-block snipers were profitable 87% of the time; ~85% exited within five minutes." | Pine Analytics (same URL) | VERIFIED |
| 4 | "Across 41k+ Solana launchpad launches, coordinated (bundled) accounts hold 36.5% of supply on average." | MELT dataset, arXiv 2602.13480 (v2, 2026-05-21): https://arxiv.org/abs/2602.13480 | VERIFIED (abstract) |
| 5 | "August 1–28, 2026: 1,032,440 launches, 18,202 graduations, a 1.8% bond rate." | MadeOnSol (a vendor, using its own pipeline): https://madeonsol.com/blog/pump-fun-deployer-stats-august-2026 | VERIFIED (single vendor source) |

Wording caveat for #1. Solidus defines the 98.6% metric as "the percentage of tokens on Pump.fun that have fallen under $1,000 worth of liquidity measured in SOL". The same page also says "approximately 98.7%" in its intro and "98%" in its conclusion. **Cite 98.6% together with its definition.** Do not write "98.6% are rugs" as if every token were intentional fraud.

## Detail per source

### Solidus Labs: rugs and pump-and-dumps (VERIFIED)
- Window: tokens created on pump.fun between January 2024 and March 2025. "Over 7 million tokens deployed with at least five trades, but only 97,000 tokens maintain liquidity above $1,000."
- Raydium: of 388,000 pools examined, ~93% (361,000) showed "soft rug pull" traits, meaning liquidity was pulled abruptly.
- The brief's CoinDesk article (https://www.coindesk.com/business/2025/05/07/98-of-tokens-on-pump-fun-have-been-rug-pulls-or-an-act-of-fraud-new-report-says) timed out here. Its headline appears in search results, so it is INFERRED. CryptoPotato repeats the same figures (VERIFIED): https://cryptopotato.com/98-of-tokens-on-pump-fun-are-rug-pulls-or-fraud-report/ . **Cite Solidus as the primary source.**

### Pine Analytics: same-block sniping (VERIFIED, published 2025-04-21)
- "Over 50% of tokens are now sniped in the exact block they're created."
- The strict subset funded by the deployer (a direct SOL transfer between deployer and sniper before launch) covers 15,000+ launches, 4,600+ sniper wallets and 10,400+ deployers. That subset made 15,000+ SOL of realized profit in one month.
- 87% of snipes were profitable. More than 55% were fully exited in under one minute, and nearly 85% within five minutes. Over 90% sold in one or two swaps.
- Caveat: this is a lower bound, because the method only catches direct funding links and misses multi-hop funding chains. Solana has no global mempool, so same-block buys imply privileged or shared infrastructure.

### Bundling and sniping definitions
- **Sniper** (Mobula docs, VERIFIED): "a wallet that purchases tokens within the first few blocks (typically 0-3 blocks) after a token launches." https://docs.mobula.io/almanac/detecting-snipers-bundlers
- **Bundler** (Mobula, VERIFIED): "coordinates multiple wallets to buy in the same block or even the same transaction."
- **Bundling mechanism** (MadeOnSol, 2026-03-21, VERIFIED): https://madeonsol.com/blog/solana-bundling-explained
  - A Jito bundle is atomic: the create transaction and the deployer's buys from 10–20 wallets land in one block, in a guaranteed order.
  - Its "typical bundled launch" example has deployer wallets controlling "20-60% of initial supply". **This is an illustrative range, not a measurement; do not cite it as data.**
- The Webacy glossary (https://docs.webacy.com/glossary/snipers-bundlers) timed out, so its content is UNKNOWN.

### 2025–2026 data on block-0 supply share and first-block buyer outcomes
- **Supply share** (VERIFIED, MELT 2026): coordinated accounts hold 36.5% of supply on average across 41k+ launches. This is the best 2026 figure for supply share, but it counts bundled accounts generally, not only block 0.
- **Sniper prevalence** (INFERRED, secondary): CoinPaprika (2026-10-19) says a study of 6,000 pump.fun coins found a sniper buying within the first five blocks on 84% of sampled launches. The study is "SBFC 2025: Decomposing Market Manipulation in Meme Coins" (sydney.edu.au). The primary source was not fetched. https://coinpaprika.com/education/launchpad-red-flags/
- **Case examples** (VERIFIED, Cointelegraph 2026-05-06): https://cointelegraph.com/news/bubblemaps-flags-mystery-over-90-wallet-launch-sniping-cluster
  - Bubblemaps: 90 newly funded wallets bought 90% of MYSTERY supply at launch, and the token then fell ~75% from its peak.
  - Nov 2025 (Bubblemaps claim, disputed by the team): ~160 wallets took 30% of EDEL supply.
- **Do not cite** arXiv 2607.02795 ("Coordinated Sniper Cohorts on Pump.fun", June 2026 data). Its Oct 2026 revision says "all numerical results below are withdrawn pending a corrected analysis" (VERIFIED at https://arxiv.org/abs/2607.02795).
- **First-block buyer outcomes in 2026: UNKNOWN.** No valid 2026 dataset was found on how block-0 buyers perform afterwards. The best evidence is Pine 2025 (87% profitable, exits within minutes). The claim that retail who buy after the snipers are their exit liquidity is INFERRED from that, not measured.

## What this means for SlowCook (INFERRED)
- Snipers profit from **ordering** (being in block 0) and from **exiting fast**. SlowCook removes the first: a sealed uniform-price auction gives a block-0 bidder no price edge. It dampens the second only partly: the Floor Keeper is capped and slows a dump, it does not stop one.
- The README must not claim SlowCook prevents rugs. A fair claim is that it removes the price advantage of being first, and that the creator cannot sell their allocation until the price holds at or above clearing.
