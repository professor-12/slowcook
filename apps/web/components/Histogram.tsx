"use client";
// Demand per price tick (revealed bids), with the clearing price marked after finalize.
import { price as fmtPrice } from "@/lib/near";

export function Histogram({ buckets, prices, clearingTick, saleSupply }: { buckets: bigint[]; prices: string[]; clearingTick: number | null; saleSupply: bigint }) {
  const nz = buckets.map((b, i) => (b > 0n ? i : -1)).filter((i) => i >= 0);
  if (!nz.length) return <p className="note">No revealed demand yet. Bids stay sealed until the reveal window.</p>;
  const lo = Math.max(0, Math.min(...nz) - 2);
  const hi = Math.min(63, Math.max(...nz, clearingTick ?? 0) + 2);
  const shown = buckets.slice(lo, hi + 1);
  const max = shown.reduce((m, b) => (b > m ? b : m), 1n);
  const W = 760, H = 260, top = 44, bottom = 28, side = 28, bw = (W - side * 2) / shown.length;
  const y = (v: bigint) => H - bottom - (Number((v * 1000n) / max) / 1000) * (H - top - bottom);
  // Axis labels: a regular stride plus the clearing tick; drop stride labels that would collide with it.
  const stride = Math.max(1, Math.ceil(shown.length / 6));
  const minGap = Math.ceil(70 / bw); // ~70px per label
  const labelled = (i: number) => {
    const t = lo + i;
    if (clearingTick === t) return true;
    if (i % stride !== 0) return false;
    return clearingTick === null || Math.abs(t - clearingTick) >= minGap;
  };
  const cx = clearingTick !== null ? side + (clearingTick - lo) * bw : 0;
  const labelRight = cx < W * 0.6; // keep the clearing label inside the chart
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Demand by price tick">
      <text x={side} y={14} fontSize={11} fill="#9aa3ad">
        tokens demanded per price tick (NEAR/token below) · sale supply {saleSupply.toLocaleString()}
      </text>
      {shown.map((b, i) => {
        const t = lo + i;
        const isClear = clearingTick === t;
        const won = clearingTick !== null && t >= clearingTick;
        return (
          <g key={t}>
            <rect x={side + i * bw + 2} y={y(b)} width={Math.max(1, bw - 4)} height={H - bottom - y(b)} rx={3} fill={isClear ? "#f0a04b" : won ? "#3fb950" : "#3a4552"} />
            {labelled(i) && (
              <text x={side + i * bw + bw / 2} y={H - 8} fontSize={11} fill={isClear ? "#f0a04b" : "#9aa3ad"} fontWeight={isClear ? 700 : 400} textAnchor="middle">
                {fmtPrice(prices[t])}
              </text>
            )}
          </g>
        );
      })}
      {clearingTick !== null && clearingTick >= lo && (
        <g>
          <line x1={cx} x2={cx} y1={top - 12} y2={H - bottom} stroke="#f0a04b" strokeDasharray="4 4" />
          <text x={labelRight ? cx + 6 : cx - 6} y={top - 2} fontSize={13} fill="#f0a04b" fontWeight={700} textAnchor={labelRight ? "start" : "end"}>
            clearing price: everyone pays this
          </text>
        </g>
      )}
    </svg>
  );
}
