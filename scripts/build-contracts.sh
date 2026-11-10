#!/usr/bin/env bash
# Build both contracts to wasm with cargo-near. Output always lands in <repo>/target/near/<crate>/
# (also when CARGO_TARGET_DIR points elsewhere), which is where the deploy scripts and the sandbox
# tests look.
set -euo pipefail
cd "$(dirname "$0")/.."
root="$(pwd)"
for pair in token:slowcook_token slowcook:slowcook; do
  dir="${pair%%:*}"
  crate="${pair##*:}"
  (cd "contracts/$dir" && cargo near build non-reproducible-wasm --no-abi --out-dir "$root/target/near/$crate")
done
ls -l target/near/*/*.wasm
