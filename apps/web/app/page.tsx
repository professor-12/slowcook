"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FACTORY, price, view, whole } from "@/lib/near";

const PHASE_CLASS: Record<string, string> = { Commit: "live", Reveal: "warn", Trading: "live", Failed: "bad" };

export default function Home() {
  const [launches, setLaunches] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const load = () =>
      view<any[]>(FACTORY, "list_launches", { from: "0", limit: 100 })
        .then((l) => setLaunches([...l].reverse()))
        .catch((e) => setErr(String(e)));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <main>
      <h1>Memecoin launches where being first is worthless.</h1>
      <p className="lead">
        Sealed bids, one clearing price for everyone, unsold supply burned, trading opens at exactly that price, and a rule-bound treasury
        defends it. Bots and bundlers can still buy, but only at the same price as you.
      </p>
      <ol className="steps">
        <li><b>Create</b>supply, minimum price, bidding window</li>
        <li><b>Seal</b>commit a hidden bid + deposit</li>
        <li><b>Reveal</b>contract checks it matches the hash</li>
        <li><b>Clear</b>one price for all; unsold supply burns</li>
        <li><b>Trade</b>pool opens at the clearing price</li>
        <li><b>Defend</b>Floor Keeper buys &amp; burns below it</li>
      </ol>
      <div className="row" style={{ margin: "20px 0" }}>
        <Link className="btn" href="/create/">Create a launch</Link>
        <Link href="/why/">See the simulation (SIMULATED) →</Link>
      </div>
      <h2>Launches on {FACTORY}</h2>
      {err && <p className="err">{err}</p>}
      {!launches && !err && <p className="note">Loading…</p>}
      {launches && launches.length === 0 && <p className="note">No launches yet.</p>}
      {launches && launches.length > 0 && (
        <div className="panel" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr><th>#</th><th>Token</th><th>Phase</th><th>Commits / reveals</th><th>Clearing (NEAR/token)</th><th>Sold</th><th>Burned</th></tr>
            </thead>
            <tbody>
              {launches.map((l) => (
                <tr key={l.id}>
                  <td>{l.id}</td>
                  <td><Link href={`/launch/?id=${l.id}`}>{l.name} <span className="note">${l.symbol}</span></Link></td>
                  <td><span className={`badge ${PHASE_CLASS[l.phase] ?? ""}`}>{l.phase}</span></td>
                  <td>{l.num_commits} / {l.num_reveals}</td>
                  <td>{l.clearing_price !== "0" ? price(l.clearing_price) : "sealed"}</td>
                  <td>{l.filled !== "0" ? whole(l.filled) : "–"}</td>
                  <td>{l.burned_at_finalize !== "0" ? whole(l.burned_at_finalize) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
