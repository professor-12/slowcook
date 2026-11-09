//! Sealed-bid, uniform-price auction: commit -> reveal -> finalize -> claim.

use crate::errors::*;
use crate::launch::*;
use crate::math::{self, Clearing, ONE_TOKEN};
use crate::*;
use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::json;
use near_sdk::{env, near, AccountId, NearToken, Promise, PromiseOrValue};

/// What a bid receives at settlement. `paid + refund + penalty == deposit` (invariant I2).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Settlement {
    pub filled: u128,
    pub paid: u128,
    pub refund: u128,
    pub penalty: u128,
}

pub fn settle(l: &Launch, b: &Bid) -> Settlement {
    match l.status {
        Status::Finalized => {
            if !b.revealed {
                let penalty = b.deposit * l.params.penalty_bps as u128 / 10_000;
                return Settlement {
                    filled: 0,
                    paid: 0,
                    refund: b.deposit - penalty,
                    penalty,
                };
            }
            let c: Clearing = l.clearing.as_ref().expect("finalized").into();
            let filled = math::fill_for(&c, b.tick, b.qty);
            let paid = l.clearing_price * filled;
            Settlement {
                filled,
                paid,
                refund: b.deposit - paid,
                penalty: 0,
            }
        }
        // Failed launches refund everything, with no penalty: nothing was sold.
        _ => Settlement {
            filled: 0,
            paid: 0,
            refund: b.deposit,
            penalty: 0,
        },
    }
}

#[near]
impl SlowCook {
    /// Submit a sealed bid: `hash_hex = sha256("<launch_id>:<bidder>:<tick>:<qty>:<salt_hex>")`.
    /// Attach `COMMIT_STORAGE_FEE` plus any escrow >= `MIN_BID_DEPOSIT`. At reveal the escrow must
    /// cover `tick_price * qty`; depositing more than that hides the real bid.
    #[payable]
    pub fn commit(&mut self, launch_id: U64, hash_hex: String) {
        let mut l = self.launch(launch_id.0);
        ensure(
            l.phase(now_ms()) == Phase::Commit,
            E_PHASE,
            "not in commit phase",
        );
        let bidder = env::predecessor_account_id();
        let key = (l.id, bidder.clone());
        ensure(!self.bids.contains_key(&key), E_DUP, "already committed");
        ensure(
            l.num_commits < l.params.max_commits,
            E_CAP,
            "commit cap reached",
        );
        let attached = env::attached_deposit().as_yoctonear();
        let fee = COMMIT_STORAGE_FEE.as_yoctonear();
        ensure(
            attached >= fee + MIN_BID_DEPOSIT.as_yoctonear(),
            E_DEPOSIT,
            "attach storage fee + minimum deposit",
        );
        let hash: [u8; 32] = hex::decode(&hash_hex)
            .ok()
            .and_then(|v| v.try_into().ok())
            .unwrap_or_else(|| fail(E_HASH, "hash_hex must be 32 bytes hex"));
        let deposit = attached - fee;
        self.bids.insert(
            key,
            Bid {
                hash,
                deposit,
                storage_fee: fee,
                revealed: false,
                tick: 0,
                qty: 0,
                claimed: false,
                tokens_owed: 0,
            },
        );
        l.escrow += deposit;
        l.storage_fees_held += fee;
        l.num_commits += 1;
        events::emit(
            "bid_committed",
            json!({ "launch_id": l.id, "bidder": bidder, "deposit": U128(deposit) }),
        );
        self.launches.insert(l.id, l);
    }

    /// Open a sealed bid. Rejected (and left unrevealed) if the hash or deposit does not match.
    pub fn reveal(&mut self, launch_id: U64, tick: u8, qty: U128, salt_hex: String) {
        let mut l = self.launch(launch_id.0);
        ensure(
            l.phase(now_ms()) == Phase::Reveal,
            E_PHASE,
            "not in reveal phase",
        );
        let bidder = env::predecessor_account_id();
        let key = (l.id, bidder.clone());
        let mut bid = self
            .bids
            .get(&key)
            .cloned()
            .unwrap_or_else(|| fail(E_NO_BID, "no commit"));
        ensure(!bid.revealed, E_DUP, "already revealed");
        ensure((tick as usize) < NUM_TICKS, E_PARAMS, "tick out of range");
        ensure(
            qty.0 > 0 && qty.0 <= l.sale_supply,
            E_PARAMS,
            "qty must be 1..sale_supply",
        );
        let pre = math::commit_preimage(l.id, bidder.as_str(), tick, qty.0, &salt_hex);
        ensure(
            env::sha256_array(pre.as_bytes()) == bid.hash,
            E_HASH,
            "reveal does not match commit",
        );
        let price = launch_tick_prices(&l)[tick as usize];
        let cost = price
            .checked_mul(qty.0)
            .unwrap_or_else(|| fail(E_OVERFLOW, "price*qty"));
        ensure(bid.deposit >= cost, E_DEPOSIT, "deposit below price*qty");

        bid.revealed = true;
        bid.tick = tick;
        bid.qty = qty.0;
        self.bids.insert(key, bid);
        l.buckets[tick as usize] += qty.0;
        l.num_reveals += 1;
        let mkey = (l.id, tick);
        let mut list = self.marginal.get(&mkey).cloned().unwrap_or_default();
        list.push(qty.0);
        self.marginal.insert(mkey, list);
        events::emit(
            "bid_revealed",
            json!({ "launch_id": l.id, "bidder": bidder, "tick": tick, "qty": qty, "price": U128(price) }),
        );
        self.launches.insert(l.id, l);
    }

