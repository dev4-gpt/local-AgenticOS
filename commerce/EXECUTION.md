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


## Continuation checkpoint — October 26, 2026

Previous goal turn classification: progress (committed domain/provider/storage foundations). This turn also changes authoritative implementation state and produces new runtime/browser/model evidence; it is not a blocked turn.

- **C2 locally implemented:** password-derived account verification, hashed session/CSRF tokens, durable login limits, expiry/revocation, server-selected tenant membership and two-account source/commercial review. Rejection with a reason prevents later approval of that revision. All tenant mutation routes have explicit missing-session and wrong-workspace tests. Privileged account provisioning stays in the terminal, with hidden password input; no fake customers or real credentials are seeded into the actual runtime.
- **C3/C5 locally implemented:** sandbox provider observations carry exact intent/merchant/money identity; verified webhook bytes are hash-bound; payment and kickoff outbox commit atomically. Operation claims are exclusive, crashes lead to reconciliation, explicit retries retain operation IDs and stop after the recovery window. Duplicate/late pending events cannot duplicate kickoff or downgrade payment. Reversals and invalidated evidence hold work for review. Real PayPal interoperability remains C8, not proven by fixture success.
- **C4 implemented with one real-model integration case:** installed access search found Claude subscription OAuth and Codex ChatGPT sign-in. Ollama's running inventory had only the existing embedding model; Qwen manifests referenced missing weights. Per the owner's storage constraint, no model was created, downloaded or pulled. A public-source evaluation used the existing Claude Pro access with `claude-sonnet-4-6`, tools/MCP/hooks/session saving disabled, and completed in 46,228 ms. It returned 7 requirements, 7 proposed deliverables and 10 questions. This validates actual adapter execution/structured parsing, not broad AI quality or buyer demand. A manual review found one overstatement about public hosting; the retained evidence records it, reinforcing the need for semantic human review.
- **C6 browser workflow implemented:** native browser UI covers approved sources, model drafting, exact fee/deposit terms, separate reviewer approval/rejection, sandbox checkout/status and project kickoff. Desktop review succeeded against explicitly labeled disposable fixtures. Mobile at 390×844 had document width 390 and no horizontal overflow; the first source panel began near y=391 after layout refinement. Viewport overrides were reset. Screenshots are retained in the task outputs, not shipped as real model/payment proof.
- **C9 source preparation advanced:** standalone README, private runtime configuration/interactive account setup, source-only MIT license scoped to `commerce/`, standalone ignore rules, and zero npm dependencies. The module directory is approximately 252 KiB at this checkpoint, excluding pre-existing model storage. No publication, deployment or npm installation occurred. Fresh packaged-install rehearsal and final public repository remain open.
- **Verification:** full Node 24 regression suite passed **109 tests**, including the actual HTTP server with fixture transports. Syntax checks passed for all modules and browser code. A later token-accounting adjustment passed its 8 affected drafting tests; subscription usage remains distinct from a paid invoice and unknown costs are never asserted to be zero. No main Veloce application test/deployment proof is inferred from these module tests.
- **C7 still open:** production Veloce host binding, shared schema/retention inventory, complete 28+7 purge/restore, financial record policy, central host budget integration and full source-dependency cascade. The new source withdrawal affects this module's direct proposal/intent/project dependencies; it does not claim to finish the separate Phase 3 wiki.
- **C8 still open:** actual owner-configured PayPal sandbox app, merchant/buyer flow, reachable verified HTTPS webhook, provider reconciliation and current-candidate evidence. The owner was asked to configure credential names locally, never to paste values. No readiness or approval is inferred from elapsed time.
- **C10 still open:** final demo recording, public video/repository, accurate submission and judge-access rehearsal. Winning remains an external outcome; the goal remains active.

Automatic approval review rejected exporting an internal implementation brief to Claude because disclosure of that potentially non-public content was not specifically authorized. That transfer was not executed. The input was changed to the already-public hackathon requirements supplied by the owner; the public-source run was approved and succeeded. No private Veloce or client content was included in the successful test. An initial CLI authentication failure caused by an overly narrow child environment was fixed by forwarding only existing OAuth configuration, never API keys or arbitrary provider environment values.

