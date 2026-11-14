//! Creator-lock tests. Review finding: with `h_obs = 1` and a 1 s poke interval the creator could
//! release the allocation seconds after launch, because the pool opens exactly at the clearing
//! price and "at or above clearing" was the hold condition. Required properties:
//! - production launches cannot set the lock, the vest, the hold window or the Floor Keeper
//!   cadence below protocol minimums;
//! - no creator token moves before `finalized_ms + creator_lock_ms` (lock >= MIN_CREATOR_LOCK_MS);
//! - an interval counts as holding only at or above `clearing * (1 + UNLOCK_MARGIN_BPS)`;
//! - after the lock the allocation vests linearly, and a release needs the price to hold;
//! - demo timings exist only on a factory initialised with `demo` on a `.testnet` account.

use super::*;
use crate::tests::{acc, set_ctx, CREATOR, DEP, FACTORY, H, NEAR};
use near_sdk::json_types::{U128, U64};
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;
use proptest::prelude::*;
use std::panic::{catch_unwind, AssertUnwindSafe};

/// Production launch: every timing left to the protocol defaults.
fn prod_args(total: u128) -> CreateLaunchArgs {
    let mut a = H::args(total);
    a.demo = None;
    a.k_obs = None;
    a.h_obs = None;
    a.epoch_secs = None;
    a.poke_interval_secs = None;
    a.creator_lock_secs = None;
    a.creator_vest_secs = None;
    a
}

/// Demo launch on a testnet factory: 10 s pokes, a hold of 3 intervals, short lock and vest.
fn demo_args(total: u128, lock_secs: u32, vest_secs: u32) -> CreateLaunchArgs {
    let mut a = H::args(total);
    a.demo = Some(true);
    a.k_obs = Some(2);
    a.h_obs = Some(3);
    a.poke_interval_secs = Some(10);
    a.epoch_secs = Some(60);
    a.creator_lock_secs = Some(lock_secs);
    a.creator_vest_secs = Some(vest_secs);
    a
}

fn panic_msg<R>(f: impl FnOnce() -> R) -> Option<String> {
    catch_unwind(AssertUnwindSafe(f))
        .err()
        .map(|e| e.downcast_ref::<String>().cloned().unwrap_or_default())
}

/// Launch, two bidders fill the 600k sale at tick 10, finalize, claim.
fn finalized(a: CreateLaunchArgs) -> (H, u64) {
    let mut h = H::new();
    let id = h.launch(a);
    h.commit(id, "alice.near", 10, 500_000, DEP);
    h.commit(id, "bob.near", 12, 100_000, DEP);
    h.goto_reveal(id);
    h.reveal(id, "alice.near", 10, 500_000);
    h.reveal(id, "bob.near", 12, 100_000);
    h.goto_end(id);
    h.finalize(id);
    h.claim(id, "alice.near");
    h.claim(id, "bob.near");
    (h, id)
}

/// Buy with `frac_bps` of the pool's NEAR. 2,000 bps lifts spot to about 1.44x clearing.
fn pump(h: &mut H, id: u64, frac_bps: u128) {
    let near_r = h.c.launch(id).pool.near_reserve.0;
    h.ctx("whale.near", near_r * frac_bps / 10_000, vec![]);
    h.c.swap_near_for_token(U64(id), U128(0));
}

fn poke_for(h: &mut H, id: u64, n: u64) {
    let every = h.c.launch(id).params.poke_interval_ms;
    for _ in 0..n {
        h.advance(every);
        h.poke(id);
    }
}

/// Creator calls `unlock_creator`; on success the token transfer callback succeeds too.
fn try_unlock(h: &mut H, id: u64) -> Result<u128, String> {
    h.ctx(CREATOR, 0, vec![]);
    match catch_unwind(AssertUnwindSafe(|| h.c.unlock_creator(U64(id)).0)) {
        Ok(v) => {
            h.ok_cb();
            assert!(h.c.on_creator_tokens(U64(id), U128(v)));
            Ok(v)
        }
        Err(e) => Err(e.downcast_ref::<String>().cloned().unwrap_or_default()),
    }
}

