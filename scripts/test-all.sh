#!/usr/bin/env bash
# Everything except the sandbox tests: contract unit + property tests, TS<->contract parity,
# simulator tests. Sandbox: `pnpm test:sandbox` (needs `pnpm build:contracts` first).
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== simulator unit tests"
node --test sim/test/*.test.ts
echo "== parity fixtures (TS model, 1000 auctions)"
node sim/src/parity.ts --cases 1000
echo "== contract unit, property (PROPTEST_CASES=${PROPTEST_CASES:=1000}) and parity tests"
PROPTEST_CASES=$PROPTEST_CASES cargo test -p slowcook -p slowcook-token -j 2 2>&1 | grep -v '^EVENT_JSON' | grep -E '^test |test result|panicked|FAILED' || true
cargo test -p slowcook -p slowcook-token -j 2 --quiet >/dev/null 2>&1 && echo "ALL CONTRACT TESTS PASSED"
