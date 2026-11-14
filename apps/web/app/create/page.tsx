"use client";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { CircleAlert } from "lucide-react";
import { create } from "@/content/site";
import { explainError } from "@/lib/errors";
import { FACTORY, parseNear } from "@/lib/near";
import { useWallet } from "@/lib/wallet";

const DRAFT_KEY = "slowcook:create-draft-v2";
const DAY = 86_400;
// Protocol minimums and defaults, as enforced by the contract (README "Launch parameters").
const TIMINGS = {
  production: { k: "6", h: "1008", epoch: String(DAY), poke: "600", lock: String(7 * DAY), vest: String(30 * DAY) },
  demo: { k: "3", h: "6", epoch: "120", poke: "10", lock: "300", vest: "120" },
};
type Mode = keyof typeof TIMINGS;
const DEFAULTS = {
  name: "Slow Pepe", symbol: "SPEPE", icon: "", total: "1000000", sale: "60", lp: "30", creator: "10",
  pMin: "0.000001", commit: "300", reveal: "300", penalty: "5", band: "10", r: "10",
  ...TIMINGS.production,
  fee: "2.1",
};
type Form = typeof DEFAULTS;
type Key = keyof Form;
const days = (secs: number) => `${Math.round((secs / DAY) * 10) / 10} days`;

function validateTimings(f: Form, mode: Mode): Partial<Record<Key, string>> {
  const e: Partial<Record<Key, string>> = {};
  const n = (k: Key) => Number(f[k]);
  const int = (k: Key) => Number.isInteger(n(k)) && n(k) > 0;
  for (const k of ["k", "h", "epoch", "poke", "lock", "vest"] as Key[]) if (!int(k)) e[k] = "Enter a whole number above 0.";
  if (mode === "demo") {
    if (!(n("lock") >= 30)) e.lock = "Use at least 30 seconds.";
    if (!(n("vest") >= 10)) e.vest = "Use at least 10 seconds.";
    if (!(n("epoch") >= 10)) e.epoch = "Use at least 10 seconds.";
    return e;
  }
  if (!(n("lock") >= 7 * DAY)) e.lock = `Use at least ${7 * DAY} seconds (7 days).`;
  if (!(n("vest") >= 7 * DAY)) e.vest = `Use at least ${7 * DAY} seconds (7 days).`;
  if (!(n("poke") >= 60)) e.poke = "Use at least 60 seconds.";
  if (!(n("k") >= 3)) e.k = "Use at least 3 intervals.";
  else if (n("k") * n("poke") < 1800) e.k = `Intervals times seconds between observations must reach 30 minutes. Now ${Math.round((n("k") * n("poke")) / 60)} minutes.`;
  if (n("h") * n("poke") < 7 * DAY) e.h = `Intervals times seconds between observations must reach 7 days. Now ${days(n("h") * n("poke"))}.`;
  if (!(n("epoch") >= 3600)) e.epoch = "Use at least 3600 seconds (1 hour).";
  return e;
}

function validate(f: Form): Partial<Record<Key, string>> {
  const e: Partial<Record<Key, string>> = {};
  const n = (k: Key) => Number(f[k]);
  if (f.name.trim().length < 1 || f.name.length > 64) e.name = "Use 1 to 64 characters.";
  if (!/^[A-Za-z0-9]{1,12}$/.test(f.symbol)) e.symbol = "Use 1 to 12 letters or digits, for example SPEPE.";
  if (!(n("total") >= 1000 && n("total") <= 1e15)) e.total = "Enter a whole number from 1,000 to 1,000,000,000,000,000.";
  if (n("sale") + n("lp") + n("creator") !== 100) e.creator = `Sale, pool and creator shares must add up to 100%. They add up to ${n("sale") + n("lp") + n("creator")}%.`;
  if (n("creator") > 10) e.creator = "The creator share can be at most 10%.";
  if (n("lp") > n("sale")) e.lp = "The pool share cannot be larger than the sale share, because the pool is funded from the sale.";
  if (!(n("pMin") > 0)) e.pMin = "Enter a price above 0, for example 0.000001.";
  if (!(n("commit") >= 10)) e.commit = "Use at least 10 seconds.";
  if (!(n("reveal") >= 10)) e.reveal = "Use at least 10 seconds.";
  if (!(n("penalty") >= 0 && n("penalty") <= 20)) e.penalty = "Use 0 to 20%.";
  if (!(n("band") >= 1 && n("band") <= 50)) e.band = "Use 1 to 50%.";
  if (!(n("r") > 0 && n("r") <= 50)) e.r = "Use more than 0 and at most 50%.";
  if (!(n("fee") >= 2)) e.fee = "Attach at least 2 NEAR on testnet to cover the token account.";
  return e;
}

