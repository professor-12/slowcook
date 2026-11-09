//! Post-launch constant-product pool (x*y=k, 0.3% fee to locked liquidity), seeded at exactly the
//! clearing price. Every swap first advances the time-weighted price accumulator, so the Floor
//! Keeper sees how long each price lasted, not just the price at the moment someone pokes.

use crate::errors::*;
use crate::launch::*;
use crate::math;
use crate::*;
use near_sdk::json_types::{U128, U64};
use near_sdk::serde::Deserialize;
use near_sdk::serde_json::{self, json};
use near_sdk::{env, near, AccountId, NearToken, Promise, PromiseOrValue};

#[derive(Deserialize, Default)]
#[serde(crate = "near_sdk::serde")]
struct SwapMsg {
    launch_id: Option<U64>,
    min_out: Option<U128>,
}

/// Advance the accumulator to `now`: cumulative += spot * elapsed_ms (wrapping; only differences
/// between two readings are meaningful, and they are exact while one interval's sum fits in u128).
pub fn accumulate(p: &mut Pool, now: u64) {
    let dt = now.saturating_sub(p.last_update_ms.0);
    if dt > 0 {
        let spot = math::spot_price(p.near_reserve.0, p.token_reserve.0);
        p.price_cumulative = U128(
            p.price_cumulative
                .0
                .wrapping_add(spot.wrapping_mul(dt as u128)),
        );
        p.last_update_ms = U64(now);
    }
}

/// Buy tokens with NEAR inside the pool. Returns tokens out (base units).
pub fn buy(p: &mut Pool, near_in: u128) -> u128 {
    let out = math::amount_out(near_in, p.near_reserve.0, p.token_reserve.0, POOL_FEE_BPS);
    p.near_reserve = U128(p.near_reserve.0 + near_in);
    p.token_reserve = U128(p.token_reserve.0 - out);
    out
}

/// Sell tokens for NEAR inside the pool. Returns NEAR out (yocto).
pub fn sell(p: &mut Pool, tokens_in: u128) -> u128 {
    let out = math::amount_out(tokens_in, p.token_reserve.0, p.near_reserve.0, POOL_FEE_BPS);
    p.token_reserve = U128(p.token_reserve.0 + tokens_in);
    p.near_reserve = U128(p.near_reserve.0 - out);
    out
}

#[near]
impl SlowCook {
    /// Buy launch tokens with the attached NEAR.
    #[payable]
    pub fn swap_near_for_token(&mut self, launch_id: U64, min_out: U128) -> U128 {
        let mut l = self.launch(launch_id.0);
        ensure(
            l.status == Status::Finalized,
            E_NOT_FINAL,
            "trading not open",
        );
        let near_in = env::attached_deposit().as_yoctonear();
        ensure(near_in > 0, E_DEPOSIT, "attach NEAR to swap");
        let user = env::predecessor_account_id();
        accumulate(&mut l.pool, now_ms());
        let spot_before = math::spot_price(l.pool.near_reserve.0, l.pool.token_reserve.0);
        let out = buy(&mut l.pool, near_in);
        ensure(
            out > 0 && out >= min_out.0,
            E_SLIPPAGE,
            "output below min_out",
        );
        events::emit(
            "swap",
            json!({
                "launch_id": l.id, "account": user, "side": "buy", "near": U128(near_in),
                "tokens": U128(out), "spot_before": U128(spot_before),
                "spot_after": U128(math::spot_price(l.pool.near_reserve.0, l.pool.token_reserve.0)),
            }),
        );
        let token = l.token_id.clone();
        let id = l.id;
        self.launches.insert(id, l);
        ext_token::ext(token)
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_TOKEN_CALL)
            .ft_transfer(user.clone(), U128(out), Some("slowcook swap".into()))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_swap_out(U64(id), user, U128(near_in), U128(out)),
            )
            .detach();
        U128(out)
    }

    /// If the token transfer of a buy failed, undo it: tokens back to the reserve, NEAR back to the user.
    #[private]
    pub fn on_swap_out(
        &mut self,
        launch_id: U64,
        user: AccountId,
        near_in: U128,
        tokens_out: U128,
    ) -> bool {
        if promise_ok() {
            return true;
        }
        let mut l = self.launch(launch_id.0);
        accumulate(&mut l.pool, now_ms());
        l.pool.token_reserve = U128(l.pool.token_reserve.0 + tokens_out.0);
        l.pool.near_reserve = U128(l.pool.near_reserve.0 - near_in.0);
        self.launches.insert(l.id, l);
        Promise::new(user)
            .transfer(NearToken::from_yoctonear(near_in.0))
            .detach();
        false
    }

    /// NEP-141 receiver: selling tokens. Only the launch's own token contract may call this.
    /// `msg` = `{"launch_id":"<id>","min_out":"<yocto>"}`. Panicking here makes the token refund
    /// the sender in `ft_resolve_transfer`.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let token = env::predecessor_account_id();
        let id = self
            .token_to_launch
            .get(&token)
            .copied()
            .unwrap_or_else(|| fail(E_AUTH, "unknown token"));
        let m: SwapMsg = if msg.is_empty() {
            SwapMsg::default()
        } else {
            serde_json::from_str(&msg).unwrap_or_else(|_| fail(E_PARAMS, "bad msg"))
        };
        if let Some(lid) = m.launch_id {
            ensure(lid.0 == id, E_AUTH, "token does not belong to launch_id");
        }
        let mut l = self.launch(id);
        ensure(
            l.status == Status::Finalized,
            E_NOT_FINAL,
            "trading not open",
        );
        accumulate(&mut l.pool, now_ms());
        let spot_before = math::spot_price(l.pool.near_reserve.0, l.pool.token_reserve.0);
        let out = sell(&mut l.pool, amount.0);
        ensure(
            out > 0 && out >= m.min_out.map(|v| v.0).unwrap_or(0),
            E_SLIPPAGE,
            "output below min_out",
        );
        events::emit(
            "swap",
            json!({
                "launch_id": id, "account": sender_id, "side": "sell", "near": U128(out),
                "tokens": amount, "spot_before": U128(spot_before),
                "spot_after": U128(math::spot_price(l.pool.near_reserve.0, l.pool.token_reserve.0)),
            }),
        );
        self.launches.insert(id, l);
        Promise::new(sender_id)
            .transfer(NearToken::from_yoctonear(out))
            .detach();
        PromiseOrValue::Value(U128(0))
    }

    pub fn get_pool(&self, launch_id: U64) -> near_sdk::serde_json::Value {
        let l = self.launch(launch_id.0);
        let mut p = l.pool.clone();
        accumulate(&mut p, now_ms());
        json!({
            "pool": p,
            "spot_price": U128(math::spot_price(p.near_reserve.0, p.token_reserve.0)),
            "clearing_price": U128(l.clearing_price),
            "fee_bps": POOL_FEE_BPS,
            "open": l.status == Status::Finalized,
        })
    }

    /// `side` = "buy" (amount in yoctoNEAR) or "sell" (amount in token base units).
    pub fn quote(&self, launch_id: U64, side: String, amount: U128) -> U128 {
        let l = self.launch(launch_id.0);
        let p = &l.pool;
        U128(match side.as_str() {
            "buy" => math::amount_out(amount.0, p.near_reserve.0, p.token_reserve.0, POOL_FEE_BPS),
            "sell" => math::amount_out(amount.0, p.token_reserve.0, p.near_reserve.0, POOL_FEE_BPS),
            _ => fail(E_PARAMS, "side must be buy or sell"),
        })
    }
}
