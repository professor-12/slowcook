"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Histogram } from "@/components/Histogram";
import {
  COMMIT_STORAGE_FEE, EXPLORER, FACTORY, ONE_TOKEN, chainNowMs, commitPreimage, errorCode, near, parseNear, price, randomSaltHex,
  receiptKey, sha256Hex, tokens, view, whole, type Receipt,
} from "@/lib/near";
import { useWallet } from "@/lib/wallet";

export default function LaunchPage() {
  return (
    <Suspense fallback={<p className="note">Loading…</p>}>
      <Launch />
    </Suspense>
  );
}

function useCountdown(targetMs: number | undefined, offset: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!targetMs) return "";
  const s = Math.max(0, Math.round((targetMs - (now + offset)) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Launch() {
  const id = useSearchParams().get("id") ?? "0";
  const { accountId, signIn, call } = useWallet();
  const [l, setL] = useState<any>(null);
  const [buckets, setBuckets] = useState<bigint[]>([]);
  const [prices, setPrices] = useState<string[]>([]);
  const [bid, setBid] = useState<any>(null);
  const [pool, setPool] = useState<any>(null);
  const [tre, setTre] = useState<any>(null);
  const [bal, setBal] = useState<string>("0");
  const [msg, setMsg] = useState<{ text: string; ok: boolean; hash?: string } | null>(null);
  const [offset, setOffset] = useState(0); // chain clock - local clock

  const refresh = useCallback(async () => {
    const launch = await view(FACTORY, "get_launch", { id });
    setL(launch);
    setBuckets((await view<string[]>(FACTORY, "get_buckets", { id })).map(BigInt));
    if (!prices.length) setPrices(await view<string[]>(FACTORY, "get_tick_prices", { id }));
    if (accountId) {
      setBid(await view(FACTORY, "get_bid", { launch_id: id, account_id: accountId }));
      if (launch.phase === "Trading") setBal(await view(launch.token_id, "ft_balance_of", { account_id: accountId }));
    }
    if (launch.phase === "Trading") {
      setPool(await view(FACTORY, "get_pool", { launch_id: id }));
      setTre(await view(FACTORY, "get_treasury", { launch_id: id }));
    }
  }, [id, accountId, prices.length]);

  useEffect(() => {
    chainNowMs().then((c) => setOffset(c - Date.now())).catch(() => {});
    refresh().catch((e) => setMsg({ text: String(e), ok: false }));
    const t = setInterval(() => refresh().catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const run = async (label: string, f: () => Promise<{ hash?: string; result?: unknown }>) => {
    setMsg({ text: `${label}: waiting for wallet…`, ok: true });
    try {
      const r = await f();
      setMsg({ text: `${label}: done`, ok: true, hash: r.hash });
      await refresh();
    } catch (e) {
      setMsg({ text: `${label}: ${errorCode(e)}`, ok: false });
    }
  };

  const commitLeft = useCountdown(l ? Number(l.commit_end_ms) : undefined, offset);
  const revealLeft = useCountdown(l ? Number(l.reveal_end_ms) : undefined, offset);
  if (!l) return <p className="note">Loading launch {id}…</p>;
  const clearingTick = l.clearing?.Over ? l.clearing.Over.tick : l.clearing?.Under ? 0 : null;

  return (
    <main>
      <h1>
        {l.name} <span className="note">${l.symbol}</span>
      </h1>
      <div className="row">
        <span className={`badge ${l.phase === "Failed" ? "bad" : "live"}`}>{l.phase}</span>
        {l.phase === "Commit" && <span className="badge warn">sealed bids close in {commitLeft}</span>}
        {l.phase === "Reveal" && <span className="badge warn">reveal closes in {revealLeft}</span>}
        <a className="note" href={`${EXPLORER}/address/${l.token_id}`}>{l.token_id}</a>
      </div>

      <div className="grid" style={{ margin: "16px 0" }}>
        <Stat k="Sealed commits" v={l.num_commits} />
        <Stat k="Revealed" v={l.num_reveals} />
        <Stat k="Clearing price (NEAR/token)" v={l.clearing_price !== "0" ? price(l.clearing_price) : "sealed"} />
        <Stat k="Sold / for sale" v={`${l.clearing ? whole(l.filled) : "–"} / ${whole(l.sale_supply)}`} />
        <Stat k="Burned (never minted)" v={l.clearing ? whole(l.burned_at_finalize) : "–"} />
      </div>

      {msg && (
        <p className={msg.ok ? "ok" : "err"}>
          {msg.text} {msg.hash && <a href={`${EXPLORER}/txns/${msg.hash}`}>view tx</a>}
        </p>
      )}

      <div className="grid-2">
        <div className="panel">
          <h3>Demand curve</h3>
          <Histogram buckets={buckets} prices={prices} clearingTick={clearingTick} saleSupply={BigInt(l.sale_supply)} />
          <p className="note">
            Bars appear only as bids are revealed. Every winning bid, even one placed at a far higher price, pays the clearing price.
          </p>
        </div>
        <div className="panel">
          {!accountId && (
            <div>
              <h3>Take part</h3>
              <p className="note">Connect a NEAR testnet wallet to {l.phase === "Commit" ? "place a sealed bid" : l.phase === "Reveal" ? "reveal your bid" : l.phase === "Trading" ? "claim, trade, poke or defend" : "interact"}.</p>
              <button onClick={signIn}>Connect wallet</button>
            </div>
          )}
          {accountId && l.phase === "Commit" && !bid && <CommitForm id={id} l={l} prices={prices} accountId={accountId} run={run} call={call} />}
          {accountId && l.phase === "Commit" && bid && <p>Your sealed bid is in. Deposit {near(bid.deposit)} NEAR. Keep your receipt for the reveal.</p>}
          {accountId && l.phase === "Reveal" && <RevealBox id={id} accountId={accountId} bid={bid} run={run} call={call} />}
          {l.phase === "AwaitingFinalize" && (
            <div>
              <h3>Finalize</h3>
              <p className="note">Anyone can finalize: it sets one clearing price, mints exactly what sold, and opens the pool at that price.</p>
              <button disabled={!accountId} onClick={() => run("finalize", () => call(FACTORY, "finalize", { launch_id: id }, 0n, 300))}>Finalize</button>
            </div>
          )}
          {accountId && (l.phase === "Trading" || l.phase === "Failed") && bid && (
            <div>
              <h3>Your bid</h3>
              <dl className="kv">
                <dt>Deposit</dt><dd>{near(bid.deposit)} NEAR</dd>
                <dt>Bid</dt><dd>{bid.revealed ? `${whole(bid.qty)} @ ${price(prices[bid.tick])}` : "not revealed"}</dd>
                <dt>Filled</dt><dd>{whole(bid.filled)}</dd>
                <dt>Pays</dt><dd>{near(bid.paid)} NEAR</dd>
                <dt>Refund</dt><dd>{near(bid.refund)} NEAR</dd>
              </dl>
              <button style={{ marginTop: 12 }} onClick={() => run("claim", () => call(FACTORY, "claim", { launch_id: id }, 0n, 150))}>Claim</button>
            </div>
          )}
          {accountId && l.phase === "Trading" && !bid && <p className="note">You have no bid in this launch.</p>}
        </div>
      </div>

      {l.phase === "Trading" && pool && tre && (
        <div className="grid" style={{ marginTop: 16 }}>
          <SwapBox id={id} l={l} pool={pool} bal={bal} accountId={accountId} run={run} call={call} />
          <Treasury id={id} l={l} tre={tre} run={run} call={call} accountId={accountId} />
        </div>
      )}
    </main>
  );
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="panel stat">
      <span className="v">{v}</span>
      <span className="k">{k}</span>
    </div>
  );
}

type Run = (label: string, f: () => Promise<{ hash?: string; result?: unknown }>) => Promise<void>;
type Call = ReturnType<typeof useWallet>["call"];

function CommitForm({ id, l, prices, accountId, run, call }: { id: string; l: any; prices: string[]; accountId: string; run: Run; call: Call }) {
  const [tick, setTick] = useState(8);
  const [qty, setQty] = useState("50000");
  const [over, setOver] = useState("20");
  const cost = prices.length ? BigInt(prices[tick]) * BigInt(qty || "0") : 0n;
  const deposit = (cost * BigInt(100 + Number(over || 0))) / 100n;
  async function commit() {
    const salt = randomSaltHex();
    const hash = await sha256Hex(commitPreimage(id, accountId, tick, BigInt(qty), salt));
    const receipt: Receipt = { factory: FACTORY, launchId: id, bidder: accountId, tick, qty, salt, hash, deposit: deposit.toString(), createdAt: new Date().toISOString() };
    try {
      localStorage.setItem(receiptKey(id, accountId), JSON.stringify(receipt));
    } catch {}
    download(receipt);
    await run("commit", () => call(FACTORY, "commit", { launch_id: id, hash_hex: hash }, deposit + COMMIT_STORAGE_FEE, 30));
  }
  return (
    <div>
      <h3>Sealed bid</h3>
      <label>Max price: {prices.length ? price(prices[tick]) : "…"} NEAR/token (tick {tick})</label>
      <input type="range" min={0} max={63} value={tick} onChange={(e) => setTick(Number(e.target.value))} />
      <label>Quantity (tokens, ≤ {whole(l.sale_supply)})</label>
      <input value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} />
      <label>Extra deposit to hide your bid (%)</label>
      <input value={over} onChange={(e) => setOver(e.target.value.replace(/\D/g, ""))} />
      <dl className="kv" style={{ marginTop: 10 }}>
        <dt>Max cost</dt><dd>{near(cost)} NEAR</dd>
        <dt>Deposit (public)</dt><dd>{near(deposit)} NEAR</dd>
        <dt>Storage fee (refunded)</dt><dd>0.005 NEAR</dd>
      </dl>
      <p className="note">Only a hash goes on-chain. Your price and quantity stay hidden until you reveal. You will pay the clearing price, not your max. A bid receipt (salt) downloads; keep it.</p>
      <button disabled={!qty || qty === "0"} onClick={commit}>Commit sealed bid</button>
    </div>
  );
}

function download(r: Receipt) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }));
  a.download = `slowcook-bid-${r.launchId}-${r.bidder}.json`;
  a.click();
}

