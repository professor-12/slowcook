//! NEP-297 events: `EVENT_JSON:{"standard":"slowcook","version":"1.0.0","event":...,"data":[...]}`.

use near_sdk::env;
use near_sdk::serde_json::{json, Value};

pub const STANDARD: &str = "slowcook";
pub const VERSION: &str = "1.0.0";

pub fn emit(event: &str, data: Value) {
    let log = json!({
        "standard": STANDARD,
        "version": VERSION,
        "event": event,
        "data": [data],
    });
    env::log_str(&format!("EVENT_JSON:{log}"));
}
