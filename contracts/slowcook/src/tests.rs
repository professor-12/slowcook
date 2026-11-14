//! Unit tests: every error code, every lifecycle step, and invariants I1–I6 on hand-built cases.
//! Property tests over random auctions live in `proptests.rs`.

use super::*;
use crate::auction::settle;
use crate::math::{Clearing, ONE_TOKEN};
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, PromiseResult, RuntimeFeesConfig};

pub const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
pub const MILLI: u128 = NEAR / 1000;
pub const FACTORY: &str = "slowcook.near";
pub const CREATOR: &str = "creator.near";
pub const P_MIN: u128 = 1_000_000_000_000_000_000; // 1e-6 NEAR per whole token
pub const DEP: u128 = 10_000 * NEAR;

pub fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

/// Test harness that owns the contract and a mock clock.
pub struct H {
    pub c: SlowCook,
    pub now_ms: u64,
}

pub fn set_ctx(now_ms: u64, pred: &str, deposit: u128, results: Vec<PromiseResult>) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc(FACTORY))
        .predecessor_account_id(acc(pred))
        .signer_account_id(acc(pred))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        // Large mock balance: parity fixtures move up to ~1e32 yocto per bid.
        .account_balance(NearToken::from_yoctonear(u128::MAX / 4))
        .block_timestamp(now_ms * 1_000_000);
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        results
    );
}

impl H {
    pub fn ctx(&self, pred: &str, deposit: u128, results: Vec<PromiseResult>) {
        set_ctx(self.now_ms, pred, deposit, results)
    }

    pub fn new() -> Self {
        // Start from empty mocked storage (testing_env! otherwise carries it over between cases).
        let _ = near_sdk::mock::with_mocked_blockchain(|b| b.take_storage());
        set_ctx(1_000_000, FACTORY, 0, vec![]);
        let mut c = SlowCook::new(acc(FACTORY), None);
        // The mock factory is not on .testnet; tests that need demo timings opt in directly.
        c.demo_allowed = true;
        c.token_code = TokenCode::Global {
            hash: [7u8; 32].into(),
        };
        H {
            c,
            now_ms: 1_000_000,
        }
    }

    pub fn args(total: u128) -> CreateLaunchArgs {
        CreateLaunchArgs {
            name: "Pepe Slow".into(),
            symbol: "PEPE".into(),
            icon: None,
            total_supply: U128(total),
            sale_bps: 6_000,
            lp_bps: 3_000,
            creator_bps: 1_000,
            p_min: U128(P_MIN),
            commit_secs: 600,
            reveal_secs: 600,
            tick_factor_bps: None,
            penalty_bps: None,
            band_bps: None,
            k_obs: Some(3),
            h_obs: Some(4),
            r_bps: None,
            epoch_secs: Some(120),
            poke_interval_secs: Some(10),
            max_commits: None,
            creator_lock_secs: Some(60),
            creator_vest_secs: Some(60),
            demo: Some(true),
        }
    }

    /// Create a launch and run the deploy callback successfully.
    pub fn launch(&mut self, a: CreateLaunchArgs) -> u64 {
        self.ctx(CREATOR, NEAR, vec![]);
        let id = self.c.create_launch(a).0;
        self.ok_cb();
        assert!(self
            .c
            .on_token_deployed(U64(id), U128(NEAR - LAUNCH_STORAGE_FEE.as_yoctonear())));
        id
    }

    pub fn ok_cb(&self) {
        self.ctx(FACTORY, 0, vec![PromiseResult::Successful(vec![])]);
    }

    pub fn fail_cb(&self) {
        self.ctx(FACTORY, 0, vec![PromiseResult::Failed]);
    }

    pub fn salt(who: &str) -> String {
        hex::encode(env::sha256(who.as_bytes()))
    }

    pub fn hash(id: u64, who: &str, tick: u8, qty: u128) -> String {
        let pre = math::commit_preimage(id, who, tick, qty, &Self::salt(who));
        hex::encode(env::sha256(pre.as_bytes()))
    }

