// Dependency-free SVG for the README (SIMULATED): two small multiples, one horizontal bar per
// mechanism (median), p5-p95 whisker, value at the tip. Same palette and specs as the web app
// (apps/web/components/SimChart.tsx): dataviz reference slots 1-3 validated on #ffffff, bars <= 24px
// with a 4px rounded data-end, hairline solid grid at clean ticks, legend, text in text colours.
import type { Band } from "./run.ts";

const C = { bg: "#ffffff", fg: "#0b1a14", muted: "#52605a", grid: "#e3e8e6", base: "#8a9590", s: ["#2a78d6", "#eb6834", "#1baf7a"] };
const FONT = "IBM Plex Sans, Segoe UI, Arial, sans-serif";
const MECHS: [string, string][] = [
  ["bondingCurve", "Bonding curve (pump.fun-style)"],
  ["slowcook", "SlowCook"],
  ["slowcookShaded", "SlowCook, shaded bids"],
];
const pct = (v: number) => `${(v * 100).toFixed(v !== 0 && Math.abs(v) < 0.1 ? 1 : 0)}%`;

function barPath(x0: number, x1: number, cy: number, h: number) {
  const left = Math.min(x0, x1), w = Math.max(1, Math.abs(x1 - x0)), r = Math.min(4, w / 2);
  const t = cy - h / 2, b = cy + h / 2;
  return x1 >= x0
    ? `M${left},${t} L${left + w - r},${t} Q${left + w},${t} ${left + w},${t + r} L${left + w},${b - r} Q${left + w},${b} ${left + w - r},${b} L${left},${b} Z`
    : `M${left + w},${t} L${left + r},${t} Q${left},${t} ${left},${t + r} L${left},${b - r} Q${left},${b} ${left + r},${b} L${left + w},${b} Z`;
}

function panel(x0: number, y0: number, title: string, metric: string, summary: Record<string, Record<string, Band>>, lo: number, hi: number, step: number): string {
  const W = 400, rowH = 44, bar = 20, left = 8, right = 64, top = 28;
  const plotW = W - left - right;
  const x = (v: number) => x0 + left + ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * plotW;
  const yEnd = y0 + top + MECHS.length * rowH;
  let s = `<text x="${x0 + left}" y="${y0 + 14}" fill="${C.fg}" font-size="14" font-weight="600">${title}</text>`;
  for (let v = lo; v <= hi + 1e-9; v += step) {
    const vv = Math.round(v * 100) / 100;
    s += `<line x1="${x(vv)}" x2="${x(vv)}" y1="${y0 + top}" y2="${yEnd}" stroke="${vv === 0 ? C.base : C.grid}" stroke-width="1" shape-rendering="crispEdges"/>`;
    s += `<text x="${x(vv)}" y="${yEnd + 18}" fill="${C.muted}" font-size="12" text-anchor="middle">${pct(vv)}</text>`;
  }
  MECHS.forEach(([key], i) => {
    const b = summary[key][metric];
    const cy = y0 + top + i * rowH + rowH / 2;
    s += `<path d="${barPath(x(0), x(b.median), cy, bar)}" fill="${C.s[i]}"/>`;
    s += `<line x1="${x(b.p5)}" x2="${x(b.p95)}" y1="${cy}" y2="${cy}" stroke="${C.fg}" stroke-width="1.5"/>`;
    for (const v of [b.p5, b.p95]) s += `<line x1="${x(v)}" x2="${x(v)}" y1="${cy - 5}" y2="${cy + 5}" stroke="${C.fg}" stroke-width="1.5"/>`;
    s += `<text x="${Math.max(x(b.median), x(b.p95)) + 8}" y="${cy + 4}" fill="${C.fg}" font-size="13" font-weight="600">${pct(b.median)}</text>`;
  });
  return s;
}

export function renderChart(summary: Record<string, Record<string, Band>>, seeds: number): string {
  const roiHi = Math.max(1, ...MECHS.map(([k]) => summary[k].insiderRoi.p95));
  const roiTop = -2 + 4 * Math.ceil((roiHi + 2) / 4);
  const W = 880, H = 300;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`;
  s += `<rect width="${W}" height="${H}" fill="${C.bg}"/>`;
  // legend (always present for >= 2 series)
  let lx = 32;
  MECHS.forEach(([, label], i) => {
    s += `<rect x="${lx}" y="20" width="12" height="12" rx="3" fill="${C.s[i]}"/><text x="${lx + 18}" y="30" fill="${C.muted}" font-size="13">${label}</text>`;
    lx += 18 + label.length * 7.2 + 28;
  });
  s += panel(24, 52, "Insider share of supply (bots and bundler)", "insiderShare", summary, 0, 1, 0.25);
  s += panel(456, 52, "Insider return after dumping at T+1", "insiderRoi", summary, -2, roiTop, (roiTop + 2) / 4);
  s += `<text x="32" y="${H - 16}" fill="${C.muted}" font-size="12">SIMULATED · ${seeds} seeds · 200 wallets · bar = median, whisker = 5th to 95th percentile · method: sim/README.md</text>`;
  return s + "</svg>\n";
}
