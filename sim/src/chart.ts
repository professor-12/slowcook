// Dependency-free SVG chart: insider share of supply and insider ROI, median with p5–p95 whiskers.
import type { Band } from "./run.ts";

const C = { bg: "#0f1115", fg: "#e8e6e3", muted: "#9aa0a6", curve: "#e5534b", slow: "#3fb950", shaded: "#58a6ff", grid: "#2d333b" };
const MECHS: [string, string, string][] = [
  ["bondingCurve", "Bonding curve (pump.fun-style)", C.curve],
  ["slowcook", "SlowCook", C.slow],
  ["slowcookShaded", "SlowCook, shaded bids", C.shaded],
];

function panel(x0: number, title: string, metric: string, summary: Record<string, Record<string, Band>>, lo: number, hi: number, fmt: (v: number) => string): string {
  const W = 420, H = 300, left = 56, top = 60, plotH = 200, barW = 70, gap = 40;
  const y = (v: number) => top + plotH - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * plotH;
  let s = `<text x="${x0 + left}" y="36" fill="${C.fg}" font-size="16" font-weight="600">${title}</text>`;
  for (let i = 0; i <= 4; i++) {
    const v = lo + ((hi - lo) * i) / 4;
    s += `<line x1="${x0 + left}" x2="${x0 + W - 10}" y1="${y(v)}" y2="${y(v)}" stroke="${C.grid}"/>`;
    s += `<text x="${x0 + left - 8}" y="${y(v) + 4}" fill="${C.muted}" font-size="11" text-anchor="end">${fmt(v)}</text>`;
  }
  if (lo < 0 && hi > 0) s += `<line x1="${x0 + left}" x2="${x0 + W - 10}" y1="${y(0)}" y2="${y(0)}" stroke="${C.muted}"/>`;
  MECHS.forEach(([key, , color], i) => {
    const b = summary[key][metric];
    const bx = x0 + left + 20 + i * (barW + gap);
    const base = y(Math.max(lo, 0));
    const top_ = y(b.median);
    s += `<rect x="${bx}" y="${Math.min(base, top_)}" width="${barW}" height="${Math.abs(base - top_)}" fill="${color}" rx="3"/>`;
    s += `<line x1="${bx + barW / 2}" x2="${bx + barW / 2}" y1="${y(b.p5)}" y2="${y(b.p95)}" stroke="${C.fg}" stroke-width="2"/>`;
    s += `<text x="${bx + barW / 2}" y="${Math.min(base, top_) - 8}" fill="${C.fg}" font-size="14" font-weight="700" text-anchor="middle">${fmt(b.median)}</text>`;
  });
  return s + `<rect x="${x0}" y="0" width="${W}" height="${H}" fill="none"/>`;
}

export function renderChart(summary: Record<string, Record<string, Band>>, seeds: number): string {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const roiHi = Math.max(1, ...MECHS.map(([k]) => summary[k].insiderRoi.p95));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="880" height="360" viewBox="0 0 880 360" font-family="Inter,Segoe UI,Arial,sans-serif">`;
  s += `<rect width="880" height="360" fill="${C.bg}"/>`;
  s += panel(0, "Insider share of supply (bots + bundler)", "insiderShare", summary, 0, 1, pct);
  // Round axis: from -200% up in 4 equal whole-hundred steps that cover the largest p95.
  const roiLo = -2;
  const roiTop = roiLo + 4 * Math.ceil((roiHi - roiLo) / 4);
  s += panel(440, "Insider ROI after dumping at T+1", "insiderRoi", summary, roiLo, roiTop, pct);
  MECHS.forEach(([, label, color], i) => {
    s += `<rect x="${56 + i * 250}" y="${306}" width="12" height="12" fill="${color}"/><text x="${74 + i * 250}" y="${317}" fill="${C.fg}" font-size="12">${label}</text>`;
  });
  s += `<text x="56" y="345" fill="${C.muted}" font-size="11">SIMULATED · ${seeds} seeds · bars = median, whiskers = p5–p95 · 10 bots, 1 bundler (20 wallets), 170 retail = 200 wallets · sim/README.md</text>`;
  return s + "</svg>\n";
}