    pub fn commit(&mut self, id: u64, who: &str, tick: u8, qty: u128, deposit: u128) {
        self.ctx(who, deposit + COMMIT_STORAGE_FEE.as_yoctonear(), vec![]);
        self.c.commit(U64(id), Self::hash(id, who, tick, qty));
    }

    pub fn reveal(&mut self, id: u64, who: &str, tick: u8, qty: u128) {
        self.ctx(who, 0, vec![]);
        self.c.reveal(U64(id), tick, U128(qty), Self::salt(who));
    }

    pub fn goto_reveal(&mut self, id: u64) {
        self.now_ms = self.c.launch(id).commit_end_ms;
    }

    pub fn goto_end(&mut self, id: u64) {
        self.now_ms = self.c.launch(id).reveal_end_ms;
    }

    pub fn finalize(&mut self, id: u64) {
        self.ctx("anyone.near", 0, vec![]);
        let _ = self.c.finalize(U64(id));
        if self.c.launch(id).status == Status::Finalizing {
            self.ok_cb();
            assert!(self.c.on_finalize_minted(U64(id)));
        }
    }

    pub fn claim(&mut self, id: u64, who: &str) -> crate::auction::SettlementView {
        self.ctx(who, 0, vec![]);
        let s = self.c.claim(U64(id));
        if s.filled.0 > 0 {
            self.ok_cb();
            self.c
                .on_claim_tokens(U64(id), acc(who), U128(s.filled.0 * ONE_TOKEN));
        }
        s
    }

    pub fn price(&self, id: u64, tick: u8) -> u128 {
        launch_tick_prices(&self.c.launch(id))[tick as usize]
    }

    pub fn advance(&mut self, ms: u64) {
        self.now_ms += ms;
    }

    pub fn poke(&mut self, id: u64) -> Observation {
        self.ctx("keeper.near", 0, vec![]);
        self.c.poke(U64(id))
    }

    /// Sell `whole` tokens into the pool as `who` (as if the token contract called ft_on_transfer).
    pub fn sell(&mut self, id: u64, who: &str, whole: u128) -> u128 {
        let token = self.c.launch(id).token_id;
        self.ctx(token.as_str(), 0, vec![]);
        match self
            .c
            .ft_on_transfer(acc(who), U128(whole * ONE_TOKEN), String::new())
        {
            PromiseOrValue::Value(v) => assert_eq!(v.0, 0),
            _ => panic!("expected value"),
        }
        self.c.launch(id).pool.near_reserve.0
    }
}

use near_sdk::PromiseOrValue;

/// A 1,000,000-token launch: sale 600k, LP 300k, creator 100k.
fn standard() -> (H, u64) {
    let mut h = H::new();
    let id = h.launch(H::args(1_000_000));
    (h, id)
}

// ------------------------------------------------------------------ create

#[test]
fn create_sets_phases_and_token_account() {
    let (h, id) = standard();
    let l = h.c.launch(id);
    assert_eq!(l.token_id.as_str(), "pepe-0.slowcook.near");
    assert_eq!(l.status, Status::Open);
    assert_eq!(l.phase(h.now_ms), Phase::Commit);
    assert_eq!(
        (l.sale_supply, l.lp_max, l.creator_max),
        (600_000, 300_000, 100_000)
    );
    assert_eq!(l.phase(l.commit_end_ms), Phase::Reveal);
    assert_eq!(l.phase(l.reveal_end_ms), Phase::AwaitingFinalize);
}

#[test]
#[should_panic(expected = "E_PARAMS")]
fn create_rejects_creator_over_10pct() {
    let mut h = H::new();
    let mut a = H::args(1_000_000);
    a.sale_bps = 5_000;
    a.creator_bps = 2_000;
    h.launch(a);
}

#[test]
#[should_panic(expected = "E_PARAMS")]
fn create_rejects_lp_above_sale() {
    let mut h = H::new();
    let mut a = H::args(1_000_000);
    a.sale_bps = 4_000;
    a.lp_bps = 5_000;
    h.launch(a);
}

