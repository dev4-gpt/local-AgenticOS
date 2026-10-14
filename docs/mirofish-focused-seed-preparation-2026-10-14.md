# MiroFish Focused Buyer Seed Preparation - 2026-10-14

## Prepared Scenario

The focused seed was generated from `evaluations/mirofish-buyer-micro-v2.json`
for the current customer hypothesis: small AI automation or development
consultancies turning approved client documents and a scoped request into a
proposal, audit, or weekly report. It contains ten fictional profiles, covers
five AI-literacy levels, balances workflow owners and security reviewers, and
preserves budget and privacy differences. It explicitly labels the workflow as
unvalidated and allows negative, uncertain, and nonbuyer responses.

The local artifact is `tmp/mirofish-buyer-seed-focused-v2.md`, SHA-256
`934b3dd5e2513dff3c38bad55196181bc7c344dd77d33958b5f00409f6dc1cb9`, with
owner-only (`0600`) permissions. It is ignored by Git so the synthetic seed
stays local; no customer data or credentials are included.

## Verification

- AgentOS buyer-seed tests: **8/8 passed** under Node `v24.19.0`.
- MiroFish buyer-smoke harness tests: **18/18 passed** using its existing
  isolated Python environment. These tests make no provider calls.
- No MiroFish project or simulation was created or run in this preparation.

## Remaining Pilot Gate

The AgentOS bootstrap expects the pinned MiroFish checkout at
`/private/tmp/agentos-mirofish-pilot-restored`, but that directory is absent.
The available MiroFish checkout is at `67e284ce7244258c054a1ee9db9b8107c5a38b3e`,
not the bootstrap's pinned commit `39d849138ef254f6c737ab4c4705e5545dbe31d4`.
The existing live-smoke runner is also hash-bound to the earlier broad
micro-v1 simulation artifacts, not this focused v2 seed. Do not treat the
focused seed or the prior simulation as a completed focused pilot. Before a
new run, review and pin the intended runner revision, bind the new run config
to the v2 cohort and source hashes, and preserve the approved `$0` paid-spend
limit with graph-memory updates disabled. No provider request or paid spend
was made in this preparation.