// ------------------------------------------------------------------ parameter minimums

#[test]
fn production_rejects_h1_with_1s_poke() {
    let mut h = H::new();
    let mut a = prod_args(1_000_000);
    a.h_obs = Some(1);
    a.poke_interval_secs = Some(1);
    h.ctx(CREATOR, NEAR, vec![]);
    let msg = panic_msg(|| h.c.create_launch(a)).expect("h_obs = 1 / poke = 1 s must be rejected");
    assert!(msg.contains("E_PARAMS"), "{msg}");
}

#[test]
fn production_rejects_values_below_each_minimum() {
    type Tweak = fn(&mut CreateLaunchArgs);
    let cases: [(&str, Tweak); 8] = [
        ("lock 1 h", |a| a.creator_lock_secs = Some(3_600)),
        ("lock 0", |a| a.creator_lock_secs = Some(0)),
        ("vest 1 h", |a| a.creator_vest_secs = Some(3_600)),
        ("k_obs 1", |a| a.k_obs = Some(1)),
        ("trigger 3 min", |a| {
            a.k_obs = Some(3);
            a.poke_interval_secs = Some(60);
        }),
        ("epoch 60 s", |a| a.epoch_secs = Some(60)),
        ("poke 10 s", |a| a.poke_interval_secs = Some(10)),
        ("hold 1 day", |a| {
            a.poke_interval_secs = Some(3_600);
            a.h_obs = Some(24);
        }),
    ];
    for (name, tweak) in cases {
        let mut h = H::new();
        let mut a = prod_args(1_000_000);
        tweak(&mut a);
        h.ctx(CREATOR, NEAR, vec![]);
        let msg = panic_msg(|| h.c.create_launch(a)).unwrap_or_else(|| panic!("{name}: accepted"));
        assert!(msg.contains("E_PARAMS"), "{name}: {msg}");
    }
}

#[test]
fn production_defaults_meet_the_minimums() {
    let mut h = H::new();
    let id = h.launch(prod_args(1_000_000));
    let p = h.c.launch(id).params;
    assert!(!p.demo);
    assert_eq!(p.creator_lock_ms, DEFAULT_CREATOR_LOCK_MS);
    assert_eq!(p.creator_vest_ms, DEFAULT_CREATOR_VEST_MS);
    assert!(p.creator_lock_ms >= MIN_CREATOR_LOCK_MS);
    assert!(p.creator_vest_ms >= MIN_CREATOR_VEST_MS);
    assert!(p.k_obs >= MIN_K_OBS);
    assert!(p.k_obs as u64 * p.poke_interval_ms >= MIN_TRIGGER_MS);
    assert!(p.epoch_ms >= MIN_EPOCH_MS);
    assert!(p.poke_interval_ms >= MIN_POKE_INTERVAL_MS);
    assert!(p.h_obs as u64 * p.poke_interval_ms >= MIN_HOLD_MS);
}

#[test]
fn demo_timings_need_a_testnet_factory() {
    // A factory without demo_allowed refuses demo launches.
    let mut h = H::new();
    h.c.demo_allowed = false;
    h.ctx(CREATOR, NEAR, vec![]);
    let msg = panic_msg(|| h.c.create_launch(demo_args(1_000_000, 60, 60)))
        .expect("demo launch on a production factory must be refused");
    assert!(msg.contains("E_PARAMS"), "{msg}");
    // demo_allowed can only be set on a .testnet account.
    set_ctx(1_000_000, FACTORY, 0, vec![]);
    let msg = panic_msg(|| SlowCook::new(acc(FACTORY), Some(true)))
        .expect("demo init on a non-testnet account must fail");
    assert!(msg.contains("E_PARAMS"), "{msg}");
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("slowcook-demo.testnet"));
    testing_env!(b.build());
    assert!(SlowCook::new(acc("slowcook-demo.testnet"), Some(true)).demo_allowed);
    assert!(!SlowCook::new(acc("slowcook-demo.testnet"), None).demo_allowed);
}

