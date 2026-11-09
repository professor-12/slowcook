# VERIFIED: facts checked against live sources

Every row was checked on **2026-11-09** unless it says otherwise.
- **Method** says how it was checked.
- Research claims (stats, prior art) are in `research/0*.md` with their own labels.

## Toolchain (pinned for this sprint)

| Item | Pinned | Latest seen | Method |
|---|---|---|---|
| Rust | 1.97.0 + `wasm32-unknown-unknown` (`rust-toolchain.toml`) | n/a | `rustup toolchain install 1.97.0` succeeded |
| near-sdk / near-contract-standards | =5.30.1 | 5.30.1 (crates.io, updated 2026-11-05) | crates.io API `max_stable_version` |
| near-workspaces | =0.24.0 (sandbox node 2.14.0, from `near-sandbox` 0.4.0 `DEFAULT_NEAR_SANDBOX_VERSION`) | 0.24.0 | crates.io API; crate source |
| cargo-near | 0.22.0 | 0.23.0 (released 2026-11-06) | GitHub releases API; sha256 of the tarball checked. Kept at 0.22.0 per COMMON-RULES (pin, don't upgrade mid-sprint) |
| near-cli-rs | 0.30.1 | 0.31.1 (2026-11-05) | GitHub releases API; sha256 checked |
| Node | 24.17.0 (nvm) | 24.22.2 LTS listed by `nvm ls-remote` | local |
| pnpm | 12.8.1 | n/a | The installed global. COMMON-RULES listed 10.x; the newer major was already installed and works |
| near-api-js | 7.4.0 | 7.4.0 | `npm view near-api-js dist-tags.latest` |
| @hot-labs/near-connect | 0.12.0 | 0.12.0 | `pnpm view` |
| next / react | 16.4.5 / 19.3.1 | same | `pnpm view`. COMMON-RULES listed 16.4.3; 16.4.5 is the current patch |
| typescript (web) | 5.9.3 | 7.0.2 | Pinned to 5.9.x on purpose: TS 7 is the native-port major and Next's type-check integration targets the 5.x API |

## NEAR platform facts used in the design

| Fact | Value | Source / method |
|---|---|---|
| Global contracts in near-sdk | `Promise::deploy_global_contract`, `deploy_global_contract_by_account_id`, `use_global_contract(code_hash)`, `use_global_contract_by_account_id` | Read in the near-sdk 5.30.1 source (`src/promise.rs` lines 544–594) |
| Global contract deploy cost | 10 NEAR per 100 KB, **burned** | https://docs.near.org/smart-contracts/global-contracts (`research/02-tech-verification.md` §a) |
| Storage staking | 1e19 yocto per byte (1 NEAR per 100 KB) | Live testnet protocol config + docs (`research/02-tech-verification.md` §b) |
| Testnet RPC | `https://rpc.testnet.fastnear.com`, `chain_id: testnet` | JSON-RPC `status`, 2026-11-09T15:21:55Z |
| Testnet faucet | `near account create-account sponsor-by-faucet-service …` gives **10 NEAR** per new account | Did it 3 times today; balances read back over RPC |
| Ref testnet `ref-finance-101.testnet` | Active | nearblocks v3 (`research/02-tech-verification.md` §c). Not used: SlowCook has its own pool (design §4) |
| nearblocks testnet API | v1 retired 2026-11-05; use v3 | `research/02-tech-verification.md` §c |
| NEAR Intents | No testnet | COMMON-RULES Q-007 + 1Click OpenAPI spec (`research/02-tech-verification.md` §d). 1Click is therefore not built |

## Our own artifacts

| Fact | Value | Method |
|---|---|---|
| Factory wasm size | 306,187 bytes | `cargo near build non-reproducible-wasm --no-abi`, 2026-11-09 |
| Token wasm size | 158,654 bytes | same |
| Contract method names and argument shapes used in README/scripts | `create_launch{args}`, `commit{launch_id,hash_hex}`, `reveal{launch_id,tick,qty,salt_hex}`, `finalize{launch_id}`, `claim{launch_id}`, `refund_unrevealed{launch_id,bidder}`, `swap_near_for_token{launch_id,min_out}`, `ft_on_transfer` msg `{"launch_id","min_out"}`, `poke/defend/unlock_creator/flush_burn{launch_id}`; views `get_launch{id}`, `list_launches{from,limit}`, `get_buckets{id}`, `get_tick_prices{id}`, `get_bid{launch_id,account_id}`, `get_clearing{id}`, `get_pool{launch_id}`, `quote{launch_id,side,amount}`, `get_treasury{launch_id}`, `get_solvency{}` | Read in source (`contracts/slowcook/src/*.rs`) and exercised by the sandbox tests and scripts |
| Testnet accounts (created by the agent, faucet-funded) | factory `slowcook-0dd752.testnet`; demo creator `sc-creator-b44c88.testnet`; demo funder `sc-bidders-da9146.testnet` | RPC `view_account` |
