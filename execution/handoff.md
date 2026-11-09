# Handoff: exact state and next action

See `execution/task-ledger.md` for status. Every command runs from the repo root, with Node 24 on PATH (`nvm use 24`).

- Build: `pnpm build:contracts`
- Unit, property and parity tests: `pnpm test`
- Sandbox tests (heavy, about 15 min to compile the first time): `pnpm test:sandbox`
- Testnet:
  1. Put the accounts in `.env`; the keys live in `~/.near-credentials/testnet/`.
  2. Run `node scripts/deploy-testnet.ts`.
  3. Run `pnpm demo:launch`.
  4. Run `pnpm demo:dump <id>`.
- Web: `pnpm -C apps/web build`, then serve `apps/web/out` (static).

Next action: see the bottom of `execution/task-ledger.md`.
