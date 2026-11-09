#!/usr/bin/env bash
# Build both contracts to wasm with cargo-near (outputs target/near/<crate>/<crate>.wasm).
set -euo pipefail
cd "$(dirname "$0")/.."
for c in token slowcook; do
  (cd "contracts/$c" && cargo near build non-reproducible-wasm --no-abi)
done
ls -l target/near/*/*.wasm
