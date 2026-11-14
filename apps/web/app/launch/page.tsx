"use client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useId, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CircleAlert, CircleCheck, Clock, ExternalLink, ShieldCheck, ShieldOff } from "lucide-react";
import { Histogram } from "@/components/Histogram";
import { PhaseBadge } from "@/components/PhaseBadge";
import { launchCopy } from "@/content/site";
import { explainError } from "@/lib/errors";
import {
  COMMIT_STORAGE_FEE, EXPLORER, FACTORY, ONE_TOKEN, chainNowMs, commitPreimage, near, parseNear, price, randomSaltHex,
  receiptKey, sha256Hex, takeEarlyLaunch, tokens, view, whole, type Receipt,
} from "@/lib/near";
import { useWallet } from "@/lib/wallet";

export default function LaunchPage() {
  return (
    <Suspense fallback={<LaunchSkeleton />}>
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

type Msg = { text: string; ok: boolean; hash?: string } | null;
type Run = (label: string, f: () => Promise<{ hash?: string; result?: unknown }>) => Promise<void>;
type Call = ReturnType<typeof useWallet>["call"];

const PHASE_INDEX: Record<string, number> = { Deploying: 0, Commit: 0, Reveal: 1, AwaitingFinalize: 2, Finalizing: 2, Trading: 3, Failed: 3 };

function Launch() {
  const id = useSearchParams().get("id") ?? "0";
  const { accountId, signIn, call } = useWallet();
  const [l, setL] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buckets, setBuckets] = useState<bigint[]>([]);
  const [prices, setPrices] = useState<string[]>([]);
  const [bid, setBid] = useState<any>(null);
  const [pool, setPool] = useState<any>(null);
  const [tre, setTre] = useState<any>(null);
  const [bal, setBal] = useState<string>("0");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [offset, setOffset] = useState(0); // chain clock minus local clock

  const refresh = useCallback(async () => {
    const launch = await (takeEarlyLaunch(id)?.catch(() => null) ?? null) ?? (await view(FACTORY, "get_launch", { id }));
    setL(launch);
    setLoadError(null);
    const [b, tp] = await Promise.all([view<string[]>(FACTORY, "get_buckets", { id }), prices.length ? Promise.resolve(null) : view<string[]>(FACTORY, "get_tick_prices", { id })]);
    setBuckets(b.map(BigInt));
    if (tp) setPrices(tp);
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
    refresh().catch((e) => setLoadError(String(e)));
    const t = setInterval(() => refresh().catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const run: Run = async (label, f) => {
    setBusy(label);
    setMsg({ text: `${label}: confirm in your wallet.`, ok: true });
    try {
      const r = await f();
      setMsg({ text: `${label}: done.`, ok: true, hash: r.hash });
      await refresh();
    } catch (e) {
      setMsg({ text: `${label}: ${explainError(e)}`, ok: false });
    } finally {
      setBusy(null);
    }
  };

  const commitLeft = useCountdown(l ? Number(l.commit_end_ms) : undefined, offset);
  const revealLeft = useCountdown(l ? Number(l.reveal_end_ms) : undefined, offset);

  if (!l) return <LaunchSkeleton id={id} error={loadError} />;

  const clearingTick = l.clearing?.Over ? l.clearing.Over.tick : l.clearing?.Under ? 0 : null;
  const phaseIdx = PHASE_INDEX[l.phase] ?? 0;
  const deadline = l.phase === "Commit" ? `Sealed bids close in ${commitLeft}` : l.phase === "Reveal" ? `Reveal closes in ${revealLeft}` : null;

  return (
    <div className="container container-wide section launch-page">
      <nav aria-label="Breadcrumb" className="small muted">
        <Link href="/#launches">Launches</Link> / Launch {l.id}
      </nav>
      <header className="launch-head">
        <h1>
          {l.name} <span className="symbol">${l.symbol}</span>
        </h1>
        <div className="row">
          <PhaseBadge phase={l.phase} />
          {l.params.demo && (
            <span className="badge badge-warn">
              <Clock size={14} aria-hidden /> {launchCopy.demoBadge}
            </span>
          )}
          {deadline && <span className="small">{deadline}</span>}
          <a className="small mono" href={`${EXPLORER}/address/${l.token_id}`} rel="noopener noreferrer">
            {l.token_id} <ExternalLink size={14} aria-hidden style={{ verticalAlign: "-2px" }} />
          </a>
        </div>
      </header>

      <ol className="timeline" aria-label="Launch progress">
        {launchCopy.phases.map((p, i) => (
          <li key={p} data-state={i < phaseIdx ? "done" : i === phaseIdx ? "current" : "todo"} aria-current={i === phaseIdx ? "step" : undefined}>
            {p}
          </li>
        ))}
      </ol>

      <dl className="stat-grid">
        <Stat label="Sealed bids" value={whole(l.num_commits)} />
        <Stat label="Revealed" value={whole(l.num_reveals)} />
        <Stat label="Clearing price (NEAR/token)" value={l.clearing ? price(l.clearing_price) : "Sealed"} />
        <Stat label={`Tokens sold of ${whole(l.sale_supply)}`} value={l.clearing ? whole(l.filled) : "–"} />
        <Stat label="Burned (never minted)" value={l.clearing ? whole(l.burned_at_finalize) : "–"} />
      </dl>

      <div aria-live="polite" className="status-region">
        {msg && (
          <div className={`notice ${msg.ok ? "notice-ok" : "notice-err"}`}>
            {msg.ok ? <CircleCheck size={20} aria-hidden /> : <CircleAlert size={20} aria-hidden />}
            <span>
              {msg.text}{" "}
              {msg.hash && (
                <a href={`${EXPLORER}/txns/${msg.hash}`} rel="noopener noreferrer">
                  View transaction
                </a>
              )}
            </span>
          </div>
        )}
      </div>

      <div className="launch-grid">
        <section className="card demand-card" aria-labelledby="demand-title">
          <h2 id="demand-title" className="card-title">
            Demand curve
          </h2>
          <Histogram buckets={buckets} prices={prices} clearingTick={clearingTick} saleSupply={BigInt(l.sale_supply)} />
          <p className="small muted" style={{ marginTop: "var(--space-3)" }}>
            Bars appear as bids are revealed. Every winning bid pays the clearing price, even one placed far higher.
          </p>
        </section>
        <section className="card action-card" aria-labelledby="action-title">
          {!accountId ? (
            <div className="stack-4">
              <h2 id="action-title" className="card-title">
                {launchCopy.takePart}
              </h2>
              <p className="muted">{launchCopy.connectFor[l.phase] ?? launchCopy.connectFor.other}</p>
              <button className="btn btn-primary" onClick={signIn}>
                Connect wallet
              </button>
            </div>
          ) : (
            <ActionPanel id={id} l={l} bid={bid} prices={prices} accountId={accountId} run={run} call={call} busy={busy} />
          )}
        </section>
      </div>

      {l.phase === "Trading" && pool && tre && (
        <div className="launch-grid launch-grid-even">
          <SwapBox id={id} l={l} pool={pool} bal={bal} accountId={accountId} run={run} call={call} busy={busy} />
          <Treasury id={id} l={l} tre={tre} run={run} call={call} accountId={accountId} busy={busy} />
        </div>
      )}
    </div>
  );
}

/** Same layout as the loaded page, so nothing jumps when the on-chain data arrives (CLS). */
function LaunchSkeleton({ id, error }: { id?: string; error?: string | null }) {
  return (
    <div className="container container-wide section launch-page" aria-busy={!error}>
      <nav aria-label="Breadcrumb" className="small muted">
        <Link href="/#launches">Launches</Link> / Launch {id ?? ""}
      </nav>
      <header className="launch-head">
        <h1>Launch {id ?? ""}</h1>
        <div className="row">
          <span className="badge">Loading from NEAR testnet</span>
        </div>
      </header>
      <ol className="timeline" aria-label="Launch progress">
        {launchCopy.phases.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
      <dl className="stat-grid">
        {["Sealed bids", "Revealed", "Clearing price (NEAR/token)", "Tokens sold", "Burned (never minted)"].map((k) => (
          <Stat key={k} label={k} value="–" />
        ))}
      </dl>
      <div className="launch-grid">
        <section className="card demand-card">
          <h2 className="card-title">Demand curve</h2>
          {error ? (
            <div className="notice notice-err" role="alert">
              <CircleAlert size={20} aria-hidden /> Launch {id} could not be loaded from NEAR testnet. Check the ID or try again shortly.
            </div>
          ) : (
            <p className="muted" role="status">
              Loading launch {id ?? ""} from NEAR testnet…
            </p>
          )}
        </section>
        <section className="card action-card">
          <h2 className="card-title">{launchCopy.takePart}</h2>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat card">
      <dt className="label">{label}</dt>
      <dd className="value" style={{ margin: 0 }}>
        {value}
      </dd>
    </div>
  );
}

function ActionPanel(p: { id: string; l: any; bid: any; prices: string[]; accountId: string; run: Run; call: Call; busy: string | null }) {
  const { id, l, bid, run, call, busy } = p;
  if (l.phase === "Commit")
    return bid ? (
      <div className="stack-4">
        <h2 id="action-title" className="card-title">Your sealed bid</h2>
        <p>
          Your bid is sealed with a deposit of <strong>{near(bid.deposit)} NEAR</strong>. Keep the receipt you downloaded; you need it to reveal.
        </p>
      </div>
    ) : (
      <CommitForm {...p} />
    );
  if (l.phase === "Reveal") return <RevealBox id={id} accountId={p.accountId} bid={bid} run={run} call={call} busy={busy} />;
  if (l.phase === "AwaitingFinalize")
    return (
      <div className="stack-4">
        <h2 id="action-title" className="card-title">Finalize the auction</h2>
        <p className="muted">Anyone can finalize. It sets one clearing price, mints exactly what sold and opens the pool at that price.</p>
        <button className="btn btn-primary" aria-busy={busy === "Finalize"} disabled={!!busy} onClick={() => run("Finalize", () => call(FACTORY, "finalize", { launch_id: id }, 0n, 300))}>
          Finalize auction
        </button>
      </div>
    );
  if ((l.phase === "Trading" || l.phase === "Failed") && bid) {
    const hasTokens = bid.filled && bid.filled !== "0";
    return (
      <div className="stack-4">
        <h2 id="action-title" className="card-title">Your result</h2>
        <dl className="kv">
          <dt>Deposit</dt>
          <dd>{near(bid.deposit)} NEAR</dd>
          <dt>Your bid</dt>
          <dd>{bid.revealed ? `${whole(bid.qty)} at up to ${price(p.prices[bid.tick])} NEAR` : "Not revealed (5% penalty)"}</dd>
          <dt>Tokens you get</dt>
          <dd>{whole(bid.filled)}</dd>
          <dt>You pay</dt>
          <dd>{near(bid.paid)} NEAR</dd>
          <dt>Refund</dt>
          <dd>{near(bid.refund)} NEAR</dd>
        </dl>
        <button className="btn btn-primary" aria-busy={busy === "Claim"} disabled={!!busy} onClick={() => run("Claim", () => call(FACTORY, "claim", { launch_id: id }, 0n, 150))}>
          {hasTokens ? "Claim tokens" : "Claim refund"}
        </button>
      </div>
    );
  }
  return (
    <div className="stack-4">
      <h2 id="action-title" className="card-title">Your bid</h2>
      <p className="muted">
        {l.phase === "Trading" ? "This account has no bid to claim in this launch. You can still trade below." : "Nothing to do for this account right now."}
      </p>
    </div>
  );
}

function CommitForm({ id, l, prices, accountId, run, call, busy }: { id: string; l: any; prices: string[]; accountId: string; run: Run; call: Call; busy: string | null }) {
  const fid = useId();
  const [tick, setTick] = useState(8);
  const [qty, setQty] = useState("50000");
  const [over, setOver] = useState("20");
  const [touched, setTouched] = useState(false);
  const q = BigInt(qty || "0");
  const qtyError = q <= 0n ? "Enter how many tokens you want, for example 50000." : q > BigInt(l.sale_supply) ? `At most ${whole(l.sale_supply)} tokens are for sale.` : null;
  const cost = prices.length ? BigInt(prices[tick]) * q : 0n;
  const deposit = (cost * BigInt(100 + Number(over || 0))) / 100n;
  async function commit() {
    setTouched(true);
    if (qtyError) return;
    const salt = randomSaltHex();
    const hash = await sha256Hex(commitPreimage(id, accountId, tick, q, salt));
    const receipt: Receipt = { factory: FACTORY, launchId: id, bidder: accountId, tick, qty, salt, hash, deposit: deposit.toString(), createdAt: new Date().toISOString() };
    try {
      localStorage.setItem(receiptKey(id, accountId), JSON.stringify(receipt));
    } catch {}
    download(receipt);
    await run("Seal bid", () => call(FACTORY, "commit", { launch_id: id, hash_hex: hash }, deposit + COMMIT_STORAGE_FEE, 30));
  }
  return (
    <form
      className="stack-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <h2 id="action-title" className="card-title">Place a sealed bid</h2>
      <div className="field">
        <label htmlFor={`${fid}-tick`}>Highest price you will pay</label>
        <input id={`${fid}-tick`} type="range" min={0} max={63} value={tick} onChange={(e) => setTick(Number(e.target.value))} aria-describedby={`${fid}-tick-help`} aria-valuetext={`${prices.length ? price(prices[tick]) : ""} NEAR per token`} />
        <p id={`${fid}-tick-help`} className="help">
          <strong className="num">{prices.length ? price(prices[tick]) : "…"} NEAR</strong> per token. If you win you pay the clearing price, which is never higher.
        </p>
      </div>
      <div className="field">
        <label htmlFor={`${fid}-qty`}>Tokens wanted</label>
        <input
          id={`${fid}-qty`}
          className="input"
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
          onBlur={() => setTouched(true)}
          aria-invalid={touched && !!qtyError}
          aria-describedby={`${fid}-qty-help ${touched && qtyError ? `${fid}-qty-err` : ""}`}
        />
        <p id={`${fid}-qty-help`} className="help">Whole tokens. {whole(l.sale_supply)} are for sale.</p>
        {touched && qtyError && (
          <p id={`${fid}-qty-err`} className="error">
            <CircleAlert size={16} aria-hidden /> {qtyError}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${fid}-over`}>Extra deposit to hide your bid (%)</label>
        <input id={`${fid}-over`} className="input" inputMode="numeric" value={over} onChange={(e) => setOver(e.target.value.replace(/\D/g, "").slice(0, 3))} aria-describedby={`${fid}-over-help`} />
        <p id={`${fid}-over-help`} className="help">Your deposit is public. Adding extra hides your real maximum; the extra is refunded.</p>
      </div>
      <dl className="kv">
        <dt>Most you could pay</dt>
        <dd>{near(cost)} NEAR</dd>
        <dt>Deposit (public)</dt>
        <dd>{near(deposit)} NEAR</dd>
        <dt>Storage fee (refunded)</dt>
        <dd>0.005 NEAR</dd>
      </dl>
      <p className="small muted">Only a hash goes on-chain. A bid receipt with your secret downloads now; keep it to reveal.</p>
      <button type="submit" className="btn btn-primary" aria-busy={busy === "Seal bid"} disabled={!!busy}>
        Seal my bid
      </button>
    </form>
  );
}

function download(r: Receipt) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }));
  a.download = `slowcook-bid-${r.launchId}-${r.bidder}.json`;
  a.click();
}

function RevealBox({ id, accountId, bid, run, call, busy }: { id: string; accountId: string; bid: any; run: Run; call: Call; busy: string | null }) {
  const fid = useId();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  useEffect(() => {
    try {
      const r = localStorage.getItem(receiptKey(id, accountId));
      if (r) setReceipt(JSON.parse(r));
    } catch {}
  }, [id, accountId]);
  if (!bid)
    return (
      <div className="stack-4">
        <h2 id="action-title" className="card-title">Reveal</h2>
        <p className="muted">This account did not place a sealed bid in this launch.</p>
      </div>
    );
  if (bid.revealed)
    return (
      <div className="stack-4">
        <h2 id="action-title" className="card-title">Reveal</h2>
        <p className="notice notice-ok">
          <CircleCheck size={20} aria-hidden /> Revealed: {whole(bid.qty)} tokens. Results appear after finalize.
        </p>
      </div>
    );
  return (
    <div className="stack-4">
      <h2 id="action-title" className="card-title">Reveal your bid</h2>
      {receipt ? (
        <p className="muted">
          Receipt loaded from this browser: {whole(receipt.qty)} tokens at tick {receipt.tick}.
        </p>
      ) : (
        <div className="field">
          <label htmlFor={`${fid}-file`}>Bid receipt</label>
          <input
            id={`${fid}-file`}
            type="file"
            accept="application/json"
            aria-describedby={`${fid}-file-help`}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                setReceipt(JSON.parse(await f.text()));
                setFileError(null);
              } catch {
                setFileError("That file is not a SlowCook bid receipt. Choose the JSON file downloaded when you sealed your bid.");
              }
            }}
          />
          <p id={`${fid}-file-help`} className="help">No receipt in this browser. Load the JSON file downloaded when you sealed your bid.</p>
          {fileError && (
            <p className="error" role="alert">
              <CircleAlert size={16} aria-hidden /> {fileError}
            </p>
          )}
        </div>
      )}
      <button
        className="btn btn-primary"
        aria-busy={busy === "Reveal"}
        disabled={!receipt || !!busy}
        onClick={() => receipt && run("Reveal", () => call(FACTORY, "reveal", { launch_id: id, tick: receipt.tick, qty: receipt.qty, salt_hex: receipt.salt }, 0n, 30))}
      >
        Reveal my bid
      </button>
      <p className="small muted">Bids that are not revealed are refunded minus a 5% penalty, which goes to the price-defence treasury.</p>
    </div>
  );
}

function SwapBox({ id, l, pool, bal, accountId, run, call, busy }: { id: string; l: any; pool: any; bal: string; accountId: string | null; run: Run; call: Call; busy: string | null }) {
  const fid = useId();
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
  const label = side === "buy" ? "Buy tokens" : "Sell tokens";
  return (
    <section className="card stack-4" aria-labelledby="trade-title">
      <h2 id="trade-title" className="card-title">Trade</h2>
      <dl className="kv">
        <dt>Price now</dt>
        <dd>{price(pool.spot_price)} NEAR</dd>
        <dt>Clearing price</dt>
        <dd>{price(pool.clearing_price)} NEAR</dd>
        <dt>Pool</dt>
        <dd>
          {near(pool.pool.near_reserve, 3)} NEAR and {tokens(pool.pool.token_reserve)} tokens
        </dd>
        <dt>Your tokens</dt>
        <dd>{tokens(bal)}</dd>
      </dl>
      <div className="segmented" role="group" aria-label="Trade direction">
        <button className={`btn btn-sm ${side === "buy" ? "btn-primary" : "btn-secondary"}`} aria-pressed={side === "buy"} onClick={() => setSide("buy")}>
          Buy
        </button>
        <button className={`btn btn-sm ${side === "sell" ? "btn-primary" : "btn-secondary"}`} aria-pressed={side === "sell"} onClick={() => setSide("sell")}>
          Sell
        </button>
      </div>
      <div className="field">
        <label htmlFor={`${fid}-amt`}>{side === "buy" ? "NEAR to spend" : "Tokens to sell"}</label>
        <input id={`${fid}-amt`} className="input" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} aria-describedby={`${fid}-amt-help`} />
        <p id={`${fid}-amt-help`} className="help num">
          You receive about {side === "buy" ? `${tokens(quote)} tokens` : `${near(quote)} NEAR`}. The trade is cancelled if the price moves more than 1%. A 0.3% fee stays in the locked pool.
        </p>
      </div>
      <button
        className="btn btn-primary"
        aria-busy={busy === label}
        disabled={!accountId || amount === 0n || !!busy}
        onClick={() =>
          side === "buy"
            ? run(label, () => call(FACTORY, "swap_near_for_token", { launch_id: id, min_out: minOut.toString() }, amount, 100))
            : run(label, () => call(l.token_id, "ft_transfer_call", { receiver_id: FACTORY, amount: amount.toString(), msg: JSON.stringify({ launch_id: id, min_out: minOut.toString() }) }, 1n, 100))
        }
      >
        {accountId ? label : "Connect wallet to trade"}
      </button>
    </section>
  );
}

const secs = (ms: number | string) => `${Math.round(Number(ms) / 1000)} s`;
const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function Treasury({ id, l, tre, run, call, accountId, busy }: { id: string; l: any; tre: any; run: Run; call: Call; accountId: string | null; busy: string | null }) {
  const t = tre.treasury;
  const below = BigInt(tre.spot_price) < BigInt(tre.floor_price);
  const lockEnd = Number(tre.creator_lock_ends_ms);
  return (
    <section className="card stack-4" aria-labelledby="keeper-title">
      <h2 id="keeper-title" className="card-title">Floor Keeper and creator lock</h2>
      <p className={`notice ${tre.trigger_ready ? "notice-err" : ""}`}>
        {tre.trigger_ready ? <ShieldOff size={20} aria-hidden /> : <ShieldCheck size={20} aria-hidden />}
        <span>
          {tre.trigger_ready
            ? "Buyback armed: the time-weighted price stayed below the floor. Anyone can run it."
            : below
              ? `Price is below the floor. The buyback arms after ${l.params.k_obs} intervals below it (${t.below_streak} so far).`
              : "Price is at or above the floor. The buyback is not armed."}
        </span>
      </p>
      {l.params.demo && (
        <p className="small">
          {launchCopy.demoNote(secs(l.params.creator_lock_ms), secs(l.params.creator_vest_ms), secs(l.params.poke_interval_ms))}
        </p>
      )}
      <dl className="kv">
        <dt>Treasury</dt>
        <dd>{near(t.near_balance)} NEAR</dd>
        <dt>Floor (clearing minus {l.params.band_bps / 100}%)</dt>
        <dd>{price(tre.floor_price)} NEAR</dd>
        <dt>Price now</dt>
        <dd>
          {below ? "▼ " : "▲ "}
          {price(tre.spot_price)} NEAR
        </dd>
        <dt>Budget left this epoch</dt>
        <dd>{near(tre.epoch_remaining)} NEAR</dd>
        <dt>Bought back and burned</dt>
        <dd>
          {tokens(t.total_bought_back)} tokens for {near(t.total_spent)} NEAR
        </dd>
        <dt>Creator tokens released</dt>
        <dd>
          {whole(tre.creator_released)} of {whole(tre.creator_tokens)}
        </dd>
        <dt>Creator lock</dt>
        <dd>{lockEnd > Date.now() ? `Until ${when(lockEnd)}` : `Ended ${when(lockEnd)}`}</dd>
        <dt>Vested so far</dt>
        <dd>
          {whole(tre.creator_vested)}, all by {when(Number(tre.creator_vest_ends_ms))}
        </dd>
        <dt>Intervals above {price(tre.hold_price)} NEAR (clearing plus 5%)</dt>
        <dd>
          {t.above_streak} of {l.params.h_obs} needed
        </dd>
      </dl>
      <div className="row">
        <button className="btn btn-secondary btn-sm" aria-busy={busy === "Record price"} disabled={!accountId || !!busy} onClick={() => run("Record price", () => call(FACTORY, "poke", { launch_id: id }, 0n, 30))}>
          Record price
        </button>
        <button className="btn btn-primary btn-sm" aria-busy={busy === "Run buyback"} disabled={!accountId || !tre.trigger_ready || !!busy} onClick={() => run("Run buyback", () => call(FACTORY, "defend", { launch_id: id }, 0n, 150))}>
          Run buyback
        </button>
        <button className="btn btn-secondary btn-sm" aria-busy={busy === "Release creator tokens"} disabled={!accountId || !tre.creator_unlockable || !!busy} onClick={() => run("Release creator tokens", () => call(FACTORY, "unlock_creator", { launch_id: id }, 0n, 150))}>
          Release creator tokens
        </button>
      </div>
      <p className="small muted">
        Anyone can call these (contract methods poke, defend and unlock_creator). The contract enforces the rules: time-weighted trigger, at most {l.params.r_bps / 100}% of the
        treasury per epoch, never above the clearing price. Creator tokens go only to the creator, only after the lock, only as they vest, and only while the price holds.
      </p>
    </section>
  );
}