Run normally with Node 24 using the README. `npm test` stays provider-free; real model evaluation is explicitly opt-in. The browser evaluation harness is temporary test infrastructure and must be stopped to remove its disposable database/accounts.


## Lifecycle checkpoint — October 26, 2026

Previous goal turn classification: progress (fresh source archive passed 109 tests; public existing-model evidence retained). This continuation implements and verifies part of C7, without claiming the shared Veloce lifecycle is finished.

- Added privileged tenant-scoped content maintenance, dry-run by default, bounded independently per content table, transactionally applied and idempotent. Sources/proposals/project content and review reasons are redacted at the original expiry plus seven days; usage metadata is redacted at 35 days. No usable authority is created by maintenance. Source updates cannot extend their original expiry or rehydrate a purged record. New source admission and proposal windows are bounded at 28 days.
- Expired buyer approval URLs disappear from returned intents immediately. Due URLs are removed from storage during cleanup; provider mappings, original amounts/digests, event identity and payment facts remain for reconciliation. A late verified capture still records the financial fact and holds kickoff.
- Added the complete local table classification in `lifecycle-inventory.json`, checked against the live schema. `LIFECYCLE.md` documents the command, original clocks, local secure-delete/checkpoint/compaction behavior, retained skeletons and external-copy limits. No purge schedule or protected restore is claimed.
- **Verification:** 117 tests passed on Node 24.18.0, including eight lifecycle tests and the HTTP workflow regression. The local test proves recovery boundary, dry run/apply, tenant scoping, bounded repeat runs, rollback, no rehydration, stable payment replay identity, no restarted kickoff, and fixture text absent from the compacted disposable database file. Syntax checks and `git diff --check` passed. No real runtime/client database was purged. Browser verification of an expired fixture approval showed the expiry warning, zero PayPal checkout links and only the payment-status action; capture, checkout, repeat review and kickoff controls were absent. A confirmed historic payment retains its financial status when its execution approval expires. The disposable server and browser tab were stopped/closed after verification.
- **Still open in C7:** protected export/restore, skeleton and authentication cleanup/offboarding, financial record policy, a maintenance schedule, shared host schema/budget/lifecycle binding, broader source dependency cascade and hosted verification. Legacy databases from before this change have no independently verified source-admission clock migration; no rollout claim is made.
- C8 still waits on owner-local PayPal sandbox configuration and a real buyer/webhook journey. C10 still needs the truthful final story/video/repository/judge rehearsal. The goal remains active.


## Protected recovery checkpoint — October 26, 2026

Previous goal turn classification: progress (content-lifecycle commit `bcde9ad`, 117 packaged tests, expiry UI browser evidence and draft demo/submission artifacts). This continuation adds a protected local recovery workflow as further C7 progress.

- Added transactional tenant-scoped export and dry-run restore with exact digest admission, bounded schema/column inventories, original-clock checks, content/proposal hashes and payment graph validation. Apply refuses nonempty targets and rolls back whole on any insert failure. Snapshot files must be private and are exclusively created, never overwritten.
- Authentication users/sessions/verifiers/credentials are excluded. Restored memberships are inactive, source content quarantined with new revisions/original expiry, every approval permanently revoked, claims replaced, intents/outbox/projects held for review. Financial facts and event identity remain for reconciliation; duplicate event delivery does not create another kickoff.
- Mapped webhook inbox rows now persist tenant attribution. Legacy schema upgrades add the nullable column; unattributed processed legacy rows block export rather than guessing ownership. Unknown ignored events remain unattributed and are excluded.
- **Verification:** 124 full-suite tests passed on Node 24.18.0. Seven new recovery tests include round trip, no restored authority, mixed tenants, broken graph, changed text, expired content, transaction rollback, paid-state reconciliation/replay, private-file permissions/symlinks/overwrite refusal, legacy refusal and actual CLI preview/apply. Two final validation checks (approval shape/project inherited expiry) passed the seven affected recovery tests. This is local fixture evidence; no real/client database was exported/restored and no provider API was called.
- Remaining C7: shared Veloce lifecycle/budget/identity binding, explicit restored identity remapping/reactivation UX, auth/skeleton cleanup, schedule, external deletion receipts, financial policy and hosted verification. C8 real sandbox and C10 publication/video/submission gates remain open. No model/dependency downloads or publication occurred.


