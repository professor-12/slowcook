"use client";
import { useWallet } from "@/lib/wallet";

export function WalletButton() {
  const { accountId, signIn, signOut } = useWallet();
  return accountId ? (
    <span className="row">
      <span className="mono">{accountId}</span>
      <button className="secondary" onClick={signOut}>
        Sign out
      </button>
    </span>
  ) : (
    <button onClick={signIn}>Connect wallet</button>
  );
}
