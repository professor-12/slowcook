// TypeScript mirror of contracts/slowcook/src/math.rs. Integer-exact (bigint), so the parity
// harness can demand identical results from both implementations.
import { createHash } from "node:crypto";

export const ONE_TOKEN = 10n ** 18n;
export const BPS = 10_000n;
export const NUM_TICKS = 64;

export type Clearing =
  | { kind: "NoDemand" }
  | { kind: "Under"; demand: bigint }
  | { kind: "Over"; tick: number; remaining: bigint; bucket: bigint };

export function tickPrices(pMin: bigint, factorBps: bigint, n = NUM_TICKS): bigint[] {
  const out: bigint[] = [];
  let p = pMin;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const next = (p * factorBps) / BPS;
      if (next <= p) throw new Error("ticks must strictly increase");
      p = next;
    }
    out.push(p);
  }
  return out;
}

export function commitPreimage(launchId: number | bigint | string, bidder: string, tick: number, qty: bigint, saltHex: string): string {
  return `${launchId}:${bidder}:${tick}:${qty}:${saltHex}`;
}

export function commitHash(launchId: number | bigint | string, bidder: string, tick: number, qty: bigint, saltHex: string): string {
  return createHash("sha256").update(commitPreimage(launchId, bidder, tick, qty, saltHex), "utf8").digest("hex");
}

export function computeClearing(buckets: bigint[], saleSupply: bigint): Clearing {
  let cum = 0n;
  for (let t = buckets.length - 1; t >= 0; t--) {
    const b = buckets[t];
    if (b === 0n) continue;
    if (cum + b >= saleSupply) return { kind: "Over", tick: t, remaining: saleSupply - cum, bucket: b };
    cum += b;
  }
  return cum === 0n ? { kind: "NoDemand" } : { kind: "Under", demand: cum };
}

export function clearingTick(c: Clearing): number {
  return c.kind === "Over" ? c.tick : 0;
}

export function fillFor(c: Clearing, tick: number, qty: bigint): bigint {
  switch (c.kind) {
    case "NoDemand":
      return 0n;
    case "Under":
      return qty;
    case "Over":
      if (tick > c.tick) return qty;
      if (tick === c.tick) return (qty * c.remaining) / c.bucket;
      return 0n;
  }
}

export function totalFilled(c: Clearing, saleSupply: bigint, marginalQtys: bigint[]): bigint {
  switch (c.kind) {
    case "NoDemand":
      return 0n;
    case "Under":
      return c.demand;
    case "Over": {
      const atMargin = marginalQtys.reduce((s, q) => s + (q * c.remaining) / c.bucket, 0n);
      return saleSupply - c.remaining + atMargin;
    }
  }
}

export interface RevealedBid {
  bidder: string;
  tick: number;
  qty: bigint; // whole tokens
  deposit: bigint; // yoctoNEAR escrow
}

export interface Allocation {
  bidder: string;
  filled: bigint;
  paid: bigint;
  refund: bigint;
}

export interface AuctionResult {
  clearing: Clearing;
  clearingPrice: bigint;
  filled: bigint;
  lpTokens: bigint;
  creatorTokens: bigint;
  burned: bigint;
  proceeds: bigint;
  lpNear: bigint;
  treasuryNear: bigint;
  allocations: Allocation[];
}

/** Full finalize + settle, exactly as the contract does it. */
export function runAuction(opts: {
  pMin: bigint;
  factorBps?: bigint;
  totalSupply: bigint;
  saleBps: bigint;
  lpBps: bigint;
  bids: RevealedBid[];
}): AuctionResult {
  const prices = tickPrices(opts.pMin, opts.factorBps ?? 11_500n);
  const sale = (opts.totalSupply * opts.saleBps) / BPS;
  const lpMax = (opts.totalSupply * opts.lpBps) / BPS;
  const creatorMax = opts.totalSupply - sale - lpMax;
  const buckets = Array.from({ length: NUM_TICKS }, () => 0n);
  const perTick = new Map<number, bigint[]>();
  for (const b of opts.bids) {
    buckets[b.tick] += b.qty;
    perTick.set(b.tick, [...(perTick.get(b.tick) ?? []), b.qty]);
  }
  const clearing = computeClearing(buckets, sale);
  const marginal = clearing.kind === "Over" ? perTick.get(clearing.tick) ?? [] : [];
  const filled = totalFilled(clearing, sale, marginal);
  const clearingPrice = clearing.kind === "NoDemand" ? 0n : prices[clearingTick(clearing)];
  const lpTokens = sale === 0n ? 0n : (filled * lpMax) / sale;
  const creatorTokens = sale === 0n ? 0n : (filled * creatorMax) / sale;
  const proceeds = clearingPrice * filled;
  const lpNear = clearingPrice * lpTokens;
  const allocations = opts.bids.map((b) => {
    const f = clearing.kind === "NoDemand" ? 0n : fillFor(clearing, b.tick, b.qty);
    const paid = clearingPrice * f;
    return { bidder: b.bidder, filled: f, paid, refund: b.deposit - paid };
  });
  return {
    clearing,
    clearingPrice,
    filled,
    lpTokens,
    creatorTokens,
    burned: clearing.kind === "NoDemand" ? opts.totalSupply : opts.totalSupply - filled - lpTokens - creatorTokens,
    proceeds,
    lpNear,
    treasuryNear: proceeds - lpNear,
    allocations,
  };
}
