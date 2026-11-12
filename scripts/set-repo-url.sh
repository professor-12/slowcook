#!/usr/bin/env bash
# Point the repo at its public GitHub URL: fills the REPLACE_ME links, adds the CI badge to the
# README, and sets the `origin` remote. Does NOT push.
# Usage: bash scripts/set-repo-url.sh https://github.com/<owner>/<repo>
set -euo pipefail
cd "$(dirname "$0")/.."
url="${1:-}"
url="${url%.git}"
url="${url%/}"
if [[ ! "$url" =~ ^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)$ ]]; then
  echo "usage: $0 https://github.com/<owner>/<repo>" >&2
  exit 1
fi
sed -i "s#https://github.com/REPLACE_ME/slowcook#${url}#g" Cargo.toml apps/web/app/layout.tsx
badge="[![CI](${url}/actions/workflows/ci.yml/badge.svg)](${url}/actions/workflows/ci.yml)"
if ! grep -qF "actions/workflows/ci.yml/badge.svg" README.md; then
  # Insert the badge right under the title line.
  awk -v b="$badge" 'NR==1{print; print ""; print b; next} {print}' README.md > README.md.tmp && mv README.md.tmp README.md
fi
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "${url}.git"
else
  git remote add origin "${url}.git"
fi
echo "repo URL set to ${url}; remaining REPLACE_ME:"
grep -rn "REPLACE_ME" Cargo.toml apps/web/app README.md || echo "  none"
git remote -v
