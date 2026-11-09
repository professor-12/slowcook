import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULTS, population, runBondingCurve, runSlowCook } from "../src/model.ts";
import { Rng } from "../src/rng.ts";

test("population has 200 participants: 10 bots, 20 bundler wallets, 170 retail", () => {
  const a = population(new Rng(1), DEFAULTS);
  assert.equal(a.length, 200);
  assert.equal(a.filter((x) => x.kind === "bot").length, 10);
  assert.equal(a.filter((x) => x.kind === "bundler").length, 20);
});

test("runs are deterministic per seed", () => {
  const r1 = runSlowCook(population(new Rng(7), DEFAULTS), DEFAULTS, new Rng(70));
  const r2 = runSlowCook(population(new Rng(7), DEFAULTS), DEFAULTS, new Rng(70));
  assert.deepEqual(r1, r2);
});

test("SIMULATED: insiders get far less supply and no first-mover discount in SlowCook", () => {
  let curveShare = 0, slowShare = 0, slowRatio = 0;
  const n = 50;
  for (let s = 1; s <= n; s++) {
    const c = runBondingCurve(population(new Rng(s), DEFAULTS), DEFAULTS, new Rng(s + 1));
    const k = runSlowCook(population(new Rng(s), DEFAULTS), DEFAULTS, new Rng(s + 1));
    curveShare += c.insiderShare / n;
    slowShare += k.insiderShare / n;
    slowRatio += k.retailAvgPrice / k.insiderAvgPrice / n;
  }
  assert.ok(curveShare > 2 * slowShare, `${curveShare} vs ${slowShare}`);
  assert.ok(Math.abs(slowRatio - 1) < 0.05, `retail/insider price ratio ${slowRatio}`);
});
