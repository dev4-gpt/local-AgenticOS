# Veloce Commerce execution plan

Goal: a competitive PayPal AI Hackathon entry with a functioning knowledge → proposal → reviewed deposit → verified sandbox capture → kickoff journey. Winning is the ambition, not a controllable completion condition.

Current baseline: `707d5b3dc38b40833c7e1f2cb1b9664b1025a90e`. Worktree: `work/veloce-paypal-research`, branch `codex/veloce-commerce`. The active Veloce source checkout is untouched. The broader design and research are in this task's `outputs/PLAN.md` and `outputs/RESEARCH.md`.

## Definition of done

- AI meaningfully extracts requirements, drafts source-linked scope and flags uncertainty using an actual configured model. No fixture output presented as live AI.
- A buyer explicitly approves a PayPal sandbox order; server code captures within reviewed terms, verifies provider events, reconciles uncertainty, and creates one local kickoff under retries.
- Source change/withdrawal invalidates an unpaid proposal and blocks stale authority. Completed payment facts are reconciled rather than erased.
- Distinct authenticated identities approve consequential terms; changing evidence, text, amount, payee, policy or expiry invalidates review.
- One coherent desktop/mobile product journey with clear pending/error/recovery states, not a collection of agent tabs.
- Tests cover source/approval integrity, tenant isolation, duplicate/out-of-order events, crash recovery, budget admission and lifecycle. Evidence identifies code and actual test environment.
- A public-source-ready standalone project contains its required code, license, instructions and supported configuration; no private Veloce backend required to run the advertised flow.
- Public YouTube video under three minutes and accurate Devpost story/tool disclosures. Actual publication/submission remains the owner's final action unless separately authorized.

## Judging strategy

The official criteria are equally weighted: technological implementation, design, potential impact, innovation and presentation. Source: https://paypalaihackathon.devpost.com/rules (checked October 26, 2026).

| Criterion | Evidence we will produce |
|---|---|
| Implementation | Real model call and actual PayPal sandbox capture, with signature verification and retry proof |
| Design | Sources → Proposal → Payment → Kickoff; source passages and commercial terms visible at review |
| Impact | One owner-controlled consultancy brief, observed manual versus assisted effort and reviewer corrections; no invented buyer validation |
| Innovation | Evidence-bound commerce: stale source material cannot authorize a fresh commercial action |
| Presentation | A continuous short demo showing value, payment and one important failure prevention |

Prioritize the end-to-end journey over sponsor count. Sponsor APIs are optional under the rules; adopt only if the core flow has a measured gap they solve.

## Current state and gap

Veloce already has Notebook proposal prompts, source hashes, identity/approval primitives, budget functions and adapter lifecycle infrastructure. It has no targeted PayPal implementation, no financial action kind, no whole-flow source invalidation contract and no root open-source license. Phase 3 knowledge work is another active stream; no edits or completion claims for that stream are made here.

New code is a dependency-free ESM package in `commerce/`. Its domain contracts can be bound to Veloce or a standalone server without copying optional AGPL adapters. The first slice is pure domain logic, deliberately not an authenticated API or durable payment executor.

## Action inventory and dependencies

Effort is relative engineering hours, not elapsed time or a promise. Cost = effort + integration-risk points. Preconditions are gates; failing them stops dependent actions, not independent work.

| ID | Action | Preconditions | Effects / exit check | Effort | Risk |
|---|---|---|---|---:|---:|
| C0 | Refresh baseline, memory and interfaces | Repo and docs accessible | Isolated branch, source interface and trace recorded | 1 | 1 |
| C1 | Immutable proposal/evidence domain | C0 | Deterministic digest, fresh source checks, cents-only terms, distinct reviewed principals; adversarial tests pass | 3 | 1 |
| C2 | Durable storage and authenticated review | C1 | Atomic revisions/approval/intent state; trusted sessions; tenant refusal and transaction/restart tests | 6 | 3 |
| C3 | PayPal server adapter and reducer | C1 | Sandbox-only create/details/capture, stable operation ids; HTTP contract tests | 5 | 2 |
| C4 | Grounded AI draft adapter | C1 | Bounded source selection, structured scope, uncertainty, citation review; real-model quality evidence later | 4 | 2 |
| C5 | Verified event inbox and kickoff outbox | C2,C3 | Verified matched capture commits payment+outbox; retries/reconciliation create no duplicates | 6 | 3 |
| C6 | Coherent application UI | C2,C4 | Desktop/mobile source → review flow, no decorative actions; recoverable states | 6 | 2 |
| C7 | Phase 3/Veloce binding and cost/lifecycle | C2,C4 | Narrow source contract, invalidation and budget hooks, no shared-checkout conflicts | 5 | 3 |
| C8 | Real sandbox end-to-end proof | C5,C6 | Real buyer approval/capture/webhook matched to build, error journey recorded | 3 | 3 |
| C9 | Packaging and regression evidence | C7,C8 | Fresh install rehearsal, standard checks, license/ownership review, no private dependencies | 4 | 2 |
| C10 | Demo and submission readiness | C9 | Video/story/code access accurate; buffer before November 12, 3 PM Eastern | 3 | 1 |

This is approximately 46 engineering hours plus external setup and validation time. Refresh after each milestone. Independent actions can proceed serially here; no subagents are authorized or required by the invoked skill.

