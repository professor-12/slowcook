"use client";
// Revealed demand per price tick. Dataviz specs: bars <= 24px with a 4px rounded data-end, 2px gaps,
// hairline solid grid, clean y ticks, legend for the 3 outcome classes, hover/focus tooltip (value
// first), and a table view so no value is tooltip-only. Colours are tokens (globals.css --series-*).
import { useId, useMemo, useState } from "react";
import { fmtPrice, whole } from "@/lib/near";
import { useMeasuredWidth } from "@/lib/useMeasuredWidth";

type Outcome = "filled" | "clearing" | "unfilled";
const OUTCOME_LABEL: Record<Outcome, string> = {
  filled: "Filled in full",
  clearing: "Clearing price (pro rata)",
  unfilled: "Below clearing (refunded)",
};

function niceStep(max: number, ticks = 4) {
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function Histogram({
  buckets,
  prices,
  clearingTick,
  saleSupply,
  compactMode = false,
}: {
  buckets: bigint[];
  prices: string[];
  clearingTick: number | null;
  saleSupply: bigint;
  compactMode?: boolean;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const { ref: plotRef, width: measured } = useMeasuredWidth<HTMLDivElement>(640);
  const nz = buckets.map((b, i) => (b > 0n ? i : -1)).filter((i) => i >= 0);
  const data = useMemo(() => {
    if (!nz.length) return null;
    const lo = Math.max(0, Math.min(...nz) - 1);
    const hi = Math.min(63, Math.max(...nz, clearingTick ?? 0) + 1);
    return Array.from({ length: hi - lo + 1 }, (_, i) => {
      const t = lo + i;
      const outcome: Outcome = clearingTick === null ? "filled" : t > clearingTick ? "filled" : t === clearingTick ? "clearing" : "unfilled";
      return { t, qty: Number(buckets[t]), price: prices[t], outcome };
    });
  }, [buckets, prices, clearingTick, nz.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <p className="muted small">No revealed demand yet. Bids stay sealed until the reveal window.</p>;

  const W = measured, H = compactMode ? 160 : 240;
  const m = { top: 16, right: 8, bottom: compactMode ? 8 : 32, left: compactMode ? 8 : 48 };
  const plotW = W - m.left - m.right, plotH = H - m.top - m.bottom;
  const max = Math.max(...data.map((d) => d.qty), 1);
  const step = niceStep(max);
  const yMax = Math.ceil(max / step) * step;
  const y = (v: number) => m.top + plotH - (v / yMax) * plotH;
  const slot = plotW / data.length;
  const bw = Math.max(2, Math.min(24, slot - 2));
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);
  const classes = (["filled", "clearing", "unfilled"] as Outcome[]).filter((o) => data.some((d) => d.outcome === o && d.qty > 0));
  // x labels: the clearing tick first, then the two ends only where they do not collide with it.
  const minLabelGap = 80;
  const cxOf = (i: number) => m.left + i * slot + slot / 2;
  const labelled: number[] = [];
  const clearIdx = clearingTick === null ? -1 : data.findIndex((d) => d.t === clearingTick);
  if (!compactMode) {
    for (const i of [clearIdx, 0, data.length - 1]) {
      if (i < 0 || labelled.includes(i)) continue;
      if (labelled.every((j) => Math.abs(cxOf(i) - cxOf(j)) >= minLabelGap)) labelled.push(i);
    }
  }
  const hovered = hover === null ? null : data.find((d) => d.t === hover) ?? null;
  const hx = hovered ? m.left + (hovered.t - data[0].t) * slot + slot / 2 : 0;

  return (
    <figure className="viz" aria-labelledby={`${id}-cap`}>
      <figcaption id={`${id}-cap`} className="visually-hidden">
        Tokens demanded at each price tick. Sale supply {saleSupply.toLocaleString()} tokens.
        {clearingTick !== null && ` Clearing price ${fmtPrice(prices[clearingTick])} NEAR per token.`}
      </figcaption>
      <ul className="viz-legend" aria-label="Legend">
        {classes.map((o) => (
          <li key={o}>
            <span className={`swatch fill-${o}`} aria-hidden /> {OUTCOME_LABEL[o]}
          </li>
        ))}
      </ul>
      <div className="viz-plot" ref={plotRef}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Demand by price tick">
          {!compactMode &&
            ticks.map((v) => (
              <g key={v}>
                <line className="viz-grid" x1={m.left} x2={W - m.right} y1={y(v)} y2={y(v)} />
                <text className="viz-axis" x={m.left - 8} y={y(v) + 4} textAnchor="end">
                  {compact.format(v)}
                </text>
              </g>
            ))}
          {data.map((d, i) => {
            const x = m.left + i * slot + (slot - bw) / 2;
            const top = y(d.qty);
            const h = m.top + plotH - top;
            const r = Math.min(4, bw / 2, h);
            const path =
              d.qty > 0
                ? `M${x},${m.top + plotH} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + bw - r},${top} Q${x + bw},${top} ${x + bw},${top + r} L${x + bw},${m.top + plotH} Z`
                : "";
            const label = labelled.includes(i) ? (
              <text className={`viz-axis ${d.t === clearingTick ? "strong" : ""}`} x={cxOf(i)} y={H - 10} textAnchor={i === 0 && d.t !== clearingTick ? "start" : i === data.length - 1 && d.t !== clearingTick ? "end" : "middle"}>
                {fmtPrice(d.price)}
              </text>
            ) : null;
            return (
              <g key={d.t}>
                {d.qty > 0 && (
                  <g
                    className={`viz-bar fill-${d.outcome} ${hover === d.t ? "is-hover" : ""}`}
                    tabIndex={compactMode ? -1 : 0}
                    role="graphics-symbol"
                    aria-label={`${whole(d.qty)} tokens at ${fmtPrice(d.price)} NEAR: ${OUTCOME_LABEL[d.outcome]}`}
                    onPointerEnter={() => setHover(d.t)}
                    onPointerLeave={() => setHover(null)}
                    onFocus={() => setHover(d.t)}
                    onBlur={() => setHover(null)}
                  >
                    {/* hit area larger than the mark */}
                    <rect x={m.left + i * slot} y={m.top} width={slot} height={plotH} fill="transparent" />
                    <path d={path} />
                  </g>
                )}
                {label}
              </g>
            );
          })}
          {clearingTick !== null && clearingTick >= data[0].t && (
            <line
              className="viz-clearing"
              x1={m.left + (clearingTick - data[0].t) * slot + slot / 2}
              x2={m.left + (clearingTick - data[0].t) * slot + slot / 2}
              y1={m.top}
              y2={m.top + plotH}
            />
          )}
          {!compactMode && <line className="viz-baseline" x1={m.left} x2={W - m.right} y1={m.top + plotH} y2={m.top + plotH} />}
        </svg>
        {hovered && (
          <div className="viz-tooltip" role="status" style={{ left: `${(hx / W) * 100}%` }}>
            <strong className="num">{whole(hovered.qty)} tokens</strong>
            <span>at {fmtPrice(hovered.price)} NEAR</span>
            <span className="muted">{OUTCOME_LABEL[hovered.outcome]}</span>
          </div>
        )}
      </div>
      {!compactMode && (
        <details className="viz-table">
          <summary>Show as table</summary>
          <div className="table-wrap" style={{ marginTop: "var(--space-3)" }}>
            <table>
              <thead>
                <tr>
                  <th scope="col" className="num">Price (NEAR/token)</th>
                  <th scope="col" className="num">Tokens demanded</th>
                  <th scope="col">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {data
                  .filter((d) => d.qty > 0)
                  .reverse()
                  .map((d) => (
                    <tr key={d.t}>
                      <td className="num">{fmtPrice(d.price)}</td>
                      <td className="num">{whole(d.qty)}</td>
                      <td>{OUTCOME_LABEL[d.outcome]}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  );
}
