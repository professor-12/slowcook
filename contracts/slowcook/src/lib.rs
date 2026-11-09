//! SlowCook: a NEAR memecoin launchpad where being first is worthless.
//!
//! One contract holds the factory, the sealed-bid auction, the post-launch pool and the
//! Floor Keeper treasury, so every NEAR movement between them is a local state change (atomic)
//! rather than a cross-contract call. The only cross-contract calls go to the per-launch NEP-141
//! token (deploy, mint, transfer, burn), and each has a callback that handles failure.
//!
//! Lifecycle: create_launch -> commit -> reveal -> finalize -> claim / swap -> poke / defend ->
//! unlock_creator. See docs/ARCHITECTURE.md.

pub mod auction;
pub mod errors;
pub mod events;
pub mod launch;
pub mod math;
pub mod pool;
pub mod treasury;

use crate::errors::*;
use crate::launch::*;
use near_sdk::json_types::{Base58CryptoHash, U128, U64};
use near_sdk::serde_json::json;
use near_sdk::store::LookupMap;
use near_sdk::{
    env, ext_contract, near, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise,
};

pub const GAS_TOKEN_NEW: Gas = Gas::from_tgas(20);
pub const GAS_TOKEN_CALL: Gas = Gas::from_tgas(10);
pub const GAS_CALLBACK: Gas = Gas::from_tgas(15);

/// NEAR sent to each token account for its own state (metadata + auto-registered holders).
pub const TOKEN_STATE_FUNDING: NearToken = NearToken::from_millinear(300);
/// Kept by the factory to pay for the launch record (~3 KB) and its marginal-bid lists.
pub const LAUNCH_STORAGE_FEE: NearToken = NearToken::from_millinear(100);
/// Refundable fee attached to each commit to cover the bid record's storage.
pub const COMMIT_STORAGE_FEE: NearToken = NearToken::from_millinear(5);
/// Smallest escrow a commit may carry (anti-spam).
pub const MIN_BID_DEPOSIT: NearToken = NearToken::from_millinear(10);
/// Swap fee, accrues to the locked liquidity.
pub const POOL_FEE_BPS: u128 = 30;

const CODE_KEY: &[u8] = b"token_code";

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Launches,
    Bids,
    Marginal,
    TokenToLaunch,
}

/// How a new launch's token account gets its code.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum TokenCode {
    /// Not configured yet; `create_launch` fails.
    Unset,
    /// The wasm bytes live in this contract's storage and are deployed onto every token account
    /// (costs ~len * storage_byte_cost per launch).
    Embedded { hash: Base58CryptoHash, len: u64 },
    /// The token code is a NEAR global contract; launches reference it by hash (no per-launch code
    /// storage).
    Global { hash: Base58CryptoHash },
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct SlowCook {
    pub owner: AccountId,
    pub launches: LookupMap<LaunchId, Launch>,
    pub next_id: LaunchId,
    pub bids: LookupMap<(LaunchId, AccountId), Bid>,
    /// Quantities of every revealed bid at each tick, so finalize can sum the exact pro-rata fill.
    pub marginal: LookupMap<(LaunchId, u8), Vec<u128>>,
    pub token_to_launch: LookupMap<AccountId, LaunchId>,
    pub token_code: TokenCode,
}

