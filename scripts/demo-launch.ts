// REAL testnet launch: creator creates a launch, N throwaway wallets commit sealed bids, reveal,
// anyone finalizes, everyone claims. Writes results/launch-<ts>.json with every tx link.
// Usage: pnpm demo:launch [--plan-only] [--resume <id>]   (after pnpm deploy:testnet)
// Tunables (env): DEMO_BIDDERS, DEMO_BUDGET_NEAR (buying power per bidder), DEMO_TICKS (comma list,
// cycled), DEMO_SNIPER_TICK, DEMO_OVERDEPOSIT_PCT, DEMO_PMIN_YOCTO or DEMO_MIN_POOL_NEAR (auto-pick
// the highest p_min that still oversubscribes the sale and reaches that pool depth), DEMO_SYMBOL.
// Before anything is sent, the TS model (parity-tested against the contract) predicts the outcome;
// after finalize the on-chain result is compared with that prediction.
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { KeyPair } from "near-api-js";
import { commitHash, runAuction, tickPrices } from "../sim/src/clearing.ts";
import { ENV, KEYS_DIR, account, call, events, fmtNear, need, sleep, view, waitForChainTime, writeResult, type TxResult } from "./lib.ts";

const FACTORY = need("SLOWCOOK_FACTORY");
const CREATOR = need("SLOWCOOK_CREATOR");
const FUNDER = need("SLOWCOOK_FUNDER");
const N = Number(ENV.DEMO_BIDDERS ?? 12);
const COMMIT = Number(ENV.DEMO_COMMIT_SECS ?? 90);
const REVEAL = Number(ENV.DEMO_REVEAL_SECS ?? 90);
const STORAGE_FEE = 5n * 10n ** 21n; // 0.005 NEAR, refundable
const run = Date.now().toString(36).slice(-5);
const resumeIdx = process.argv.indexOf("--resume");
const RESUME: string | null = resumeIdx > 0 ? process.argv[resumeIdx + 1] : null;
const PLAN_ONLY = process.argv.includes("--plan-only");
const YOCTO = 10n ** 24n;
const toYocto = (near: string) => BigInt(Math.round(Number(near) * 1e6)) * 10n ** 18n;
const BUDGET = toYocto(ENV.DEMO_BUDGET_NEAR ?? "0.3");
const TICKS = (ENV.DEMO_TICKS ?? "4,5,6,7,8,9,10").split(",").map(Number);
const SNIPER_TICK = Number(ENV.DEMO_SNIPER_TICK ?? 20);
const OVER = BigInt(ENV.DEMO_OVERDEPOSIT_PCT ?? 20);
const GAS_MARGIN = 8n * 10n ** 22n; // 0.08 NEAR per wallet for commit/reveal/claim/dump gas
const FACTOR = 11_500n;
const SALE_BPS = 6000n, LP_BPS = 3000n, TOTAL = 1_000_000n;

