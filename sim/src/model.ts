// SIMULATED. Same 200 participants through (A) a pump.fun-style bonding curve and (B) SlowCook.
// The SlowCook auction itself uses the contract-exact bigint clearing (clearing.ts); trading
// before/after uses float constant-product math. See sim/README.md for every assumption.
import { BPS, runAuction, tickPrices, type RevealedBid } from "./clearing.ts";
import { Rng } from "./rng.ts";

export const YOCTO = 1e24;
export const TOTAL_SUPPLY = 1_000_000_000; // whole tokens

export interface Params {
  // population
  nBots: number;
  botBudget: [number, number]; // NEAR, uniform range per bot
  bundlerWallets: number;
  bundlerBudget: number; // NEAR total
  nRetail: number;
  retailValuationMedian: number; // NEAR per token
  retailValuationSigma: number;
  retailBudgetMedian: number; // NEAR
  retailBudgetSigma: number;
  retailBudgetCap: number;
  // bonding curve (pump.fun-like virtual reserves)
  curveVirtualNear: number;
  curveVirtualTokens: number;
  curveFee: number;
  // SlowCook
  saleBps: number;
  lpBps: number;
  poolFee: number;
  pMin: number; // NEAR per token
  rBps: number; // Floor Keeper spend cap per epoch
  bandBps: number;
}

export const DEFAULTS: Params = {
  nBots: 10,
  botBudget: [0.2, 0.5],
  bundlerWallets: 20,
  bundlerBudget: 10,
  nRetail: 170,
  retailValuationMedian: 2.5e-7,
  retailValuationSigma: 0.7,
  retailBudgetMedian: 0.8,
  retailBudgetSigma: 0.9,
  retailBudgetCap: 20,
  curveVirtualNear: 30,
  curveVirtualTokens: 1.073e9,
  curveFee: 0.01,
  saleBps: 6000,
  lpBps: 3000,
  poolFee: 0.003,
  pMin: 30 / 1.073e9, // same opening price as the curve
  rBps: 1000,
  bandBps: 1000,
};

export type Kind = "bot" | "bundler" | "retail";

export interface Agent {
  id: string;
  kind: Kind;
  budget: number; // NEAR
  valuation: number; // NEAR per token (retail); insiders use insiderLimitMult
  arrival: number; // retail arrival order key
}

export function population(rng: Rng, p: Params): Agent[] {
  const agents: Agent[] = [];
  for (let i = 0; i < p.nBots; i++)
    agents.push({ id: `bot${i}`, kind: "bot", budget: rng.uniform(...p.botBudget), valuation: 0, arrival: -2 });
  for (let i = 0; i < p.bundlerWallets; i++)
    agents.push({ id: `bundle${i}`, kind: "bundler", budget: p.bundlerBudget / p.bundlerWallets, valuation: 0, arrival: -1 });
  for (let i = 0; i < p.nRetail; i++)
    agents.push({
      id: `retail${i}`,
      kind: "retail",
      budget: Math.min(p.retailBudgetCap, rng.logNormal(p.retailBudgetMedian, p.retailBudgetSigma)),
      valuation: rng.logNormal(p.retailValuationMedian, p.retailValuationSigma),
      arrival: rng.next(),
    });
  return agents;
}

/** Constant-product pool with fee taken on input. */
export class Cpmm {
  near: number;
  tokens: number;
  fee: number;
  constructor(near: number, tokens: number, fee: number) {
    this.near = near;
    this.tokens = tokens;
    this.fee = fee;
  }
  spot(): number {
    return this.near / this.tokens;
  }
  buy(nearIn: number): number {
    const eff = nearIn * (1 - this.fee);
    const out = (this.tokens * eff) / (this.near + eff);
    this.near += nearIn;
    this.tokens -= out;
    return out;
  }
  sell(tokensIn: number): number {
    const eff = tokensIn * (1 - this.fee);
    const out = (this.near * eff) / (this.tokens + eff);
    this.tokens += tokensIn;
    this.near -= out;
    return out;
  }
  /** NEAR to add (fee ignored) to move spot to `target`. */
  nearToReach(target: number): number {
    const k = this.near * this.tokens;
    return Math.max(0, Math.sqrt(target * k) - this.near);
  }
}

interface Holding {
  tokens: number;
  cost: number;
}

