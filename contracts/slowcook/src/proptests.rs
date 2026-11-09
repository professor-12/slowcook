//! Property tests: random auctions with good, bad and missing reveals, over- and under-deposits,
//! then finalize and claim everyone. Checks I1, I2, I3 and I6 after the run, and compares the
//! clearing price with an independent brute-force oracle.
//! Case count: `PROPTEST_CASES` (CI runs 1000).

use crate::auction::settle;
use crate::launch::*;
use crate::math::{self, ONE_TOKEN};
use crate::tests::{acc, H, NEAR};
use near_sdk::json_types::{U128, U64};
use proptest::prelude::*;
use std::panic::{catch_unwind, AssertUnwindSafe};

#[derive(Clone, Debug)]
enum RevealMode {
    Correct,
    WrongSalt,
    WrongQty,
    None,
}

#[derive(Clone, Debug)]
struct BidSpec {
    tick: u8,
    qty_frac: u32, // per-mille of sale supply, 1..=400
    over_deposit_pct: u32,
    under: bool,
    reveal: RevealMode,
}

fn bid_strategy() -> impl Strategy<Value = BidSpec> {
    (
        0u8..64,
        1u32..=400,
        0u32..200,
        prop::bool::weighted(0.08),
        prop_oneof![
            8 => Just(RevealMode::Correct),
            1 => Just(RevealMode::WrongSalt),
            1 => Just(RevealMode::WrongQty),
            1 => Just(RevealMode::None),
        ],
    )
        .prop_map(
            |(tick, qty_frac, over_deposit_pct, under, reveal)| BidSpec {
                tick,
                qty_frac,
                over_deposit_pct,
                under,
                reveal,
            },
        )
}

/// Oracle: the highest tick price at which demand at-or-above it covers the sale; else p_min.
fn oracle_clearing_tick(buckets: &[u128], sale: u128) -> Option<u8> {
    let mut best = None;
    for t in 0..buckets.len() {
        let demand: u128 = buckets[t..].iter().sum();
        if demand >= sale && buckets[t] > 0 {
            best = Some(t as u8);
        }
    }
    best
}

fn expect_panic<F: FnOnce()>(f: F) -> String {
    let r = catch_unwind(AssertUnwindSafe(f));
    match r {
        Ok(()) => panic!("expected a panic"),
        Err(e) => e
            .downcast_ref::<String>()
            .cloned()
            .or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string()))
            .unwrap_or_default(),
    }
}

