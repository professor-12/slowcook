import { why } from "@/content/site";
import sim from "@/content/sim-summary.json";
import { SimChart, type Band } from "@/components/SimChart";
import { MECHANISMS } from "@/content/mechanisms";

const ROWS: [string, string, "pct" | "near" | "x"][] = [
  ["Insider share of supply (bots and bundler)", "insiderShare", "pct"],
  ["Bundler share", "bundlerShare", "pct"],
  ["Insider return after dumping at T+1", "insiderRoi", "pct"],
  ["Insider profit (NEAR)", "insiderPnl", "near"],
  ["Retail aggregate profit or loss (NEAR)", "retailPnl", "near"],
  ["Median retail return", "retailRoiMedian", "pct"],
  ["Price drop caused by the dump", "priceDropPct", "pct"],
];

const fmt = (v: number, kind: string) => (kind === "pct" ? `${(v * 100).toFixed(1)}%` : v.toFixed(2));

// Static data (results/sim-summary-SIMULATED.json, copied at build): prerendered, no fetch, no layout shift.
export default function Why() {
  const s: any = sim;
  return (
    <div className="container container-wide section stack-4" style={{ gap: "var(--space-12)" }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <p className="eyebrow">{why.eyebrow}</p>
        <h1>{why.title}</h1>
        <p className="lead">{why.lead}</p>
      </div>

      <section className="card stack-4" aria-labelledby="chart-title">
        <h2 id="chart-title" className="card-title">
          {why.chartTitle}
          {s ? `, ${s.seeds.toLocaleString()} runs` : ""}
        </h2>
        <SimChart summary={s.summary} />
        <p className="small muted">{why.chartNote}</p>
      </section>

      {s && (
        <section aria-labelledby="table-title" className="stack-4">
          <h2 id="table-title">All results</h2>
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">SIMULATED results, median with 5th to 95th percentile in brackets</caption>
              <thead>
                <tr>
                  <th scope="col">Median (5th to 95th percentile)</th>
                  {MECHANISMS.map((m) => (
                    <th key={m.key} scope="col" className="num">
                      {m.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([label, key, kind]) => (
                  <tr key={key}>
                    <th scope="row" style={{ background: "transparent", fontWeight: 400, color: "var(--foreground)" }}>
                      {label}
                    </th>
                    {MECHANISMS.map((m) => {
                      const b: Band | undefined = s.summary[m.key][key];
                      return (
                        <td key={m.key} className="num">
                          {b ? (
                            <>
                              <strong>{fmt(b.median, kind)}</strong>{" "}
                              <span className="muted">
                                ({fmt(b.p5, kind)} to {fmt(b.p95, kind)})
                              </span>
                            </>
                          ) : (
                            "–"
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small">
            <a href={why.method.href} rel="noopener noreferrer">
              {why.method.label}
            </a>
          </p>
        </section>
      )}

      <div className="two-col">
        <section className="card stack-2" aria-labelledby="fixes-title">
          <h2 id="fixes-title" className="card-title">
            {why.fixes.title}
          </h2>
          <p>{why.fixes.body}</p>
        </section>
        <section className="card stack-2" aria-labelledby="limits-title">
          <h2 id="limits-title" className="card-title">
            {why.limits.title}
          </h2>
          <p>{why.limits.body}</p>
        </section>
      </div>
    </div>
  );
}