    /// Anyone, after the reveal window: walk the buckets, set one clearing price, mint exactly
    /// what was sold plus the (scaled) LP and creator shares, and burn the rest by never minting it.
    pub fn finalize(&mut self, launch_id: U64) -> PromiseOrValue<bool> {
        let mut l = self.launch(launch_id.0);
        ensure(
            l.phase(now_ms()) == Phase::AwaitingFinalize,
            E_PHASE,
            "reveal window not over",
        );
        let c = math::compute_clearing(&l.buckets, l.sale_supply);
        if c == Clearing::NoDemand {
            l.status = Status::Failed;
            l.clearing = Some((&c).into());
            l.burned_at_finalize = l.total_supply;
            events::emit(
                "finalized",
                json!({ "launch_id": l.id, "failed": true, "reason": "no demand" }),
            );
            self.launches.insert(l.id, l);
            return PromiseOrValue::Value(false);
        }
        let marginal = match c {
            Clearing::Over { tick, .. } => self
                .marginal
                .get(&(l.id, tick))
                .cloned()
                .unwrap_or_default(),
            _ => vec![],
        };
        let filled = math::total_filled(&c, l.sale_supply, &marginal);
        let price = launch_tick_prices(&l)[c.tick() as usize];
        // Fix vs the original brief: LP and creator shares scale with what actually sold, so the
        // pool can always be seeded at the clearing price from proceeds, even when undersubscribed.
        let lp_tokens = math::mul_div(filled, l.lp_max, l.sale_supply).unwrap();
        let creator_tokens = math::mul_div(filled, l.creator_max, l.sale_supply).unwrap();
        l.clearing = Some((&c).into());
        l.clearing_price = price;
        l.filled = filled;
        l.lp_tokens = lp_tokens;
        l.creator_tokens = creator_tokens;
        l.proceeds = price * filled;
        l.burned_at_finalize = l.total_supply - filled - lp_tokens - creator_tokens;
        l.status = Status::Finalizing;
        let mint = (filled + lp_tokens + creator_tokens) * ONE_TOKEN;
        let token = l.token_id.clone();
        let id = l.id;
        self.launches.insert(id, l);
        PromiseOrValue::Promise(
            ext_token::ext(token)
                .with_static_gas(GAS_TOKEN_CALL)
                .mint(env::current_account_id(), U128(mint))
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_CALLBACK)
                        .on_finalize_minted(U64(id)),
                ),
        )
    }

    #[private]
    pub fn on_finalize_minted(&mut self, launch_id: U64) -> bool {
        let mut l = self.launch(launch_id.0);
        if !promise_ok() {
            // Nothing moved yet; reopen so anyone can retry finalize.
            l.status = Status::Open;
            l.clearing = None;
            self.launches.insert(l.id, l);
            return false;
        }
        let now = now_ms();
        let lp_near = l.clearing_price * l.lp_tokens;
        l.escrow -= l.proceeds;
        l.pool = Pool {
            near_reserve: U128(lp_near),
            token_reserve: U128(l.lp_tokens * ONE_TOKEN),
            price_cumulative: U128(0),
            last_update_ms: U64(now),
        };
        l.treasury = Treasury {
            near_balance: U128(l.proceeds - lp_near),
            last_poke_ms: U64(now),
            ..Default::default()
        };
        l.status = Status::Finalized;
        events::emit(
            "finalized",
            json!({
                "launch_id": l.id, "clearing_tick": l.clearing.as_ref().map(|c| Clearing::from(c).tick()),
                "clearing_price": U128(l.clearing_price), "filled": U128(l.filled),
                "burned": U128(l.burned_at_finalize), "lp_tokens": U128(l.lp_tokens),
                "lp_near": U128(lp_near), "treasury_near": U128(l.proceeds - lp_near),
                "creator_tokens": U128(l.creator_tokens),
            }),
        );
        self.launches.insert(l.id, l);
        true
    }

    /// Settle the caller's bid: tokens for the filled part, NEAR refund of the rest.
    pub fn claim(&mut self, launch_id: U64) -> SettlementView {
        self.internal_settle(launch_id.0, env::predecessor_account_id(), false)
    }

    /// Anyone can push a refund to an unrevealed bidder once the launch is final (minus penalty).
    pub fn refund_unrevealed(&mut self, launch_id: U64, bidder: AccountId) -> SettlementView {
        self.internal_settle(launch_id.0, bidder, true)
    }

    #[private]
    pub fn on_claim_tokens(&mut self, launch_id: U64, bidder: AccountId, amount: U128) -> bool {
        let key = (launch_id.0, bidder);
        let ok = promise_ok();
        if ok {
            self.bids.remove(&key);
        } else if let Some(b) = self.bids.get_mut(&key) {
            b.tokens_owed = amount.0;
        }
        ok
    }

    pub fn get_bid(&self, launch_id: U64, account_id: AccountId) -> Option<BidView> {
        let l = self.launch(launch_id.0);
        self.bids.get(&(l.id, account_id)).map(|b| {
            let s = (l.status == Status::Finalized || l.status == Status::Failed)
                .then(|| settle(&l, b));
            BidView {
                hash_hex: hex::encode(b.hash),
                deposit: U128(b.deposit),
                storage_fee: U128(b.storage_fee),
                revealed: b.revealed,
                tick: b.revealed.then_some(b.tick),
                qty: b.revealed.then_some(U128(b.qty)),
                claimed: b.claimed,
                tokens_owed: U128(b.tokens_owed),
                filled: s.map(|s| U128(s.filled)),
                paid: s.map(|s| U128(s.paid)),
                refund: s.map(|s| U128(s.refund)),
            }
        })
    }
}

