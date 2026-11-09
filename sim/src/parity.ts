// Generates sim/fixtures/parity.json: 1000 random auctions with the expected clearing, fills and
// refunds computed by the TS model. contracts/slowcook/src/parity_tests.rs replays every case
// through the contract's own math and settlement code and requires identical results.
// Usage: node src/parity.ts [--cases 1000]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { commitHash, runAuction, tickPrices, type RevealedBid } from "./clearing.ts";
import { Rng } from "./rng.ts";

const here = dirname(fileURLToPath(import.meta.url));

export function makeCase(seed: number) {
  const rng = new Rng(seed);
  const total = BigInt(rng.int(1_000, 50_000_000));
  // Same constraints as create_launch: creator <= 10%, lp <= sale, sale + lp + creator = 100%.
  const saleBps = BigInt(rng.int(5_000, 8_000));
  const creator = BigInt(rng.int(0, 1_000));
  const lpBps = 10_000n - saleBps - creator;
  const pMin = BigInt(rng.int(1, 1_000_000)) * 10n ** 12n;
  const factorBps = BigInt(rng.int(10_500, 13_000));
  const prices = tickPrices(pMin, factorBps);
  const sale = (total * saleBps) / 10_000n;
  const n = rng.int(1, 40);
  const bids: RevealedBid[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < n; i++) {
    // Cluster ticks so the marginal tick often has several bids (exercises pro-rata dust).
    const tick = rng.next() < 0.5 ? rng.int(20, 26) : rng.int(0, 63);
    const qty = BigInt(Math.max(1, Math.floor(Number(sale) * rng.uniform(0.001, 0.5))));
    const cost = prices[tick] * qty;
    const minDeposit = 10n ** 22n; // contract MIN_BID_DEPOSIT (0.01 NEAR)
    let deposit = cost + (cost * BigInt(rng.int(0, 100))) / 100n;
    if (deposit < minDeposit) deposit = minDeposit;
    const bidder = `b${i}.near`;
    const salt = rng.hex(32);
    hashes.push(commitHash(seed, bidder, tick, qty, salt) + ":" + salt);
    bids.push({ bidder, tick, qty, deposit });
  }
  const r = runAuction({ pMin, factorBps, totalSupply: total, saleBps, lpBps, bids });
  const s = (x: bigint) => x.toString();
  return {
    seed,
    input: {
      total_supply: s(total), sale_bps: Number(saleBps), lp_bps: Number(lpBps), creator_bps: Number(creator),
      p_min: s(pMin), tick_factor_bps: Number(factorBps),
      bids: bids.map((b, i) => ({ bidder: b.bidder, tick: b.tick, qty: s(b.qty), deposit: s(b.deposit), hash_salt: hashes[i] })),
    },
    expected: {
      clearing_kind: r.clearing.kind,
      clearing_tick: r.clearing.kind === "Over" ? r.clearing.tick : 0,
      clearing_price: s(r.clearingPrice), filled: s(r.filled), lp_tokens: s(r.lpTokens),
      creator_tokens: s(r.creatorTokens), burned: s(r.burned), proceeds: s(r.proceeds),
      lp_near: s(r.lpNear), treasury_near: s(r.treasuryNear),
      allocations: r.allocations.map((a) => ({ filled: s(a.filled), paid: s(a.paid), refund: s(a.refund) })),
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf("--cases");
  const cases = i > 0 ? Number(process.argv[i + 1]) : 1000;
  const out = Array.from({ length: cases }, (_, k) => makeCase(k + 1));
  mkdirSync(join(here, "..", "fixtures"), { recursive: true });
  writeFileSync(join(here, "..", "fixtures", "parity.json"), JSON.stringify(out));
  const kinds = out.reduce<Record<string, number>>((m, c) => ((m[c.expected.clearing_kind] = (m[c.expected.clearing_kind] ?? 0) + 1), m), {});
  console.log(`wrote ${cases} parity cases`, kinds);
}
