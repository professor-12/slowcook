// Headless-browser check of every web page against a base URL (hosted or local).
// Fails on HTTP errors, console errors, uncaught page errors, failed same-origin requests, or missing
// content; saves a screenshot per page to verification/web-check/ and a JSON report to results/.
//
// Usage: node scripts/check-web.ts [baseUrl]      (default http://127.0.0.1:8765, e.g. `npx serve apps/web/out -l 8765`)
// Env:   CHROMIUM_PATH   path to a Chromium/headless-shell binary (default: newest in ~/.cache/ms-playwright)
//        CHROMIUM_LIBS   extra LD_LIBRARY_PATH for the browser (for machines without libnss3)
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { ROOT, writeResult } from "./lib.ts";

const BASE = (process.argv[2] ?? process.env.WEB_URL ?? "http://127.0.0.1:8765").replace(/\/$/, "");
const SHOTS = join(ROOT, "verification", "web-check");
mkdirSync(SHOTS, { recursive: true });

function findChromium(): string {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = join(homedir(), ".cache", "ms-playwright");
  const dirs = existsSync(cache) ? readdirSync(cache).filter((d) => d.startsWith("chromium")).sort().reverse() : [];
  for (const d of dirs) {
    for (const rel of ["chrome-headless-shell-linux64/chrome-headless-shell", "chrome-linux/headless_shell", "chrome-linux/chrome", "chrome-linux64/chrome"]) {
      const p = join(cache, d, rel);
      if (existsSync(p)) return p;
    }
  }
  throw new Error("no Chromium found: set CHROMIUM_PATH");
}

interface Check {
  path: string;
  name: string;
  expect: (p: Page) => Promise<string[]>; // returns a list of problems
}

const textVisible = async (p: Page, text: string, timeout = 20_000) => {
  try {
    await p.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout });
    return [];
  } catch {
    return [`missing text: "${text}"`];
  }
};

const CHECKS: Check[] = [
  {
    path: "/",
    name: "home",
    expect: async (p) => [
      ...(await textVisible(p, "being first is worthless")),
      ...(await textVisible(p, "SlowCook Demo")), // launch list loaded from testnet RPC
    ],
  },
  {
    path: "/create/",
    name: "create",
    expect: async (p) => [...(await textVisible(p, "Create a launch")), ...(await textVisible(p, "Connect wallet to create"))],
  },
  {
    path: "/launch/?id=0",
    name: "launch-0",
    expect: async (p) => {
      const probs = [...(await textVisible(p, "SlowCook Demo")), ...(await textVisible(p, "Floor Keeper"))];
      const bars = await p.locator("svg[aria-label='Demand by price tick'] rect").count();
      if (bars === 0) probs.push("histogram has no bars");
      const clearing = await p.locator(".stat", { hasText: "Clearing price" }).locator(".v").innerText().catch(() => "");
      if (!clearing || clearing === "sealed") probs.push(`clearing price stat shows "${clearing}"`);
      return probs;
    },
  },
  {
    path: "/launch/?id=1",
    name: "launch-1",
    expect: async (p) => {
      const probs = [...(await textVisible(p, "SlowCook Deep Pool")), ...(await textVisible(p, "Floor Keeper"))];
      const bars = await p.locator("svg[aria-label='Demand by price tick'] rect").count();
      if (bars === 0) probs.push("histogram has no bars");
      return probs;
    },
  },
  {
    path: "/why/",
    name: "why",
    expect: async (p) => {
      const probs = [...(await textVisible(p, "Why SlowCook")), ...(await textVisible(p, "Insider share of supply"))];
      const w = await p.locator("img[src='/sim-chart.svg']").evaluate((i: HTMLImageElement) => i.naturalWidth).catch(() => 0);
      if (!w) probs.push("simulation chart image did not load");
      return probs;
    },
  },
  {
    path: "/this-page-does-not-exist/",
    name: "not-found",
    expect: async (p) => textVisible(p, "404", 10_000),
  },
];

const browser = await chromium.launch({
  executablePath: findChromium(),
  env: { ...process.env, LD_LIBRARY_PATH: [process.env.CHROMIUM_LIBS, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") },
});
const report: any[] = [];
let failed = 0;
for (const c of CHECKS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (m) => {
    // The deliberate 404 check logs the document's own 404; that is the expected result.
    if (m.type() === "error" && !(c.name === "not-found" && /status of 404/.test(m.text()))) consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("requestfailed", (r) => {
    // net::ERR_ABORTED = request cancelled by the browser (e.g. Next.js link prefetch when the page closes).
    const err = r.failure()?.errorText ?? "";
    if (r.url().startsWith(BASE) && !err.includes("ERR_ABORTED")) failedRequests.push(`${r.url()} ${err}`);
  });
  page.on("response", (r) => {
    if (r.url().startsWith(BASE) && r.status() >= 400 && c.name !== "not-found") failedRequests.push(`${r.url()} HTTP ${r.status()}`);
  });
  const res = await page.goto(BASE + c.path, { waitUntil: "networkidle", timeout: 45_000 }).catch((e) => (pageErrors.push(String(e)), null));
  const status = res?.status() ?? 0;
  const problems = await c.expect(page);
  if (c.name !== "not-found" && status !== 200) problems.push(`HTTP ${status}`);
  // Wallet connector: clicking "Connect wallet" must open the near-connect selector without errors.
  let wallet = "skipped";
  if (c.name === "home") {
    await page.getByRole("button", { name: "Connect wallet" }).first().click().catch(() => {});
    await page.waitForTimeout(4000);
    const frames = page.frames().length;
    const dialog = await page.locator("[role=dialog], .hot-connector-popup, iframe").count();
    wallet = frames > 1 || dialog > 0 ? "selector opened" : "no selector visible";
    if (wallet !== "selector opened") problems.push("wallet selector did not open");
  }
  await page.screenshot({ path: join(SHOTS, `${c.name}.png`), fullPage: true });
  const errs = [...consoleErrors.map((e) => `console: ${e}`), ...pageErrors.map((e) => `pageerror: ${e}`), ...failedRequests.map((e) => `request: ${e}`)];
  const ok = problems.length === 0 && errs.length === 0;
  if (!ok) failed++;
  report.push({ page: c.path, ok, status, problems, errors: errs, wallet });
  console.log(`${ok ? "✔" : "✘"} ${c.path} (HTTP ${status})${wallet !== "skipped" ? ` wallet: ${wallet}` : ""}`);
  for (const p of [...problems, ...errs]) console.log(`    - ${p}`);
  await page.close();
}
await browser.close();
const path = writeResult("web-check", { base: BASE, checkedAt: new Date().toISOString(), pages: report });
console.log(`\n${CHECKS.length - failed}/${CHECKS.length} pages clean · screenshots in verification/web-check/ · ${path}`);
process.exit(failed ? 1 : 0);
