//! Launch, bid and parameter types, plus the JSON views returned to clients.

use crate::math::Clearing;
use near_sdk::json_types::{U128, U64};
use near_sdk::{near, AccountId};

pub type LaunchId = u64;

pub const NUM_TICKS: usize = 64;
pub const OBS_RING: usize = 16;

/// Arguments to `create_launch`. All token quantities are whole tokens; prices are yoctoNEAR per
/// whole token; durations are seconds. Optional fields fall back to `Defaults`.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct CreateLaunchArgs {
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub total_supply: U128,
    pub sale_bps: u16,
    pub lp_bps: u16,
    pub creator_bps: u16,
    pub p_min: U128,
    pub commit_secs: u32,
    pub reveal_secs: u32,
    pub tick_factor_bps: Option<u16>,
    pub penalty_bps: Option<u16>,
    pub band_bps: Option<u16>,
    pub k_obs: Option<u32>,
    pub h_obs: Option<u32>,
    pub r_bps: Option<u16>,
    pub epoch_secs: Option<u32>,
    pub poke_interval_secs: Option<u32>,
    pub max_commits: Option<u32>,
    /// Time after finalize before any creator token can be released. Production minimum 7 days.
    pub creator_lock_secs: Option<u32>,
    /// Linear vesting period that starts when the lock ends. Production minimum 7 days.
    pub creator_vest_secs: Option<u32>,
    /// Short timings for a testnet demo. Only a factory initialised with `demo_allowed` on a
    /// `.testnet` account accepts it, and the flag is public in every view of the launch.
    pub demo: Option<bool>,
}

/// Floor Keeper and auction parameters, fixed at creation.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Params {
    pub tick_factor_bps: u16,
    pub penalty_bps: u16,
    pub band_bps: u16,
    pub k_obs: u32,
    pub h_obs: u32,
    pub r_bps: u16,
    pub epoch_ms: u64,
    pub poke_interval_ms: u64,
    pub max_commits: u32,
    pub creator_lock_ms: u64,
    pub creator_vest_ms: u64,
    /// Testnet demo timings: the protocol minimums were relaxed for this launch.
    pub demo: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    /// Token account is being created; nothing is open yet.
    Deploying,
    /// Commit window, then reveal window, then awaiting `finalize` (derived from time).
    Open,
    /// `finalize` computed the clearing and is waiting for the mint callback.
    Finalizing,
    /// Clearing done, tokens minted, pool open.
    Finalized,
    /// No demand, or the token deploy failed. Every deposit is refundable in full.
    Failed,
}

#[near(serializers = [json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Deploying,
    Commit,
    Reveal,
    AwaitingFinalize,
    Finalizing,
    Trading,
    Failed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ClearingState {
    NoDemand,
    Under {
        demand: U128,
    },
    Over {
        tick: u8,
        remaining: U128,
        bucket: U128,
    },
}

impl From<&Clearing> for ClearingState {
    fn from(c: &Clearing) -> Self {
        match c {
            Clearing::NoDemand => ClearingState::NoDemand,
            Clearing::Under { demand } => ClearingState::Under {
                demand: U128(*demand),
            },
            Clearing::Over {
                tick,
                remaining,
                bucket,
            } => ClearingState::Over {
                tick: *tick,
                remaining: U128(*remaining),
                bucket: U128(*bucket),
            },
        }
    }
}

impl From<&ClearingState> for Clearing {
    fn from(c: &ClearingState) -> Self {
        match c {
            ClearingState::NoDemand => Clearing::NoDemand,
            ClearingState::Under { demand } => Clearing::Under { demand: demand.0 },
            ClearingState::Over {
                tick,
                remaining,
                bucket,
            } => Clearing::Over {
                tick: *tick,
                remaining: remaining.0,
                bucket: bucket.0,
            },
        }
    }
}