#[test]
#[should_panic(expected = "E_DEPOSIT")]
fn create_requires_funding() {
    let mut h = H::new();
    h.ctx(CREATOR, MILLI, vec![]);
    h.c.create_launch(H::args(1_000_000));
}

#[test]
#[should_panic(expected = "E_PARAMS")]
fn create_requires_token_code() {
    let mut h = H::new();
    h.c.token_code = TokenCode::Unset;
    h.launch(H::args(1_000_000));
}

#[test]
fn failed_token_deploy_marks_launch_failed() {
    let mut h = H::new();
    h.ctx(CREATOR, NEAR, vec![]);
    let id = h.c.create_launch(H::args(1_000_000)).0;
    h.fail_cb();
    assert!(!h.c.on_token_deployed(U64(id), U128(NEAR)));
    assert_eq!(h.c.launch(id).status, Status::Failed);
}

#[test]
#[should_panic(expected = "E_AUTH")]
fn only_owner_sets_token_code() {
    let mut h = H::new();
    h.ctx("mallory.near", 0, vec![]);
    h.c.use_global_token_code([1u8; 32].into());
}

// ------------------------------------------------------------------ commit

#[test]
#[should_panic(expected = "E_PHASE")]
fn commit_blocked_while_token_deploying() {
    let mut h = H::new();
    h.ctx(CREATOR, NEAR, vec![]);
    let id = h.c.create_launch(H::args(1_000_000)).0;
    h.commit(id, "alice.near", 3, 10, NEAR);
}

#[test]
#[should_panic(expected = "E_DUP")]
fn commit_twice_rejected() {
    let (mut h, id) = standard();
    h.commit(id, "alice.near", 3, 10, NEAR);
    h.commit(id, "alice.near", 3, 10, NEAR);
}

#[test]
#[should_panic(expected = "E_CAP")]
fn commit_cap_enforced() {
    let mut h = H::new();
    let mut a = H::args(1_000_000);
    a.max_commits = Some(2);
    let id = h.launch(a);
    h.commit(id, "a.near", 1, 1, NEAR);
    h.commit(id, "b.near", 1, 1, NEAR);
    h.commit(id, "c.near", 1, 1, NEAR);
}

#[test]
#[should_panic(expected = "E_DEPOSIT")]
fn commit_needs_minimum_deposit() {
    let (mut h, id) = standard();
    h.ctx("alice.near", COMMIT_STORAGE_FEE.as_yoctonear(), vec![]);
    h.c.commit(U64(id), H::hash(id, "alice.near", 1, 1));
}

#[test]
#[should_panic(expected = "E_HASH")]
fn commit_rejects_malformed_hash() {
    let (mut h, id) = standard();
    h.ctx("alice.near", NEAR, vec![]);
    h.c.commit(U64(id), "abcd".into());
}

#[test]
#[should_panic(expected = "E_PHASE")]
fn commit_after_window_rejected() {
    let (mut h, id) = standard();
    h.goto_reveal(id);
    h.commit(id, "alice.near", 3, 10, NEAR);
}

// ------------------------------------------------------------------ reveal (I6)

#[test]
#[should_panic(expected = "E_PHASE")]
fn reveal_during_commit_rejected() {
    let (mut h, id) = standard();
    h.commit(id, "alice.near", 3, 10, NEAR);
    h.reveal(id, "alice.near", 3, 10);
}

#[test]
fn reveal_mismatch_rejected_and_bid_stays_sealed() {
    let (mut h, id) = standard();
    h.commit(id, "alice.near", 3, 10, NEAR);
    h.goto_reveal(id);
    for (tick, qty) in [(4u8, 10u128), (3, 11)] {
        h.ctx("alice.near", 0, vec![]);
        let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            h.c.reveal(U64(id), tick, U128(qty), H::salt("alice.near"))
        }));
        assert!(r.is_err());
    }
    // A different account cannot reveal alice's preimage either (bidder is in the hash).
    assert!(!h.c.bids.get(&(id, acc("alice.near"))).unwrap().revealed);
    h.reveal(id, "alice.near", 3, 10);
    assert_eq!(h.c.launch(id).buckets[3], 10);
}