export interface RunMetrics {
  insiderShare: number; // share of participant-held tokens held by bots+bundler just before the dump
  botShare: number;
  bundlerShare: number;
  insiderAvgPrice: number;
  retailAvgPrice: number;
  insiderPnl: number; // NEAR, after dumping everything at T+1
  insiderRoi: number;
  retailPnl: number; // NEAR, aggregate, marked at post-dump price
  retailRoiMedian: number;
  retailLosingShare: number; // of retail who bought
  retailBuyers: number;
  priceDropPct: number; // post-dump spot vs pre-dump spot
  clearingPrice?: number;
  burnedPct?: number;
  treasurySpent?: number;
}

function summarize(agents: Agent[], h: Map<string, Holding>, finalPrice: number, dumpProceeds: Map<string, number>, preDump: number): RunMetrics {
  let insTok = 0, botTok = 0, bunTok = 0, allTok = 0, insCost = 0, insOut = 0, retTok = 0, retCost = 0;
  const retailRois: number[] = [];
  let retailPnl = 0, losing = 0;
  for (const a of agents) {
    const x = h.get(a.id);
    if (!x || x.tokens <= 0) continue;
    allTok += x.tokens;
    if (a.kind === "retail") {
      retTok += x.tokens;
      retCost += x.cost;
      const pnl = x.tokens * finalPrice - x.cost;
      retailPnl += pnl;
      retailRois.push(pnl / x.cost);
      if (pnl < 0) losing++;
    } else {
      insTok += x.tokens;
      insCost += x.cost;
      insOut += dumpProceeds.get(a.id) ?? 0;
      if (a.kind === "bot") botTok += x.tokens;
      else bunTok += x.tokens;
    }
  }
  retailRois.sort((a, b) => a - b);
  return {
    insiderShare: allTok ? insTok / allTok : 0,
    botShare: allTok ? botTok / allTok : 0,
    bundlerShare: allTok ? bunTok / allTok : 0,
    insiderAvgPrice: insTok ? insCost / insTok : 0,
    retailAvgPrice: retTok ? retCost / retTok : 0,
    insiderPnl: insOut - insCost,
    insiderRoi: insCost ? (insOut - insCost) / insCost : 0,
    retailPnl,
    retailRoiMedian: retailRois.length ? retailRois[Math.floor(retailRois.length / 2)] : 0,
    retailLosingShare: retailRois.length ? losing / retailRois.length : 0,
    retailBuyers: retailRois.length,
    priceDropPct: preDump ? (preDump - finalPrice) / preDump : 0,
  };
}

function dumpInsiders(agents: Agent[], h: Map<string, Holding>, pool: Cpmm, rng: Rng): Map<string, number> {
  const out = new Map<string, number>();
  // Bots race to exit first, then the bundler's wallets.
  const order = [...rng.shuffle(agents.filter((a) => a.kind === "bot")), ...agents.filter((a) => a.kind === "bundler")];
  for (const a of order) {
    const x = h.get(a.id);
    if (x && x.tokens > 0) out.set(a.id, pool.sell(x.tokens));
  }
  return out;
}

/** (A) pump.fun-style: price rises with every buy, arrival order decides price. */
export function runBondingCurve(agents: Agent[], p: Params, rng: Rng): RunMetrics {
  const pool = new Cpmm(p.curveVirtualNear, p.curveVirtualTokens, p.curveFee);
  const h = new Map<string, Holding>();
  // Block 0: the creator's bundle lands with the create tx, snipers in the same block.
  const order = [
    ...agents.filter((a) => a.kind === "bundler"),
    ...rng.shuffle(agents.filter((a) => a.kind === "bot")),
    ...[...agents.filter((a) => a.kind === "retail")].sort((a, b) => a.arrival - b.arrival),
  ];
  for (const a of order) {
    if (a.kind === "retail" && pool.spot() >= a.valuation) continue; // too expensive for them now
    const t = pool.buy(a.budget);
    h.set(a.id, { tokens: t, cost: a.budget });
  }
  const preDump = pool.spot();
  const dump = dumpInsiders(agents, h, pool, rng);
  return summarize(agents, h, pool.spot(), dump, preDump);
}

/** Highest tick whose price is <= limit, or -1 if limit < p_min. */
function tickFor(prices: number[], limit: number): number {
  let t = -1;
  for (let i = 0; i < prices.length; i++) if (prices[i] <= limit) t = i;
  return t;
}

