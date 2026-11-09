// Read-only NEAR helpers: JSON-RPC view calls, formatting and the commit hash (same preimage as
// contracts/slowcook/src/math.rs::commit_preimage).
export const NETWORK = "testnet" as const;
export const FACTORY = process.env.NEXT_PUBLIC_SLOWCOOK_FACTORY ?? "slowcook-0dd752.testnet";
export const RPC = process.env.NEXT_PUBLIC_NEAR_RPC ?? "https://rpc.testnet.fastnear.com";
export const EXPLORER = "https://testnet.nearblocks.io";
export const ONE_TOKEN = 10n ** 18n;
export const YOCTO = 10n ** 24n;
export const COMMIT_STORAGE_FEE = 5n * 10n ** 21n;

export async function view<T = any>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "slowcook",
      method: "query",
      params: { request_type: "call_function", finality: "optimistic", account_id: contractId, method_name: method, args_base64: btoa(JSON.stringify(args)) },
    }),
  });
  const j = await res.json();
  if (j.error || j.result?.error) throw new Error(JSON.stringify(j.error ?? j.result.error));
  return JSON.parse(new TextDecoder().decode(new Uint8Array(j.result.result)));
}

export async function chainNowMs(): Promise<number> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "b", method: "block", params: { finality: "final" } }),
  });
  const j = await res.json();
  return Math.floor(Number(j.result.header.timestamp_nanosec) / 1e6);
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomSaltHex(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function commitPreimage(launchId: string, bidder: string, tick: number, qty: bigint, salt: string): string {
  return `${launchId}:${bidder}:${tick}:${qty}:${salt}`;
}

/** yoctoNEAR -> "1.2345" */
export function near(yocto: bigint | string | number | undefined, dp = 4): string {
  if (yocto === undefined) return "–";
  const v = BigInt(yocto);
  const whole = v / YOCTO;
  const frac = (v % YOCTO).toString().padStart(24, "0").slice(0, dp);
  return dp ? `${whole}.${frac}` : whole.toString();
}

/** Price in yocto per whole token -> NEAR per token, compact. */
export function price(yocto: bigint | string | undefined): string {
  if (yocto === undefined) return "–";
  const n = Number(BigInt(yocto)) / 1e24;
  if (n === 0) return "0";
  return n < 0.001 ? n.toExponential(3) : n.toPrecision(4);
}

export function tokens(base: bigint | string | undefined): string {
  if (base === undefined) return "–";
  return (Number(BigInt(base) / 10n ** 14n) / 1e4).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function whole(n: bigint | string | number | undefined): string {
  if (n === undefined) return "–";
  return Number(n).toLocaleString();
}

export function parseNear(s: string): bigint {
  const [w, f = ""] = s.trim().split(".");
  return BigInt(w || "0") * YOCTO + BigInt((f + "0".repeat(24)).slice(0, 24) || "0");
}

export function errorCode(e: unknown): string {
  const m = String((e as Error)?.message ?? e).match(/E_[A-Z_]+[^"\\]*/);
  return m ? m[0] : String((e as Error)?.message ?? e).slice(0, 200);
}

export interface Receipt {
  factory: string;
  launchId: string;
  bidder: string;
  tick: number;
  qty: string;
  salt: string;
  hash: string;
  deposit: string;
  createdAt: string;
}

export const receiptKey = (launchId: string, bidder: string) => `slowcook:receipt:${FACTORY}:${launchId}:${bidder}`;
