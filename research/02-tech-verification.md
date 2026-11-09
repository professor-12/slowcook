# R4: Technical verification (items a–f)

All checks ran on 2026-11-09 (around 15:20–16:00 UTC). Labels: VERIFIED / INFERRED / HYPOTHESIS / UNKNOWN.

Access note: docs.near.org and docs.near-intents.org timed out from this machine. For NEAR docs, the official source repo `near/docs` (branch `master`) was read through the GitHub API instead. That is the same content the site renders, but the live site itself was not seen.

## (a) Global contracts (NEP-0591)

**Source.** `near/docs` → `smart-contracts/global-contracts.mdx` (renders at https://docs.near.org/smart-contracts/global-contracts). VERIFIED (doc source).

### How it works
- **Two modes.**
  - By hash: immutable, pinned to a code hash.
  - By account ID: upgradable. If the publisher redeploys, every user of the reference follows the new code.
- **Separate state.** Each account that uses the code keeps its own state and balance.
- **Cost.** Deploying is "10x more … at the rate 10 NEAR per 100KB", and that amount is **burnt, not locked**. Using a global contract is "typically under 0.001 NEAR" because only a reference is stored.
- **When to use it.** The docs advise global contracts when the same code goes to roughly 10 or more accounts; for local prototypes, regular deploys are simpler.
- **Publishing is not deploying.** Publishing under an account ID does **not** make that account executable.

### Commands
- **CLI:**
  - Deploy by hash: `near contract deploy-as-global use-file <wasm> as-global-hash <account-id> network-config testnet sign-with-keychain send`
  - Use by hash: `near contract deploy <account-id> use-global-hash <hash> without-init-call network-config testnet`
  - To initialize in the same transaction, use `with-init-call`, which prevents someone else from initializing first.
- **Off-chain Rust (near-api):**
  - `Contract::deploy_global_contract_code(code).as_hash()`
  - `Contract::deploy(id).use_global_hash(hash)`

### In-contract API: near-sdk 5.30.1, `near_sdk::Promise` (VERIFIED at https://docs.rs/near-sdk/5.30.1/near_sdk/struct.Promise.html)
- `deploy_global_contract(self, code: impl Into<Vec<u8>>) -> Self` → `env::promise_batch_action_deploy_global_contract`
- `deploy_global_contract_by_account_id(self, code) -> Self` → `..._deploy_global_contract_by_account_id`
- `use_global_contract(self, code_hash: impl Into<CryptoHash>) -> Self` → `..._use_global_contract`
- `use_global_contract_by_account_id(self, account_id: AccountId) -> Self` → `..._use_global_contract_by_account_id`
- Docs example: `Promise::new(sub).create_account().transfer(amount).use_global_contract(code_hash)`.
- These four methods carry **no** "Available on crate feature" note. By contrast, `state_init` and `refund_to` require `deterministic-account-ids`.
- **docs.rs shows 5.30.1 as the latest near-sdk.** COMMON-RULES pins 5.30.0; consider pinning 5.30.1.

### Live on testnet?
- **INFERRED yes.** `EXPERIMENTAL_protocol_config` on testnet returns `runtime_config.wasm_config.global_contract_host_fns = true` at protocol_version 88, and the docs' CLI examples target testnet.
- **Not proven by a real deploy.** Cheap check: `deploy-as-global` the token wasm on testnet once, then `use-global-hash` on one sub-account.

### Cost comparison for SlowCook (HYPOTHESIS until the wasm is built and measured)
- Assume the FT wasm is ~200 KB:
  - Global deploy: ~20 NEAR **burned** once.
  - Per launch with a global contract: a sub-account reference plus its own state.
  - Per launch with a regular sub-account deploy: ~2 NEAR **locked**.
- Break-even is about 10 launches. Testnet faucet amounts are small, so a 20 NEAR burn may be hard to fund.
- Upside of the global route: a by-hash reference gives a visible, immutable code hash for every token, which is good trust evidence.
- **Measure the real wasm size before deciding.**

## (b) Storage staking cost (VERIFIED, two sources)
- **Live protocol config.** `EXPERIMENTAL_protocol_config` (finality final) on `rpc.testnet.fastnear.com` returns `runtime_config.storage_amount_per_byte = "10000000000000000000"`.
  - That is **10^19 yoctoNEAR per byte**: 0.00001 NEAR per byte, or 1 NEAR per 100 KB.
- **Docs.** `near/docs` `protocol/storage/storage-staking.mdx` says the same: "**1E19 yoctoNEAR per byte**, or **100kb per NEAR token**".
- **Related limits from the same config:**
  - `max_contract_size` = 4,194,304 bytes
  - `max_total_prepaid_gas` = 1,000 Tgas (1e15)
  - `epoch_length` = 43,200 blocks
  - `min_gas_price` = 5000

## (c) Rhea / Ref Finance testnet `ref-finance-101.testnet`: ACTIVE (VERIFIED)
- **View `metadata`:**
  - `version 1.9.19`, `state "Running"`, `pool_count 2930`
  - `owner reflabs.sputnikv2.testnet`, `wnear_id wrap.testnet`, `admin_fee_bps 2000`
  - `auto_whitelisted_postfix` includes `meme-cooking.testnet`, `.tkns.testnet`, `.portalpad1.testnet` and `.tkndev.testnet`
- **`view_account`:** code_hash `AEAm8sQ5KYZRgnpq2CN2NhX6d8QV76iRtiDpy5Ai6zDX`, storage_usage 14,019,298 bytes.
- **Recent transactions** (from `https://api-testnet.nearblocks.io/v3/accounts/ref-finance-101.testnet/txns?limit=15`):
  - The newest is a `storage_deposit` at 2026-11-09 15:06 UTC (`FV7MYAdZd9UfLpePDjH1bZs7Euui9cqKHVr4a7iFW69`).
  - `heliquant.testnet` called `add_simple_pool` at 07:16 UTC (`8aYSSfDHReFWBCfUHQUw4nT1rv1X7g2QV7tSrTdwddYd`) and then `add_liquidity`.
- **Limit:** there was no `swap` among the last 15 transactions, so the swap path itself was not observed. It works per INFERRED; a real check is one test swap on a new pool.
- **Tooling gotcha (VERIFIED):** nearblocks **testnet API v1 was retired on 2026-11-05**. Use `/v3/accounts/{id}/txns`, which returns `data[]` and uses `limit` with cursor pagination. Mainnet v1/v2 switch off on 2026-11-22.
- **Design implication (HYPOTHESIS):** Ref testnet is usable. But `defend()` needs to read the pool price and swap in one place without cross-contract callbacks, so the brief's own minimal AMM inside the SlowCook contract is still simpler and safer. Ref could be an optional second venue.

## (d) NEAR Intents 1Click API
- **llms.txt** (VERIFIED via WebFetch: https://docs.near-intents.org/llms.txt): JWT auth. OpenAPI specs are at `https://1click.chaindefuser.com/docs/v0/openapi.yaml` and `https://explorer.near-intents.org/api/v0/openapi.yaml`.
- **Summary** (VERIFIED from the 1Click OpenAPI spec and the `defuse-protocol/one-click-sdk-typescript` README):
  1. Base URL `https://1click.chaindefuser.com`. A JWT is required for quote, deposit-submit and status (`OpenAPI.TOKEN`).
  2. `GET /v0/tokens` lists supported assets.
  3. `POST /v0/quote` takes swapType (e.g. `EXACT_INPUT`), assets, amount, slippage, refund and recipient. It returns pricing plus a unique **depositAddress**; `dry: true` simulates without one.
  4. `POST /v0/deposit/submit` (`submitDepositTx`) tells 1Click the deposit tx hash for that depositAddress, which speeds up detection.
  5. `GET /v0/status?depositAddress=…` returns `PENDING_DEPOSIT | INCOMPLETE_DEPOSIT | PROCESSING | SUCCESS | REFUNDED | FAILED`.
- **No testnet.**
  - The spec's ~46k lines contain no "testnet" (VERIFIED).
  - COMMON-RULES Q-007 says there is no Intents testnet (nearhackathon.com timed out today, so this was not re-read).
  - Zaunchpad reports the same (VERIFIED).
- **Consequence:** a 1Click "bid from any chain" demo is mainnet-only and needs a JWT and the human's "yes". Keep it at the bottom of the cut list.

## (e) Testnet RPC and block time
- **`status` on `https://rpc.testnet.fastnear.com`** (VERIFIED, 2026-11-09T15:21:55Z):
  - `chain_id: testnet`, `latest_block_height: 276937787`
  - protocol_version 88, node `2.14.0-rc.5`, `syncing: false`
  - `earliest_block_height 276738055` (2026-11-08T06:17Z): about 1.4 days of history, so **non-archival**.
- **Block time (VERIFIED by measurement):**
  - Heights 276,940,000 → 276,941,000 spanned 569.83 s, which is **~0.57 s per height**.
  - A second sample, 276,936,787 → 276,941,040 (4,253 heights in 2,485.1 s), gives **~0.58 s per height**.
  - **Use ~0.6 s when converting "M blocks" or "epoch = 100 blocks" (≈1 minute) into time.**
- **Reliability:** about 3 of ~15 requests came back with an empty body. Add retry plus a fallback.
- **near-cli-rs defaults** (VERIFIED in `near/near-cli-rs` `src/config/mod.rs`, not tested): testnet → `https://archival-rpc.testnet.fastnear.com/`, and `testnet-fastnear` → `https://test.rpc.fastnear.com/`. Provider list: https://docs.near.org/api/rpc/providers.

## (f) Testnet faucet and creating an account with near-cli-rs
- **Command** (VERIFIED, `near/near-cli-rs` `docs/GUIDE.en.md`): `near account create-account sponsor-by-faucet-service <name>.testnet autogenerate-new-keypair save-to-keychain network-config testnet create`. The faucet ("helper service") covers creation, testnet only.
- **Faucet URL in near-cli-rs config** (VERIFIED): `faucet_url: https://helper.nearprotocol.com/account`.
  - Today `GET /` on that host returned 404. That says nothing about `/account`, so whether account creation works is **UNKNOWN** until the human runs the command.
- **Top-up faucets** (from `near/docs` `getting-started/faucet.mdx`): a built-in faucet on the docs page, and https://near-faucet.io/ (HTTP 200 today).
- **Version drift (VERIFIED):** the latest near-cli-rs release is **v0.31.1 (2026-11-05)**; COMMON-RULES pins 0.30.1. Decide on day 1 and record the choice.

## Open checks to run before Gate R
1. Build the token wasm, record its size, and compute the regular versus global cost from the 10^19 yocto/byte figure.
2. If you choose the global route, do one testnet `deploy-as-global` plus `use-global-hash`.
3. Create the team testnet account with the faucet command above; this proves the faucet works.
