// Builds the ~2 min demo video: Piper voiceover (local, CC0 "joe" voice), headless recordings of the
// live site, two terminal cards with real run logs, burned-in captions timed to the speech, H.264/AAC MP4.
//
// Usage: node scripts/video/make-demo.ts
// Env:   PIPER_BIN, PIPER_VOICE (.onnx), CHROMIUM_PATH (optional), CHROMIUM_LIBS (optional NSS libs),
//        SITE (default https://web-omega-dun-65.vercel.app), OUT_DIR (default submission/video)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { ROOT } from "../lib.ts";
import { SCENES, type Scene } from "./narration.ts";

const SITE = (process.env.SITE ?? "https://web-omega-dun-65.vercel.app").replace(/\/$/, "");
const OUT = process.env.OUT_DIR ?? join(ROOT, "submission", "video");
const WORK = join(OUT, "work");
const PIPER = process.env.PIPER_BIN ?? "piper";
const VOICE = process.env.PIPER_VOICE ?? "";
const FONTS = join(ROOT, "apps", "web", "app", "fonts");
const W = 1280, H = 720;
const LEAD = 0.45, GAP = 0.3, TAIL = 0.55; // seconds of silence: scene start, between lines, scene end

if (!VOICE || !existsSync(VOICE)) throw new Error("set PIPER_VOICE to a Piper .onnx voice model");
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const run = (cmd: string, args: string[], input?: string) => execFileSync(cmd, args, { input, stdio: ["pipe", "pipe", "pipe"] }).toString();
const ff = (args: string[]) => run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
const dur = (f: string) => Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).trim());
const silence = (secs: number, f: string) => ff(["-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono", "-t", secs.toFixed(3), "-c:a", "pcm_s16le", f]);

// ------------------------------------------------------------------ 1. narration audio + timings
interface Timed { scene: Scene; secs: number; audio: string; caps: { start: number; end: number; text: string }[] }
const timed: Timed[] = [];
for (const scene of SCENES) {
  const parts: string[] = [];
  const caps: Timed["caps"] = [];
  let t = 0;
  const lead = join(WORK, `${scene.id}-lead.wav`);
  silence(LEAD, lead);
  parts.push(lead);
  t += LEAD;
  scene.lines.forEach((line, i) => {
    const wav = join(WORK, `${scene.id}-${i}.wav`);
    run(PIPER, ["--model", VOICE, "--output_file", wav, "--length_scale", "0.97"], line.say);
    const d = dur(wav);
    caps.push({ start: t, end: t + d, text: line.cap });
    parts.push(wav);
    t += d;
    const gap = join(WORK, `${scene.id}-${i}-gap.wav`);
    silence(i === scene.lines.length - 1 ? TAIL : GAP, gap);
    parts.push(gap);
    t += i === scene.lines.length - 1 ? TAIL : GAP;
  });
  if (scene.minSecs && t < scene.minSecs) {
    const pad = join(WORK, `${scene.id}-pad.wav`);
    silence(scene.minSecs - t, pad);
    parts.push(pad);
    t = scene.minSecs;
  }
  const list = join(WORK, `${scene.id}-list.txt`);
  writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
  const audio = join(WORK, `${scene.id}.wav`);
  ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", audio]);
  timed.push({ scene, secs: dur(audio), audio, caps });
  console.log(`audio ${scene.id.padEnd(8)} ${dur(audio).toFixed(2)}s (${scene.lines.length} lines)`);
}
const total = timed.reduce((s, x) => s + x.secs, 0);
console.log(`total ${total.toFixed(1)}s`);