/** (B) SlowCook: sealed bids, one clearing price, burn, pool at clearing, Floor Keeper.
 *  Insiders play the strongest strategy we could think of: they know the retail demand curve,
 *  compute the clearing price retail alone would set, and bid one tick (15%) above it so they are
 *  always filled in full. Retail bid their valuation (or a shaded valuation). */
export function runSlowCook(agents: Agent[], p: Params, rng: Rng, shade = false): RunMetrics {
  const pMinYocto = BigInt(Math.round(p.pMin * YOCTO));
  const pricesY = tickPrices(pMinYocto, 11_500n);
  const prices = pricesY.map((x) => Number(x) / YOCTO);
  const auction = (bids: RevealedBid[]) =>
    runAuction({ pMin: pMinYocto, totalSupply: BigInt(TOTAL_SUPPLY), saleBps: BigInt(p.saleBps), lpBps: BigInt(p.lpBps), bids });
  const retailBids: RevealedBid[] = [];
  const requested = new Map<string, { qty: number; limit: number }>();
  for (const a of agents.filter((x) => x.kind === "retail")) {
    let limit = a.valuation;
    if (shade) limit *= 1 - rng.uniform(0, 0.3);
    const tick = tickFor(prices, limit);
    if (tick < 0) continue;
    const qty = BigInt(Math.floor(a.budget / prices[tick]));
    if (qty <= 0n) continue;
    requested.set(a.id, { qty: Number(qty), limit: prices[tick] });
    retailBids.push({ bidder: a.id, tick, qty, deposit: BigInt(Math.round(a.budget * YOCTO)) });
  }
  const retailOnly = auction(retailBids);
  const insiderTick = Math.min(63, (retailOnly.clearing.kind === "Over" ? retailOnly.clearing.tick : 0) + 1);
  const bids = [...retailBids];
  for (const a of agents.filter((x) => x.kind !== "retail")) {
    const qty = BigInt(Math.floor(a.budget / prices[insiderTick]));
    if (qty > 0n) bids.push({ bidder: a.id, tick: insiderTick, qty, deposit: BigInt(Math.round(a.budget * YOCTO)) });
  }
  const r = auction(bids);
  const clearing = Number(r.clearingPrice) / YOCTO;
  const h = new Map<string, Holding>();
  const spent = new Map<string, number>();
  for (const al of r.allocations) {
    const tokens = Number(al.filled);
    const cost = Number(al.paid) / YOCTO;
    if (tokens > 0) h.set(al.bidder, { tokens, cost });
    spent.set(al.bidder, cost);
  }
  if (r.clearing.kind === "NoDemand") {
    return { ...summarize(agents, h, 0, new Map(), 0), clearingPrice: 0, burnedPct: 1, treasurySpent: 0 };
  }
  const pool = new Cpmm(Number(r.lpNear) / YOCTO, Number(r.lpTokens), p.poolFee);
  let treasury = Number(r.treasuryNear) / YOCTO;
  // Post-launch: only demand the auction left unfilled (pro-rata at the margin) buys in the pool,
  // spending at most what that unfilled quantity would have cost at the bidder's own limit.
  for (const a of [...agents.filter((x) => x.kind === "retail")].sort((x, y) => x.arrival - y.arrival)) {
    const req = requested.get(a.id);
    if (!req) continue;
    const got = h.get(a.id)?.tokens ?? 0;
    const want = Math.min((req.qty - got) * req.limit, a.budget - (spent.get(a.id) ?? 0));
    if (want <= 1e-9 || pool.spot() >= a.valuation) continue;
    const t = pool.buy(want);
    const prev = h.get(a.id) ?? { tokens: 0, cost: 0 };
    h.set(a.id, { tokens: prev.tokens + t, cost: prev.cost + want });
  }
  const preDump = pool.spot();
  const dump = dumpInsiders(agents, h, pool, rng);
  // Floor Keeper: one capped defend per epoch (the price stays below the band after a dump).
  let treasurySpent = 0;
  if (pool.spot() < clearing * (1 - p.bandBps / 10_000)) {
    const spend = Math.min(treasury * (p.rBps / 10_000), pool.nearToReach(clearing));
    pool.buy(spend); // tokens bought are burned
    treasury -= spend;
    treasurySpent = spend;
  }
  return {
    ...summarize(agents, h, pool.spot(), dump, preDump),
    clearingPrice: clearing,
    burnedPct: Number(r.burned) / TOTAL_SUPPLY,
    treasurySpent,
  };
}
