//! Parity harness: the TypeScript model (sim/src/clearing.ts) and the contract must agree exactly.
//!
//! `pnpm -C sim parity` writes sim/fixtures/parity.json (1000 random auctions with the TS-computed
//! clearing, fills, payments and refunds). This test:
//! 1. replays all cases through the contract's pure math (`math.rs`) and the commit hash, and
//! 2. replays the first `PARITY_CONTRACT_CASES` (default 100) through the full contract flow
//!    (create_launch -> commit -> reveal -> finalize -> claim) in the mocked VM.

use crate::launch::*;
use crate::math::{self, Clearing};
use crate::tests::{H, NEAR};
use near_sdk::json_types::U128;
use near_sdk::serde_json::Value;

fn u(v: &Value) -> u128 {
    v.as_str().unwrap().parse().unwrap()
}

fn load() -> Vec<Value> {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../sim/fixtures/parity.json"
    );
    let raw = std::fs::read_to_string(path)
        .unwrap_or_else(|_| panic!("missing {path}: run `pnpm -C sim parity` first"));
    near_sdk::serde_json::from_str(&raw).unwrap()
}

#[test]
fn parity_pure_math_all_cases() {
    let cases = load();
    assert!(
        cases.len() >= 1000,
        "expected >= 1000 parity cases, got {}",
        cases.len()
    );
    for c in &cases {
        let seed = c["seed"].as_u64().unwrap();
        let inp = &c["input"];
        let exp = &c["expected"];
        let total = u(&inp["total_supply"]);
        let sale = total * inp["sale_bps"].as_u64().unwrap() as u128 / 10_000;
        let lp_max = total * inp["lp_bps"].as_u64().unwrap() as u128 / 10_000;
        let creator_max = total - sale - lp_max;
        let prices = math::tick_prices(
            u(&inp["p_min"]),
            inp["tick_factor_bps"].as_u64().unwrap() as u128,
            NUM_TICKS,
        )
        .unwrap();
        let bids: Vec<(u8, u128, u128)> = inp["bids"]
            .as_array()
            .unwrap()
            .iter()
            .map(|b| {
                (
                    b["tick"].as_u64().unwrap() as u8,
                    u(&b["qty"]),
                    u(&b["deposit"]),
                )
            })
            .collect();
        // Commit hash: same preimage, same sha256 on both sides.
        for (i, b) in inp["bids"].as_array().unwrap().iter().enumerate() {
            let hs = b["hash_salt"].as_str().unwrap();
            let (hash, salt) = hs.split_once(':').unwrap();
            let pre =
                math::commit_preimage(seed, &format!("b{i}.near"), bids[i].0, bids[i].1, salt);
            assert_eq!(
                hex::encode(near_sdk::env::sha256(pre.as_bytes())),
                hash,
                "seed {seed} bid {i} hash"
            );
        }
        let mut buckets = vec![0u128; NUM_TICKS];
        for (t, q, _) in &bids {
            buckets[*t as usize] += q;
        }
        let cl = math::compute_clearing(&buckets, sale);
        let kind = match cl {
            Clearing::NoDemand => "NoDemand",
            Clearing::Under { .. } => "Under",
            Clearing::Over { .. } => "Over",
        };
        assert_eq!(kind, exp["clearing_kind"].as_str().unwrap(), "seed {seed}");
        assert_eq!(
            cl.tick() as u64,
            exp["clearing_tick"].as_u64().unwrap(),
            "seed {seed}"
        );
        let marginal: Vec<u128> = bids
            .iter()
            .filter(|(t, _, _)| *t == cl.tick())
            .map(|(_, q, _)| *q)
            .collect();
        let filled = math::total_filled(&cl, sale, &marginal);
        let price = prices[cl.tick() as usize];
        let lp = math::mul_div(filled, lp_max, sale).unwrap();
        let cr = math::mul_div(filled, creator_max, sale).unwrap();
        assert_eq!(price, u(&exp["clearing_price"]), "seed {seed}");
        assert_eq!(filled, u(&exp["filled"]), "seed {seed}");
        assert_eq!(lp, u(&exp["lp_tokens"]), "seed {seed}");
        assert_eq!(cr, u(&exp["creator_tokens"]), "seed {seed}");
        assert_eq!(total - filled - lp - cr, u(&exp["burned"]), "seed {seed}");
        assert_eq!(price * filled, u(&exp["proceeds"]), "seed {seed}");
        assert_eq!(price * lp, u(&exp["lp_near"]), "seed {seed}");
        for (i, (t, q, d)) in bids.iter().enumerate() {
            let a = &exp["allocations"][i];
            let f = math::fill_for(&cl, *t, *q);
            assert_eq!(f, u(&a["filled"]), "seed {seed} bid {i}");
            assert_eq!(price * f, u(&a["paid"]), "seed {seed} bid {i}");
            assert_eq!(d - price * f, u(&a["refund"]), "seed {seed} bid {i}");
        }
    }
}

#[test]
fn parity_full_contract_flow() {
    let n: usize = std::env::var("PARITY_CONTRACT_CASES")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(100);
    for c in load().iter().take(n) {
        let seed = c["seed"].as_u64().unwrap();
        let inp = &c["input"];
        let exp = &c["expected"];
        let mut h = H::new();
        let mut a = H::args(u(&inp["total_supply"]));
        a.sale_bps = inp["sale_bps"].as_u64().unwrap() as u16;
        a.lp_bps = inp["lp_bps"].as_u64().unwrap() as u16;
        a.creator_bps = inp["creator_bps"].as_u64().unwrap() as u16;
        a.p_min = U128(u(&inp["p_min"]));
        a.tick_factor_bps = Some(inp["tick_factor_bps"].as_u64().unwrap() as u16);
        let id = h.launch(a);
        let bids = inp["bids"].as_array().unwrap();
        for (i, b) in bids.iter().enumerate() {
            h.commit(
                id,
                &format!("b{i}.near"),
                b["tick"].as_u64().unwrap() as u8,
                u(&b["qty"]),
                u(&b["deposit"]),
            );
        }
        h.goto_reveal(id);
        for (i, b) in bids.iter().enumerate() {
            h.reveal(
                id,
                &format!("b{i}.near"),
                b["tick"].as_u64().unwrap() as u8,
                u(&b["qty"]),
            );
        }
        h.goto_end(id);
        h.finalize(id);
        let l = h.c.launch(id);
        assert_eq!(l.status, Status::Finalized, "seed {seed}");
        assert_eq!(l.clearing_price, u(&exp["clearing_price"]), "seed {seed}");
        assert_eq!(l.filled, u(&exp["filled"]), "seed {seed}");
        assert_eq!(l.burned_at_finalize, u(&exp["burned"]), "seed {seed}");
        assert_eq!(l.pool.near_reserve.0, u(&exp["lp_near"]), "seed {seed}");
        assert_eq!(
            l.treasury.near_balance.0,
            u(&exp["treasury_near"]),
            "seed {seed}"
        );
        for (i, _) in bids.iter().enumerate() {
            let s = h.claim(id, &format!("b{i}.near"));
            let a = &exp["allocations"][i];
            assert_eq!(s.filled.0, u(&a["filled"]), "seed {seed} bid {i}");
            assert_eq!(s.paid.0, u(&a["paid"]), "seed {seed} bid {i}");
            assert_eq!(s.refund.0, u(&a["refund"]), "seed {seed} bid {i}");
        }
        assert_eq!(h.c.launch(id).escrow, 0, "seed {seed}");
    }
    let _ = NEAR;
}
