"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FACTORY, errorCode, parseNear } from "@/lib/near";
import { useWallet } from "@/lib/wallet";

export default function Create() {
  const { accountId, signIn, call } = useWallet();
  const router = useRouter();
  const [f, setF] = useState({
    name: "Slow Pepe", symbol: "SPEPE", icon: "", total: "1000000", sale: "60", lp: "30", creator: "10",
    pMin: "0.000001", commit: "300", reveal: "300", penalty: "5", band: "10", k: "6", h: "12", r: "10", epoch: "120", poke: "10",
    fee: "2.1",
  });
  const [status, setStatus] = useState<string>("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const sum = Number(f.sale) + Number(f.lp) + Number(f.creator);

  async function submit() {
    setStatus("Waiting for wallet…");
    try {
      const args = {
        name: f.name, symbol: f.symbol, icon: f.icon || null, total_supply: f.total,
        sale_bps: Math.round(Number(f.sale) * 100), lp_bps: Math.round(Number(f.lp) * 100), creator_bps: Math.round(Number(f.creator) * 100),
        p_min: parseNear(f.pMin).toString(), commit_secs: Number(f.commit), reveal_secs: Number(f.reveal),
        penalty_bps: Math.round(Number(f.penalty) * 100), band_bps: Math.round(Number(f.band) * 100), k_obs: Number(f.k), h_obs: Number(f.h),
        r_bps: Math.round(Number(f.r) * 100), epoch_secs: Number(f.epoch), poke_interval_secs: Number(f.poke),
      };
      const { result } = await call(FACTORY, "create_launch", { args }, parseNear(f.fee), 300);
      setStatus(`Created launch ${result}`);
      router.push(`/launch/?id=${result}`);
    } catch (e) {
      setStatus(errorCode(e));
    }
  }

  const field = (k: keyof typeof f, label: string, hint?: string) => (
    <div>
      <label>{label}</label>
      <input value={f[k]} onChange={set(k)} />
      {hint && <div className="note">{hint}</div>}
    </div>
  );
  return (
    <main>
      <h1>Create a launch</h1>
      <p className="lead">Nothing is tradable until the auction clears. The creator share is capped at 10% and locked until the price holds at or above the clearing price.</p>
      <div className="grid">
        <div className="panel">
          <h3>Token</h3>
          {field("name", "Name")}
          {field("symbol", "Ticker", "token account becomes <ticker>-<id>." + FACTORY)}
          {field("icon", "Icon (data URL, optional)")}
          {field("total", "Total supply (whole tokens)")}
        </div>
        <div className="panel">
          <h3>Split &amp; auction</h3>
          {field("sale", "Sale %")}
          {field("lp", "Pool %", "≤ sale %; scaled by what actually sells")}
          {field("creator", "Creator % (locked, ≤ 10)")}
          <div className={sum === 100 ? "note ok" : "note err"}>sum {sum}%</div>
          {field("pMin", "Minimum price (NEAR per token)")}
          {field("commit", "Commit window (seconds)")}
          {field("reveal", "Reveal window (seconds)")}
          {field("penalty", "Non-reveal penalty %")}
        </div>
        <div className="panel">
          <h3>Floor Keeper &amp; lock</h3>
          {field("band", "Defend below clearing − band %")}
          {field("k", "Observations below floor to trigger (k)")}
          {field("r", "Max treasury spend per epoch %")}
          {field("epoch", "Epoch (seconds)")}
          {field("poke", "Min seconds between observations")}
          {field("h", "Observations at/above clearing to unlock creator (h)")}
          {field("fee", "Attached NEAR (token account + storage)", "≈1.99 NEAR on testnet (per-launch token code); excess funds the token's storage")}
        </div>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        {accountId ? <button onClick={submit} disabled={sum !== 100}>Create launch</button> : <button onClick={signIn}>Connect wallet to create</button>}
        <span className="note">{status}</span>
      </div>
    </main>
  );
}
