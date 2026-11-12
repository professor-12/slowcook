"use client";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { CircleAlert } from "lucide-react";
import { create } from "@/content/site";
import { explainError } from "@/lib/errors";
import { FACTORY, parseNear } from "@/lib/near";
import { useWallet } from "@/lib/wallet";

const DRAFT_KEY = "slowcook:create-draft";
const DEFAULTS = {
  name: "Slow Pepe", symbol: "SPEPE", icon: "", total: "1000000", sale: "60", lp: "30", creator: "10",
  pMin: "0.000001", commit: "300", reveal: "300", penalty: "5", band: "10", k: "6", h: "12", r: "10", epoch: "120", poke: "10",
  fee: "2.1",
};
type Form = typeof DEFAULTS;
type Key = keyof Form;

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
  const [touched, setTouched] = useState<Partial<Record<Key, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    try {
      const d = localStorage.getItem(DRAFT_KEY);
      if (d) setF({ ...DEFAULTS, ...JSON.parse(d) });
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(f));
    } catch {}
  }, [f]);

  const errors = validate(f);
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
            {field("creator", "Creator share (%)", "At most 10%. Locked until the price holds.")}
            {field("pMin", "Minimum price (NEAR per token)", "If demand is short, every winner pays this price.")}
            {field("commit", "Sealed bidding window (seconds)", undefined, "numeric")}
            {field("reveal", "Reveal window (seconds)", undefined, "numeric")}
            {field("penalty", "Penalty for not revealing (%)", "Paid into the price-defence treasury.")}
          </fieldset>
          <fieldset className="card stack-4">
            <legend>Floor Keeper and lock</legend>
            {field("band", "Buy back below clearing minus (%)")}
            {field("k", "Intervals below the floor before a buyback", undefined, "numeric")}
            {field("r", "Most of the treasury spent per epoch (%)")}
            {field("epoch", "Epoch length (seconds)", undefined, "numeric")}
            {field("poke", "Minimum seconds between price observations", undefined, "numeric")}
            {field("h", "Intervals at or above clearing before creator tokens are released", undefined, "numeric")}
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