/// JSON form of `Settlement` returned by `claim`.
#[near(serializers = [json])]
pub struct SettlementView {
    pub filled: U128,
    pub paid: U128,
    pub refund: U128,
    pub penalty: U128,
}

impl SlowCook {
    fn internal_settle(
        &mut self,
        id: LaunchId,
        bidder: AccountId,
        only_unrevealed: bool,
    ) -> SettlementView {
        let mut l = self.launch(id);
        ensure(
            l.status == Status::Finalized || l.status == Status::Failed,
            E_NOT_FINAL,
            "launch not finalized",
        );
        let key = (id, bidder.clone());
        let mut b = self
            .bids
            .get(&key)
            .cloned()
            .unwrap_or_else(|| fail(E_NO_BID, "no bid"));
        if only_unrevealed {
            ensure(!b.revealed, E_PARAMS, "bid was revealed; bidder must claim");
        }
        if b.claimed {
            // Retry a token transfer that failed earlier.
            ensure(b.tokens_owed > 0, E_DUP, "already claimed");
            let amount = b.tokens_owed;
            b.tokens_owed = 0;
            self.bids.insert(key, b);
            self.send_claim_tokens(&l, &bidder, amount);
            return SettlementView {
                filled: U128(amount / ONE_TOKEN),
                paid: U128(0),
                refund: U128(0),
                penalty: U128(0),
            };
        }
        let s = settle(&l, &b);
        l.escrow -= s.refund + s.penalty;
        l.storage_fees_held -= b.storage_fee;
        l.treasury.near_balance = U128(l.treasury.near_balance.0 + s.penalty);
        l.claims += 1;
        b.claimed = true;
        let out_near = s.refund + b.storage_fee;
        if out_near > 0 {
            Promise::new(bidder.clone())
                .transfer(NearToken::from_yoctonear(out_near))
                .detach();
        }
        if s.filled > 0 {
            self.bids.insert(key, b);
            self.send_claim_tokens(&l, &bidder, s.filled * ONE_TOKEN);
        } else {
            self.bids.remove(&key);
        }
        events::emit(
            "claimed",
            json!({
                "launch_id": id, "bidder": bidder, "filled": U128(s.filled), "paid": U128(s.paid),
                "refund": U128(s.refund), "penalty": U128(s.penalty),
            }),
        );
        self.launches.insert(id, l);
        SettlementView {
            filled: U128(s.filled),
            paid: U128(s.paid),
            refund: U128(s.refund),
            penalty: U128(s.penalty),
        }
    }

    fn send_claim_tokens(&self, l: &Launch, bidder: &AccountId, amount: u128) {
        ext_token::ext(l.token_id.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_TOKEN_CALL)
            .ft_transfer(bidder.clone(), U128(amount), Some("slowcook claim".into()))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_claim_tokens(U64(l.id), bidder.clone(), U128(amount)),
            )
            .detach();
    }
}
