// Lighthouse (mobile defaults: simulated slow 4G + 4x CPU) on the main pages.
// Starts Chromium itself with a Linux temp profile and connects over the DevTools port, instead of
// letting chrome-launcher pick a profile dir (under WSL it puts it on the Windows drive).
// Usage: node scripts/lighthouse.ts [baseUrl]    Env: CHROME_PATH (full Chrome/Chromium), CHROMIUM_LIBS
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import lighthouse from "lighthouse";
import { writeResult } from "./lib.ts";

const BASE = (process.argv[2] ?? "http://127.0.0.1:8765").replace(/\/$/, "");
const PAGES = [
  ["home", "/"],
  ["launch-1", "/launch/?id=1"],
  ["why", "/why/"],
  ["create", "/create/"],
];
const PORT = 9333;

function findChrome(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = join(homedir(), ".cache", "ms-playwright");
  for (const d of existsSync(cache) ? readdirSync(cache).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse() : []) {
    for (const rel of ["chrome-linux64/chrome", "chrome-linux/chrome"]) if (existsSync(join(cache, d, rel))) return join(cache, d, rel);
  }
  throw new Error("set CHROME_PATH to a full Chrome/Chromium binary");
}

const profile = mkdtempSync(join(tmpdir(), "slowcook-lh-"));
if (profile.startsWith("/mnt/")) throw new Error(`refusing to put the Chrome profile on a Windows drive: ${profile}`);
const chrome = spawn(findChrome(), ["--headless=new", "--no-sandbox", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"], {
  env: { ...process.env, LD_LIBRARY_PATH: [process.env.CHROMIUM_LIBS, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") },
  stdio: "ignore",
});
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  const out: any[] = [];
  for (const [name, path] of PAGES) {
    const r: any = await lighthouse(`${BASE}${path}`, { port: PORT, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility", "best-practices", "seo"] });
    const lhr = r.lhr;
    const scores = Object.fromEntries(Object.entries(lhr.categories).map(([k, v]: any) => [k, Math.round(v.score * 100)]));
    const metric = (id: string) => lhr.audits[id]?.displayValue;
    const below = Object.values(lhr.audits)
      .filter((a: any) => a.score !== null && a.score < 0.9 && ["binary", "numeric", "metricSavings"].includes(a.scoreDisplayMode))
      .map((a: any) => `${a.id} (${a.score})`);
    const row = { page: path, benchmarkIndex: lhr.environment?.benchmarkIndex, scores, lcp: metric("largest-contentful-paint"), tbt: metric("total-blocking-time"), cls: metric("cumulative-layout-shift"), fcp: metric("first-contentful-paint"), below_0_9: below };
    out.push(row);
    console.log(`${name.padEnd(9)} cpu-benchmark ${Math.round(lhr.environment?.benchmarkIndex ?? 0)} ${JSON.stringify(scores)} LCP ${row.lcp} TBT ${row.tbt} CLS ${row.cls}${below.length ? `\n          below 0.9: ${below.join(", ")}` : ""}`);
  }
  console.log(`wrote ${writeResult("lighthouse", { base: BASE, mode: "mobile, simulated throttling (Lighthouse defaults)", ranAt: new Date().toISOString(), pages: out })}`);
} finally {
  chrome.kill("SIGKILL");
  await new Promise((r) => setTimeout(r, 500));
  rmSync(profile, { recursive: true, force: true });
}
