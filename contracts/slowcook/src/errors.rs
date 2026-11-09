//! Stable error prefixes. Every panic message starts with one of these, so clients and tests can
//! match on the prefix without depending on the human-readable tail.

pub const E_PHASE: &str = "E_PHASE";
pub const E_HASH: &str = "E_HASH";
pub const E_DEPOSIT: &str = "E_DEPOSIT";
pub const E_DUP: &str = "E_DUP";
pub const E_CAP: &str = "E_CAP";
pub const E_NOT_FINAL: &str = "E_NOT_FINAL";
pub const E_SLIPPAGE: &str = "E_SLIPPAGE";
pub const E_TRIGGER: &str = "E_TRIGGER";
pub const E_EPOCH_CAP: &str = "E_EPOCH_CAP";
pub const E_LOCKED: &str = "E_LOCKED";
pub const E_AUTH: &str = "E_AUTH";
pub const E_PARAMS: &str = "E_PARAMS";
pub const E_NO_BID: &str = "E_NO_BID";
pub const E_TOO_SOON: &str = "E_TOO_SOON";
pub const E_NOT_FOUND: &str = "E_NOT_FOUND";
pub const E_OVERFLOW: &str = "E_OVERFLOW";

/// Panic with `"<CODE>: <detail>"`.
pub fn fail(code: &str, detail: &str) -> ! {
    near_sdk::env::panic_str(&format!("{code}: {detail}"))
}

/// `require!` with a stable error code.
pub fn ensure(cond: bool, code: &str, detail: &str) {
    if !cond {
        fail(code, detail)
    }
}
