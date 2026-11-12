"use client";
import { LogOut, Wallet } from "lucide-react";
import { useWallet } from "@/lib/wallet";

export function WalletButton({ block = false }: { block?: boolean }) {
  const { accountId, signIn, signOut } = useWallet();
  const style = block ? { width: "100%" } : undefined;
  return accountId ? (
    <span className="row" style={style}>
      <span className="mono small" title={accountId}>
        {accountId.length > 22 ? `${accountId.slice(0, 10)}…${accountId.slice(-10)}` : accountId}
      </span>
      <button className="btn btn-ghost btn-sm" onClick={signOut}>
        <LogOut size={16} aria-hidden /> Sign out
      </button>
    </span>
  ) : (
    <button className="btn btn-primary" onClick={signIn} style={style}>
      <Wallet size={20} aria-hidden /> Connect wallet
    </button>
  );
}