## Sandbox ingress checkpoint — October 26, 2026

Previous goal turn classification: progress (`6e05632`, protected local recovery, 124 fresh-package tests). This continuation closes a local ingress/setup gap on the C8 path without claiming real provider interoperability.

- Added a separate optional loopback webhook-only listener (`--webhook-port`) so an authorized HTTPS forwarder need not expose the account UI or rewrite the app Host. It exposes only exact POST callback/JSON, checks required signature headers, bounds body/header size and verification concurrency, and never trusts inbound tenant fields. It forwards through the existing signature-verifying service and durable payment reducer. No public tunnel/deployment was started.
- Added read-only `sandbox-check`: absent credentials yield variable names only, with no database creation. Configured runs use sandbox OAuth and GET webhook details; output contains boolean identity/HTTPS/path/subscription checks and missing event names, not secrets/URL/provider bodies. Reachability and merchant identity remain explicitly untested by this command. Official Orders/Webhooks documentation was refreshed October 26.
- **Actual setup observation:** this task process lacks `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `PAYPAL_WEBHOOK_ID`; the command reported those names and exited nonzero. No credential files were opened, no actual PayPal API request was made and no funds moved. Owner-local setup is still needed for actual C8 acceptance.
- Added `SANDBOX-ACCEPTANCE.md` with the concrete real buyer/capture/verified event/replay/withdrawal proof sequence and redacted-evidence requirements. This is a runbook, not a success report.
- **Verification:** 129 tests pass on Node 24.18.0, including the local HTTP workflow and five added setup/provider/ingress cases. Receiver tests prove no UI/login/assets, required signature verification, no persistence after signature failure, generic secret-free error responses, body cap, concurrency refusal/recovery, and no runtime creation from a missing-config setup check. Syntax checks and whitespace checks pass. These are disposable fixture tests; the actual PayPal sandbox journey, shared Veloce binding and final recording/publication remain open.


## Real-model application checkpoint — October 26, 2026

Previous goal turn classification: progress (`a31144b`, isolated webhook ingress, configuration check, 129 fresh-package tests). This turn produces real model-through-application evidence and a repeatable opt-in harness, while leaving semantic acceptance open.

- `test/real-model-http-evaluation.mjs` drives actual authenticated HTTP source submission, distinct-account source review, real existing Claude subscription drafting and immutable SQLite proposal persistence. It asserts the author cannot approve the proposal and verifies human-set cents/merchant remain unchanged. Input is only the public challenge brief; accounts/terms are synthetic and PayPal is disabled. Default tests never call this script. `--keep-open` supports browser review and graceful shutdown removes temporary state. Existing evidence paths are refused before starting a model call.
- Two real Sonnet 4.6 calls completed (42,084 ms and 47,095 ms). Manual review of the first found that “under three minutes” became ≤ 3 minutes. It was rejected through the browser, with the durable changes-requested state and no approval/checkout controls. Prompt guidance now preserves alternatives, optionality and strict numeric boundaries.
- The second call retained “under three minutes” in requirements and deliverables, plus local OR hosted delivery and optional sponsors. A hosting-access assumption still implied an unsupported condition; this revision was also rejected in the browser. No semantic acceptance, broad AI quality, two-real-person review or payment proof is claimed. Prompting alone did not eliminate unsupported assumptions. The final demo still requires a semantically accepted revision.
- Evidence and manual source-comparison notes are in the task outputs `real-model-http-evaluation-public*.json` and `MODEL-QUALITY-REVIEW.md`; screenshots show actual model revisions with clearly synthetic terms and disabled payments. The public source text, rather than private Veloce/client content, was sent to the existing subscription. No weights were created/downloaded and no new paid service was enabled.
- **Verification:** 129 provider-free regression tests pass after the final prompt refinement; syntax/whitespace checks pass. Both evaluation servers exited 0 after explicit task-owned shutdown, deleting disposable SQLite/accounts, and temporary browser tabs were closed. Shared Veloce checkout remains unchanged.
- C8 still needs owner-configured real sandbox credentials, buyer/capture and verified event proof. C7 shared host/lifecycle/budget integration and financial policy remain open; C10 recording/public source publication/submission remains open. The goal remains active.
