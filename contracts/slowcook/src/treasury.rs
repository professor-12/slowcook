//! Floor Keeper treasury and creator lock.
//!
//! - `poke` (anyone, at most once per `poke_interval`) closes an observation interval and records
//!   its time-weighted average price (TWAP) from the pool accumulator.
//! - `defend` (anyone) buys tokens with treasury NEAR and burns them, only if the last `k_obs`
//!   interval TWAPs were all below `clearing * (1 - band)` AND spot is still below that floor.
//!   It spends at most `r_bps` of the treasury per epoch, never pushes spot above the clearing
//!   price, and resets the streak, so the next defend needs `k_obs` fresh observations.
//! - `unlock_creator` releases creator tokens only when all of these hold:
//!   1. the creator lock is over (`finalized_ms + creator_lock_ms`, at least 7 days unless demo);
//!   2. the last `h_obs` interval TWAPs were all at or above `clearing * (1 + 5%)` (the pool opens
//!      exactly at clearing, so an untraded pool never counts as holding);
//!   3. something new has vested: the allocation vests linearly over `creator_vest_ms` after
//!      the lock, and each call sends only the vested amount not yet released.

use crate::errors::*;
use crate::launch::*;
use crate::math;
use crate::pool::{accumulate, buy};
use crate::*;
use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::json;
use near_sdk::{env, near, NearToken};

pub fn floor_price(l: &Launch) -> u128 {
    l.clearing_price * (10_000 - l.params.band_bps as u128) / 10_000
}

/// Interval TWAPs at or above this count towards the creator hold.
pub fn hold_price(l: &Launch) -> u128 {
    math::mul_div(l.clearing_price, math::BPS + UNLOCK_MARGIN_BPS, math::BPS).unwrap_or(u128::MAX)
}

pub fn creator_lock_end(l: &Launch) -> u64 {
    l.finalized_ms + l.params.creator_lock_ms
}

/// Whole creator tokens vested by `now`: zero until the lock ends, then linear over the vest.
pub fn creator_vested(l: &Launch, now: u64) -> u128 {
    let start = creator_lock_end(l);
    if l.status != Status::Finalized || now < start {
        return 0;
    }
    let elapsed = (now - start).min(l.params.creator_vest_ms) as u128;
    math::mul_div(l.creator_tokens, elapsed, l.params.creator_vest_ms as u128)
        .unwrap_or(l.creator_tokens)
}

/// Budget left in the current epoch, rolling the epoch if it has expired. Mutates `t`.
pub fn roll_epoch(t: &mut Treasury, p: &Params, now: u64) -> u128 {
    if t.epoch_start_ms.0 == 0 || now >= t.epoch_start_ms.0 + p.epoch_ms {
        t.epoch_start_ms = U64(now);
        t.epoch_budget = U128(t.near_balance.0 * p.r_bps as u128 / 10_000);
        t.epoch_spent = U128(0);
    }
    t.epoch_budget.0 - t.epoch_spent.0
}

#[near]
impl SlowCook {
    pub fn poke(&mut self, launch_id: U64) -> Observation {
        let mut l = self.launch(launch_id.0);
        ensure(
            l.status == Status::Finalized,
            E_NOT_FINAL,
            "trading not open",
        );
        let now = now_ms();
        let dt = now.saturating_sub(l.treasury.last_poke_ms.0);
        ensure(
            dt >= l.params.poke_interval_ms,
            E_TOO_SOON,
            "poke interval not elapsed",
        );
        accumulate(&mut l.pool, now);
        let cum = l.pool.price_cumulative.0;
        let twap = cum.wrapping_sub(l.treasury.last_cumulative.0) / dt as u128;
        let floor = floor_price(&l);
        let hold = hold_price(&l);
        let t = &mut l.treasury;
        t.below_streak = if twap < floor { t.below_streak + 1 } else { 0 };
        t.above_streak = if twap >= hold { t.above_streak + 1 } else { 0 };
        t.last_poke_ms = U64(now);
        t.last_cumulative = U128(cum);
        let obs = Observation {
            ts_ms: U64(now),
            price_cumulative: U128(cum),
            twap: U128(twap),
        };
        t.observations.push(obs.clone());
        if t.observations.len() > OBS_RING {
            t.observations.remove(0);
        }
        events::emit(
            "poked",
            json!({
                "launch_id": l.id, "twap": U128(twap), "floor": U128(floor),
                "spot": U128(math::spot_price(l.pool.near_reserve.0, l.pool.token_reserve.0)),
                "below_streak": l.treasury.below_streak, "above_streak": l.treasury.above_streak,
            }),
        );
        self.launches.insert(l.id, l);
        obs
    }