function RevealBox({ id, accountId, bid, run, call }: { id: string; accountId: string; bid: any; run: Run; call: Call }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  useEffect(() => {
    try {
      const r = localStorage.getItem(receiptKey(id, accountId));
      if (r) setReceipt(JSON.parse(r));
    } catch {}
  }, [id, accountId]);
  if (!bid) return <p className="note">You did not commit to this launch.</p>;
  if (bid.revealed) return <p className="ok">Revealed: {whole(bid.qty)} tokens at tick {bid.tick}. Wait for finalize.</p>;
  return (
    <div>
      <h3>Reveal</h3>
      {receipt ? (
        <p className="note">Receipt loaded: {whole(receipt.qty)} tokens at tick {receipt.tick}.</p>
      ) : (
        <>
          <p className="note">No receipt in this browser. Load the JSON you downloaded at commit time.</p>
          <input type="file" accept="application/json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setReceipt(JSON.parse(await f.text())); }} />
        </>
      )}
      <button
        style={{ marginTop: 12 }}
        disabled={!receipt}
        onClick={() => receipt && run("reveal", () => call(FACTORY, "reveal", { launch_id: id, tick: receipt.tick, qty: receipt.qty, salt_hex: receipt.salt }, 0n, 30))}
      >
        Reveal bid
      </button>
      <p className="note">Not revealing costs {"the non-reveal penalty"} of your deposit; it goes to the Floor Keeper treasury.</p>
    </div>
  );
}

