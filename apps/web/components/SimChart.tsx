"use client";
// SIMULATED results as two small multiples (insider share, insider ROI), one horizontal bar per
// mechanism. Dataviz specs: bars <= 24px, 4px rounded data-end, value at the tip, p5-p95 whisker,
// hairline solid grid at clean ticks, legend for 3 series, hover/focus tooltip, table view on the page.
import { useState } from "react";
import { useMeasuredWidth } from "@/lib/useMeasuredWidth";
import { MECHANISMS } from "@/content/mechanisms";

export type Band = { median: number; p5: number; p95: number };
type Summary = Record<string, Record<string, Band>>;

export { MECHANISMS };

const pct = (v: number) => `${(v * 100).toFixed(v !== 0 && Math.abs(v) < 0.1 ? 1 : 0)}%`;

function Panel({ title, metric, summary, lo, hi, step }: { title: string; metric: string; summary: Summary; lo: number; hi: number; step: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const { ref: plotRef, width: measured } = useMeasuredWidth<HTMLDivElement>(520);
  const W = measured, rowH = 44, bar = 20, m = { top: 8, right: 64, bottom: 28, left: 8 };
  const plotW = W - m.left - m.right;
  const H = m.top + MECHANISMS.length * rowH + m.bottom;
  const x = (v: number) => m.left + ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * plotW;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  const hovered = MECHANISMS.find((s) => s.key === hover);
  return (
    <figure className="viz sim-panel">
      <figcaption className="sim-panel-title">{title}</figcaption>
      <div className="viz-plot" ref={plotRef}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`${title}: median and 5th to 95th percentile per mechanism`}>
          {ticks.map((v) => (
            <g key={v}>
              <line className={v === 0 ? "viz-baseline" : "viz-grid"} x1={x(v)} x2={x(v)} y1={m.top} y2={H - m.bottom} />
              <text className="viz-axis" x={x(v)} y={H - 8} textAnchor="middle">
                {pct(v)}
              </text>
            </g>
          ))}
          {MECHANISMS.map((s, i) => {
            const b = summary[s.key]?.[metric];
            if (!b) return null;
            const cy = m.top + i * rowH + rowH / 2;
            const x0 = x(0), x1 = x(b.median);
            const left = Math.min(x0, x1), w = Math.max(1, Math.abs(x1 - x0));
            const r = Math.min(4, w / 2);
            const top = cy - bar / 2, bottom = cy + bar / 2;
            // rounded at the data end only (right end for positive values, left end for negative)
            const path =
              b.median >= 0
                ? `M${left},${top} L${left + w - r},${top} Q${left + w},${top} ${left + w},${top + r} L${left + w},${bottom - r} Q${left + w},${bottom} ${left + w - r},${bottom} L${left},${bottom} Z`
                : `M${left + w},${top} L${left + r},${top} Q${left},${top} ${left},${top + r} L${left},${bottom - r} Q${left},${bottom} ${left + r},${bottom} L${left + w},${bottom} Z`;
            const labelX = Math.max(x1, x(b.p95)) + 8;
            return (
              <g
                key={s.key}
                className={`viz-bar ${s.cls} ${hover === s.key ? "is-hover" : ""}`}
                tabIndex={0}
                role="graphics-symbol"
                aria-label={`${s.label}: median ${pct(b.median)}, 5th to 95th percentile ${pct(b.p5)} to ${pct(b.p95)}`}
                onPointerEnter={() => setHover(s.key)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(s.key)}
                onBlur={() => setHover(null)}
              >
                <rect x={m.left} y={m.top + i * rowH} width={plotW} height={rowH} fill="transparent" />
                <path d={path} />
                <line className="viz-whisker" x1={x(b.p5)} x2={x(b.p95)} y1={cy} y2={cy} />
                <line className="viz-whisker" x1={x(b.p5)} x2={x(b.p5)} y1={cy - 5} y2={cy + 5} />
                <line className="viz-whisker" x1={x(b.p95)} x2={x(b.p95)} y1={cy - 5} y2={cy + 5} />
                <text className="viz-label" x={labelX} y={cy + 4}>
                  {pct(b.median)}
                </text>
              </g>
            );
          })}
        </svg>
        {hovered && summary[hovered.key]?.[metric] && (
          <div className="viz-tooltip" role="status" style={{ left: "50%" }}>
            <strong className="num">{pct(summary[hovered.key][metric].median)} median</strong>
            <span className="num">
              {pct(summary[hovered.key][metric].p5)} to {pct(summary[hovered.key][metric].p95)} (p5 to p95)
            </span>
            <span className="muted">{hovered.label}</span>
          </div>
        )}
      </div>
    </figure>
  );
}

export function SimChart({ summary }: { summary: Summary }) {
  const roiHi = Math.max(1, ...MECHANISMS.map((s) => summary[s.key]?.insiderRoi?.p95 ?? 0));
  const roiTop = -2 + 4 * Math.ceil((roiHi + 2) / 4);
  return (
    <div className="stack-4">
      <ul className="viz-legend" aria-label="Legend">
        {MECHANISMS.map((s) => (
          <li key={s.key}>
            <span className={`swatch ${s.cls}`} aria-hidden /> {s.label}
          </li>
        ))}
      </ul>
      <div className="two-col">
        <Panel title="Insider share of supply (bots and bundler)" metric="insiderShare" summary={summary} lo={0} hi={1} step={0.25} />
        <Panel title="Insider return after dumping at T+1" metric="insiderRoi" summary={summary} lo={-2} hi={roiTop} step={(roiTop + 2) / 4} />
      </div>
    </div>
  );
}
