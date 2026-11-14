// REAL testnet: scripted sell-off after a launch, then the Floor Keeper.
//  1. creator unlock attempt -> E_LOCKED
//  2. holders dump tokens into the pool (ft_transfer_call -> ft_on_transfer)
//  3. keeper pokes k_obs intervals -> defend() buys back and burns (<= r% of treasury)
//  4. k_obs more pokes -> defend() again -> E_EPOCH_CAP (same epoch)
//  5. a buyer restores the price; h_obs pokes above clearing + 5%
//  6. creator unlock while the lock is still running -> E_LOCKED (price holds, lock does not)
//  7. mid-vest unlock -> only the vested part; after the vest -> the rest
// Usage: pnpm demo:dump <launch_id>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KEYS_DIR, account, call, events, fmtNear, need, sleep, view, waitForChainTime, writeResult, type TxResult } from "./lib.ts";

const FACTORY = need("SLOWCOOK_FACTORY");
const CREATOR = need("SLOWCOOK_CREATOR");
const FUNDER = need("SLOWCOOK_FUNDER");
const launchId = process.argv[2] ?? (await view<any[]>(FACTORY, "list_launches", { from: "0", limit: 100 })).at(-1)?.id;
if (!launchId) throw new Error("usage: pnpm demo:dump <launch_id>");

const steps: any[] = [];
function record(step: string, r: TxResult, extra: Record<string, unknown> = {}) {
  steps.push({ step, ok: r.ok, tx: r.url, error: r.ok ? undefined : r.error, ...extra });
  console.log(`${r.ok ? "✔" : "✘"} ${step}${r.ok ? "" : `  -> ${(r.error ?? "").match(/E_[A-Z_]+/)?.[0] ?? r.error}`}\n    ${r.url}`);
}
const launch = await view(FACTORY, "get_launch", { id: launchId });
if (launch.phase !== "Trading") throw new Error(`launch ${launchId} is ${launch.phase}, not Trading`);
const token = launch.token_id as string;
const keeper = account(FUNDER);
const k = launch.params.k_obs as number;
const h = launch.params.h_obs as number;
const pokeMs = Number(launch.params.poke_interval_ms);
const clearing = BigInt(launch.clearing_price);

const treasury = async () => view(FACTORY, "get_treasury", { launch_id: launchId });
const spot = async () => BigInt((await view(FACTORY, "get_pool", { launch_id: launchId })).spot_price);
async function pokeN(n: number, label: string) {
  for (let i = 0; i < n; i++) {
    await sleep(pokeMs + 1500);
    const r = await call(keeper, FACTORY, "poke", { launch_id: launchId }, { tgas: 30 });
    const ev = events(r).find((e) => e.event === "poked")?.data?.[0];
    record(`poke ${i + 1}/${n} (${label})`, r, ev ? { twap: ev.twap, floor: ev.floor, below_streak: ev.below_streak, above_streak: ev.above_streak } : {});
    if (ev) console.log(`    twap ${ev.twap} vs floor ${ev.floor} | below ${ev.below_streak} above ${ev.above_streak}`);
  }
}

console.log(`launch ${launchId} token ${token}; clearing ${clearing} yocto/token, spot ${await spot()}`);

console.log("\n== 1. creator tries to unlock right away");
record("unlock_creator (expect E_LOCKED)", await call(account(CREATOR), FACTORY, "unlock_creator", { launch_id: launchId }, { tgas: 100 }));

console.log("\n== 2. holders dump");
const receipts: any[] = JSON.parse(readFileSync(join(KEYS_DIR, `receipts-launch-${launchId}.json`), "utf8"));
await call(keeper, FACTORY, "poke", { launch_id: launchId }, { tgas: 30 }).then((r) => record("poke (close the at-clearing interval)", r));
let dumped = 0n;
for (const b of receipts.slice(0, 6)) {
  const bal = BigInt(await view(token, "ft_balance_of", { account_id: b.id }));
  if (bal === 0n) continue;
  const r = await call(account(b.id), token, "ft_transfer_call", { receiver_id: FACTORY, amount: bal.toString(), msg: JSON.stringify({ launch_id: launchId }) }, { deposit: 1n, tgas: 100 });
  record(`dump ${b.id} sells ${bal / 10n ** 18n} tokens`, r);
  if (r.ok) dumped += bal;
}
const t0 = await treasury();
console.log(`   spot ${t0.spot_price} vs floor ${t0.floor_price} (clearing ${t0.clearing_price}); treasury ${fmtNear(t0.treasury.near_balance)} NEAR`);

