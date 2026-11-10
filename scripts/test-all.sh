#!/usr/bin/env bash
# Everything except the sandbox tests: contract unit + property tests, TS<->contract parity,
# simulator tests. Sandbox: `pnpm test:sandbox` (needs `pnpm build:contracts` first).
# Exits non-zero if any suite fails.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== simulator unit tests"
node --test sim/test/*.test.ts
echo "== parity fixtures (TS model, 1000 auctions)"
node sim/src/parity.ts --cases 1000
echo "== contract unit, property (PROPTEST_CASES=${PROPTEST_CASES:=1000}) and parity tests"
log="$(mktemp)"
trap 'rm -f "$log"' EXIT
status=0
PROPTEST_CASES=$PROPTEST_CASES cargo test -p slowcook -p slowcook-token -j 2 >"$log" 2>&1 || status=$?
grep -v '^EVENT_JSON' "$log" | grep -E '^test |test result|panicked|FAILED|^error' || true
if [ "$status" -eq 0 ]; then
  echo "ALL CONTRACT TESTS PASSED"
else
  echo "CONTRACT TESTS FAILED (exit $status)" >&2
  exit "$status"
fi
