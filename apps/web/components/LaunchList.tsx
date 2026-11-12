"use client";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { price, whole } from "@/lib/near";
import { loadLaunches, usePolling } from "@/lib/useLaunches";
import { PhaseBadge } from "./PhaseBadge";

export function LaunchList() {
  const { state, refresh } = usePolling(loadLaunches);
  if (state.status === "loading") return <p className="muted" role="status">Loading launches from NEAR testnet…</p>;
  if (state.status === "error")
    return (
      <div className="notice notice-err" role="alert">
        <span>Could not reach the NEAR testnet RPC. The data is on-chain; try again in a moment.</span>
        <button className="btn btn-secondary btn-sm" onClick={refresh}>
          <RefreshCw size={16} aria-hidden /> Retry
        </button>
      </div>
    );
  const launches = [...state.data].reverse();
  if (!launches.length) return <p className="muted">No launches yet. Create the first one.</p>;
  return (
    <div className="table-wrap">
      <table>
        <caption className="visually-hidden">Launches on the SlowCook testnet contract, newest first</caption>
        <thead>
          <tr>
            <th scope="col">Launch</th>
            <th scope="col">Phase</th>
            <th scope="col" className="num">Sealed bids</th>
            <th scope="col" className="num">Clearing price (NEAR/token)</th>
            <th scope="col" className="num">Sold</th>
            <th scope="col" className="num">Burned</th>
          </tr>
        </thead>
        <tbody>
          {launches.map((l) => (
            <tr key={l.id}>
              <td>
                <Link href={`/launch/?id=${l.id}`}>
                  {l.name} <span className="muted">${l.symbol}</span>
                </Link>
              </td>
              <td>
                <PhaseBadge phase={l.phase} />
              </td>
              <td className="num">
                {l.num_commits} <span className="muted">({l.num_reveals} revealed)</span>
              </td>
              <td className="num">{l.clearing ? price(l.clearing_price) : "Sealed"}</td>
              <td className="num">{l.clearing ? whole(l.filled) : "–"}</td>
              <td className="num">{l.clearing ? whole(l.burned_at_finalize) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
