//! Pure integer math shared by the contract, the unit/property tests and the parity fixtures.
//! Nothing here touches `env`, so it runs identically natively and in wasm.
//! The TypeScript model in `sim/src/clearing.ts` mirrors these functions line for line.

mod u256 {
    #![allow(clippy::manual_div_ceil)] // inside the `uint` crate's macro expansion
    uint::construct_uint! {
        /// 256-bit unsigned integer for intermediate products (reserves x reserves, price x amount).
        pub struct U256(4);
    }
}
pub use u256::U256;

/// Base units per whole token (token decimals = 18).
pub const ONE_TOKEN: u128 = 1_000_000_000_000_000_000;
pub const BPS: u128 = 10_000;

/// `a * b / c`, floor, with a 256-bit intermediate. `None` if `c == 0` or the result exceeds u128.
pub fn mul_div(a: u128, b: u128, c: u128) -> Option<u128> {
    if c == 0 {
        return None;
    }
    let r = U256::from(a) * U256::from(b) / U256::from(c);
    if r > U256::from(u128::MAX) {
        None
    } else {
        Some(r.as_u128())
    }
}

/// Tick prices in yoctoNEAR per whole token. `p[0] = p_min`, `p[i] = floor(p[i-1] * factor_bps / 10000)`.
/// Returns `None` if any step overflows or fails to strictly increase.
pub fn tick_prices(p_min: u128, factor_bps: u128, n: usize) -> Option<Vec<u128>> {
    let mut v = Vec::with_capacity(n);
    let mut p = p_min;
    for i in 0..n {
        if i > 0 {
            let next = p.checked_mul(factor_bps)? / BPS;
            if next <= p {
                return None;
            }
            p = next;
        }
        v.push(p);
    }
    Some(v)
}

/// Commit hash preimage. Both sides (contract, TS client) hash exactly this UTF-8 string.
pub fn commit_preimage(
    launch_id: u64,
    bidder: &str,
    tick: u8,
    qty: u128,
    salt_hex: &str,
) -> String {
    format!("{launch_id}:{bidder}:{tick}:{qty}:{salt_hex}")
}

/// Result of walking the demand buckets from the highest tick down.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Clearing {
    /// No revealed demand at all. The launch fails; every deposit is refunded.
    NoDemand,
    /// Demand at or above `p_min` is below the sale supply. Everyone is filled in full at tick 0
    /// (`p_min`), and the unsold remainder is burned.
    Under { demand: u128 },
    /// Demand reaches the sale supply at tick `tick`. Bids above it fill in full; bids at it share
    /// `remaining` pro rata over `bucket` (the total quantity at that tick).
    Over {
        tick: u8,
        remaining: u128,
        bucket: u128,
    },
}

impl Clearing {
    pub fn tick(&self) -> u8 {
        match self {
            Clearing::Over { tick, .. } => *tick,
            _ => 0,
        }
    }
}

/// Walk ticks from high to low until cumulative quantity reaches `sale_supply`.
pub fn compute_clearing(buckets: &[u128], sale_supply: u128) -> Clearing {
    let mut cum: u128 = 0;
    for t in (0..buckets.len()).rev() {
        let b = buckets[t];
        if b == 0 {
            continue;
        }
        if cum + b >= sale_supply {
            return Clearing::Over {
                tick: t as u8,
                remaining: sale_supply - cum,
                bucket: b,
            };
        }
        cum += b;
    }
    if cum == 0 {
        Clearing::NoDemand
    } else {
        Clearing::Under { demand: cum }
    }
}

/// Whole tokens a revealed bid `(tick, qty)` receives. Pro-rata at the marginal tick rounds down;
/// the rounding remainder is never minted (it is counted as burned).
pub fn fill_for(c: &Clearing, tick: u8, qty: u128) -> u128 {
    match c {
        Clearing::NoDemand => 0,
        Clearing::Under { .. } => qty,
        Clearing::Over {
            tick: ct,
            remaining,
            bucket,
        } => {
            if tick > *ct {
                qty
            } else if tick == *ct {
                mul_div(qty, *remaining, *bucket).expect("bounded by qty")
            } else {
                0
            }
        }
    }
}

/// Exact number of whole tokens sold: sum over all revealed bids of `fill_for`. `marginal_qtys` are
/// the quantities of every bid at the clearing tick (only needed for `Over`).
pub fn total_filled(c: &Clearing, sale_supply: u128, marginal_qtys: &[u128]) -> u128 {
    match c {
        Clearing::NoDemand => 0,
        Clearing::Under { demand } => *demand,
        Clearing::Over {
            remaining, bucket, ..
        } => {
            let at_margin: u128 = marginal_qtys
                .iter()
                .map(|q| mul_div(*q, *remaining, *bucket).unwrap())
                .sum();
            sale_supply - remaining + at_margin
        }
    }
}

