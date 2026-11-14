# X post (the human posts this; the agent never posts)

Attach `submission/video/slowcook-demo.mp4` (2:17, re-rendered 2026-11-14 with the creator-lock fix) to the main post.

**If the post is already up:** the video posted before 2026-11-14 shows the old creator unlock (released after 6 × 10 s at clearing). The re-rendered video shows the fix.

## Main post (269/280 as X counts it; each link counts as 23)

```
Built at NEAR HACKATHON: SlowCook, memecoin launches where being first is worthless.

Sealed bids. One price for every winner. Unsold supply burned. A treasury defends the price.

Live: https://web-omega-dun-65.vercel.app
Code: https://github.com/professor-12/slowcook

@NEARProtocol #NEARHackathon
```

## Optional reply in the thread (278/280)

```
How it works on NEAR testnet:
1. Commit a hash of price + quantity
2. Reveal when bidding closes
3. One clearing price for every winner
4. Pool opens at that price
5. Floor Keeper buys back and burns below it, max 10% per epoch

Simulated: bot + bundler supply share 40% to 11%.
```

## Notes
- **Rule check:** the rules require the post to say "built at NEAR HACKATHON", tag @NEARProtocol and #NEARHackathon, and include the demo video. The main post covers all three once the video is attached.
- **Simulated figure:** "40% to 11%" is SIMULATED (sim/README.md), labelled "Simulated" in the reply.
- **After posting:** copy the main post's URL (x.com/<handle>/status/<id>). It becomes `demoUrl`.