/** Plan bids for a given p_min: (tick, qty, deposit) per wallet; wallet N-1 will not reveal. */
function planBids(pMin: bigint) {
  const prices = tickPrices(pMin, FACTOR);
  return Array.from({ length: N }, (_, i) => {
    const tick = i === 0 ? SNIPER_TICK : TICKS[(i - 1) % TICKS.length];
    const price = prices[tick];
    const qty = BUDGET / price;
    return { i, tick, qty, deposit: (price * qty * (100n + OVER)) / 100n };
  });
}
function predict(pMin: bigint) {
  const bids = planBids(pMin);
  const r = runAuction({
    pMin, factorBps: FACTOR, totalSupply: TOTAL, saleBps: SALE_BPS, lpBps: LP_BPS,
    bids: bids.slice(0, N - 1).map((b) => ({ bidder: `b${b.i}`, tick: b.tick, qty: b.qty, deposit: b.deposit })),
  });
  return { bids, r };
}
let P_MIN = BigInt(ENV.DEMO_PMIN_YOCTO ?? 10n ** 18n);
if (ENV.DEMO_MIN_POOL_NEAR && !ENV.DEMO_PMIN_YOCTO) {
  // Highest p_min on a 2% grid where the sale is still oversubscribed (demand >= supply).
  let best: bigint | null = null;
  for (let p = 10n ** 17n; p < 10n ** 22n; p = (p * 102n) / 100n) if (predict(p).r.clearing.kind === "Over") best = p;
  if (!best) throw new Error("no p_min oversubscribes the sale with these budgets");
  P_MIN = best;
}
const prediction = predict(P_MIN);
const fundOf = (b: { deposit: bigint }) => b.deposit + STORAGE_FEE + GAS_MARGIN;
const totalFunding = prediction.bids.reduce((s, b) => s + fundOf(b), 0n);
console.log(`plan: ${N} wallets, budget ${fmtNear(BUDGET)} NEAR each, ticks ${TICKS.join("/")} (sniper ${SNIPER_TICK}), over-deposit ${OVER}%, p_min ${P_MIN} yocto`);
console.log(`predicted (TS model): ${prediction.r.clearing.kind} at tick ${prediction.r.clearing.kind === "Over" ? (prediction.r.clearing as any).tick : 0}, clearing ${prediction.r.clearingPrice}, filled ${prediction.r.filled}, pool ${fmtNear(prediction.r.lpNear)} NEAR, treasury ${fmtNear(prediction.r.treasuryNear)} NEAR`);
console.log(`funding needed from ${FUNDER}: ${fmtNear(totalFunding)} NEAR (+ creator deposit 2.1 NEAR from ${CREATOR})`);
if (ENV.DEMO_MIN_POOL_NEAR && prediction.r.lpNear < toYocto(ENV.DEMO_MIN_POOL_NEAR)) {
  throw new Error(`predicted pool ${fmtNear(prediction.r.lpNear)} NEAR < DEMO_MIN_POOL_NEAR ${ENV.DEMO_MIN_POOL_NEAR}; raise DEMO_BUDGET_NEAR`);
}
if (PLAN_ONLY) process.exit(0);

const log: { step: string; ok: boolean; tx: string; note?: string }[] = [];
function record(step: string, r: TxResult, note?: string) {
  log.push({ step, ok: r.ok, tx: r.url, note: note ?? (r.ok ? undefined : r.error) });
  console.log(`${r.ok ? "✔" : "✘"} ${step}${note ? ` (${note})` : ""}\n    ${r.url}`);
}