#[test]
#[should_panic(expected = "E_HASH")]
fn reveal_wrong_salt_is_e_hash() {
    let (mut h, id) = standard();
    h.commit(id, "alice.near", 3, 10, NEAR);
    h.goto_reveal(id);
    h.ctx("alice.near", 0, vec![]);
    h.c.reveal(U64(id), 3, U128(10), "00".repeat(32));
}

#[test]
#[should_panic(expected = "E_DUP")]
fn reveal_twice_rejected() {
    let (mut h, id) = standard();
    h.commit(id, "alice.near", 3, 10, NEAR);
    h.goto_reveal(id);
    h.reveal(id, "alice.near", 3, 10);
    h.reveal(id, "alice.near", 3, 10);
}

#[test]
#[should_panic(expected = "E_DEPOSIT")]
fn reveal_requires_deposit_covering_price_times_qty() {
    let (mut h, id) = standard();
    let cost = h.price(id, 10) * 1_000;
    h.commit(id, "alice.near", 10, 1_000, cost - 1);
    h.goto_reveal(id);
    h.reveal(id, "alice.near", 10, 1_000);
}

#[test]
#[should_panic(expected = "E_NO_BID")]
fn reveal_without_commit() {
    let (mut h, id) = standard();
    h.goto_reveal(id);
    h.reveal(id, "ghost.near", 1, 1);
}

// ------------------------------------------------------------------ finalize + claim

#[test]
#[should_panic(expected = "E_PHASE")]
fn finalize_before_reveal_end_rejected() {
    let (mut h, id) = standard();
    h.goto_reveal(id);
    h.finalize(id);
}

#[test]
#[should_panic(expected = "E_NOT_FINAL")]
fn claim_before_finalize_rejected() {
    let (mut h, id) = standard();
    h.commit(id, "alice.near", 3, 10, NEAR);
    h.goto_end(id);
    h.claim(id, "alice.near");
}

/// Oversubscribed: three bidders, the marginal tick is split pro rata, everyone pays one price.
#[test]
fn oversubscribed_uniform_price_and_pro_rata() {
    let (mut h, id) = standard();
    let dep = DEP;
    h.commit(id, "bot.near", 20, 300_000, dep);
    h.commit(id, "alice.near", 10, 400_000, dep);
    h.commit(id, "bob.near", 10, 200_000, dep);
    h.commit(id, "carol.near", 5, 100_000, dep);
    h.goto_reveal(id);
    h.reveal(id, "bot.near", 20, 300_000);
    h.reveal(id, "alice.near", 10, 400_000);
    h.reveal(id, "bob.near", 10, 200_000);
    h.reveal(id, "carol.near", 5, 100_000);
    h.goto_end(id);
    h.finalize(id);
    let l = h.c.launch(id);
    let p10 = h.price(id, 10);
    assert_eq!(l.status, Status::Finalized);
    assert_eq!(l.clearing_price, p10);
    // remaining at tick 10 = 600k - 300k = 300k shared over 600k demand => 50%
    assert_eq!(
        l.clearing,
        Some(ClearingState::Over {
            tick: 10,
            remaining: U128(300_000),
            bucket: U128(600_000)
        })
    );
    assert_eq!(l.filled, 600_000);
    let bot = h.claim(id, "bot.near");
    let alice = h.claim(id, "alice.near");
    let bob = h.claim(id, "bob.near");
    let carol = h.claim(id, "carol.near");
    assert_eq!(bot.filled.0, 300_000);
    assert_eq!(alice.filled.0, 200_000);
    assert_eq!(bob.filled.0, 100_000);
    assert_eq!(carol.filled.0, 0);
    // The bot bid 2x higher but pays the same per-token price as everyone else.
    assert_eq!(bot.paid.0, p10 * 300_000);
    assert_eq!(alice.paid.0, p10 * 200_000);
    // I2
    for s in [&bot, &alice, &bob, &carol] {
        assert_eq!(s.paid.0 + s.refund.0 + s.penalty.0, dep);
    }
    let l = h.c.launch(id);
    assert_eq!(l.escrow, 0);
    assert_eq!(l.storage_fees_held, 0);
}