#[test]
fn demo_launches_still_need_a_lock_and_a_vest() {
    for (lock, vest) in [(0, 60), (5, 60), (60, 0)] {
        let mut h = H::new();
        h.ctx(CREATOR, NEAR, vec![]);
        let msg = panic_msg(|| h.c.create_launch(demo_args(1_000_000, lock, vest)))
            .unwrap_or_else(|| panic!("lock {lock} s / vest {vest} s accepted"));
        assert!(msg.contains("E_PARAMS"), "{msg}");
    }
}

// ------------------------------------------------------------------ lock and vest

#[test]
fn creator_cannot_unlock_before_the_lock_even_if_price_holds() {
    // 14-day lock; price held well above the margin for the full 7-day hold window.
    let mut a = prod_args(1_000_000);
    a.creator_lock_secs = Some(14 * 86_400);
    let (mut h, id) = finalized(a);
    pump(&mut h, id, 2_000);
    let h_obs = h.c.launch(id).params.h_obs as u64;
    poke_for(&mut h, id, h_obs);
    let l = h.c.launch(id);
    assert!(
        l.treasury.above_streak as u64 >= h_obs,
        "price held for the hold window"
    );
    assert!(h.now_ms < l.finalized_ms + 14 * DAY_MS);
    let err = try_unlock(&mut h, id).expect_err("lock not over");
    assert!(err.contains("E_LOCKED"), "{err}");
    assert_eq!(h.c.launch(id).creator_released, 0);
}

#[test]
fn pool_resting_at_clearing_is_not_holding() {
    // Nobody trades: the pool sits exactly at clearing for the whole lock and vest.
    let (mut h, id) = finalized(demo_args(1_000_000, 60, 60));
    poke_for(&mut h, id, 20);
    assert_eq!(h.c.launch(id).treasury.above_streak, 0);
    let err = try_unlock(&mut h, id).expect_err("no margin above clearing");
    assert!(err.contains("E_LOCKED"), "{err}");
}

#[test]
fn production_unlock_after_lock_vests_with_sustained_price() {
    let (mut h, id) = finalized(prod_args(1_000_000));
    pump(&mut h, id, 2_000);
    let l = h.c.launch(id);
    let (total, lock_end) = (l.creator_tokens, l.finalized_ms + l.params.creator_lock_ms);
    let per_day = DAY_MS / l.params.poke_interval_ms;
    // Day 7: lock over and hold met, but nothing has vested yet.
    poke_for(&mut h, id, 7 * per_day);
    assert_eq!(h.now_ms, lock_end);
    assert!(try_unlock(&mut h, id)
        .expect_err("nothing vested")
        .contains("E_LOCKED"));
    // Day 22: 15 of 30 vest days have passed.
    poke_for(&mut h, id, 15 * per_day);
    assert_eq!(try_unlock(&mut h, id).expect("half vested"), total / 2);
    // Day 37: the rest, and nothing beyond the allocation.
    poke_for(&mut h, id, 15 * per_day);
    assert_eq!(
        try_unlock(&mut h, id).expect("fully vested"),
        total - total / 2
    );
    assert_eq!(h.c.launch(id).creator_released, total);
    assert!(try_unlock(&mut h, id).is_err());
}

#[test]
fn demo_unlock_vests_linearly_after_the_lock() {
    let (mut h, id) = finalized(demo_args(1_000_000, 60, 100));
    pump(&mut h, id, 2_000);
    let l = h.c.launch(id);
    let (total, lock_end) = (l.creator_tokens, l.finalized_ms + 60_000);
    poke_for(&mut h, id, 6);
    assert_eq!(h.now_ms, lock_end);
    poke_for(&mut h, id, 5);
    assert_eq!(try_unlock(&mut h, id).expect("half vested"), total / 2);
    assert!(try_unlock(&mut h, id)
        .expect_err("nothing new")
        .contains("E_LOCKED"));
    poke_for(&mut h, id, 6);
    assert_eq!(
        try_unlock(&mut h, id).expect("fully vested"),
        total - total / 2
    );
}

