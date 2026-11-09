// Redeploy only the factory wasm (same state layout). Usage: node scripts/redeploy-code.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXPLORER, ROOT, account, need, view, withRetry, writeResult } from "./lib.ts";

const factoryId = need("SLOWCOOK_FACTORY");
const wasm = readFileSync(join(ROOT, "target/near/slowcook/slowcook.wasm"));
const r: any = await withRetry(() => account(factoryId).deployContract(new Uint8Array(wasm)), "deploy");
const url = `${EXPLORER}/txns/${r.transaction.hash}`;
const launches = await view<any[]>(factoryId, "list_launches", { from: "0", limit: 10 });
console.log(`redeployed ${wasm.length} bytes: ${url}\nstate still readable: ${launches.length} launch(es), launch 0 phase ${launches[0]?.phase}`);
writeResult("redeploy", { factory: factoryId, bytes: wasm.length, tx: url, launches_after: launches.length });