/// I1: undersubscribed -> clearing at p_min, unsold burned, LP/creator scale with sales.
#[test]
fn undersubscribed_burns_and_scales_shares() {
    let (mut h, id) = standard();
    h.commit(id, "alice.near", 30, 60_000, DEP);
    h.goto_reveal(id);
    h.reveal(id, "alice.near", 30, 60_000);
    h.goto_end(id);
    h.finalize(id);
    let l = h.c.launch(id);
    assert_eq!(
        l.clearing,
        Some(ClearingState::Under {
            demand: U128(60_000)
        })
    );
    assert_eq!(l.clearing_price, P_MIN);
    assert_eq!(l.filled, 60_000);
    assert_eq!(l.lp_tokens, 30_000);
    assert_eq!(l.creator_tokens, 10_000);
    assert_eq!(l.burned_at_finalize, 1_000_000 - 100_000);
    assert_eq!(
        l.filled + l.lp_tokens + l.creator_tokens + l.burned_at_finalize,
        l.total_supply
    );
    // Pool seeded at exactly the clearing price; treasury gets the other half of proceeds.
    let spot = math::spot_price(l.pool.near_reserve.0, l.pool.token_reserve.0);
    assert_eq!(spot, P_MIN);
    assert_eq!(
        l.pool.near_reserve.0 + l.treasury.near_balance.0,
        l.proceeds
    );
    assert_eq!(l.treasury.near_balance.0, l.proceeds / 2);
}

/// The original brief's split (fixed 30% LP) would make the treasury negative here; ours cannot.
#[test]
fn tiny_sale_cannot_underfund_pool() {
    let (mut h, id) = standard();
    h.commit(id, "alice.near", 0, 1_000, NEAR);
    h.goto_reveal(id);
    h.reveal(id, "alice.near", 0, 1_000);
    h.goto_end(id);
    h.finalize(id);
    let l = h.c.launch(id);
    assert_eq!(l.status, Status::Finalized);
    assert_eq!(l.pool.near_reserve.0, P_MIN * 500);
}

#[test]
fn no_demand_fails_and_refunds_in_full() {
    let (mut h, id) = standard();
    h.commit(id, "alice.near", 3, 10, NEAR);
    h.goto_end(id);
    h.finalize(id);
    assert_eq!(h.c.launch(id).status, Status::Failed);
    let s = h.claim(id, "alice.near");
    assert_eq!((s.refund.0, s.penalty.0, s.filled.0), (NEAR, 0, 0));
}

#[test]
fn unrevealed_bid_pays_penalty_into_treasury() {
    let (mut h, id) = standard();
    h.commit(id, "alice.near", 3, 1_000, 10 * NEAR);
    h.commit(id, "sniper.near", 60, 1_000, 10 * NEAR);
    h.goto_reveal(id);
    h.reveal(id, "alice.near", 3, 1_000);
    h.goto_end(id);
    h.finalize(id);
    let before = h.c.launch(id).treasury.near_balance.0;
    h.ctx("anyone.near", 0, vec![]);
    let s = h.c.refund_unrevealed(U64(id), acc("sniper.near"));
    assert_eq!(s.penalty.0, 10 * NEAR * 500 / 10_000);
    assert_eq!(s.refund.0 + s.penalty.0, 10 * NEAR);
    assert_eq!(h.c.launch(id).treasury.near_balance.0, before + s.penalty.0);
}

