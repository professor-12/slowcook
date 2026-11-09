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
  // cumulative demand from the top, for the supply line
  const W = 760, H = 240, pad = 28, bw = (W - pad * 2) / shown.length;
  const y = (v: bigint) => H - pad - Number((v * 1000n) / max) / 1000 * (H - pad * 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Demand by price tick">
      {shown.map((b, i) => {
        const t = lo + i;
        const isClear = clearingTick === t;
        const won = clearingTick !== null && t >= clearingTick;
        return (
          <g key={t}>
            <rect x={pad + i * bw + 2} y={y(b)} width={bw - 4} height={H - pad - y(b)} rx={3} fill={isClear ? "#f0a04b" : won ? "#3fb950" : "#3a4552"} />
            {(i % Math.ceil(shown.length / 8) === 0 || isClear) && (
              <text x={pad + i * bw + bw / 2} y={H - 8} fontSize={11} fill="#9aa3ad" textAnchor="middle">
                {fmtPrice(prices[t])}
              </text>
            )}
          </g>
        );
      })}
      {clearingTick !== null && clearingTick >= lo && (
        <g>
          <line x1={pad + (clearingTick - lo) * bw} x2={pad + (clearingTick - lo) * bw} y1={pad / 2} y2={H - pad} stroke="#f0a04b" strokeDasharray="4 4" />
          <text x={pad + (clearingTick - lo) * bw + 6} y={pad} fontSize={13} fill="#f0a04b" fontWeight={700}>
            clearing price: everyone pays this
          </text>
        </g>
      )}
      <text x={pad} y={14} fontSize={11} fill="#9aa3ad">
        tokens demanded per price tick (NEAR/token below) · sale supply {saleSupply.toLocaleString()}
      </text>
    </svg>
  );
}