#[test]
fn release_blocked_while_price_below_margin() {
    let (mut h, id) = finalized(demo_args(1_000_000, 60, 100));
    pump(&mut h, id, 2_000);
    poke_for(&mut h, id, 8);
    // A dump breaks the streak: no release until h_obs fresh intervals hold again.
    h.sell(id, "alice.near", 200_000);
    poke_for(&mut h, id, 1);
    assert_eq!(h.c.launch(id).treasury.above_streak, 0);
    assert!(try_unlock(&mut h, id)
        .expect_err("streak broken")
        .contains("E_LOCKED"));
}

#[test]
fn failed_creator_transfer_returns_only_that_amount() {
    let (mut h, id) = finalized(demo_args(1_000_000, 60, 100));
    pump(&mut h, id, 2_000);
    poke_for(&mut h, id, 11);
    h.ctx(CREATOR, 0, vec![]);
    let sent = h.c.unlock_creator(U64(id)).0;
    assert!(sent > 0);
    h.fail_cb();
    assert!(!h.c.on_creator_tokens(U64(id), U128(sent)));
    assert_eq!(h.c.launch(id).creator_released, 0);
}

// ------------------------------------------------------------------ property: never early

proptest! {
    #![proptest_config(ProptestConfig {
        cases: std::env::var("PROPTEST_CASES").ok().and_then(|v| v.parse().ok()).unwrap_or(64),
        failure_persistence: None,
        .. ProptestConfig::default()
    })]

    /// Random production launches and random histories (time jumps, pumps, dumps, pokes, unlock
    /// attempts): creator tokens never move before finalized_at + lock, the lock is never under
    /// MIN_CREATOR_LOCK_MS, and the total released never exceeds the vested amount.
    #[test]
    fn creator_never_paid_before_min_lock(
        lock_days in 0u32..=21,
        // Half the cases try a short hold (the reported bypass), half a valid one.
        hold_hours in prop_oneof![1u32..=12, 168u32..=400],
        steps in prop::collection::vec((0u8..6, 1u64..=48), 5..60),
    ) {
        let mut a = prod_args(1_000_000);
        a.creator_lock_secs = Some(lock_days * 86_400);
        a.poke_interval_secs = Some(3_600);
        a.h_obs = Some(hold_hours);
        let mut h = H::new();
        h.ctx(CREATOR, NEAR, vec![]);
        if catch_unwind(AssertUnwindSafe(|| h.c.create_launch(a.clone()))).is_err() {
            // Rejected at creation: only allowed when a value is under a minimum.
            prop_assert!(
                (lock_days as u64) * DAY_MS < MIN_CREATOR_LOCK_MS
                    || hold_hours as u64 * 3_600_000 < MIN_HOLD_MS
            );
            return Ok(());
        }
        let (mut h, id) = finalized(a);
        let fin = h.c.launch(id).finalized_ms;
        for (op, hours) in steps {
            h.advance(hours * 3_600_000);
            match op {
                0 => pump(&mut h, id, 500),
                1 => { h.sell(id, "alice.near", 20_000); }
                2..=4 => { h.poke(id); }
                _ => { let _ = try_unlock(&mut h, id); }
            }
            let l = h.c.launch(id);
            if l.creator_released > 0 {
                prop_assert!(h.now_ms >= fin + MIN_CREATOR_LOCK_MS);
                prop_assert!(h.now_ms >= fin + l.params.creator_lock_ms);
            }
            let vest_start = fin + l.params.creator_lock_ms;
            let vested = if h.now_ms < vest_start {
                0
            } else {
                l.creator_tokens * (h.now_ms - vest_start).min(l.params.creator_vest_ms) as u128
                    / l.params.creator_vest_ms as u128
            };
            prop_assert!(l.creator_released <= vested);
        }
    }
}
