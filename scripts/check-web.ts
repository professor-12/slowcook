// Headless-browser QA of every web page against a base URL (hosted or local), following
// docs/design/core/qa-checklist.md:
//  1. content checks per page (live testnet data renders, wallet selector opens) at 1440px
//  2. matrix: 6 widths (320-1920) x normal/reduced motion: no console/page errors, no horizontal overflow
//  3. axe-core WCAG 2.2 AA scan per page; touch targets >= 24px (44px expected on controls)
// Screenshots: verification/web-check/<page>-<width>.png (375 and 1440). Report: results/web-check-*.json
//
// Usage: node scripts/check-web.ts [baseUrl]   (local: node scripts/serve-web.ts 8765)
// Env:   CHROMIUM_PATH, CHROMIUM_LIBS (extra LD_LIBRARY_PATH, e.g. NSS libs on machines without libnss3)
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { ROOT, writeResult } from "./lib.ts";

const BASE = (process.argv[2] ?? process.env.WEB_URL ?? "http://127.0.0.1:8765").replace(/\/$/, "");
const SHOTS = join(ROOT, "verification", "web-check");
mkdirSync(SHOTS, { recursive: true });
const AXE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const WIDTHS = [320, 375, 768, 1024, 1440, 1920];

function findChromium(): string {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = join(homedir(), ".cache", "ms-playwright");
  const dirs = existsSync(cache) ? readdirSync(cache).filter((d) => d.startsWith("chromium")).sort().reverse() : [];
  for (const d of dirs)
    for (const rel of ["chrome-headless-shell-linux64/chrome-headless-shell", "chrome-linux/headless_shell", "chrome-linux/chrome", "chrome-linux64/chrome"]) {
      const p = join(cache, d, rel);
      if (existsSync(p)) return p;
    }
  throw new Error("no Chromium found: set CHROMIUM_PATH");
}

const textVisible = async (p: Page, text: string, timeout = 20_000) => {
  try {
    await p.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout });
    return [];
  } catch {
    return [`missing text: "${text}"`];
  }
};

interface Check {
  path: string;
  name: string;
  status?: number;
  expect: (p: Page) => Promise<string[]>;
}
const CHECKS: Check[] = [
  {
    path: "/",
    name: "home",
    expect: async (p) => [...(await textVisible(p, "being first is worthless")), ...(await textVisible(p, "SlowCook Demo")), ...(await textVisible(p, "Live from NEAR testnet"))],
  },
  { path: "/create/", name: "create", expect: async (p) => [...(await textVisible(p, "Create a launch")), ...(await textVisible(p, "Connect wallet to create"))] },
  {
    path: "/launch/?id=0",
    name: "launch-0",
    expect: async (p) => {
      const probs = [...(await textVisible(p, "SlowCook Demo")), ...(await textVisible(p, "Floor Keeper"))];
      if ((await p.locator("svg[aria-label='Demand by price tick'] path").count()) === 0) probs.push("histogram has no bars");
      const v = await p.locator(".stat", { hasText: "Clearing price" }).locator(".value").innerText().catch(() => "");
      if (!v || v === "Sealed") probs.push(`clearing price stat shows "${v}"`);
      return probs;
    },
  },
  {
    path: "/launch/?id=1",
    name: "launch-1",
    expect: async (p) => {
      const probs = [...(await textVisible(p, "SlowCook Deep Pool")), ...(await textVisible(p, "Floor Keeper"))];
      if ((await p.locator("svg[aria-label='Demand by price tick'] path").count()) === 0) probs.push("histogram has no bars");
      return probs;
    },
  },
  {
    path: "/why/",
    name: "why",
    expect: async (p) => {
      const probs = [...(await textVisible(p, "Why SlowCook")), ...(await textVisible(p, "Insider share of supply"))];
      if ((await p.locator("svg[aria-label^='Insider share'] path").count()) < 3) probs.push("simulation chart did not render 3 bars");
      return probs;
    },
  },
  { path: "/this-page-does-not-exist/", name: "not-found", status: 404, expect: async (p) => textVisible(p, "This page does not exist", 10_000) },
];

/** Scroll like a reader so scroll-triggered reveals run before a full-page screenshot. */
async function scrollThrough(page: Page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 500) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
}

const NET_FLAP = /ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED/;
/** Open a page; if the local network flapped during the load, retry once (counts as a site error only if it repeats). */
async function openPage(browser: Browser, c: Check, width: number, reduced: boolean) {
  const first = await openPageOnce(browser, c, width, reduced);
  if (!first.errors.some((e) => NET_FLAP.test(e))) return first;
  await first.ctx.close();
  return openPageOnce(browser, c, width, reduced);
}