proptest! {
    #![proptest_config(ProptestConfig {
        cases: std::env::var("PROPTEST_CASES").ok().and_then(|v| v.parse().ok()).unwrap_or(200),
        failure_persistence: None,
        .. ProptestConfig::default()
    })]

    #[test]
    fn random_auctions_hold_invariants(
        total in 1_000u128..20_000_000,
        sale_bps in 3_000u16..=8_000,
        creator_bps in 0u16..=1_000,
        bids in prop::collection::vec(bid_strategy(), 1..24),
    ) {
        let lp_bps = 10_000 - sale_bps - creator_bps;
        prop_assume!(lp_bps > 0 && lp_bps <= sale_bps);
        let mut h = H::new();
        let mut a = H::args(total);
        a.sale_bps = sale_bps;
        a.lp_bps = lp_bps;
        a.creator_bps = creator_bps;
        let id = h.launch(a);
        let sale = h.c.launch(id).sale_supply;
        prop_assume!(sale > 0);

        let names: Vec<String> = (0..bids.len()).map(|i| format!("bidder{i}.near")).collect();
        let mut deposits = vec![0u128; bids.len()];
        let mut qtys = vec![0u128; bids.len()];
        for (i, b) in bids.iter().enumerate() {
            let qty = (sale * b.qty_frac as u128 / 1_000).max(1);
            qtys[i] = qty;
            let cost = h.price(id, b.tick) * qty;
            let dep = if b.under {
                cost.saturating_sub(1).max(crate::MIN_BID_DEPOSIT.as_yoctonear())
            } else {
                (cost + cost * b.over_deposit_pct as u128 / 100).max(crate::MIN_BID_DEPOSIT.as_yoctonear())
            };
            deposits[i] = dep;
            h.commit(id, &names[i], b.tick, qty, dep);
        }

        h.goto_reveal(id);
        let mut revealed = vec![false; bids.len()];
        for (i, b) in bids.iter().enumerate() {
            let who = names[i].clone();
            let cost = h.price(id, b.tick) * qtys[i];
            match b.reveal {
                RevealMode::Correct => {
                    if deposits[i] >= cost {
                        h.reveal(id, &who, b.tick, qtys[i]);
                        revealed[i] = true;
                        // I6: second reveal always rejected
                        let msg = expect_panic(|| h.reveal(id, &who, b.tick, qtys[i]));
                        prop_assert!(msg.contains("E_DUP"), "{}", msg);
                    } else {
                        let msg = expect_panic(|| h.reveal(id, &who, b.tick, qtys[i]));
                        prop_assert!(msg.contains("E_DEPOSIT"), "{}", msg);
                    }
                }
                RevealMode::WrongSalt => {
                    let before = h.c.launch(id).buckets.clone();
                    let msg = expect_panic(|| {
                        h.ctx(&who, 0, vec![]);
                        h.c.reveal(U64(id), b.tick, U128(qtys[i]), "ab".repeat(32));
                    });
                    prop_assert!(msg.contains("E_HASH"), "{}", msg);
                    prop_assert_eq!(&before, &h.c.launch(id).buckets);
                }
                RevealMode::WrongQty => {
                    let msg = expect_panic(|| h.reveal(id, &who, b.tick, qtys[i] + 1));
                    prop_assert!(msg.contains("E_HASH") || msg.contains("E_PARAMS"), "{}", msg);
                }
                RevealMode::None => {}
            }
        }

        // Oracle check on the revealed book.
        let buckets = h.c.launch(id).buckets.clone();
        let expected_tick = oracle_clearing_tick(&buckets, sale);

        h.goto_end(id);
        h.finalize(id);
        let l = h.c.launch(id);
        let demand: u128 = buckets.iter().sum();
        if demand == 0 {
            prop_assert_eq!(l.status, Status::Failed);
        } else {
            prop_assert_eq!(l.status, Status::Finalized);
            let ct = expected_tick.unwrap_or(0);
            prop_assert_eq!(l.clearing_price, h.price(id, ct));
            // I1
            let marginal_bids = bids.iter().enumerate()
                .filter(|(i, b)| revealed[*i] && b.tick == ct).count() as u128;
            let ideal = sale.min(demand);
            prop_assert!(l.filled <= ideal && ideal - l.filled < marginal_bids.max(1));
            prop_assert_eq!(l.filled + l.lp_tokens + l.creator_tokens + l.burned_at_finalize, total);
            prop_assert_eq!(l.pool.near_reserve.0 + l.treasury.near_balance.0, l.proceeds);
            prop_assert_eq!(
                math::spot_price(l.pool.near_reserve.0, l.pool.token_reserve.0),
                if l.lp_tokens > 0 { l.clearing_price } else { 0 }
            );
        }

        // Claim everyone; I2 per bidder, sum checks for I3.
        let mut sum_paid = 0u128;
        let mut sum_pen = 0u128;
        let mut sum_filled = 0u128;
        for (i, name) in names.iter().enumerate() {
            let l = h.c.launch(id);
            let b = h.c.bids.get(&(id, acc(name))).cloned().unwrap();
            let expect = settle(&l, &b);
            let s = h.claim(id, name);
            prop_assert_eq!(s.paid.0 + s.refund.0 + s.penalty.0, deposits[i]);
            prop_assert_eq!(s.paid.0, l.clearing_price * s.filled.0);
            prop_assert_eq!(s.filled.0, expect.filled);
            if !revealed[i] {
                prop_assert_eq!(s.filled.0, 0);
            }
            sum_paid += s.paid.0;
            sum_pen += s.penalty.0;
            sum_filled += s.filled.0;
            // After a successful claim the bid record is gone.
            prop_assert!(h.c.bids.get(&(id, acc(name))).is_none());
        }
        let l = h.c.launch(id);
        prop_assert_eq!(l.escrow, 0);
        prop_assert_eq!(l.storage_fees_held, 0);
        prop_assert_eq!(sum_filled, l.filled);
        prop_assert_eq!(sum_paid, l.proceeds);
        // I3: everything NEAR-denominated still held equals proceeds + penalties.
        if l.status == Status::Finalized {
            prop_assert_eq!(l.pool.near_reserve.0 + l.treasury.near_balance.0, sum_paid + sum_pen);
        }
        let _ = ONE_TOKEN;
        let _ = NEAR;
    }
}