export default function Create() {
  const { accountId, signIn, call } = useWallet();
  const router = useRouter();
  const fid = useId();
  const [f, setF] = useState<Form>(DEFAULTS);
  const [mode, setMode] = useState<Mode>("production");
  const [touched, setTouched] = useState<Partial<Record<Key, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    try {
      const d = localStorage.getItem(DRAFT_KEY);
      if (d) {
        const { mode: m, ...rest } = JSON.parse(d);
        setF({ ...DEFAULTS, ...rest });
        if (m === "demo" || m === "production") setMode(m);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...f, mode }));
    } catch {}
  }, [f, mode]);

  const errors = { ...validate(f), ...validateTimings(f, mode) };
  const pickMode = (m: Mode) => {
    setMode(m);
    setF({ ...f, ...TIMINGS[m] });
  };
  const show = (k: Key) => (submitted || touched[k]) && errors[k];

  async function submit() {
    setSubmitted(true);
    if (Object.keys(errors).length) {
      setStatus({ ok: false, text: "Check the highlighted fields. Nothing was sent." });
      return;
    }
    setBusy(true);
    setStatus({ ok: true, text: "Confirm the transaction in your wallet." });
    try {
      const args = {
        name: f.name, symbol: f.symbol, icon: f.icon || null, total_supply: f.total,
        sale_bps: Math.round(Number(f.sale) * 100), lp_bps: Math.round(Number(f.lp) * 100), creator_bps: Math.round(Number(f.creator) * 100),
        p_min: parseNear(f.pMin).toString(), commit_secs: Number(f.commit), reveal_secs: Number(f.reveal),
        penalty_bps: Math.round(Number(f.penalty) * 100), band_bps: Math.round(Number(f.band) * 100), k_obs: Number(f.k), h_obs: Number(f.h),
        r_bps: Math.round(Number(f.r) * 100), epoch_secs: Number(f.epoch), poke_interval_secs: Number(f.poke),
        creator_lock_secs: Number(f.lock), creator_vest_secs: Number(f.vest), demo: mode === "demo",
      };
      const { result } = await call(FACTORY, "create_launch", { args }, parseNear(f.fee), 300);
      setStatus({ ok: true, text: `Launch ${result} created. Opening it now.` });
      router.push(`/launch/?id=${result}`);
    } catch (e) {
      setStatus({ ok: false, text: explainError(e) });
    } finally {
      setBusy(false);
    }
  }

  const field = (k: Key, label: string, help?: string, inputMode: "text" | "numeric" | "decimal" = "decimal") => {
    const err = show(k);
    const ids = [help ? `${fid}-${k}-help` : "", err ? `${fid}-${k}-err` : ""].filter(Boolean).join(" ");
    return (
      <div className="field">
        <label htmlFor={`${fid}-${k}`}>{label}</label>
        <input
          id={`${fid}-${k}`}
          className="input"
          inputMode={inputMode}
          value={f[k]}
          onChange={(e) => setF({ ...f, [k]: e.target.value })}
          onBlur={() => setTouched({ ...touched, [k]: true })}
          aria-invalid={!!err}
          aria-describedby={ids || undefined}
        />
        {help && (
          <p id={`${fid}-${k}-help`} className="help">
            {help}
          </p>
        )}
        {err && (
          <p id={`${fid}-${k}-err`} className="error">
            <CircleAlert size={16} aria-hidden /> {err}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="container container-wide section">
      <div className="page-head">
        <p className="eyebrow">New launch</p>
        <h1>{create.title}</h1>
        <p className="lead">{create.lead}</p>
      </div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="form-sections">
          <fieldset className="card stack-4">
            <legend>Token</legend>
            {field("name", "Name", undefined, "text")}
            {field("symbol", "Ticker", `The token account becomes <ticker>-<id>.${FACTORY}.`, "text")}
            {field("icon", "Icon (optional)", "A data URL for the token icon.", "text")}
            {field("total", "Total supply", "Whole tokens.", "numeric")}
          </fieldset>
          <fieldset className="card stack-4">
            <legend>Split and auction</legend>
            {field("sale", "Sale share (%)")}
            {field("lp", "Pool share (%)", "At most the sale share. It scales with how much actually sells.")}
            {field("creator", "Creator share (%)", create.creatorHelp)}
            {field("pMin", "Minimum price (NEAR per token)", "If demand is short, every winner pays this price.")}
            {field("commit", "Sealed bidding window (seconds)", undefined, "numeric")}
            {field("reveal", "Reveal window (seconds)", undefined, "numeric")}
            {field("penalty", "Penalty for not revealing (%)", "Paid into the price-defence treasury.")}
          </fieldset>
          <fieldset className="card stack-4">
            <legend>Floor Keeper and creator lock</legend>
            <div className="field">
              <p id={`${fid}-mode-label`} className="field-label">Timings</p>
              <div className="segmented" role="group" aria-labelledby={`${fid}-mode-label`} aria-describedby={`${fid}-mode-help`}>
                <button type="button" className={`btn btn-sm ${mode === "production" ? "btn-primary" : "btn-secondary"}`} aria-pressed={mode === "production"} onClick={() => pickMode("production")}>
                  Production
                </button>
                <button type="button" className={`btn btn-sm ${mode === "demo" ? "btn-primary" : "btn-secondary"}`} aria-pressed={mode === "demo"} onClick={() => pickMode("demo")}>
                  Testnet demo
                </button>
              </div>
              <p id={`${fid}-mode-help`} className="help">
                {mode === "production" ? create.modeProduction : create.modeDemo}
              </p>
            </div>
            {field("lock", "Creator lock after the auction (seconds)", mode === "production" ? `At least 7 days. Now ${days(Number(f.lock))}.` : "At least 30 seconds.", "numeric")}
            {field("vest", "Creator vesting after the lock (seconds)", mode === "production" ? `Released in a straight line over this period. At least 7 days. Now ${days(Number(f.vest))}.` : "At least 10 seconds.", "numeric")}
            {field("poke", "Minimum seconds between price observations", mode === "production" ? "At least 60." : undefined, "numeric")}
            {field("h", "Intervals above clearing plus 5% before any creator release", mode === "production" ? "Together they must cover at least 7 days." : undefined, "numeric")}
            {field("band", "Buy back below clearing minus (%)")}
            {field("k", "Intervals below the floor before a buyback", mode === "production" ? "At least 3, covering at least 30 minutes." : undefined, "numeric")}
            {field("r", "Most of the treasury spent per epoch (%)")}
            {field("epoch", "Epoch length (seconds)", mode === "production" ? "At least 3600." : undefined, "numeric")}
            {field("fee", "NEAR to attach", create.cost)}
          </fieldset>
        </div>
        <div className="row" style={{ marginTop: "var(--space-8)" }}>
          {accountId ? (
            <button type="submit" className="btn btn-primary btn-lg" aria-busy={busy} disabled={busy}>
              {create.submit}
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-lg" onClick={signIn}>
              {create.connect}
            </button>
          )}
          <p className="small muted">Your draft is saved in this browser.</p>
        </div>
        <div aria-live="polite" style={{ marginTop: "var(--space-4)" }}>
          {status && (
            <p className={`notice ${status.ok ? "notice-ok" : "notice-err"}`}>
              {!status.ok && <CircleAlert size={20} aria-hidden />} {status.text}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