async function openPageOnce(browser: Browser, c: Check, width: number, reduced: boolean) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference", deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !(c.status === 404 && /status of 404/.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
  page.on("requestfailed", (r) => {
    const err = r.failure()?.errorText ?? "";
    if (r.url().startsWith(BASE) && !err.includes("ERR_ABORTED")) errors.push(`request: ${r.url()} ${err}`);
  });
  const res = await page.goto(BASE + c.path, { waitUntil: "networkidle", timeout: 45_000 }).catch((e) => (errors.push(`goto: ${e}`), null));
  return { ctx, page, errors, status: res?.status() ?? 0 };
}

const browser = await chromium.launch({
  executablePath: findChromium(),
  env: { ...process.env, LD_LIBRARY_PATH: [process.env.CHROMIUM_LIBS, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") },
});
const report: any = { base: BASE, checkedAt: new Date().toISOString(), content: [], matrix: [], axe: [], targets: [] };
let failures = 0;

// 1. Content + wallet + axe + targets at 1440 (normal motion)
for (const c of CHECKS) {
  const { ctx, page, errors, status } = await openPage(browser, c, 1440, false);
  const problems = await c.expect(page);
  if (status !== (c.status ?? 200)) problems.push(`HTTP ${status}`);
  let wallet = "skipped";
  if (c.name === "home") {
    await page.getByRole("button", { name: "Connect wallet" }).first().click().catch(() => {});
    await page.waitForTimeout(4000);
    // near-connect renders its selector as a .hot-connector-popup element listing wallets
    const popup = page.locator(".hot-connector-popup");
    wallet = (await popup.count()) > 0 && (await popup.getByText("Select wallet").count()) > 0 ? "selector opened" : "no selector visible";
    if (wallet !== "selector opened") problems.push("wallet selector did not open");
    await page.reload({ waitUntil: "networkidle" });
  }
  // axe-core, WCAG 2.0/2.1/2.2 A + AA
  await page.addScriptTag({ content: AXE });
  const axe: any = await page.evaluate(async () => {
    const r = await (window as any).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
    return r.violations.map((v: any) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n: any) => n.target.join(" ")) }));
  });
  // target size: every visible interactive element >= 24x24; report controls under 44px tall
  const targets: any = await page.evaluate(() => {
    const out: { el: string; w: number; h: number }[] = [];
    document.querySelectorAll("a, button, input, select, summary, [tabindex='0']").forEach((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const inline = el.tagName === "A" && getComputedStyle(el).display === "inline" && el.closest("p, li, td, dd, nav.small");
      if (inline) return; // inline text links are exempt from 2.5.8 (spacing/inline exception)
      if (r.width < 24 || r.height < 24) out.push({ el: `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""} "${(el.textContent ?? "").trim().slice(0, 30)}"`, w: Math.round(r.width), h: Math.round(r.height) });
    });
    return out;
  });
  await scrollThrough(page);
  await page.screenshot({ path: join(SHOTS, `${c.name}-1440.png`), fullPage: true });
  const ok = problems.length === 0 && errors.length === 0 && axe.length === 0 && targets.length === 0;
  if (!ok) failures++;
  report.content.push({ page: c.path, ok, status, problems, errors, wallet });
  report.axe.push({ page: c.path, violations: axe });
  report.targets.push({ page: c.path, under24px: targets });
  console.log(`${ok ? "✔" : "✘"} ${c.path} (HTTP ${status})${wallet !== "skipped" ? ` wallet: ${wallet}` : ""} · axe violations ${axe.length} · targets <24px ${targets.length}`);
  for (const p of [...problems, ...errors]) console.log(`    - ${p}`);
  for (const v of axe) console.log(`    - axe ${v.impact} ${v.id}: ${v.help} @ ${v.nodes.join(" | ")}`);
  for (const t of targets) console.log(`    - target ${t.w}x${t.h}: ${t.el}`);
  await ctx.close();
}

// 2. Matrix: widths x motion modes
let matrixFail = 0;
for (const c of CHECKS) {
  for (const width of WIDTHS) {
    for (const reduced of [false, true]) {
      const { ctx, page, errors } = await openPage(browser, c, width, reduced);
      await page.waitForTimeout(1500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (!reduced && width === 375) await scrollThrough(page);
      if (!reduced && width === 375) await page.screenshot({ path: join(SHOTS, `${c.name}-${width}.png`), fullPage: true });
      const ok = overflow <= 0 && errors.length === 0;
      if (!ok) matrixFail++;
      report.matrix.push({ page: c.path, width, reducedMotion: reduced, ok, horizontalOverflowPx: overflow, errors });
      if (!ok) console.log(`✘ ${c.path} @${width}px ${reduced ? "reduced" : "normal"}: overflow ${overflow}px ${errors.join("; ")}`);
      await ctx.close();
    }
  }
}
console.log(`matrix: ${report.matrix.length - matrixFail}/${report.matrix.length} page×width×motion combinations clean (no overflow, no errors)`);
failures += matrixFail;
await browser.close();
const path = writeResult("web-check", report);
console.log(`\n${failures === 0 ? "ALL CLEAN" : `${failures} failing check(s)`} · screenshots in verification/web-check/ · ${path}`);
process.exit(failures ? 1 : 0);