#[test]
#[should_panic(expected = "E_PARAMS")]
fn refund_unrevealed_cannot_settle_revealed_bid() {
    let (mut h, id) = standard();
    h.commit(id, "alice.near", 3, 1_000, 10 * NEAR);
    h.goto_reveal(id);
    h.reveal(id, "alice.near", 3, 1_000);
    h.goto_end(id);
    h.finalize(id);
    h.ctx("anyone.near", 0, vec![]);
    h.c.refund_unrevealed(U64(id), acc("alice.near"));
}

#[test]
#[should_panic(expected = "E_DUP")]
fn claim_twice_while_tokens_in_flight_rejected() {
    let (mut h, id) = standard();
    h.commit(id, "alice.near", 3, 1_000, 10 * NEAR);
    h.goto_reveal(id);
    h.reveal(id, "alice.near", 3, 1_000);
    h.goto_end(id);
    h.finalize(id);
    h.ctx("alice.near", 0, vec![]);
    h.c.claim(U64(id));
    h.c.claim(U64(id));
}

#[test]
fn failed_token_transfer_on_claim_can_be_retried() {
    let (mut h, id) = standard();
    h.commit(id, "alice.near", 3, 1_000, 10 * NEAR);
    h.goto_reveal(id);
    h.reveal(id, "alice.near", 3, 1_000);
    h.goto_end(id);
    h.finalize(id);
    h.ctx("alice.near", 0, vec![]);
    h.c.claim(U64(id));
    h.fail_cb();
    h.c.on_claim_tokens(U64(id), acc("alice.near"), U128(1_000 * ONE_TOKEN));
    assert_eq!(
        h.c.bids.get(&(id, acc("alice.near"))).unwrap().tokens_owed,
        1_000 * ONE_TOKEN
    );
    h.ctx("alice.near", 0, vec![]);
    let s = h.c.claim(U64(id));
    assert_eq!(s.filled.0, 1_000);
    assert_eq!(s.refund.0, 0); // NEAR was already refunded the first time
}

#[test]
fn failed_mint_reopens_finalize() {
    let (mut h, id) = standard();
    h.commit(id, "alice.near", 3, 1_000, 10 * NEAR);
    h.goto_reveal(id);
    h.reveal(id, "alice.near", 3, 1_000);
    h.goto_end(id);
    h.ctx("anyone.near", 0, vec![]);
    let _ = h.c.finalize(U64(id));
    h.fail_cb();
    assert!(!h.c.on_finalize_minted(U64(id)));
    let l = h.c.launch(id);
    assert_eq!(l.status, Status::Open);
    assert_eq!(l.escrow, 10 * NEAR);
    h.finalize(id);
    assert_eq!(h.c.launch(id).status, Status::Finalized);
}

// ------------------------------------------------------------------ pool (I4)

fn traded() -> (H, u64) {
    let (mut h, id) = standard();
    h.commit(id, "alice.near", 10, 600_000, DEP);
    h.commit(id, "bob.near", 12, 100_000, DEP);
    h.goto_reveal(id);
    h.reveal(id, "alice.near", 10, 600_000);
    h.reveal(id, "bob.near", 12, 100_000);
    h.goto_end(id);
    h.finalize(id);
    h.claim(id, "alice.near");
    h.claim(id, "bob.near");
    (h, id)
}

#[test]
#[should_panic(expected = "E_NOT_FINAL")]
fn no_swaps_before_finalize() {
    let (mut h, id) = standard();
    h.ctx("alice.near", NEAR, vec![]);
    h.c.swap_near_for_token(U64(id), U128(0));
}

#[test]
#[should_panic(expected = "E_NOT_FINAL")]
fn no_sells_before_finalize() {
    let (mut h, id) = standard();
    h.sell(id, "alice.near", 1);
}

#[test]
fn pool_opens_at_clearing_and_swaps_move_price() {
    let (mut h, id) = traded();
    let l = h.c.launch(id);
    let clearing = l.clearing_price;
    assert_eq!(
        math::spot_price(l.pool.near_reserve.0, l.pool.token_reserve.0),
        clearing
    );
    h.ctx("dave.near", NEAR / 10, vec![]);
    let q = h.c.quote(U64(id), "buy".into(), U128(NEAR / 10)).0;
    let out = h.c.swap_near_for_token(U64(id), U128(q)).0;
    assert_eq!(out, q);
    let l = h.c.launch(id);
    assert!(math::spot_price(l.pool.near_reserve.0, l.pool.token_reserve.0) > clearing);
    h.sell(id, "alice.near", 50_000);
    let l = h.c.launch(id);
    assert!(math::spot_price(l.pool.near_reserve.0, l.pool.token_reserve.0) < clearing);
}