/// Constant-product pool between NEAR and the launch token. Token reserve is held by this
/// contract's account on the token contract. LP shares are not issued: the liquidity is locked.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default)]
pub struct Pool {
    pub near_reserve: U128,
    /// Base units (10^18 per whole token).
    pub token_reserve: U128,
    /// Sum of spot_price * elapsed_ms, wrapping (Uniswap-v2 style accumulator).
    pub price_cumulative: U128,
    pub last_update_ms: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Observation {
    pub ts_ms: U64,
    pub price_cumulative: U128,
    /// Time-weighted average price over the interval ending at this observation.
    pub twap: U128,
}

/// Floor Keeper treasury and creator-lock state.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default)]
pub struct Treasury {
    pub near_balance: U128,
    pub below_streak: u32,
    pub above_streak: u32,
    pub last_poke_ms: U64,
    pub last_cumulative: U128,
    pub observations: Vec<Observation>,
    pub epoch_start_ms: U64,
    pub epoch_budget: U128,
    pub epoch_spent: U128,
    pub total_spent: U128,
    pub total_bought_back: U128,
    pub burn_pending: U128,
    pub defends: u32,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Launch {
    pub id: LaunchId,
    pub creator: AccountId,
    pub token_id: AccountId,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub total_supply: u128,
    pub sale_supply: u128,
    pub lp_max: u128,
    pub creator_max: u128,
    pub p_min: u128,
    pub created_ms: u64,
    pub commit_end_ms: u64,
    pub reveal_end_ms: u64,
    pub params: Params,
    pub status: Status,
    pub buckets: Vec<u128>,
    pub num_commits: u32,
    pub num_reveals: u32,
    /// Deposits (excluding storage fees) still held for bidders, before proceeds are taken out.
    pub escrow: u128,
    /// Refundable per-bid storage fees still held.
    pub storage_fees_held: u128,
    pub clearing: Option<ClearingState>,
    pub clearing_price: u128,
    pub filled: u128,
    pub lp_tokens: u128,
    pub creator_tokens: u128,
    pub burned_at_finalize: u128,
    pub proceeds: u128,
    pub pool: Pool,
    pub treasury: Treasury,
    /// When the launch reached `Finalized` (the creator lock runs from here).
    pub finalized_ms: u64,
    /// Creator tokens (whole) released so far, including transfers still in flight.
    pub creator_released: u128,
    pub claims: u32,
}

impl Launch {
    pub fn phase(&self, now_ms: u64) -> Phase {
        match self.status {
            Status::Deploying => Phase::Deploying,
            Status::Finalizing => Phase::Finalizing,
            Status::Finalized => Phase::Trading,
            Status::Failed => Phase::Failed,
            Status::Open => {
                if now_ms < self.commit_end_ms {
                    Phase::Commit
                } else if now_ms < self.reveal_end_ms {
                    Phase::Reveal
                } else {
                    Phase::AwaitingFinalize
                }
            }
        }
    }
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Bid {
    pub hash: [u8; 32],
    /// Escrowed NEAR (yocto), excluding the refundable storage fee.
    pub deposit: u128,
    pub storage_fee: u128,
    pub revealed: bool,
    pub tick: u8,
    pub qty: u128,
    pub claimed: bool,
    /// Tokens (base units) whose transfer failed; `claim` retries them.
    pub tokens_owed: u128,
}

#[near(serializers = [json])]
pub struct LaunchView {
    pub id: U64,
    pub creator: AccountId,
    pub token_id: AccountId,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub total_supply: U128,
    pub sale_supply: U128,
    pub lp_max: U128,
    pub creator_max: U128,
    pub p_min: U128,
    pub created_ms: U64,
    pub commit_end_ms: U64,
    pub reveal_end_ms: U64,
    pub params: Params,
    pub status: Status,
    pub phase: Phase,
    pub num_commits: u32,
    pub num_reveals: u32,
    pub escrow: U128,
    pub clearing: Option<ClearingState>,
    pub clearing_price: U128,
    pub filled: U128,
    pub lp_tokens: U128,
    pub creator_tokens: U128,
    pub burned_at_finalize: U128,
    pub proceeds: U128,
    pub finalized_ms: U64,
    pub creator_released: U128,
    /// True once the whole creator allocation has been released.
    pub creator_unlocked: bool,
    pub claims: u32,
}

impl LaunchView {
    pub fn from(l: &Launch, now_ms: u64) -> Self {
        Self {
            id: U64(l.id),
            creator: l.creator.clone(),
            token_id: l.token_id.clone(),
            name: l.name.clone(),
            symbol: l.symbol.clone(),
            icon: l.icon.clone(),
            total_supply: U128(l.total_supply),
            sale_supply: U128(l.sale_supply),
            lp_max: U128(l.lp_max),
            creator_max: U128(l.creator_max),
            p_min: U128(l.p_min),
            created_ms: U64(l.created_ms),
            commit_end_ms: U64(l.commit_end_ms),
            reveal_end_ms: U64(l.reveal_end_ms),
            params: l.params.clone(),
            status: l.status,
            phase: l.phase(now_ms),
            num_commits: l.num_commits,
            num_reveals: l.num_reveals,
            escrow: U128(l.escrow),
            clearing: l.clearing.clone(),
            clearing_price: U128(l.clearing_price),
            filled: U128(l.filled),
            lp_tokens: U128(l.lp_tokens),
            creator_tokens: U128(l.creator_tokens),
            burned_at_finalize: U128(l.burned_at_finalize),
            proceeds: U128(l.proceeds),
            finalized_ms: U64(l.finalized_ms),
            creator_released: U128(l.creator_released),
            creator_unlocked: l.creator_tokens > 0 && l.creator_released >= l.creator_tokens,
            claims: l.claims,
        }
    }
}

#[near(serializers = [json])]
pub struct BidView {
    pub hash_hex: String,
    pub deposit: U128,
    pub storage_fee: U128,
    pub revealed: bool,
    pub tick: Option<u8>,
    pub qty: Option<U128>,
    pub claimed: bool,
    pub tokens_owed: U128,
    /// Projected outcome once the launch is finalized (None before).
    pub filled: Option<U128>,
    pub paid: Option<U128>,
    pub refund: Option<U128>,
}

#[near(serializers = [json])]
pub struct TreasuryView {
    pub treasury: Treasury,
    pub clearing_price: U128,
    pub floor_price: U128,
    pub spot_price: U128,
    pub trigger_ready: bool,
    pub epoch_remaining: U128,
    /// `unlock_creator` would release something now.
    pub creator_unlockable: bool,
    pub creator_tokens: U128,
    pub creator_released: U128,
    /// Vested so far by time (release also needs the price-hold condition).
    pub creator_vested: U128,
    pub creator_lock_ends_ms: U64,
    pub creator_vest_ends_ms: U64,
    /// Interval TWAPs must be at or above this to count towards the hold (clearing + margin).
    pub hold_price: U128,
    pub creator_unlocked: bool,
}
