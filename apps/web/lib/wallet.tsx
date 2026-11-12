"use client";
// Wallet context on @hot-labs/near-connect (testnet). The connector (~94 KB of JS plus a wallet
// manifest fetch) loads only when needed: on "Connect wallet", on the first transaction, or after
// idle when this browser connected before (to restore the session). Visitors who only read pay nothing.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { NETWORK } from "./near";

type Connector = import("@hot-labs/near-connect").NearConnector;
interface WalletCtx {
  accountId: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  call: (receiverId: string, method: string, args: object, deposit?: bigint, tgas?: number) => Promise<{ hash?: string; result?: unknown }>;
}
const Ctx = createContext<WalletCtx | null>(null);
const FLAG = "slowcook:wallet-connected";
const remember = (on: boolean) => {
  try {
    on ? localStorage.setItem(FLAG, "1") : localStorage.removeItem(FLAG);
  } catch {}
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const connector = useRef<Promise<Connector> | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);

  const ensure = useCallback(() => {
    if (!connector.current) {
      connector.current = import("@hot-labs/near-connect").then(({ NearConnector }) => {
        const c = new NearConnector({ network: NETWORK, features: { testnet: true }, footerBranding: null });
        c.on("wallet:signIn", (t) => {
          setAccountId(t.accounts[0]?.accountId ?? null);
          remember(true);
        });
        c.on("wallet:signOut", () => {
          setAccountId(null);
          remember(false);
        });
        return c;
      });
    }
    return connector.current;
  }, []);

  useEffect(() => {
    let wasConnected = false;
    try {
      wasConnected = localStorage.getItem(FLAG) === "1";
    } catch {}
    if (!wasConnected) return;
    const restore = async () => {
      try {
        const { accounts } = await (await ensure()).getConnectedWallet();
        setAccountId(accounts[0]?.accountId ?? null);
      } catch {}
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(restore, { timeout: 3000 });
    else setTimeout(restore, 1500);
  }, [ensure]);

  const signIn = useCallback(async () => {
    await (await ensure()).connect();
  }, [ensure]);
  const signOut = useCallback(async () => {
    await (await ensure()).disconnect();
    setAccountId(null);
    remember(false);
  }, [ensure]);
  const call = useCallback(
    async (receiverId: string, method: string, args: object, deposit = 0n, tgas = 100) => {
      const wallet = await (await ensure()).wallet();
      const out: any = await wallet.signAndSendTransaction({
        receiverId,
        actions: [{ type: "FunctionCall", params: { methodName: method, args, gas: (BigInt(tgas) * 10n ** 12n).toString(), deposit: deposit.toString() } }],
      });
      const failure = out?.status?.Failure;
      if (failure) throw new Error(JSON.stringify(failure));
      let result: unknown;
      const b64 = out?.status?.SuccessValue;
      if (b64) {
        try {
          result = JSON.parse(atob(b64));
        } catch {}
      }
      return { hash: out?.transaction?.hash ?? out?.transaction_outcome?.id, result };
    },
    [ensure],
  );

  return <Ctx.Provider value={{ accountId, signIn, signOut, call }}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWallet outside WalletProvider");
  return c;
}