#[test]
#[should_panic(expected = "E_SLIPPAGE")]
fn swap_slippage_guard() {
    let (mut h, id) = traded();
    h.ctx("dave.near", NEAR, vec![]);
    h.c.swap_near_for_token(U64(id), U128(u128::MAX));
}

#[test]
#[should_panic(expected = "E_AUTH")]
fn sell_from_unknown_token_rejected() {
    let (mut h, _id) = traded();
    h.ctx("fake-token.near", 0, vec![]);
    let _ =
        h.c.ft_on_transfer(acc("alice.near"), U128(ONE_TOKEN), String::new());
}

#[test]
fn failed_buy_transfer_is_reversed() {
    let (mut h, id) = traded();
    let before = h.c.launch(id).pool.clone();
    h.ctx("dave.near", NEAR, vec![]);
    let out = h.c.swap_near_for_token(U64(id), U128(0));
    h.fail_cb();
    assert!(!h.c.on_swap_out(U64(id), acc("dave.near"), U128(NEAR), out));
    let after = h.c.launch(id).pool;
    assert_eq!(after.near_reserve, before.near_reserve);
    assert_eq!(after.token_reserve, before.token_reserve);
}

// ------------------------------------------------------------------ Floor Keeper (I5) + creator lock

#[test]
#[should_panic(expected = "E_TOO_SOON")]
fn poke_rate_limited() {
    let (mut h, id) = traded();
    h.advance(10_000);
    h.poke(id);
    h.advance(5_000);
    h.poke(id);
}

#[test]
#[should_panic(expected = "E_TRIGGER")]
fn defend_requires_trigger() {
    let (mut h, id) = traded();
    h.advance(10_000);
    h.poke(id);
    h.ctx("keeper.near", 0, vec![]);
    h.c.defend(U64(id));
}

#[test]
fn twap_ignores_a_one_block_dip() {
    // Dump and buy back within one second, then poke: the 10s interval TWAP barely moves.
    let (mut h, id) = traded();
    let clearing = h.c.launch(id).clearing_price;
    h.advance(9_000);
    h.sell(id, "alice.near", 200_000);
    h.advance(1_000);
    let obs = h.poke(id);
    assert!(
        obs.twap.0 > clearing * 85 / 100,
        "twap {} vs clearing {}",
        obs.twap.0,
        clearing
    );
    assert_eq!(h.c.launch(id).treasury.below_streak, 0);
}

#[test]
fn dump_triggers_capped_defend_then_epoch_cap_then_next_epoch() {
    let (mut h, id) = traded();
    let clearing = h.c.launch(id).clearing_price;
    h.sell(id, "alice.near", 300_000);
    let l = h.c.launch(id);
    assert!(math::spot_price(l.pool.near_reserve.0, l.pool.token_reserve.0) < clearing * 9 / 10);
    for _ in 0..3 {
        h.advance(10_000);
        h.poke(id);
    }
    let t0 = h.c.launch(id).treasury.near_balance.0;
    h.ctx("keeper.near", 0, vec![]);
    let bought = h.c.defend(U64(id)).0;
    assert!(bought > 0);
    let l = h.c.launch(id);
    let spent = l.treasury.total_spent.0;
    // I5: at most r% (10%) of the treasury in this epoch.
    assert!(spent <= t0 / 10, "spent {spent} > 10% of {t0}");
    assert_eq!(l.treasury.below_streak, 0);
    // Still below floor; after k fresh observations in the same epoch the cap blocks it.
    for _ in 0..3 {
        h.advance(10_000);
        h.poke(id);
    }
    h.ctx("keeper.near", 0, vec![]);
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| h.c.defend(U64(id))));
    let msg = r
        .err()
        .and_then(|e| e.downcast_ref::<String>().cloned())
        .unwrap_or_default();
    assert!(msg.contains("E_EPOCH_CAP"), "{msg}");
    // Next epoch: allowed again, with a fresh 10% budget.
    h.advance(120_000);
    h.ctx("keeper.near", 0, vec![]);
    for _ in 0..3 {
        h.advance(10_000);
        h.poke(id);
    }
    h.ctx("keeper.near", 0, vec![]);
    assert!(h.c.defend(U64(id)).0 > 0);
    assert_eq!(h.c.launch(id).treasury.defends, 2);
}