/// Constant-product output: `out = r_out * in*(1-fee) / (r_in + in*(1-fee))`, floor.
pub fn amount_out(amount_in: u128, reserve_in: u128, reserve_out: u128, fee_bps: u128) -> u128 {
    if amount_in == 0 || reserve_in == 0 || reserve_out == 0 {
        return 0;
    }
    let in_fee = U256::from(amount_in) * U256::from(BPS - fee_bps);
    let num = in_fee * U256::from(reserve_out);
    let den = U256::from(reserve_in) * U256::from(BPS) + in_fee;
    (num / den).as_u128()
}

/// Spot price in yoctoNEAR per whole token.
pub fn spot_price(near_reserve: u128, token_reserve: u128) -> u128 {
    if token_reserve == 0 {
        return 0;
    }
    mul_div(near_reserve, ONE_TOKEN, token_reserve).unwrap_or(u128::MAX)
}

/// NEAR that must be added to the pool (fee ignored) to lift the spot price to `target`:
/// with k = x*y and price = x*ONE/y, the new x is sqrt(target * k / ONE). Returns 0 if already there.
pub fn near_to_reach_price(near_reserve: u128, token_reserve: u128, target: u128) -> u128 {
    let k = U256::from(near_reserve) * U256::from(token_reserve);
    let x_new = (U256::from(target) * k / U256::from(ONE_TOKEN)).integer_sqrt();
    let x = U256::from(near_reserve);
    if x_new <= x {
        0
    } else {
        let d = x_new - x;
        if d > U256::from(u128::MAX) {
            u128::MAX
        } else {
            d.as_u128()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ticks_are_geometric_and_increasing() {
        let p = tick_prices(1_000_000_000_000_000, 11_500, 64).unwrap();
        assert_eq!(p.len(), 64);
        assert_eq!(p[1], 1_150_000_000_000_000);
        assert!(p.windows(2).all(|w| w[1] > w[0]));
        // ~1.15^63 ~= 6.7e3
        assert!(p[63] / p[0] > 6_000 && p[63] / p[0] < 7_000);
    }

    #[test]
    fn ticks_reject_flat_steps() {
        assert!(tick_prices(5, 11_500, 64).is_none());
    }

    #[test]
    fn clearing_over_under_none() {
        let mut b = vec![0u128; 64];
        assert_eq!(compute_clearing(&b, 100), Clearing::NoDemand);
        b[5] = 60;
        b[3] = 80;
        assert_eq!(
            compute_clearing(&b, 100),
            Clearing::Over {
                tick: 3,
                remaining: 40,
                bucket: 80
            }
        );
        assert_eq!(compute_clearing(&b, 1_000), Clearing::Under { demand: 140 });
        // exact fill at a tick
        assert_eq!(
            compute_clearing(&b, 60),
            Clearing::Over {
                tick: 5,
                remaining: 60,
                bucket: 60
            }
        );
    }

    #[test]
    fn pro_rata_rounds_down_and_dust_is_not_minted() {
        let c = Clearing::Over {
            tick: 3,
            remaining: 10,
            bucket: 3 * 7,
        };
        // three bids of 7 at the margin: each gets floor(7*10/21) = 3, dust = 1
        assert_eq!(fill_for(&c, 3, 7), 3);
        assert_eq!(fill_for(&c, 4, 7), 7);
        assert_eq!(fill_for(&c, 2, 7), 0);
        assert_eq!(total_filled(&c, 50, &[7, 7, 7]), 40 + 9);
    }

    #[test]
    fn pool_math() {
        let out = amount_out(1_000, 10_000, 10_000, 30);
        assert_eq!(out, 906); // 10000*997/(100000+997)... floor
        assert_eq!(spot_price(2 * ONE_TOKEN, 4 * ONE_TOKEN), ONE_TOKEN / 2);
        let need = near_to_reach_price(100, 400 * ONE_TOKEN, 1); // price 0.25 -> 1 needs x=200
        assert_eq!(need, 100);
        assert_eq!(near_to_reach_price(100, 400 * ONE_TOKEN, 0), 0);
    }

    #[test]
    fn mul_div_overflow_and_zero() {
        assert_eq!(mul_div(u128::MAX, 2, 1), None);
        assert_eq!(mul_div(1, 1, 0), None);
        assert_eq!(mul_div(u128::MAX, u128::MAX, u128::MAX), Some(u128::MAX));
    }
}