console.log(`\n== 3. keeper pokes ${k} intervals, then defend()`);
record("defend before trigger (expect E_TRIGGER)", await call(keeper, FACTORY, "defend", { launch_id: launchId }, { tgas: 100 }));
await pokeN(k, "after dump");
const supplyBefore = BigInt(await view(token, "ft_total_supply"));
const d1 = await call(keeper, FACTORY, "defend", { launch_id: launchId }, { tgas: 150 });
const dev = events(d1).find((e) => e.event === "defended")?.data?.[0];
record("defend #1", d1, dev ?? {});
const supplyAfter = BigInt(await view(token, "ft_total_supply"));
if (dev) console.log(`    spent ${fmtNear(dev.spent)} NEAR, bought & burned ${BigInt(dev.burned) / 10n ** 18n} tokens; spot ${dev.spot_before} -> ${dev.spot_after}; supply ${supplyBefore / 10n ** 18n} -> ${supplyAfter / 10n ** 18n}`);

console.log(`\n== 4. same epoch: ${k} more pokes, defend again`);
await pokeN(k, "same epoch");
const d2 = await call(keeper, FACTORY, "defend", { launch_id: launchId }, { tgas: 150 });
record("defend #2 in same epoch (expect E_EPOCH_CAP)", d2);

console.log("\n== 5. price recovers; creator unlock after it holds");
// Size the buy to lift spot ~10% above clearing: x' = sqrt(target * x * y / 1e18), plus 1% for the fee.
const isqrt = (n: bigint) => { if (n < 2n) return n; let x = n, y = (x + 1n) / 2n; while (y < x) { x = y; y = (x + n / x) / 2n; } return x; };
const pl = (await view(FACTORY, "get_pool", { launch_id: launchId })).pool;
const [x, y] = [BigInt(pl.near_reserve), BigInt(pl.token_reserve)];
const target = (clearing * 115n) / 100n;
const needNear = isqrt((target * x * y) / 10n ** 18n) - x;
const buyNear = needNear > 0n ? (needNear * 101n) / 100n : 10n ** 23n;
const buy = await call(keeper, FACTORY, "swap_near_for_token", { launch_id: launchId, min_out: "0" }, { deposit: buyNear, tgas: 100 });
record(`buyer swaps ${fmtNear(buyNear)} NEAR for tokens (sized to lift spot ~15% above clearing)`, buy);
console.log(`    spot now ${await spot()} (clearing ${clearing}, hold needs >= ${(await treasury()).hold_price})`);
await pokeN(h + 1, "recovery");

const unlock = async (label: string) => {
  const r = await call(account(CREATOR), FACTORY, "unlock_creator", { launch_id: launchId }, { tgas: 150 });
  const amount = r.ok ? BigInt(r.value) : 0n;
  record(label, r, r.ok ? { released: amount.toString() } : {});
  if (r.ok) console.log(`    released ${amount} tokens`);
  return { r, amount };
};
const lockInfo = await treasury();
const lockEnd = Number(lockInfo.creator_lock_ends_ms);
const vestEnd = Number(lockInfo.creator_vest_ends_ms);
console.log(`\n== 6. price has held (${lockInfo.treasury.above_streak} of ${h} intervals); lock ends ${new Date(lockEnd).toISOString()}, vest ends ${new Date(vestEnd).toISOString()}`);
const lockedTry = await unlock("unlock_creator while the lock runs (expect E_LOCKED)");
const lockedOk = !lockedTry.r.ok && /creator lock ends/.test(lockedTry.r.error ?? "");
if (!lockedOk) console.log("    NOTE: the lock was already over or another check failed; see the step above");

console.log("\n== 7. mid-vest release, then the rest");
await waitForChainTime(lockEnd + (vestEnd - lockEnd) / 2, "half the vest");
await pokeN(1, "still holding");
const part = await unlock("unlock_creator mid-vest (expect a partial release)");
await waitForChainTime(vestEnd, "end of the vest");
await pokeN(1, "still holding");
const rest = await unlock("unlock_creator after the vest (expect the rest)");
const creatorBal = BigInt(await view(token, "ft_balance_of", { account_id: CREATOR }));
console.log(`    creator token balance: ${creatorBal / 10n ** 18n} of allocation ${launch.creator_tokens}`);

const t1 = await treasury();
const solvency = await view(FACTORY, "get_solvency");
const path = writeResult(`dump-${launchId}`, {
  label: "REAL testnet run (test NEAR, no real value)",
  factory: FACTORY, launch_id: launchId, token, clearing_price: clearing, tokens_dumped: dumped,
  treasury_before: t0.treasury.near_balance, treasury_after: t1.treasury.near_balance,
  defend_1: dev ?? null, supply_before_defend: supplyBefore, supply_after_defend: supplyAfter,
  defend_2_error: d2.ok ? null : (d2.error ?? "").match(/E_[A-Z_]+/)?.[0],
  creator_lock: {
    lock_ends_ms: lockEnd, vest_ends_ms: vestEnd, allocation: launch.creator_tokens,
    rejected_during_lock: lockedOk, rejected_error: lockedTry.r.ok ? null : lockedTry.r.error,
    mid_vest_released: part.amount, after_vest_released: rest.amount,
  },
  creator_balance: creatorBal, solvency, steps,
});
console.log(`\nwrote ${path}`);
