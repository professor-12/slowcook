// SIMULATED. Runs the same population through a bonding curve and through SlowCook for N seeds and
// writes sim/out/summary.json, sim/out/runs.csv and sim/out/chart.svg.
// Usage: node src/run.ts [--seeds 1000]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULTS, population, runBondingCurve, runSlowCook, type RunMetrics } from "./model.ts";
import { Rng } from "./rng.ts";
import { renderChart } from "./chart.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "out");
const argSeeds = process.argv.indexOf("--seeds");
const SEEDS = argSeeds > 0 ? Number(process.argv[argSeeds + 1]) : 1000;

const MECHS = {
  bondingCurve: (seed: number) => runBondingCurve(population(new Rng(seed), DEFAULTS), DEFAULTS, new Rng(seed ^ 0x9e3779b9)),
  slowcook: (seed: number) => runSlowCook(population(new Rng(seed), DEFAULTS), DEFAULTS, new Rng(seed ^ 0x9e3779b9), false),
  slowcookShaded: (seed: number) => runSlowCook(population(new Rng(seed), DEFAULTS), DEFAULTS, new Rng(seed ^ 0x9e3779b9), true),
} as const;
type Mech = keyof typeof MECHS;

const METRICS: (keyof RunMetrics)[] = [
  "insiderShare", "botShare", "bundlerShare", "insiderAvgPrice", "retailAvgPrice", "insiderPnl",
  "insiderRoi", "retailPnl", "retailRoiMedian", "retailLosingShare", "retailBuyers", "priceDropPct",
  "clearingPrice", "burnedPct", "treasurySpent",
];

function pct(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

export interface Band { median: number; p5: number; p95: number }

export function runAll(seeds: number) {
  const rows: string[] = ["mechanism,seed," + METRICS.join(",")];
  const summary: Record<string, Record<string, Band>> = {};
  for (const mech of Object.keys(MECHS) as Mech[]) {
    const cols: Record<string, number[]> = Object.fromEntries(METRICS.map((m) => [m, []]));
    for (let s = 1; s <= seeds; s++) {
      const r = MECHS[mech](s);
      rows.push([mech, s, ...METRICS.map((m) => (r[m] ?? "") as number)].join(","));
      for (const m of METRICS) if (typeof r[m] === "number") cols[m].push(r[m] as number);
    }
    summary[mech] = {};
    for (const m of METRICS) {
      const v = cols[m].sort((a, b) => a - b);
      if (v.length) summary[mech][m] = { median: pct(v, 0.5), p5: pct(v, 0.05), p95: pct(v, 0.95) };
    }
  }
  return { rows, summary };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  const { rows, summary } = runAll(SEEDS);
  mkdirSync(outDir, { recursive: true });
  const doc = {
    label: "SIMULATED — synthetic agents, not real market data. See sim/README.md for assumptions.",
    seeds: SEEDS,
    generatedAt: new Date().toISOString(),
    params: DEFAULTS,
    summary,
  };
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(doc, null, 2));
  writeFileSync(join(outDir, "runs.csv"), rows.join("\n") + "\n");
  writeFileSync(join(outDir, "chart.svg"), renderChart(summary, SEEDS));
  const f = (x: number, pctFmt = true) => (pctFmt ? `${(x * 100).toFixed(1)}%` : x.toFixed(2));
  const line = (name: string, m: string, p = true) => {
    const b = summary[name][m];
    return `${f(b.median, p)} (${f(b.p5, p)}–${f(b.p95, p)})`;
  };
  console.log(`SIMULATED · ${SEEDS} seeds · median (p5–p95) · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log("| metric | bonding curve | SlowCook | SlowCook (shaded bids) |");
  console.log("|---|---|---|---|");
  for (const [label, m, p] of [
    ["Insider share of supply before dump", "insiderShare", true],
    ["Bot share", "botShare", true],
    ["Bundler share", "bundlerShare", true],
    ["Insider ROI after T+1 dump", "insiderRoi", true],
    ["Insider PnL (NEAR)", "insiderPnl", false],
    ["Retail aggregate PnL (NEAR)", "retailPnl", false],
    ["Median retail ROI", "retailRoiMedian", true],
    ["Retail buyers losing money", "retailLosingShare", true],
    ["Price drop from dump", "priceDropPct", true],
  ] as [string, string, boolean][]) {
    console.log(`| ${label} | ${line("bondingCurve", m, p)} | ${line("slowcook", m, p)} | ${line("slowcookShaded", m, p)} |`);
  }
  const ratio = (n: string) => summary[n].retailAvgPrice.median / summary[n].insiderAvgPrice.median;
  console.log(`| Retail avg price ÷ insider avg price (medians) | ${ratio("bondingCurve").toFixed(2)}x | ${ratio("slowcook").toFixed(2)}x | ${ratio("slowcookShaded").toFixed(2)}x |`);
  console.log(`\nwrote ${join(outDir, "summary.json")}, runs.csv, chart.svg`);
}
