"use client";
import { useEffect, useState } from "react";

type Band = { median: number; p5: number; p95: number };
const ROWS: [string, string, "pct" | "near" | "x"][] = [
  ["Insider share of supply (bots + bundler)", "insiderShare", "pct"],
  ["Bundler share", "bundlerShare", "pct"],
  ["Insider ROI after dumping at T+1", "insiderRoi", "pct"],
  ["Insider profit (NEAR)", "insiderPnl", "near"],
  ["Retail aggregate PnL (NEAR)", "retailPnl", "near"],
  ["Median retail ROI", "retailRoiMedian", "pct"],
  ["Price drop caused by the dump", "priceDropPct", "pct"],
];

export default function Why() {
  const [s, setS] = useState<any>(null);
  useEffect(() => {
    fetch("/sim-summary.json").then((r) => r.json()).then(setS).catch(() => {});
  }, []);
  const f = (b: Band | undefined, kind: string) => {
    if (!b) return "–";
    const one = (v: number) => (kind === "pct" ? `${(v * 100).toFixed(1)}%` : v.toFixed(2));
    return (
      <>
        <b>{one(b.median)}</b> <span className="note">({one(b.p5)} to {one(b.p95)})</span>
      </>
    );
  };
  return (
    <main>
      <h1>Why SlowCook</h1>
      <p className="lead">
        On a bonding curve the price rises with every buy, so the first buyer pays the least. That subsidy is what sniper bots and bundlers
        harvest. In a uniform-price sealed auction there is no first: everyone who wins pays the same price.
      </p>
      <div className="panel" style={{ margin: "16px 0" }}>
        <h3>SIMULATED · same 200 wallets through both mechanisms · {s?.seeds ?? "…"} seeds</h3>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sim-chart.svg" alt="Simulated insider share and ROI: bonding curve vs SlowCook" style={{ width: "100%", borderRadius: 8 }} />
      </div>
      {s && (
        <div className="panel" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr><th>median (p5 to p95)</th><th>Bonding curve</th><th>SlowCook</th><th>SlowCook, shaded bids</th></tr>
            </thead>
            <tbody>
              {ROWS.map(([label, key, kind]) => (
                <tr key={key}>
                  <td>{label}</td>
                  <td>{f(s.summary.bondingCurve[key], kind)}</td>
                  <td>{f(s.summary.slowcook[key], kind)}</td>
                  <td>{f(s.summary.slowcookShaded[key], kind)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">
            {s.label} Insiders in SlowCook get the strongest strategy we could build: they know all retail demand and bid one tick above the
            clearing price retail alone would set. Full method: sim/README.md.
          </p>
        </div>
      )}
      <div className="grid" style={{ marginTop: 16 }}>
        <div className="panel">
          <h3>What it fixes</h3>
          <p>Being first, splitting into 20 wallets, or bidding 5× higher buys no better price. Unsold supply burns instead of flooding the pool. The creator&apos;s tokens unlock only after the price holds.</p>
        </div>
        <div className="panel">
          <h3>What it doesn&apos;t</h3>
          <p>Deposits are public (they cap a bid, they don&apos;t reveal it). One person can still use many wallets. The treasury slows a sell-off; it can&apos;t stop one. Not revealing is an option priced by a 5% penalty.</p>
        </div>
      </div>
    </main>
  );
}
