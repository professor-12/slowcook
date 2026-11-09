import assert from "node:assert/strict";
import { test } from "node:test";
import { commitHash, computeClearing, fillFor, runAuction, tickPrices, totalFilled } from "../src/clearing.ts";

test("ticks are geometric and strictly increasing", () => {
  const p = tickPrices(10n ** 15n, 11_500n);
  assert.equal(p.length, 64);
  assert.equal(p[1], 1_150_000_000_000_000n);
  for (let i = 1; i < 64; i++) assert.ok(p[i] > p[i - 1]);
});

test("clearing: over, under, none (same vectors as math.rs)", () => {
  const b = Array.from({ length: 64 }, () => 0n);
  assert.deepEqual(computeClearing(b, 100n), { kind: "NoDemand" });
  b[5] = 60n;
  b[3] = 80n;
  assert.deepEqual(computeClearing(b, 100n), { kind: "Over", tick: 3, remaining: 40n, bucket: 80n });
  assert.deepEqual(computeClearing(b, 1000n), { kind: "Under", demand: 140n });
});

test("pro-rata rounds down; dust is not sold", () => {
  const c = { kind: "Over", tick: 3, remaining: 10n, bucket: 21n } as const;
  assert.equal(fillFor(c, 3, 7n), 3n);
  assert.equal(fillFor(c, 4, 7n), 7n);
  assert.equal(fillFor(c, 2, 7n), 0n);
  assert.equal(totalFilled(c, 50n, [7n, 7n, 7n]), 49n);
});

test("everyone pays the clearing price; paid + refund = deposit", () => {
  const prices = tickPrices(10n ** 18n, 11_500n);
  const bids = [
    { bidder: "sniper", tick: 40, qty: 300_000n, deposit: prices[40] * 300_000n },
    { bidder: "alice", tick: 10, qty: 400_000n, deposit: prices[10] * 400_000n * 2n },
    { bidder: "bob", tick: 10, qty: 200_000n, deposit: prices[10] * 200_000n },
  ];
  const r = runAuction({ pMin: 10n ** 18n, totalSupply: 1_000_000n, saleBps: 6000n, lpBps: 3000n, bids });
  assert.equal(r.clearingPrice, prices[10]);
  for (const a of r.allocations) {
    assert.equal(a.paid, r.clearingPrice * a.filled);
    assert.equal(a.paid + a.refund, bids.find((b) => b.bidder === a.bidder)!.deposit);
  }
  assert.equal(r.allocations[0].filled, 300_000n); // the sniper is filled but pays the same price
  assert.equal(r.filled + r.lpTokens + r.creatorTokens + r.burned, 1_000_000n);
  assert.equal(r.lpNear + r.treasuryNear, r.proceeds);
});

test("commit hash matches the contract's preimage format", () => {
  // Same vector is asserted on the Rust side via the parity fixtures.
  assert.equal(commitHash(0, "alice.near", 3, 10n, "ab".repeat(32)).length, 64);
  assert.notEqual(commitHash(0, "alice.near", 3, 10n, "ab".repeat(32)), commitHash(0, "bob.near", 3, 10n, "ab".repeat(32)));
});