    pub fn defend(&mut self, launch_id: U64) -> U128 {
        let mut l = self.launch(launch_id.0);
        ensure(
            l.status == Status::Finalized,
            E_NOT_FINAL,
            "trading not open",
        );
        ensure(
            l.treasury.below_streak >= l.params.k_obs,
            E_TRIGGER,
            "TWAP has not been below the floor for k_obs observations",
        );
        let now = now_ms();
        accumulate(&mut l.pool, now);
        let floor = floor_price(&l);
        let spot_before = math::spot_price(l.pool.near_reserve.0, l.pool.token_reserve.0);
        ensure(
            spot_before < floor,
            E_TRIGGER,
            "spot already above the floor",
        );
        let remaining = roll_epoch(&mut l.treasury, &l.params, now);
        ensure(remaining > 0, E_EPOCH_CAP, "epoch budget spent");
        let need = math::near_to_reach_price(
            l.pool.near_reserve.0,
            l.pool.token_reserve.0,
            l.clearing_price,
        );
        let spend = remaining.min(need).min(l.treasury.near_balance.0);
        ensure(spend > 0, E_TRIGGER, "nothing to spend");
        let bought = buy(&mut l.pool, spend);
        let t = &mut l.treasury;
        t.near_balance = U128(t.near_balance.0 - spend);
        t.epoch_spent = U128(t.epoch_spent.0 + spend);
        t.total_spent = U128(t.total_spent.0 + spend);
        t.total_bought_back = U128(t.total_bought_back.0 + bought);
        t.below_streak = 0;
        t.defends += 1;
        events::emit(
            "defended",
            json!({
                "launch_id": l.id, "spent": U128(spend), "burned": U128(bought),
                "spot_before": U128(spot_before),
                "spot_after": U128(math::spot_price(l.pool.near_reserve.0, l.pool.token_reserve.0)),
                "epoch_remaining": U128(l.treasury.epoch_budget.0 - l.treasury.epoch_spent.0),
            }),
        );
        let token = l.token_id.clone();
        let id = l.id;
        self.launches.insert(id, l);
        self.burn_tokens(id, token, bought);
        U128(bought)
    }

    /// Retry a buyback burn whose cross-contract call failed.
    pub fn flush_burn(&mut self, launch_id: U64) {
        let mut l = self.launch(launch_id.0);
        let amount = l.treasury.burn_pending.0;
        ensure(amount > 0, E_PARAMS, "nothing pending");
        l.treasury.burn_pending = U128(0);
        let token = l.token_id.clone();
        self.launches.insert(l.id, l);
        self.burn_tokens(launch_id.0, token, amount);
    }

    #[private]
    pub fn on_burned(&mut self, launch_id: U64, amount: U128) -> bool {
        let ok = promise_ok();
        if !ok {
            let mut l = self.launch(launch_id.0);
            l.treasury.burn_pending = U128(l.treasury.burn_pending.0 + amount.0);
            self.launches.insert(l.id, l);
        }
        ok
    }

