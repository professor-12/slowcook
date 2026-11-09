// Shared helpers for the testnet scripts. Keys come from the near-cli legacy keychain
// (~/.near-credentials/testnet/<account>.json) or from .demo-keys/ for throwaway bidder wallets.
// Config comes from .env (see .env.example). Nothing here touches mainnet.
import dns from "node:dns";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Account, FailoverRpcProvider, JsonRpcProvider, KeyPairSigner, actions, teraToGas } from "near-api-js";

// This network has flaky IPv6; prefer IPv4 and fail over between RPC endpoints.
dns.setDefaultResultOrder("ipv4first");

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const KEYS_DIR = join(ROOT, ".demo-keys");
export const RESULTS_DIR = join(ROOT, "results");

export function loadEnv(): Record<string, string> {
  const p = join(ROOT, ".env");
  const env: Record<string, string> = {};
  if (existsSync(p)) {
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  }
  return { ...env, ...process.env } as Record<string, string>;
}

export const ENV = loadEnv();
export const NETWORK = ENV.NEAR_NETWORK ?? "testnet";
if (NETWORK !== "testnet") throw new Error("scripts are testnet-only by design (COMMON-RULES guardrail 4)");
export const RPC = ENV.NEAR_RPC ?? "https://rpc.testnet.fastnear.com";
export const RPC_FALLBACK = ENV.NEAR_RPC_FALLBACK ?? "https://test.rpc.fastnear.com";
export const EXPLORER = "https://testnet.nearblocks.io";
export const provider = new FailoverRpcProvider([new JsonRpcProvider({ url: RPC }), new JsonRpcProvider({ url: RPC_FALLBACK })]);

const NET_ERR = /ETIMEDOUT|ENETUNREACH|ECONNRESET|ECONNREFUSED|EAI_AGAIN|fetch failed|socket hang up|timeout|Exceeded \d+ attempts/i;
/** Retry on transport errors only. Contract calls are idempotent here: a duplicate after a lost
 *  response fails with E_DUP / E_TOO_SOON and is reported as such. */
export async function withRetry<T>(f: () => Promise<T>, label: string, tries = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await f();
    } catch (e) {
      const m = String((e as Error)?.message ?? e) + String((e as any)?.cause ?? "");
      if (i >= tries || !NET_ERR.test(m)) throw e;
      console.log(`   (network error on ${label}, retry ${i}/${tries - 1})`);
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

export function need(name: string): string {
  const v = ENV[name];
  if (!v) throw new Error(`missing ${name} in .env (see .env.example)`);
  return v;
}

function readKey(accountId: string): string {
  const local = join(KEYS_DIR, `${accountId}.json`);
  const cli = join(homedir(), ".near-credentials", "testnet", `${accountId}.json`);
  for (const p of [local, cli]) {
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")).private_key;
  }
  throw new Error(`no key for ${accountId} in ${local} or ${cli}`);
}

export function account(accountId: string): Account {
  return new Account(accountId, provider, KeyPairSigner.fromSecretKey(readKey(accountId) as never));
}

export function saveKey(accountId: string, publicKey: string, privateKey: string) {
  mkdirSync(KEYS_DIR, { recursive: true });
  writeFileSync(join(KEYS_DIR, `${accountId}.json`), JSON.stringify({ account_id: accountId, public_key: publicKey, private_key: privateKey }));
}

export async function view<T = any>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  return withRetry(async () => (await provider.callFunction({ contractId, method, args, finality: "optimistic" } as never)) as T, `view ${method}`);
}

export interface TxResult {
  ok: boolean;
  hash: string;
  url: string;
  value?: any;
  error?: string;
  logs: string[];
}

/** Send one function call; never throws on contract failure (we record failures as evidence too). */
export async function call(
  signer: Account,
  receiverId: string,
  method: string,
  args: Record<string, unknown> | Uint8Array,
  opts: { deposit?: bigint; tgas?: number } = {},
): Promise<TxResult> {
  let res: any;
  try {
    res = await withRetry(
    () =>
      signer.signAndSendTransaction({
        receiverId,
        actions: [actions.functionCall(method, args as never, teraToGas(opts.tgas ?? 100), opts.deposit ?? 0n)],
        throwOnFailure: false,
        waitUntil: "FINAL",
      }),
    method,
  );
  } catch (e) {
    // Rejected before reaching the chain (e.g. not enough balance for the gas reservation).
    return { ok: false, hash: "", url: "(not sent)", error: String((e as Error)?.message ?? e).slice(0, 300), logs: [] };
  }
  const hash: string = res.transaction?.hash ?? res.transaction_outcome?.id;
  const logs: string[] = [];
  let error: string | undefined;
  for (const o of [res.transaction_outcome, ...(res.receipts_outcome ?? [])]) {
    logs.push(...(o?.outcome?.logs ?? []));
    const f = o?.outcome?.status?.Failure;
    if (f && !error) error = JSON.stringify(f);
  }
  const top = res.status?.Failure;
  if (top) error = JSON.stringify(top);
  let value: any;
  const b64 = res.status?.SuccessValue;
  if (typeof b64 === "string" && b64.length) {
    try {
      value = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    } catch {
      value = b64;
    }
  }
  return { ok: !error, hash, url: `${EXPLORER}/txns/${hash}`, value, error, logs };
}

export function events(r: TxResult): any[] {
  return r.logs.filter((l) => l.startsWith("EVENT_JSON:")).map((l) => JSON.parse(l.slice(11)));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function chainNowMs(): Promise<number> {
  const b: any = await withRetry(() => provider.viewBlock({ finality: "final" } as never), "block");
  return Math.floor(Number(b.header.timestamp_nanosec ?? b.header.timestamp) / 1e6);
}

export async function waitForChainTime(targetMs: number, label: string) {
  for (;;) {
    const now = await chainNowMs();
    if (now >= targetMs) return;
    const left = Math.ceil((targetMs - now) / 1000);
    process.stdout.write(`\r  waiting for ${label}: ${left}s   `);
    await sleep(Math.min(5_000, Math.max(1_000, targetMs - now)));
  }
}

export const fmtNear = (yocto: bigint | string, dp = 4) => (Number(BigInt(yocto)) / 1e24).toFixed(dp);

export function writeResult(prefix: string, data: unknown): string {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const p = join(RESULTS_DIR, `${prefix}-${ts}.json`);
  writeFileSync(p, JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  return p;
}
