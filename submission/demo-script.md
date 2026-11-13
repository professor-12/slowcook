# Demo video script (~2 min)

**What to show:** the live site (https://web-omega-dun-65.vercel.app), launch 1 at https://web-omega-dun-65.vercel.app/launch/?id=1 ("SlowCook Deep Pool"), plus a terminal.

**Where the numbers come from:** the REAL testnet run on 2026-11-12, recorded in `results/launch-1-*.json` and `results/dump-1-*.json`. If you re-run the demo for recording, read the numbers from the new output instead.

**Labelling:** simulation numbers are SIMULATED, so say so on screen.

| Time | Screen | Voice-over |
|---|---|---|
| 0:00 | Home page hero | "On pump.fun, more than half of tokens are sniped in their first block, and bundled wallets hold over a third of supply. Being first is the whole game. SlowCook makes being first worthless." |
| 0:15 | `/why`: SIMULATED chart | "Same 200 wallets, 1,000 simulated runs. On a bonding curve, bots and a bundler take 40% of supply and make 437% by dumping. In SlowCook they take 11% and lose 9% — even though we let them see all of retail demand." |
| 0:40 | Launch 1 page: 12 sealed commits; nearblocks shows a commit with no price | "Twelve wallets commit sealed bids on NEAR testnet. Only a hash goes on-chain. Nobody can see a price, not bots, not the creator. A wrong reveal is rejected." |
| 1:00 | Histogram with the clearing line; claims in the terminal | "Anyone finalizes. One clearing price: 0.0000195 NEAR per token, for everyone. A wallet that bid seven times higher paid exactly the same price. All 600,000 tokens sold, and the pool opens at exactly that price with 5.86 NEAR. Our model predicted this result to the yoctoNEAR before the launch." |
| 1:25 | `demo:dump 1` terminal + Floor Keeper panel | "Now a sell-off: six holders dump 308,000 tokens and the price falls to a quarter. After three time-weighted intervals below the floor, the Floor Keeper buys back and burns 103,000 tokens, using exactly its 10% cap. A second defence in the same epoch is refused. The creator's tokens stayed locked until the price recovered and held." |
| 1:50 | README tests table | "Judged on the mechanic: every rule is a contract method with a test, plus 1,000-case property tests and exact parity between our model and the contract. Repo and a five-minute reproduction below. Built at NEAR HACKATHON." |

## Shots to capture

| Moment | Link |
|---|---|
| Sealed commit (no price visible) | https://testnet.nearblocks.io/txns/8qS9zG6ibYxFNr8muTHFx6VBULYjBxBujRC31rscsLs2 |
| Wrong-salt reveal rejected | https://testnet.nearblocks.io/txns/EtCZhXJW4A8HDhZ5xYn8Uw2No8RZuv3bYeyDAys5qrgF |
| Finalize | https://testnet.nearblocks.io/txns/so2LEkqWAMjBxJwyFYuXQsUjLtAEFppxfqgKLVyCKCT |
| Defend (spent 0.5929 NEAR, burned 103,215) | https://testnet.nearblocks.io/txns/CaWtxdoqnjjLRqHXHSYJpwQvEPxHNv8f2BWU8pRLXLmh |
| Second defend refused | https://testnet.nearblocks.io/txns/D3KCfRbkMJECbjdWqwa4Bjk5fzdXGKwsk4xFDuqYjPcX |

Ready-made page screenshots (1280 px wide) are in `verification/web-check/`.
