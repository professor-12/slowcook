# Submission package

**Nothing here is sent by the agent.**
- The human fills the `<HUMAN: …>` fields.
- The human sets `consent: true` only after agreeing to the contact notice.
- The human says "yes" before anything is submitted.

**Source:** https://nearhackathon.com/HACKATHON.md, read 2026-11-09. Re-read it before submitting.
- API: `POST https://nearhackathon.com/api/applications` (JSON).
- Deadline: 2026-11-14T23:59:00Z.

Draft JSON: [`submission.json`](submission.json). `requestId` is generated once; reuse it on retries.

## Checklist

**Done by the agent**
- [x] MIT `LICENSE`.
- [x] README: what it is, problem, how it works, try it in 5 minutes, NEAR features, limits, built-with + AI disclosure, related projects (placeholder), license.
- [x] Tests: unit, property, parity, sandbox (`verification/test-report.md`).
- [x] Simulation labelled SIMULATED.
- [x] Testnet deploy + evidence JSON in `results/` (see README "REAL").
- [x] X post draft: `x-post.md`.
- [x] Demo script: `demo-script.md`.

**Needs the human**
- [x] Public GitHub repo created: https://github.com/professor-12/slowcook.
- [x] Repo links, CI badge and `origin` set (`scripts/set-repo-url.sh https://github.com/professor-12/slowcook`); `projectUrl` filled in `submission.json`.
- [ ] README "Related projects" (Q-015): the section is written. Confirm Partner A's other entry, or "none".
- [ ] Hosted demo (e.g. Vercel: root `apps/web`, build `pnpm build`, output `out`), then run `node scripts/check-web.ts <hosted-url>`. The local headless check passes 6/6.
- [ ] Record the ~2 min demo video (`demo-script.md`).
- [ ] Post on X (`x-post.md`); put the post URL in `demoUrl`.
- [ ] Fill `leadName`, `email`, `size`, `nearAddress` (mainnet payout), `projectUrl`, `demoUrl`; set `consent: true`.
- [x] Fresh-clone test with a shared build cache (test report §7). Optional: repeat on a truly clean machine.
- [ ] Say "yes" so the agent can submit, or submit through the form at https://nearhackathon.com/#apply.

## Submit command (run only after the human's explicit "yes")
```bash
curl -sS -X POST https://nearhackathon.com/api/applications \
  -H 'Content-Type: application/json' --data @submission/submission.json
```