Planning uses a small explicit milestone state space, monotonic effects and fixed nonnegative action weights. A* with an admissible zero heuristic selects a minimum-weight path for that model; it does not prove a globally optimal real-world project schedule. Planned path/evaluation will be saved with the research outputs. In this model every milestone is required; ordering is driven by preconditions, with C2/C3/C4 branches re-orderable as dependencies allow.

## Execution sequence and milestones

1. C0/C1: source and proposal contract, exact commercial review; build and test first.
2. C2/C3: durable state and PayPal adapter. Start provider adapter tests without account access; actual sandbox validation waits for owner configuration.
3. C4/C6: real AI drafting and review UI. Use existing supported model infrastructure; paid calls remain disabled without a cost cap.
4. C5/C8: capture reconciliation and kickoff. Test crash windows before demonstrating payment success.
5. C7/C9: Veloce adapter binding, lifecycle/cost hooks and public-source packaging. Preserve the broader Phase 7 gates.
6. C10: rehearse under-three-minute narrative, submit with buffer and keep judge access/reproducibility through December 15.

First proof target: C1 passes locally today. Next vertical slice target: authenticated persistent proposal review plus one PayPal sandbox operation behind a tested provider boundary. Feature freeze target November 10; submission target November 11. These dates are planning targets, not scheduled automations.

## Source and approval contract decision

Each source reference carries tenant, stable id, revision, content hash, metadata hash and original expiry. The trusted host supplies fresh authorized snapshots with active/approved/ordinary state; the core never opens private vaults or promotes legacy notes. Sensitive sources require a future explicit consent path; this first slice fails closed.

Each immutable proposal binds exact source references, title/body, structured USD cents terms, merchant, sandbox environment, policy and lifetime. Proposal expiry cannot exceed a supporting source. The reviewer must acknowledge evidence and commercial terms separately; a valid source id is not a semantic support guarantee.

Domain principal objects must come from a server authentication boundary. The pure package does not authenticate a user, trust a browser-supplied role, verify an approval signature or enforce single use in storage. The next milestone must enforce those rules with persisted sessions and atomic transactions before exposing any payment API.

## Replan triggers and fallbacks

- Phase 3 interface moves: use a versioned binding to existing Notebook source refs; do not build a parallel wiki or mark Phase 3 complete.
- Unknown provider outcome: reconcile the same operation, never generate a new capture id to make a test pass.
- Model quality insufficient: narrow the deliverable and require review; evaluate another already permitted provider only within approved cost conditions.
- Hosting unavailable: runnable local project is permitted, with documented HTTPS webhook receiver setup. A simulated webhook is test evidence only.
- Public code rights unresolved: package newly authored standalone code and eliminate unnecessary private/AGPL runtime dependencies. License decisions must reflect actual ownership.
- Time pressure: cut optional sponsor tooling, advanced media, vector search and extra payment types; preserve real AI, sandbox payment, authority and reconciliation.

## Trajectory and task state

Ruflo task/workflow/trajectory/memory tools are not exposed. This file records local execution; no Ruflo database update is claimed.

- C0 complete: refreshed tracker and memory, verified clean main checkout/baseline, reused isolated research worktree and created `codex/veloce-commerce`. Node shell default was v26, outside the project range; use installed `/opt/homebrew/opt/node@24/bin/node` v24.18.0.
- C1 complete locally: immutable snapshots, source and metadata checks, exact USD cents, sandbox-only state, explicit evidence/terms review, distinct principals, expiry and source-aware admission. Tests ran on Node 24.18.0.
- C2 partial: SQLite transactions persist revisions, host-supplied memberships, review records, consumed approvals and unique payment intents with stable create/capture operation ids. Restart/retry, cross-tenant, stale-source, revoked-reviewer and duplicate-intent tests pass. HTTP session authentication, execution claims, lifecycle purge/restore and hosted binding remain pending. This is server-only code; caller-supplied subjects are not an authentication mechanism.
- C3 partial: pinned sandbox-only OAuth/create/details/capture/verification boundary implemented with bounded response parsing, timeout, no implicit retries, strict order/money/payee checks, safe approval links, certificate-location validation and generic uncertainty errors. Responses are local HTTP fixtures; no real sandbox interoperability or complete payment reducer has been verified yet. Sparse/mismatched provider responses require reconciliation rather than being assumed successful.
- Verification checkpoint: 72 tests pass; syntax checks pass. Seven targeted guard mutations were caught in disposable copies. Removing the revision-admission guard is caught by its stable error-code assertion; the database UNIQUE constraint separately preserves one intent per revision. This is targeted fault testing, not comprehensive mutation coverage.
- C4–C10 pending. No real model/provider calls, payment, deployment, publication or submission performed by the implementation slice.

The explicit A* model was executed and recorded in `outputs/goal-plan-search.json`: 25 expanded states, cost 69, a feasible minimum-model-cost path through all milestones. Equal-cost branch order is not a delivery requirement. We prioritized the independently testable PayPal/storage seams while model and source setup remain future work.

SQLite uses Node's built-in `node:sqlite`, documented for Node 24 at https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html. It is a local standalone storage choice, not a replacement of Veloce's Supabase database. The host binding remains a separate task. Use a private, operator-managed data directory for any future real material; fixtures here use temporary directories and are removed by tests.

Run the portable tests on supported Node:

```sh
cd commerce
/opt/homebrew/opt/node@24/bin/node --test test/*.test.mjs
/opt/homebrew/opt/node@24/bin/node --check src/proposals.mjs
```

The package is private until publication/ownership decisions are complete. The current test-only slice is not a working hackathon application and must not be described as one.
