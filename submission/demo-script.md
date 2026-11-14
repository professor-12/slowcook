# Demo video

**Rendered:** `submission/video/slowcook-demo.mp4`, 2:17 (137.3 s), re-rendered 2026-11-14 after the creator-lock fix, 1280×720 H.264/AAC, 7.8 MB (git-ignored). Captions are burned in; the separate caption file is `submission/video/slowcook-demo.en.srt`.

**Regenerate:**
```bash
PIPER_BIN=<venv>/bin/piper PIPER_VOICE=<path>/en_US-joe-medium.onnx node scripts/video/make-demo.ts
```

**How it is made**
- **Voice:** synthetic, generated locally with Piper using the CC0 "joe" voice. Say so if asked.
- **Footage:** headless recordings of the site (on 2026-11-14 recorded from the local build of commit `96fbc1f`, served by `scripts/serve-web.ts`, because Vercel's security checkpoint now refuses headless browsers; the page data is read live from testnet either way), plus three terminal cards that replay real lines from the 2026-11-14 launch 0 and dump runs on the fixed factory (`slowcook-674040.testnet`). Omitted lines, and one line copied from the result file, are marked `[…]`.
- **Narration and sources:** `scripts/video/narration.ts`. Every figure there has a source comment.

**Scenes:** title → problem (home) → how it works (home) → SIMULATED results (/why) → real launch (terminal) → clearing (launch 0 page) → sell-off and Floor Keeper (terminal) → live result (launch 0 page) → creator lock and vest (terminal) → tests and links (end card).

---

# Demo video script (~2 min)

**What to show:** the live site (https://web-omega-dun-65.vercel.app), launch 0 at https://web-omega-dun-65.vercel.app/launch/?id=0 ("SlowCook Deep Pool" on `slowcook-674040.testnet`), plus a terminal.

**Where the numbers come from:** the REAL testnet run on 2026-11-14 on the fixed contract, recorded in `results/launch-0-2026-11-14T01-51-38-296Z.json` and `results/dump-0-2026-11-14T02-08-47-558Z.json`. The auction and buyback numbers equal the 2026-11-12 launch 1 run (same plan, same pool reserves). If you re-run the demo for recording, read the numbers from the new output instead.

**Labelling:** simulation numbers are SIMULATED, so say so on screen.

| Time | Screen | Voice-over |
|---|---|---|
| 0:00 | Home page hero | "On pump.fun, more than half of tokens are sniped in their first block, and bundled wallets hold over a third of supply. Being first is the whole game. SlowCook makes being first worthless." |
| 0:15 | `/why`: SIMULATED chart | "Same 200 wallets, 1,000 simulated runs. On a bonding curve, bots and a bundler take 40% of supply and make 437% by dumping. In SlowCook they take 11% and lose 9% — even though we let them see all of retail demand." |
| 0:40 | Launch 0 page: 12 sealed commits; nearblocks shows a commit with no price | "Twelve wallets commit sealed bids on NEAR testnet. Only a hash goes on-chain. Nobody can see a price, not bots, not the creator. A wrong reveal is rejected." |
| 1:00 | Histogram with the clearing line; claims in the terminal | "Anyone finalizes. One clearing price: 0.0000195 NEAR per token, for everyone. A wallet that bid seven times higher paid exactly the same price. All 600,000 tokens sold, and the pool opens at exactly that price with 5.86 NEAR. Our model predicted this result to the yoctoNEAR before the launch." |
| 1:25 | `demo:dump 0` terminal + Floor Keeper panel | "Now a sell-off: six holders dump 308,000 tokens and the price falls to a quarter. After three time-weighted intervals below the floor, the Floor Keeper buys back and burns 103,000 tokens, using exactly its 10% cap. A second defence in the same epoch is refused." |
| 1:45 | Creator-lock terminal | "Creator tokens are locked for at least 7 days; this demo uses 15 minutes. With the price held above clearing + 5%, the creator tried early and the contract refused. After the lock, tokens vest over time: 61,937 part-way through, the rest at the end." |
| 2:00 | README tests table | "Judged on the mechanic: every rule is a contract method with a test, plus 1,000-case property tests and exact parity between our model and the contract. Repo and a five-minute reproduction below. Built at NEAR HACKATHON." |

## Shots to capture

| Moment | Link |
|---|---|
| Sealed commit (no price visible) | https://testnet.nearblocks.io/txns/2wLspUMft8hBzqhHQUERzMzny5duWXxy6hzc8F6yZTX2 |
| Wrong-salt reveal rejected | https://testnet.nearblocks.io/txns/AkesCVnE4yYs47fiqbsT6RdzLZvcoee3gouHU2pzPZJ6 |
| Finalize | https://testnet.nearblocks.io/txns/9rRsEJcQNgcas1VndVUGNoVtXcg8GvEKdjLiPWj4g2fr |
| Defend (spent 0.5929 NEAR, burned 103,215) | https://testnet.nearblocks.io/txns/E29i7jvS7YGLW4twXPEPjrtgUEU6zKq1BisE4YhTfZas |
| Second defend refused | https://testnet.nearblocks.io/txns/3oirdDs8iuzHddc3PEdGzq46uv1ugZFaBJC2m8BhCCsc |
| Creator release refused during the lock (price held) | https://testnet.nearblocks.io/txns/DARXW1JeJ7uPo83DAPiJ4VQVP5gb3VPVvAvxABQXzmKg |
| Creator release mid-vest (61,937) | https://testnet.nearblocks.io/txns/4sPCkd6jZGjuvfoKHCLJsurpM9RZzsoYvk55kpAccEky |
| Creator release after the vest (38,063) | https://testnet.nearblocks.io/txns/3qkrio5WFX1Z19cfRWihUYzwAALyHjjbcPDkQDS6RBuw |

Ready-made page screenshots (1280 px wide) are in `verification/web-check/`.
