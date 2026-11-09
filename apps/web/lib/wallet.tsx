"use client";
// Wallet context on @hot-labs/near-connect (testnet). Exposes the signed-in account and a single
// `call` helper that sends one FunctionCall and returns the transaction hash.
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

export function WalletProvider({ children }: { children: ReactNode }) {
  const connector = useRef<Connector | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { NearConnector } = await import("@hot-labs/near-connect");
      const c = new NearConnector({ network: NETWORK, features: { testnet: true }, footerBranding: null });
      connector.current = c;
      c.on("wallet:signIn", (t) => alive && setAccountId(t.accounts[0]?.accountId ?? null));
      c.on("wallet:signOut", () => alive && setAccountId(null));
      try {
        const { accounts } = await c.getConnectedWallet();
        if (alive) setAccountId(accounts[0]?.accountId ?? null);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async () => {
    await connector.current?.connect();
  }, []);
  const signOut = useCallback(async () => {
    await connector.current?.disconnect();
    setAccountId(null);
  }, []);
  const call = useCallback(async (receiverId: string, method: string, args: object, deposit = 0n, tgas = 100) => {
    if (!connector.current) throw new Error("wallet not ready");
    const wallet = await connector.current.wallet();
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
  }, []);

  return <Ctx.Provider value={{ accountId, signIn, signOut, call }}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWallet outside WalletProvider");
  return c;
}