    /// Release the creator tokens vested so far, once the lock is over and the price has held above
    /// clearing + 5% for the last `h_obs` intervals. Returns the whole tokens sent.
    pub fn unlock_creator(&mut self, launch_id: U64) -> U128 {
        let mut l = self.launch(launch_id.0);
        ensure(l.status == Status::Finalized, E_NOT_FINAL, "not finalized");
        let now = now_ms();
        let lock_end = creator_lock_end(&l);
        ensure(
            now >= lock_end,
            E_LOCKED,
            &format!(
                "creator lock ends at {lock_end} ms ({} s left)",
                lock_end.saturating_sub(now).div_ceil(1000)
            ),
        );
        ensure(
            l.treasury.above_streak >= l.params.h_obs,
            E_LOCKED,
            &format!(
                "price has held above clearing + 5% for {} of {} intervals",
                l.treasury.above_streak, l.params.h_obs
            ),
        );
        let amount = creator_vested(&l, now).saturating_sub(l.creator_released);
        ensure(amount > 0, E_LOCKED, "nothing newly vested");
        l.creator_released += amount;
        events::emit(
            "creator_unlocked",
            json!({
                "launch_id": l.id, "creator": l.creator, "amount": U128(amount),
                "released": U128(l.creator_released), "allocation": U128(l.creator_tokens),
            }),
        );
        ext_token::ext(l.token_id.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_TOKEN_CALL)
            .ft_transfer(
                l.creator.clone(),
                U128(amount * math::ONE_TOKEN),
                Some("creator vest".into()),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_creator_tokens(U64(l.id), U128(amount)),
            )
            .detach();
        self.launches.insert(l.id, l);
        U128(amount)
    }

    /// On a failed transfer, return exactly that amount to the unreleased balance.
    #[private]
    pub fn on_creator_tokens(&mut self, launch_id: U64, amount: U128) -> bool {
        let ok = promise_ok();
        if !ok {
            let mut l = self.launch(launch_id.0);
            l.creator_released -= amount.0;
            self.launches.insert(l.id, l);
        }
        ok
    }

    pub fn get_treasury(&self, launch_id: U64) -> TreasuryView {
        let l = self.launch(launch_id.0);
        let mut t = l.treasury.clone();
        let now = now_ms();
        let epoch_remaining =
            if t.epoch_start_ms.0 == 0 || now >= t.epoch_start_ms.0 + l.params.epoch_ms {
                t.near_balance.0 * l.params.r_bps as u128 / 10_000
            } else {
                t.epoch_budget.0 - t.epoch_spent.0
            };
        let spot = math::spot_price(l.pool.near_reserve.0, l.pool.token_reserve.0);
        let floor = floor_price(&l);
        let vested = creator_vested(&l, now);
        let (lock_end, vest_end) = if l.status == Status::Finalized {
            let e = creator_lock_end(&l);
            (e, e + l.params.creator_vest_ms)
        } else {
            (0, 0)
        };
        let trigger_ready =
            l.status == Status::Finalized && t.below_streak >= l.params.k_obs && spot < floor;
        t.observations.reverse();
        TreasuryView {
            treasury: t,
            clearing_price: U128(l.clearing_price),
            floor_price: U128(floor),
            spot_price: U128(spot),
            trigger_ready,
            epoch_remaining: U128(epoch_remaining),
            creator_unlockable: l.status == Status::Finalized
                && now >= lock_end
                && l.treasury.above_streak >= l.params.h_obs
                && vested > l.creator_released,
            creator_tokens: U128(l.creator_tokens),
            creator_released: U128(l.creator_released),
            creator_vested: U128(vested),
            creator_lock_ends_ms: U64(lock_end),
            creator_vest_ends_ms: U64(vest_end),
            hold_price: U128(hold_price(&l)),
            creator_unlocked: l.creator_tokens > 0 && l.creator_released >= l.creator_tokens,
        }
    }
}

impl SlowCook {
    fn burn_tokens(&self, id: LaunchId, token: near_sdk::AccountId, amount: u128) {
        ext_token::ext(token)
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_TOKEN_CALL)
            .burn(U128(amount))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_burned(U64(id), U128(amount)),
            )
            .detach();
    }
}