#[ext_contract(ext_token)]
#[allow(dead_code)]
pub trait LaunchToken {
    fn mint(&mut self, account_id: AccountId, amount: U128);
    fn burn(&mut self, amount: U128);
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

pub fn now_ms() -> u64 {
    env::block_timestamp_ms()
}

#[near]
impl SlowCook {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            owner,
            launches: LookupMap::new(StorageKey::Launches),
            next_id: 0,
            bids: LookupMap::new(StorageKey::Bids),
            marginal: LookupMap::new(StorageKey::Marginal),
            token_to_launch: LookupMap::new(StorageKey::TokenToLaunch),
            token_code: TokenCode::Unset,
        }
    }

    // ---------------------------------------------------------------- admin: token code

    /// Owner uploads the token wasm as the raw call arguments. Stored in contract storage.
    pub fn set_token_code(&mut self) {
        self.assert_owner();
        let code = env::input().unwrap_or_else(|| fail(E_PARAMS, "no code"));
        ensure(code.len() > 1_000, E_PARAMS, "code too small");
        let hash: [u8; 32] = env::sha256_array(&code);
        env::storage_write(CODE_KEY, &code);
        self.token_code = TokenCode::Embedded {
            hash: hash.into(),
            len: code.len() as u64,
        };
    }

    /// Owner points new launches at an already-deployed global contract by its code hash.
    pub fn use_global_token_code(&mut self, code_hash: Base58CryptoHash) {
        self.assert_owner();
        self.token_code = TokenCode::Global { hash: code_hash };
    }

    /// Owner publishes the stored token wasm as a NEAR global contract (deployed by hash), then
    /// switches new launches to it. The deploy cost is paid from this contract's balance.
    pub fn publish_token_code_globally(&mut self) -> Promise {
        self.assert_owner();
        let code = env::storage_read(CODE_KEY).unwrap_or_else(|| fail(E_PARAMS, "no stored code"));
        let hash: [u8; 32] = env::sha256_array(&code);
        Promise::new(env::current_account_id())
            .deploy_global_contract(code)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_global_published(hash.into()),
            )
    }

    #[private]
    pub fn on_global_published(&mut self, hash: Base58CryptoHash) -> bool {
        let ok = promise_ok();
        if ok {
            self.token_code = TokenCode::Global { hash };
        }
        ok
    }

    // ---------------------------------------------------------------- create

    /// Create a launch and deploy its token on `<symbol>-<id>.<this account>`. The attached NEAR
    /// funds the token account (code + state) plus `LAUNCH_STORAGE_FEE`; any excess goes to the
    /// token account's storage budget.
    #[payable]
    pub fn create_launch(&mut self, args: CreateLaunchArgs) -> U64 {
        let params = validate(&args);
        let creator = env::predecessor_account_id();
        let id = self.next_id;
        let sym: String = args
            .symbol
            .to_ascii_lowercase()
            .chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .take(12)
            .collect();
        ensure(!sym.is_empty(), E_PARAMS, "symbol must contain a-z0-9");
        let token_id: AccountId = format!("{sym}-{id}.{}", env::current_account_id())
            .parse()
            .unwrap_or_else(|_| fail(E_PARAMS, "token account id too long"));

        let attached = env::attached_deposit();
        let code_cost = match &self.token_code {
            TokenCode::Unset => fail(E_PARAMS, "token code not configured"),
            TokenCode::Embedded { len, .. } => {
                env::storage_byte_cost().saturating_mul(*len as u128)
            }
            TokenCode::Global { .. } => NearToken::from_yoctonear(0),
        };
        let required = code_cost
            .saturating_add(TOKEN_STATE_FUNDING)
            .saturating_add(LAUNCH_STORAGE_FEE);
        ensure(
            attached >= required,
            E_DEPOSIT,
            &format!("attach at least {} yoctoNEAR", required.as_yoctonear()),
        );
        let funding = attached.saturating_sub(LAUNCH_STORAGE_FEE);

        let total = args.total_supply.0;
        let sale_supply = total * args.sale_bps as u128 / 10_000;
        let lp_max = total * args.lp_bps as u128 / 10_000;
        let creator_max = total - sale_supply - lp_max;
        let now = now_ms();
        let commit_end = now + args.commit_secs as u64 * 1000;
        let launch = Launch {
            id,
            creator: creator.clone(),
            token_id: token_id.clone(),
            name: args.name.clone(),
            symbol: args.symbol.clone(),
            icon: args.icon.clone(),
            total_supply: total,
            sale_supply,
            lp_max,
            creator_max,
            p_min: args.p_min.0,
            created_ms: now,
            commit_end_ms: commit_end,
            reveal_end_ms: commit_end + args.reveal_secs as u64 * 1000,
            params,
            status: Status::Deploying,
            buckets: vec![0; NUM_TICKS],
            num_commits: 0,
            num_reveals: 0,
            escrow: 0,
            storage_fees_held: 0,
            clearing: None,
            clearing_price: 0,
            filled: 0,
            lp_tokens: 0,
            creator_tokens: 0,
            burned_at_finalize: 0,
            proceeds: 0,
            pool: Pool::default(),
            treasury: Treasury::default(),
            creator_unlocked: false,
            claims: 0,
        };
        self.launches.insert(id, launch);
        self.token_to_launch.insert(token_id.clone(), id);
        self.next_id += 1;

        let init_args = json!({
            "owner_id": env::current_account_id(),
            "name": args.name,
            "symbol": args.symbol,
            "icon": args.icon,
        })
        .to_string()
        .into_bytes();
        let mut p = Promise::new(token_id.clone())
            .create_account()
            .transfer(funding);
        p = match &self.token_code {
            TokenCode::Embedded { .. } => {
                p.deploy_contract(env::storage_read(CODE_KEY).expect("code"))
            }
            TokenCode::Global { hash } => p.use_global_contract(*hash),
            TokenCode::Unset => unreachable!(),
        };
        p.function_call(
            "new".to_string(),
            init_args,
            NearToken::from_yoctonear(0),
            GAS_TOKEN_NEW,
        )
        .then(
            Self::ext(env::current_account_id())
                .with_static_gas(GAS_CALLBACK)
                .on_token_deployed(U64(id), U128(funding.as_yoctonear())),
        )
        .detach();

        events::emit(
            "launch_created",
            json!({
                "launch_id": id, "creator": creator, "token_id": token_id,
                "symbol": args.symbol, "total_supply": U128(total), "p_min": args.p_min,
                "commit_end_ms": U64(commit_end),
            }),
        );
        U64(id)
    }

    #[private]
    pub fn on_token_deployed(&mut self, launch_id: U64, funding: U128) -> bool {
        let mut l = self.launch(launch_id.0);
        let ok = promise_ok();
        if ok {
            l.status = Status::Open;
        } else {
            // The failed batch refunds `funding` to this account; pass it back to the creator.
            l.status = Status::Failed;
            Promise::new(l.creator.clone())
                .transfer(NearToken::from_yoctonear(funding.0))
                .detach();
            events::emit(
                "launch_failed",
                json!({ "launch_id": l.id, "reason": "token deploy failed" }),
            );
        }
        self.launches.insert(l.id, l);
        ok
    }

    // ---------------------------------------------------------------- views

    pub fn get_launch(&self, id: U64) -> LaunchView {
        LaunchView::from(&self.launch(id.0), now_ms())
    }

    pub fn list_launches(&self, from: Option<U64>, limit: Option<u32>) -> Vec<LaunchView> {
        let from = from.map(|f| f.0).unwrap_or(0);
        let limit = limit.unwrap_or(20).min(100) as u64;
        let now = now_ms();
        (from..self.next_id.min(from.saturating_add(limit)))
            .filter_map(|i| self.launches.get(&i).map(|l| LaunchView::from(l, now)))
            .collect()
    }

    pub fn get_buckets(&self, id: U64) -> Vec<U128> {
        self.launch(id.0).buckets.iter().map(|b| U128(*b)).collect()
    }

    pub fn get_tick_prices(&self, id: U64) -> Vec<U128> {
        let l = self.launch(id.0);
        launch_tick_prices(&l).into_iter().map(U128).collect()
    }

    pub fn get_clearing(&self, id: U64) -> near_sdk::serde_json::Value {
        let l = self.launch(id.0);
        json!({
            "clearing": l.clearing,
            "clearing_price": U128(l.clearing_price),
            "filled": U128(l.filled),
            "lp_tokens": U128(l.lp_tokens),
            "creator_tokens": U128(l.creator_tokens),
            "burned_at_finalize": U128(l.burned_at_finalize),
            "proceeds": U128(l.proceeds),
        })
    }

    pub fn get_token_code(&self) -> TokenCode {
        self.token_code.clone()
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    /// Solvency check (invariant I3): NEAR this contract owes, summed over every launch, versus its
    /// balance minus what is locked for storage.
    pub fn get_solvency(&self) -> near_sdk::serde_json::Value {
        let mut owed: u128 = 0;
        for i in 0..self.next_id {
            if let Some(l) = self.launches.get(&i) {
                owed += l.escrow
                    + l.storage_fees_held
                    + l.pool.near_reserve.0
                    + l.treasury.near_balance.0;
            }
        }
        let balance = env::account_balance().as_yoctonear();
        let storage = env::storage_byte_cost().as_yoctonear() * env::storage_usage() as u128;
        json!({
            "balance": U128(balance),
            "storage_locked": U128(storage),
            "owed": U128(owed),
            "solvent": balance >= owed.saturating_add(storage),
        })
    }

    // ---------------------------------------------------------------- internal

    pub(crate) fn assert_owner(&self) {
        ensure(
            env::predecessor_account_id() == self.owner,
            E_AUTH,
            "owner only",
        );
    }

    pub(crate) fn launch(&self, id: LaunchId) -> Launch {
        self.launches
            .get(&id)
            .cloned()
            .unwrap_or_else(|| fail(E_NOT_FOUND, "no such launch"))
    }
}

