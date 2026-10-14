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
was created locally as `proj_6eef37f42493`. A later read-back confirms
`graph_completed`, graph `mirofish_bf15aa3aba8e400c`, 52 nodes, and 96 edges.
Its source remains the fictional v2 seed; the Zep batch is recorded in local
project metadata. This graph build used no customer data. It is ingestion
evidence, not a buyer simulation.

## Existing Buyer Run Review

The completed run `sim_fe9b23d28531` is the earlier micro-v1 cohort, not the
focused v2 consultancy cohort. Its local run state reports 10/10 rounds, 10
profiles, and 2 generated dynamic posts. The technical audit passes, but the
pilot gate does not:

- Aryaman's hash-bound review approves post 3 and rejects post 4 as not
  role-faithful or actionable. Post 4 implies pilot interest from a persona
  with a <$50 monthly budget despite the stated $2,500 setup plus $1,250/month
  offer.
- The audit finds no cross-buyer quotes or interactions. Both active personas
  are listed as missing buyer interactions.
- The audit reports `technicalEvidencePassed: true`,
  `pilotEvidencePassed: false`, and `marketValidation: false`.

The original AI-assisted review is preserved beside the canonical human review
as a private mode-0600 backup. The review is evidence about this synthetic run
only; it is not evidence of demand. No additional provider call was made while
updating the assessment.

## Remaining MiroFish Work

The focused v2 buyer simulation has now run once, after explicit authorization
under the `$0` paid-spend limit. The one-shot preparation/guard is local to the
MiroFish checkout at `backend/scripts/run_buyer_pilot_v2.py`; its local run is
`sim_8f4e26a9d170`. It used ten synthetic profiles, with only P00249 and P00639
active in simulated hour 8, ten total rounds, Groq Free, no second platform,
and graph-memory updates disabled. The process completed in about 3.3 seconds.
There is no customer data in the run.

The run is technically complete, but **fails the pilot-evidence gate**. It
produced two initial posts and two generated quote responses, with ten
round-end events and 16 trace rows. Each active profile quoted its own opening
post rather than interacting with the other buyer, so cross-buyer interaction
is absent. One generated response uses the unsupported phrase “From my
experience”; both responses are synthetic text and must not be treated as
customer evidence, product proof, or validated willingness to pay. The run
does not change `marketValidation: false`, and no second provider-backed run is
authorized by this approval.

After the run, the MiroFish v2 guard plus existing buyer-smoke tests passed
21/21, and the AgentOS buyer-seed/repeat-smoke/release-evidence checks passed
12/12. These checks validate cohort/config bounds and evidence handling; they
do not turn synthetic output into market validation.

The private local evidence is under
`MiroFish-Buyer-Pilot/backend/uploads/simulations/sim_8f4e26a9d170/`. Its
configuration SHA-256 is
`5f777cc94e137545377583fe96772fe1bbf27598f51a33c649a6d0a9b14860b9`, its
profile SHA-256 is
`2bf08ba873f5a96dc2d14cbe3999bfbb7c08fa5cd1634604c47f4623b27aaed3`, and its
action-log SHA-256 is
`16c446dafd353c7d2a0c1451a1a2a325bd740aa9cbd89c81d7fb3cbc55d62042`. The
MiroFish origin is configured with pushing disabled, so the local runner file
and private run outputs have not been pushed. Keep graph-memory updates
disabled and preserve the no-deployment hold.