// ------------------------------------------------------------------ 2. cards (title, end, terminals)
const fontCss = `
@font-face{font-family:D;src:url(file://${FONTS}/instrument-sans.woff2) format("woff2");font-weight:500 700}
@font-face{font-family:B;src:url(file://${FONTS}/ibm-plex-sans.woff2) format("woff2");font-weight:400 600}
@font-face{font-family:M;src:url(file://${FONTS}/ibm-plex-mono.woff2) format("woff2");font-weight:400}
*{box-sizing:border-box}body{margin:0;width:${W}px;height:${H}px;overflow:hidden;font-family:B}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function cardHtml(id: "title" | "end"): string {
  const body =
    id === "title"
      ? `<div class="wrap"><div class="brand">Slow<span>Cook</span><span class="pill">NEAR testnet</span></div>
         <h1>Memecoin launches where being first is worthless.</h1>
         <p>Sealed bids · one clearing price for every winner · unsold supply burned · a treasury that defends the price</p></div>`
      : `<div class="wrap"><div class="brand">Slow<span>Cook</span><span class="pill">Built at NEAR HACKATHON</span></div>
         <ul class="facts"><li><b>58</b> contract tests, every error code</li><li><b>1,000</b> random auctions per property-test run</li><li><b>1,000</b> auctions matched against an independent model</li><li>CI green on every push</li></ul>
         <p class="links"><span>Live demo</span> web-omega-dun-65.vercel.app</p>
         <p class="links"><span>Code</span> github.com/professor-12/slowcook</p>
         <p class="small">Testnet only. Contracts unaudited. Simulation figures are labelled SIMULATED in the repo. @NEARProtocol #NEARHackathon</p></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}
  body{background:#fff;color:#0b1a14;border-top:12px solid #0e5a43}
  .wrap{padding:84px 96px;display:grid;gap:28px}
  .brand{font-family:D;font-weight:700;font-size:44px;letter-spacing:-.02em}.brand span{color:#0f7a4e}
  .pill{display:inline-block;background:#e6f7ef;color:#0f7a4e!important;font-family:B;font-weight:600;font-size:22px;padding:8px 18px;border-radius:999px;margin-left:18px;vertical-align:middle;letter-spacing:0}
  h1{font-family:D;font-weight:600;font-size:76px;line-height:1.03;letter-spacing:-.03em;margin:8px 0 0;max-width:1000px}
  p{font-size:26px;color:#52605a;margin:0;max-width:1000px}
  .facts{list-style:none;padding:0;margin:0;display:grid;gap:12px;font-size:30px}.facts b{font-family:D;color:#0e5a43}
  .links{font-size:30px;color:#0b1a14}.links span{display:inline-block;min-width:170px;color:#52605a;font-size:22px;text-transform:uppercase;letter-spacing:.08em}
  .small{font-size:20px}
  .wrap>*{animation:rise .6s cubic-bezier(.05,.7,.1,1) both}.wrap>*:nth-child(2){animation-delay:.08s}.wrap>*:nth-child(3){animation-delay:.16s}.wrap>*:nth-child(n+4){animation-delay:.24s}
  @keyframes rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
  </style></head><body>${body}</body></html>`;
}

function terminalHtml(id: "launch" | "dump", secs: number): string {
  const lines = readFileSync(join(ROOT, "scripts", "video", `terminal-${id}.txt`), "utf8").trimEnd().split("\n");
  const per = Math.max(0.12, (secs - 1.5) / lines.length);
  const html = lines
    .map((l, i) => {
      const cls = l.startsWith("$") ? "cmd" : l.startsWith("==") ? "hd" : l.startsWith("✔") ? "ok" : l.startsWith("✘") ? "bad" : l.includes("[…]") ? "note" : "info";
      return `<div class="l ${cls}" style="animation-delay:${(0.3 + i * per).toFixed(2)}s">${esc(l)}</div>`;
    })
    .join("");
  const title = id === "launch" ? "Real launch on NEAR testnet · scripts/demo-launch.ts" : "Scripted sell-off and Floor Keeper · scripts/demo-dump.ts";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}
  body{background:#f5f7f6;display:grid;place-items:center}
  .win{width:1220px;height:660px;background:#0b1a14;border-radius:16px;box-shadow:0 12px 32px -8px rgb(11 26 20/.3);display:grid;grid-template-rows:auto 1fr;overflow:hidden}
  .bar{display:flex;gap:8px;align-items:center;padding:14px 18px;background:#13261e;color:#a9b8b1;font-size:18px}
  .dot{width:12px;height:12px;border-radius:50%;background:#2b3f36}
  .term{padding:18px 24px;font-family:M;font-size:18.5px;line-height:1.45;color:#d8e2dd;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden}
  .l{white-space:pre;overflow:hidden;text-overflow:ellipsis;opacity:0;animation:in .18s linear forwards}
  .cmd{color:#fff;font-weight:600}.hd{color:#8fd3b2}.ok{color:#d8e2dd}.ok::first-letter{color:#19c37d}.bad{color:#ffb4a8}.info{color:#a9b8b1}.note{color:#e6c07b}
  @keyframes in{to{opacity:1}}
  </style></head><body><div class="win"><div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span>&nbsp;${esc(title)}</div><div class="term">${html}</div></div></body></html>`;
}

// ------------------------------------------------------------------ 3. record each scene
function findChromium(): string {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = join(homedir(), ".cache", "ms-playwright");
  for (const d of readdirSync(cache).filter((x) => x.startsWith("chromium")).sort().reverse())
    for (const rel of ["chrome-headless-shell-linux64/chrome-headless-shell", "chrome-linux64/chrome", "chrome-linux/chrome"])
      if (existsSync(join(cache, d, rel))) return join(cache, d, rel);
  throw new Error("no Chromium found");
}

async function smoothScroll(page: Page, y: number, ms: number) {
  await page.evaluate(
    ({ y, ms }) =>
      new Promise<void>((res) => {
        const from = window.scrollY, t0 = performance.now();
        const step = (now: number) => {
          const p = Math.min(1, (now - t0) / ms), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          window.scrollTo(0, from + (y - from) * e);
          p < 1 ? requestAnimationFrame(step) : res();
        };
        requestAnimationFrame(step);
      }),
    { y, ms },
  );
}
const topOf = (page: Page, sel: string, offset = 90) => page.locator(sel).first().evaluate((el, o) => el.getBoundingClientRect().top + window.scrollY - o, offset);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: findChromium(),
  env: { ...process.env, LD_LIBRARY_PATH: [process.env.CHROMIUM_LIBS, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") },
});
const segments: string[] = [];
for (const t of timed) {
  const vdir = join(WORK, `rec-${t.scene.id}`);
  let readyMs = 0;
  for (let attempt = 1; ; attempt++) {
    rmSync(vdir, { recursive: true, force: true });
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: vdir, size: { width: W, height: H } } });
    const page = await ctx.newPage();
    const t0 = Date.now();
    let ready = 0;
    try {
      const v = t.scene.visual;
      const ms = t.secs * 1000;
      if (v.kind === "card") {
        await page.setContent(cardHtml(v.id), { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        ready = Date.now() - t0;
        await wait(ms + 300);
      } else if (v.kind === "terminal") {
        await page.setContent(terminalHtml(v.id, t.secs), { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        ready = Date.now() - t0;
        await wait(ms + 300);
      } else {
        await page.goto(SITE + v.path, { waitUntil: "networkidle", timeout: 60_000 });
        const must = v.action.startsWith("launch") ? "SlowCook Deep Pool" : v.action === "why" ? "Insider share of supply" : "Live from NEAR testnet";
        await page.getByText(must).first().waitFor({ timeout: 30_000 });
        if (v.action.startsWith("launch")) await page.locator("svg[aria-label='Demand by price tick'] path").first().waitFor({ timeout: 30_000 });
        if (v.action === "hero") await page.getByText("SlowCook Deep Pool").first().waitFor({ timeout: 30_000 });
        if (v.action === "launch-keeper") await page.getByText("Floor Keeper and creator lock").first().waitFor({ timeout: 30_000 });
        await wait(400);
        ready = Date.now() - t0;
        if (v.action === "hero") {
          await wait(ms * 0.75);
          await page.getByRole("link", { name: "See a launch" }).first().hover();
          await wait(ms * 0.25 + 300);
        } else if (v.action === "steps") {
          await smoothScroll(page, await topOf(page, "#how-it-works", 60), 1600);
          await wait(ms - 1600 + 300);
        } else if (v.action === "why") {
          await wait(800);
          await smoothScroll(page, await topOf(page, "#chart-title", 110), 1400);
          await wait(ms * 0.45);
          await page.locator("svg[aria-label^='Insider return'] .viz-bar").nth(1).hover();
          await wait(Math.max(500, ms - 2200 - ms * 0.45 + 300));
        } else if (v.action === "launch-curve") {
          await wait(ms * 0.3);
          await smoothScroll(page, await topOf(page, "#demand-title", 110), 1500);
          await wait(ms * 0.2);
          await page.locator(".viz-bar.fill-clearing").first().hover();
          await wait(Math.max(500, ms * 0.5 - 1500 + 300));
        } else if (v.action === "launch-keeper") {
          await smoothScroll(page, await topOf(page, "#keeper-title", 110), 1500);
          await wait(ms - 1500 + 300);
        }
      }
      readyMs = ready;
      await ctx.close();
      break;
    } catch (e) {
      await ctx.close().catch(() => {});
      if (attempt >= 3) throw e;
      console.log(`  retry ${t.scene.id} (${String(e).slice(0, 80)})`);
    }
  }
  const webm = readdirSync(vdir).find((f) => f.endsWith(".webm"))!;
  const seg = join(WORK, `seg-${t.scene.id}.mp4`);
  segments.push(seg);
  // Trim to the moment the content was ready; hold the last frame if the recording is short.
  ff([
    "-ss", (readyMs / 1000).toFixed(3), "-i", join(vdir, webm),
    "-vf", `tpad=stop_mode=clone:stop_duration=3,fps=30,scale=${W}:${H}:flags=lanczos,format=yuv420p`,
    "-t", t.secs.toFixed(3), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-an", seg,
  ]);
  console.log(`video ${t.scene.id.padEnd(8)} ${dur(seg).toFixed(2)}s (trimmed ${(readyMs / 1000).toFixed(2)}s of page load)`);
}
await browser.close();

// ------------------------------------------------------------------ 4. assemble: video, audio, captions
const vlist = join(WORK, "video-list.txt");
writeFileSync(vlist, segments.map((p) => `file '${p}'`).join("\n"));
const video = join(WORK, "video.mp4");
ff(["-f", "concat", "-safe", "0", "-i", vlist, "-c", "copy", video]);
const alist = join(WORK, "audio-list.txt");
writeFileSync(alist, timed.map((t) => `file '${t.audio}'`).join("\n"));
const narration = join(WORK, "narration.wav");
ff(["-f", "concat", "-safe", "0", "-i", alist, "-c", "copy", narration]);

const srtTime = (s: number) => {
  const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};
let offset = 0, n = 0;
const srt: string[] = [];
for (const t of timed) {
  for (const c of t.caps) srt.push(`${++n}\n${srtTime(offset + c.start)} --> ${srtTime(offset + c.end)}\n${c.text}\n`);
  offset += t.secs;
}
const srtPath = join(OUT, "slowcook-demo.en.srt");
writeFileSync(srtPath, srt.join("\n"));
const finalPath = join(OUT, "slowcook-demo.mp4");
const style = "FontName=Ubuntu Sans,FontSize=17,PrimaryColour=&H00FFFFFF,OutlineColour=&H00142A21,BackColour=&H00142A21,BorderStyle=3,Outline=6,Shadow=0,MarginV=22,MarginL=60,MarginR=60";
ff([
  "-i", video, "-i", narration,
  "-vf", `subtitles=${srtPath}:force_style='${style}'`,
  "-af", "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000",
  "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30",
  "-c:a", "aac", "-b:a", "160k", "-ac", "2", "-movflags", "+faststart", "-shortest", finalPath,
]);
console.log(`\nwrote ${finalPath} (${dur(finalPath).toFixed(1)}s) and ${srtPath}`);