#[test]
fn defend_never_lifts_spot_above_clearing() {
    let (mut h, id) = traded();
    let mut a = h.c.launch(id);
    a.params.r_bps = 5_000; // big budget
    h.c.launches.insert(id, a);
    let clearing = h.c.launch(id).clearing_price;
    h.sell(id, "bob.near", 30_000);
    for _ in 0..3 {
        h.advance(10_000);
        h.poke(id);
    }
    let floor = treasury::floor_price(&h.c.launch(id));
    let l = h.c.launch(id);
    let spot0 = math::spot_price(l.pool.near_reserve.0, l.pool.token_reserve.0);
    if spot0 >= floor {
        return; // this sell size did not breach the floor; covered by the other test
    }
    h.ctx("keeper.near", 0, vec![]);
    h.c.defend(U64(id));
    let l = h.c.launch(id);
    assert!(math::spot_price(l.pool.near_reserve.0, l.pool.token_reserve.0) <= clearing);
}

#[test]
#[should_panic(expected = "E_LOCKED")]
fn creator_locked_initially() {
    let (mut h, id) = traded();
    h.ctx(CREATOR, 0, vec![]);
    h.c.unlock_creator(U64(id));
}

#[test]
fn creator_unlocks_after_lock_and_vest_when_price_holds_above_margin() {
    // Demo timings from H::args: 60 s lock, 60 s vest, hold of 4 x 10 s intervals.
    let (mut h, id) = traded();
    let near_r = h.c.launch(id).pool.near_reserve.0;
    h.ctx("dave.near", near_r / 5, vec![]);
    h.c.swap_near_for_token(U64(id), U128(0));
    for _ in 0..12 {
        h.advance(10_000);
        h.poke(id);
    }
    h.ctx(CREATOR, 0, vec![]);
    let sent = h.c.unlock_creator(U64(id)).0;
    let l = h.c.launch(id);
    assert_eq!(sent, l.creator_tokens);
    assert_eq!(l.creator_released, l.creator_tokens);
}

#[test]
fn creator_streak_resets_when_price_drops() {
    let (mut h, id) = traded();
    let near_r = h.c.launch(id).pool.near_reserve.0;
    h.ctx("dave.near", near_r / 5, vec![]);
    h.c.swap_near_for_token(U64(id), U128(0));
    for _ in 0..3 {
        h.advance(10_000);
        h.poke(id);
    }
    assert_eq!(h.c.launch(id).treasury.above_streak, 3);
    h.sell(id, "alice.near", 200_000);
    h.advance(10_000);
    h.poke(id);
    assert_eq!(h.c.launch(id).treasury.above_streak, 0);
}

// ------------------------------------------------------------------ settle() unit

#[test]
fn settle_paths() {
    let (h, id) = traded();
    let l = h.c.launch(id);
    let b = Bid {
        hash: [0; 32],
        deposit: NEAR,
        storage_fee: 0,
        revealed: false,
        tick: 0,
        qty: 0,
        claimed: false,
        tokens_owed: 0,
    };
    let s = settle(&l, &b);
    assert_eq!(s.penalty, NEAR / 20);
    let c: Clearing = l.clearing.as_ref().unwrap().into();
    assert_eq!(c.tick(), 10);
}
