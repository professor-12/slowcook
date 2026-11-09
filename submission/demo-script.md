# Demo video script (~2 min)

Record the screen on the web app plus a terminal running `pnpm demo:launch` / `pnpm demo:dump`. Read the numbers from the real outputs, not from this script.

| Time | Screen | Voice-over |
|---|---|---|
| 0:00 | Home page hero | "On pump.fun, more than half of tokens are sniped in their first block, and bundled wallets hold over a third of supply. Being first is the whole game. SlowCook makes being first worthless." |
| 0:15 | /why: SIMULATED chart | "Same 200 wallets, 1000 runs. On a bonding curve, bots and a bundler take 40% of supply and make 437% by dumping. In SlowCook they take 11% and lose about 9%, even when they know all of retail demand. Simulated, method in the repo." |
| 0:40 | Terminal: demo:launch commits; launch page shows commits ticking up, histogram empty | "Twelve wallets commit sealed bids on NEAR testnet. Only a hash goes on-chain. Nobody can see a price, not bots, not the creator." |
| 1:00 | Reveal → histogram fills → finalize → clearing line | "Reveal, then anyone finalizes. One clearing price for everyone, including the wallet that bid five times higher. The unsold supply was never minted. The pool opens at exactly that price." |
| 1:25 | demo:dump: dump, pokes, defend, E_EPOCH_CAP; treasury panel | "A scripted sell-off. After the time-weighted price sits below the floor, the Floor Keeper buys back and burns, capped at 10% of the treasury per epoch. A second defend in the same epoch is refused. The creator's tokens stayed locked until the price recovered." |
| 1:50 | README tests table | "Judged on the mechanic: every rule is a contract method with a test, plus 1000-case property tests and TS-to-contract parity. Repo and a five-minute reproduction below. Built at NEAR HACKATHON." |
