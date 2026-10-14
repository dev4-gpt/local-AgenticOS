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

## Focused Project Staging

The bootstrap is now pinned to the audited MiroFish checkout at
`67e284ce7244258c054a1ee9db9b8107c5a38b3e`; its default path resolves to the
existing sibling `MiroFish-Buyer-Pilot` checkout. The 18 offline MiroFish
buyer-smoke tests passed. An explicit `--focused-v2` mode validates the ten
profile IDs against the canonical v2 cohort before using MiroFish's own
ontology normalizer.

The MiroFish-native dry run passed with 3 entity types, 4 relationships, the
expected seed and ontology hashes, and `networkCalls: 0`. The focused project
was then created locally as `proj_6eef37f42493`. A read-back confirmed status
`ontology_generated`, ten fictional profiles, the focused workflow, and no
attached graph ID. No Zep or LLM call was made.

The focused pilot is **not yet simulated**. The existing live-smoke runner is
hash-bound to the earlier broad micro-v1 configuration, not this focused v2
project. Next, bind a new simulation config and profile CSV to the v2 cohort,
verify its bounded schedule and provider configuration, then run only within
the approved `$0` paid-spend limit with graph-memory updates disabled. Preserve
the current no-deployment hold.