function SwapBox({ id, l, pool, bal, accountId, run, call }: { id: string; l: any; pool: any; bal: string; accountId: string | null; run: Run; call: Call }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amt, setAmt] = useState("0.1");
  const [quote, setQuote] = useState<string>("0");
  const amount = useMemo(() => {
    try {
      return side === "buy" ? parseNear(amt) : BigInt(Math.floor(Number(amt) * 1e6)) * (ONE_TOKEN / 10n ** 6n);
    } catch {
      return 0n;
    }
  }, [amt, side]);
  useEffect(() => {
    if (amount > 0n) view(FACTORY, "quote", { launch_id: id, side, amount: amount.toString() }).then(setQuote).catch(() => setQuote("0"));
  }, [amount, side, id]);
  const minOut = (BigInt(quote) * 99n) / 100n;
  return (
    <div className="panel">
      <h3>Trade</h3>
      <dl className="kv">
        <dt>Spot</dt><dd>{price(pool.spot_price)} NEAR</dd>
        <dt>Clearing</dt><dd>{price(pool.clearing_price)} NEAR</dd>
        <dt>Pool</dt><dd>{near(pool.pool.near_reserve, 3)} NEAR / {tokens(pool.pool.token_reserve)} tokens</dd>
        <dt>Your tokens</dt><dd>{tokens(bal)}</dd>
      </dl>
      <div className="row" style={{ marginTop: 10 }}>
        <button className={side === "buy" ? "" : "secondary"} onClick={() => setSide("buy")}>Buy</button>
        <button className={side === "sell" ? "" : "secondary"} onClick={() => setSide("sell")}>Sell</button>
      </div>
      <label>{side === "buy" ? "NEAR in" : "Tokens in"}</label>
      <input value={amt} onChange={(e) => setAmt(e.target.value)} />
      <p className="note">≈ {side === "buy" ? `${tokens(quote)} tokens` : `${near(quote)} NEAR`} (1% slippage guard, 0.3% fee to locked liquidity)</p>
      <button
        disabled={!accountId || amount === 0n}
        onClick={() =>
          side === "buy"
            ? run("buy", () => call(FACTORY, "swap_near_for_token", { launch_id: id, min_out: minOut.toString() }, amount, 100))
            : run("sell", () => call(l.token_id, "ft_transfer_call", { receiver_id: FACTORY, amount: amount.toString(), msg: JSON.stringify({ launch_id: id, min_out: minOut.toString() }) }, 1n, 100))
        }
      >
        {side === "buy" ? "Buy" : "Sell"}
      </button>
    </div>
  );
}