pub(crate) fn launch_tick_prices(l: &Launch) -> Vec<u128> {
    math::tick_prices(l.p_min, l.params.tick_factor_bps as u128, NUM_TICKS)
        .expect("validated at create")
}

/// `true` if the single promise this callback depends on succeeded.
pub(crate) fn promise_ok() -> bool {
    env::promise_results_count() == 1 && env::promise_result_checked(0, 1024).is_ok()
}

fn validate(a: &CreateLaunchArgs) -> Params {
    let bad = |m: &str| fail(E_PARAMS, m);
    if a.name.is_empty() || a.name.len() > 64 {
        bad("name must be 1..64 chars");
    }
    if a.symbol.is_empty() || a.symbol.len() > 12 {
        bad("symbol must be 1..12 chars");
    }
    if let Some(i) = &a.icon {
        if i.len() > 2048 {
            bad("icon too long");
        }
    }
    if a.sale_bps as u32 + a.lp_bps as u32 + a.creator_bps as u32 != 10_000 {
        bad("sale_bps + lp_bps + creator_bps must be 10000");
    }
    if a.sale_bps == 0 || a.lp_bps == 0 {
        bad("sale and lp shares must be > 0");
    }
    if a.creator_bps > 1_000 {
        bad("creator share must be <= 10%");
    }
    if a.lp_bps > a.sale_bps {
        bad("lp share must be <= sale share (pool NEAR comes from sale proceeds)");
    }
    let total = a.total_supply.0;
    if !(1_000..=1_000_000_000_000_000).contains(&total) {
        bad("total_supply must be 1e3..1e15 whole tokens");
    }
    if a.commit_secs < 10
        || a.reveal_secs < 10
        || a.commit_secs > 2_592_000
        || a.reveal_secs > 2_592_000
    {
        bad("commit/reveal must be 10s..30d");
    }
    let d = Params {
        tick_factor_bps: a.tick_factor_bps.unwrap_or(11_500),
        penalty_bps: a.penalty_bps.unwrap_or(500),
        band_bps: a.band_bps.unwrap_or(1_000),
        k_obs: a.k_obs.unwrap_or(6),
        h_obs: a.h_obs.unwrap_or(12),
        r_bps: a.r_bps.unwrap_or(1_000),
        epoch_ms: a.epoch_secs.unwrap_or(120) as u64 * 1000,
        poke_interval_ms: a.poke_interval_secs.unwrap_or(10) as u64 * 1000,
        max_commits: a.max_commits.unwrap_or(500),
    };
    if !(10_100..=20_000).contains(&d.tick_factor_bps) {
        bad("tick_factor_bps must be 10100..20000");
    }
    if d.penalty_bps > 2_000 {
        bad("penalty_bps must be <= 2000");
    }
    if !(100..=5_000).contains(&d.band_bps) {
        bad("band_bps must be 100..5000");
    }
    if d.k_obs == 0 || d.k_obs > 1_000 || d.h_obs == 0 || d.h_obs > 100_000 {
        bad("k_obs 1..1000, h_obs 1..100000");
    }
    if d.r_bps == 0 || d.r_bps > 5_000 {
        bad("r_bps must be 1..5000");
    }
    if d.epoch_ms < 10_000 || d.poke_interval_ms < 1_000 {
        bad("epoch >= 10s, poke interval >= 1s");
    }
    if d.max_commits == 0 || d.max_commits > 500 {
        bad("max_commits must be 1..500");
    }
    // Ticks must strictly increase and the top tick times the whole sale must fit in u128.
    let prices = math::tick_prices(a.p_min.0, d.tick_factor_bps as u128, NUM_TICKS)
        .unwrap_or_else(|| bad("p_min too small for strictly increasing ticks, or overflow"));
    let sale = total * a.sale_bps as u128 / 10_000;
    if prices[NUM_TICKS - 1].checked_mul(sale).is_none() {
        bad("p_min too large");
    }
    d
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod proptests;

#[cfg(test)]
mod parity_tests;