const funder = account(FUNDER);
const bidders: string[] = [];
let launchId: string;
let launch: any;
let plan: { id: string; tick: number; qty: bigint; salt: string; deposit: bigint; hash: string }[];
const args = {
  name: ENV.DEMO_NAME ?? "SlowCook Demo", symbol: ENV.DEMO_SYMBOL ?? "SLOW", icon: null,
  total_supply: TOTAL.toString(), sale_bps: Number(SALE_BPS), lp_bps: Number(LP_BPS), creator_bps: 1000,
  p_min: P_MIN.toString(),
  commit_secs: COMMIT, reveal_secs: REVEAL,
  k_obs: 3, h_obs: 6, r_bps: 1000, epoch_secs: 120, poke_interval_secs: 10, penalty_bps: 500,
  // Demo timings (testnet factory only; the launch page labels it DEMO). Production minimums:
  // 7-day lock, 7-day vest, 7-day hold, 60 s pokes; see README "Launch parameters".
  demo: true,
  creator_lock_secs: Number(ENV.DEMO_LOCK_SECS ?? 900),
  creator_vest_secs: Number(ENV.DEMO_VEST_SECS ?? 180),
};
if (RESUME) {
  launchId = RESUME;
  plan = JSON.parse(readFileSync(join(KEYS_DIR, `receipts-launch-${launchId}.json`), "utf8")).map((b: any) => ({ ...b, qty: BigInt(b.qty), deposit: BigInt(b.deposit) }));
  launch = await view(FACTORY, "get_launch", { id: launchId });
  console.log(`resuming launch ${launchId} in phase ${launch.phase} (steps 1-4 already on-chain)`);
} else {
// 1. Throwaway bidder wallets: sub-accounts of the funder.
console.log(`\n== 1. creating ${N} bidder wallets under ${FUNDER}`);
for (let i = 0; i < N; i++) {
  const id = `b${i}-${run}.${FUNDER}`;
  const kp = KeyPair.fromRandom("ed25519");
  const r: any = await funder.createSubAccount({ accountOrPrefix: id, publicKey: kp.getPublicKey(), nearToTransfer: fundOf(prediction.bids[i]) });
  writeKey(id, kp);
  bidders.push(id);
  log.push({ step: `create wallet ${id}`, ok: true, tx: `https://testnet.nearblocks.io/txns/${r.transaction.hash}` });
}
console.log(`   ${bidders.length} wallets funded (deposit + 0.005 storage fee + 0.08 gas each), ${fmtNear(totalFunding)} NEAR total`);

function writeKey(id: string, kp: KeyPair) {
  mkdirSync(KEYS_DIR, { recursive: true });
  writeFileSync(join(KEYS_DIR, `${id}.json`), JSON.stringify({ account_id: id, public_key: kp.getPublicKey().toString(), private_key: kp.toString() }));
}

// 2. Create the launch.
console.log(`\n== 2. ${CREATOR} creates the launch`);
const creator = account(CREATOR);
const created = await call(creator, FACTORY, "create_launch", { args }, { deposit: 21n * 10n ** 23n, tgas: 300 });
record("create_launch", created);
if (!created.ok) process.exit(1);
launchId = created.value;
launch = await view(FACTORY, "get_launch", { id: launchId });
console.log(`   launch ${launchId}: token ${launch.token_id}, phase ${launch.phase}`);
const prices: string[] = await view(FACTORY, "get_tick_prices", { id: launchId });

// 3. Sealed bids. A spread of limits; one "sniper" bids at tick 20, far above everyone else; one wallet will not reveal;
//    one tries a wrong salt first. Deposits are OVER% above cost so the deposit doesn't reveal the bid.
console.log(`\n== 3. ${N} sealed commits (only hashes go on-chain)`);
if (prices.some((p, i) => BigInt(p) !== tickPrices(P_MIN, FACTOR)[i])) throw new Error("on-chain tick prices differ from the plan");
plan = bidders.map((id, i) => {
  const { tick, qty, deposit } = prediction.bids[i]; // bidder 0 = "sniper" bids far above everyone
  const salt = randomBytes(32).toString("hex");
  return { id, tick, qty, salt, deposit, hash: commitHash(launchId, id, tick, qty, salt) };
});
mkdirSync(KEYS_DIR, { recursive: true });
writeFileSync(join(KEYS_DIR, `receipts-launch-${launchId}.json`), JSON.stringify(plan, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
await Promise.all(
  plan.map(async (b) => {
    const r = await call(account(b.id), FACTORY, "commit", { launch_id: launchId, hash_hex: b.hash }, { deposit: b.deposit + STORAGE_FEE, tgas: 30 });
    record(`commit ${b.id}`, r, `deposit ${fmtNear(b.deposit)} NEAR`);
  }),
);
const bid0 = await view(FACTORY, "get_bid", { launch_id: launchId, account_id: plan[1].id });
console.log(`   on-chain bid record exposes: tick=${bid0.tick} qty=${bid0.qty} deposit=${fmtNear(bid0.deposit)} (price hidden)`);

}
launch = await view(FACTORY, "get_launch", { id: launchId });
if (launch.phase === "Commit" || launch.phase === "Reveal") {
// 4. Reveal.
console.log(`\n== 4. reveal`);
await waitForChainTime(Number(launch.commit_end_ms) + 1500, "reveal window");
console.log("");
const noShow = plan[N - 1];
const wrongSalt = plan[2];
const bad = await call(account(wrongSalt.id), FACTORY, "reveal", { launch_id: launchId, tick: wrongSalt.tick, qty: wrongSalt.qty.toString(), salt_hex: "00".repeat(32) }, { tgas: 30 });
record(`reveal with WRONG salt ${wrongSalt.id} (must fail E_HASH)`, bad, bad.ok ? "UNEXPECTED SUCCESS" : "rejected as expected");
await Promise.all(
  plan
    .filter((b) => b !== noShow)
    .map(async (b) => {
      const r = await call(account(b.id), FACTORY, "reveal", { launch_id: launchId, tick: b.tick, qty: b.qty.toString(), salt_hex: b.salt }, { tgas: 30 });
      record(`reveal ${b.id}`, r, `tick ${b.tick}, qty ${b.qty}`);
    }),
);
console.log(`   ${noShow.id} deliberately does not reveal (pays the ${args.penalty_bps / 100}% penalty)`);
}
const noShowBidder = plan[N - 1];

// 5. Finalize.
console.log(`\n== 5. finalize (anyone can call)`);
await waitForChainTime(Number(launch.reveal_end_ms) + 1500, "end of reveal");
console.log("");
const buckets: string[] = await view(FACTORY, "get_buckets", { id: launchId });
const already = (await view(FACTORY, "get_launch", { id: launchId })).phase === "Trading";
const fin: TxResult = already
  ? { ok: true, hash: "", url: "(finalized in an earlier run; see results/)", logs: [] }
  : await call(funder, FACTORY, "finalize", { launch_id: launchId }, { tgas: 300 });
record(already ? "finalize (already done)" : "finalize", fin);
await sleep(2000);
launch = await view(FACTORY, "get_launch", { id: launchId });
const finEvent = events(fin).find((e) => e.event === "finalized")?.data?.[0];
console.log(`   clearing price ${launch.clearing_price} yocto/token (tick ${finEvent?.clearing_tick}), filled ${launch.filled}, burned ${launch.burned_at_finalize}`);

// 6. Claims and the penalty refund.
console.log(`\n== 6. claims`);
const claims: any[] = [];
for (const b of plan.filter((x) => x.id !== noShowBidder.id)) {
  const r = await call(account(b.id), FACTORY, "claim", { launch_id: launchId }, { tgas: 50 });
  record(`claim ${b.id}`, r, r.ok ? `filled ${r.value.filled}, paid ${fmtNear(r.value.paid)} NEAR, refund ${fmtNear(r.value.refund)} NEAR` : undefined);
  claims.push({ bidder: b.id, tick: b.tick, qty: b.qty, deposit: b.deposit, ...(r.value ?? {}), tx: r.url });
}
const pen = await call(funder, FACTORY, "refund_unrevealed", { launch_id: launchId, bidder: noShowBidder.id }, { tgas: 50 });
record(`refund_unrevealed ${noShowBidder.id}`, pen, pen.ok ? `penalty ${fmtNear(pen.value.penalty)} NEAR to treasury` : undefined);

const finalLaunch = await view(FACTORY, "get_launch", { id: launchId });
const pool = await view(FACTORY, "get_pool", { launch_id: launchId });
const treasury = await view(FACTORY, "get_treasury", { launch_id: launchId });
const supply = await view(finalLaunch.token_id, "ft_total_supply");
const matches = {
  clearing_price: BigInt(finalLaunch.clearing_price) === prediction.r.clearingPrice,
  filled: BigInt(finalLaunch.filled) === prediction.r.filled,
  pool_near: BigInt(pool.pool.near_reserve) === prediction.r.lpNear,
};
const uniform = claims.filter((c) => c.filled && c.filled !== "0").every((c) => BigInt(c.paid) === BigInt(finalLaunch.clearing_price) * BigInt(c.filled));
const path = writeResult(`launch-${launchId}`, {
  label: "REAL testnet run (test NEAR, no real value)",
  factory: FACTORY, launch_id: launchId, token: finalLaunch.token_id, args, buckets,
  clearing_price_yocto: finalLaunch.clearing_price, filled: finalLaunch.filled, burned: finalLaunch.burned_at_finalize,
  token_total_supply: supply, pool: pool.pool, spot_price: pool.spot_price, treasury_near: treasury.treasury.near_balance,
  every_winner_paid_clearing_price: uniform, sniper_bidder: plan[0].id,
  prediction: { model: "sim/src/clearing.ts (parity-tested)", clearing_price: prediction.r.clearingPrice, filled: prediction.r.filled, pool_near: prediction.r.lpNear, treasury_near: prediction.r.treasuryNear },
  onchain_matches_prediction: matches, claims, steps: log,
});
console.log(`\nEvery winner paid the same price per token: ${uniform}`);
console.log(`On-chain result matches the TS prediction made before launch: ${JSON.stringify(matches)}`);
console.log(`Sniper (${plan[0].id}) bid tick ${plan[0].tick} and paid: ${claims[0]?.paid ? fmtNear(claims[0].paid) : "?"} NEAR for ${claims[0]?.filled} tokens`);
console.log(`Pool opened at ${pool.spot_price} yocto/token (clearing ${finalLaunch.clearing_price}); treasury ${fmtNear(treasury.treasury.near_balance)} NEAR`);
console.log(`\nwrote ${path}\nnext: pnpm demo:dump ${launchId}`);