function Treasury({ id, l, tre, run, call, accountId }: { id: string; l: any; tre: any; run: Run; call: Call; accountId: string | null }) {
  const t = tre.treasury;
  return (
    <div className="panel">
      <h3>Floor Keeper &amp; creator lock</h3>
      <dl className="kv">
        <dt>Treasury</dt><dd>{near(t.near_balance)} NEAR</dd>
        <dt>Floor (clearing − {l.params.band_bps / 100}%)</dt><dd>{price(tre.floor_price)} NEAR</dd>
        <dt>Spot</dt><dd className={BigInt(tre.spot_price) < BigInt(tre.floor_price) ? "err" : "ok"}>{price(tre.spot_price)} NEAR</dd>
        <dt>Intervals below floor</dt><dd>{t.below_streak} / {l.params.k_obs}</dd>
        <dt>Trigger</dt><dd className={tre.trigger_ready ? "err" : ""}>{tre.trigger_ready ? "ARMED" : "not armed"}</dd>
        <dt>Epoch budget left</dt><dd>{near(tre.epoch_remaining)} NEAR</dd>
        <dt>Bought back &amp; burned</dt><dd>{tokens(t.total_bought_back)} tokens for {near(t.total_spent)} NEAR</dd>
        <dt>Creator allocation</dt><dd>{whole(tre.creator_tokens)} {tre.creator_unlocked ? "(unlocked)" : "(locked)"}</dd>
        <dt>Intervals at/above clearing</dt><dd>{t.above_streak} / {l.params.h_obs}</dd>
      </dl>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="secondary" disabled={!accountId} onClick={() => run("poke", () => call(FACTORY, "poke", { launch_id: id }, 0n, 30))}>Poke (record TWAP)</button>
        <button disabled={!accountId || !tre.trigger_ready} onClick={() => run("defend", () => call(FACTORY, "defend", { launch_id: id }, 0n, 150))}>Defend</button>
        <button className="secondary" disabled={!accountId || !tre.creator_unlockable} onClick={() => run("unlock", () => call(FACTORY, "unlock_creator", { launch_id: id }, 0n, 150))}>Unlock creator</button>
      </div>
      <p className="note">Anyone can poke, defend and unlock; the contract enforces the rules (time-weighted trigger, ≤ {l.params.r_bps / 100}% of treasury per epoch, never above clearing).</p>
    </div>
  );
}
