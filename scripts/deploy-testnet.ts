// Deploy the SlowCook factory to testnet, initialise it, and upload the token wasm.
// Usage: pnpm deploy:testnet   (requires .env with SLOWCOOK_FACTORY and its key in ~/.near-credentials)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, account, call, need, view, writeResult, EXPLORER } from "./lib.ts";

const factoryId = need("SLOWCOOK_FACTORY");
const factory = account(factoryId);
const factoryWasm = readFileSync(join(ROOT, "target/near/slowcook/slowcook.wasm"));
const tokenWasm = readFileSync(join(ROOT, "target/near/slowcook_token/slowcook_token.wasm"));

const out: Record<string, unknown> = { network: "testnet", factory: factoryId, at: new Date().toISOString() };
const state = await factory.getState();
const hasCode = (state as any).codeHash && (state as any).codeHash !== "11111111111111111111111111111111";
console.log(`factory ${factoryId}: balance ${(Number((state as any).balance?.total ?? 0n) / 1e24).toFixed(3)} NEAR, code ${hasCode ? "present" : "none"}`);

const dep: any = await factory.deployContract(new Uint8Array(factoryWasm));
out.deploy_tx = `${EXPLORER}/txns/${dep.transaction.hash}`;
console.log(`deployed factory wasm (${factoryWasm.length} bytes): ${out.deploy_tx}`);

let owner: string | null = null;
try {
  owner = await view<string>(factoryId, "get_owner");
} catch {}
if (!owner) {
  const init = await call(factory, factoryId, "new", { owner: factoryId });
  if (!init.ok) throw new Error(`init failed: ${init.error}`);
  out.init_tx = init.url;
  console.log(`initialised: ${init.url}`);
} else {
  console.log(`already initialised (owner ${owner})`);
}

const code = await call(factory, factoryId, "set_token_code", new Uint8Array(tokenWasm), { tgas: 300 });
if (!code.ok) throw new Error(`set_token_code failed: ${code.error}`);
out.set_token_code_tx = code.url;
out.token_code = await view(factoryId, "get_token_code");
console.log(`token wasm uploaded (${tokenWasm.length} bytes): ${code.url}`);
console.log("token code:", JSON.stringify(out.token_code));
console.log(`wrote ${writeResult("deploy", out)}`);
