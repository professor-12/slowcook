"use client";
// Real product UI as hero media: the latest traded launch, read live from NEAR testnet.
import Link from "next/link";
import { FACTORY, near, price, view, whole } from "@/lib/near";
import { usePolling } from "@/lib/useLaunches";
import { Histogram } from "./Histogram";
import { PhaseBadge } from "./PhaseBadge";

async function loadHero() {
  const list = await view<any[]>(FACTORY, "list_launches", { from: "0", limit: 100 });
  const l = [...list].reverse().find((x) => x.phase === "Trading") ?? list[list.length - 1];
  if (!l) return null;
  const [buckets, prices, pool] = await Promise.all([
    view<string[]>(FACTORY, "get_buckets", { id: l.id }),
    view<string[]>(FACTORY, "get_tick_prices", { id: l.id }),
    view<any>(FACTORY, "get_pool", { launch_id: l.id }),
  ]);
  return { l, buckets: buckets.map(BigInt), prices, pool };
}

export function HeroCard() {
  const { state } = usePolling(loadHero, 15000);
  return (
    <div className="card hero-card" aria-live="polite">
      {state.status !== "ready" || !state.data ? (
        <div className="hero-card-empty">
          <p className="card-title">Live from NEAR testnet</p>
          <p className="muted small">{state.status === "error" ? "The testnet RPC did not answer. Refresh to try again." : "Loading the latest launch…"}</p>
        </div>
      ) : (
        <HeroCardBody {...state.data} />
      )}
    </div>
  );
}

function HeroCardBody({ l, buckets, prices, pool }: { l: any; buckets: bigint[]; prices: string[]; pool: any }) {
  const clearingTick = l.clearing?.Over ? l.clearing.Over.tick : l.clearing?.Under ? 0 : null;
  return (
    <div className="stack-4">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <p className="card-title" style={{ margin: 0 }}>
          Live from NEAR testnet
        </p>
        <PhaseBadge phase={l.phase} />
      </div>
      <div>
        <p className="hero-card-name">{l.name}</p>
        <p className="muted small mono">{l.token_id}</p>
      </div>
      <Histogram buckets={buckets} prices={prices} clearingTick={clearingTick} saleSupply={BigInt(l.sale_supply)} compactMode />
      <dl className="kv">
        <dt>Clearing price, paid by every winner</dt>
        <dd>{l.clearing ? `${price(l.clearing_price)} NEAR` : "Sealed"}</dd>
        <dt>Tokens sold</dt>
        <dd>
          {whole(l.filled)} of {whole(l.sale_supply)}
        </dd>
        <dt>Pool</dt>
        <dd>{pool?.pool ? `${near(pool.pool.near_reserve, 2)} NEAR` : "–"}</dd>
      </dl>
      <Link href={`/launch/?id=${l.id}`}>Open launch {l.id}</Link>
    </div>
  );
}
