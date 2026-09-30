# AgentOS production-readiness program

Date: 2026-09-26. Status: active plan; no production certification is implied.

## Objective and score

Deliver and verify five outcomes: a complete customer journey, authorized Skool content-to-graph ingestion, coherent local/cloud product UI, real-world buyer-scenario evaluation with MiroFish, and a production AI engineering loop for evaluation, observability, and tracing. Improve the product by fixing verified defects, not by claiming a subjective percentage. Report two separate measures for each immutable candidate: critical release gates passed / required gates, and supported customer actions with current-release evidence / promised actions. A critical failure blocks release regardless of aggregate percentage. Record source SHA, deployment IDs, migration versions, test time, owner, and rollback target with each result.

The current ~60% figure is an earlier estimate, not a verified baseline. Establish the numerator and denominator before reporting a replacement percentage.

## Shared operating rules

- Preserve a clean, reviewable release candidate and existing customer data. Use test-mode or disposable tenants first. No live charge, paid simulation scale-up, public promotion, or destructive data operation without explicit cost/owner authorization and a rollback path. A billing alert is not a hard spending cap.
- Do not run the existing Skool browser collector against this community until platform-level authorization for automated collection is established. Member or community-owner permission alone does not settle Skool's platform rules. Offer a user-provided export/import route that retains provenance and deletion support. Collect only material the user is entitled to use; exclude private messages, member profiles, credentials, and unrelated communities.
- Keep synthetic persona results labeled as hypotheses. Obtain real buyer interviews and measured conversion/usability evidence before making market-fit claims.
- Reuse the repository's Next.js, Supabase, Playwright, and release-ledger patterns. Maintain a single manifest of supported local/cloud behavior and capability availability.

## Workstream A: full customer journey and release acceptance

1. Inventory promised customer actions against `docs/public-launch-runbook.md`, `docs/production-release-acceptance-checklist.md`, and current routes. Write a test matrix for consent/intake, email verification, checkout/webhook, manifest review, provisioning, activation, first successful action, usage/budget, support, export/delete/offboarding, and failure/retry paths. Include two-tenant isolation and operator roles.
2. Add focused Playwright/API acceptance tests using existing fixtures. Exercise a disposable Stripe Test-mode customer and duplicate/reordered webhook events; never use a live charge as a development fixture. Prove secrets do not reach client output or evidence artifacts.
3. Run static checks and focused tests, then a browser-based staging journey. Record actual IDs and redacted outcomes. Classify every failed gate by severity and repair the highest-risk product defects.
4. Run the strict release check only for a clean immutable candidate with real deployment and owner evidence. A local pass does not replace production acceptance. Publish the ledger only when the production checklist's owner approvals and rollback evidence exist.

Done when every critical customer action is demonstrated on the release candidate, financial and tenant isolation tests pass, and the strict ledger says `releaseReady: true`; otherwise report exact blockers and do not claim GA readiness.

## Workstream B: Skool source-to-graph

1. Confirm whether Skool itself has granted an automation exception. Until then, design for an authorized user-supplied export (JSON/HTML/Markdown/CSV or individually saved pages) and document how a user obtains and uploads it. Preserve source URLs and captured-at timestamps. Do not bypass login, rate limits, anti-bot measures, or paywalls.
2. Inspect `src/lib/classroomResearch.ts`, `src/app/api/classroom-research/route.ts`, `src/app/api/client-runtime/memory-import/route.ts`, and the Supabase graph SQL. Define source, page/post/lesson, outbound-link, attachment-reference, and relation records scoped to tenant and import job. Set idempotent canonical IDs, permitted content types, size limits, provenance, retention, and deletion behavior.
3. Implement an authenticated import-and-review workflow in the hosted client. Parse structured exports with a real parser, sanitize untrusted HTML, validate URLs against SSRF and secret leakage, and show preview/counts before commit. Chunk and retry safely; prohibit cross-tenant reads and writes. Preserve original and normalized text where permitted.
4. Extend graph storage/query APIs and UI to show content nodes, source relationships, and clickable original links with citation/provenance. Do not silently convert the existing tag graph into an unrelated schema. Add migration and rollback procedures.
5. Test malformed exports, duplicates, cycles, inaccessible links, large files, injection content, tenant isolation, deletion, and re-import. Run one authorized sample import and inspect graph counts and link fidelity. If platform authorization arrives, add a narrow Skool connector behind an explicit policy/config gate using the same ingestion contract.

Done when an authorized sample is completely enumerated, imported without cross-tenant leakage, queryable in the graph, and removable. “All information” is limited by the approved export's scope and observed completeness, which must be reported.

## Workstream C: local/cloud UI parity

1. Separate the Vercel marketing/front-door UI (`product-experience`) from the actual workspace UI (`src/app`). Compare like-for-like workspace routes only; document product edition and execution-target differences.
2. Start local operator and client-runtime mirrors, capture desktop/mobile screenshots and action traces, and compare to authenticated cloud routes on the same release. Build a route/action matrix covering navigation, pipeline, agents, graph/memory, credential setup, run status, artifacts, errors, billing, and settings.
3. Prioritize blockers: wrong page/branding, missing actions, broken deep links, inaccessible state, contradictory capability labels. Share components/contracts incrementally behind a feature flag where appropriate; keep local hardware/provider differences explicit instead of forcing false sameness.
4. Add visual and behavioral regression tests for the changed route families. Verify no overlap, responsive failure, hydration error, or edition-only import violation. Record screenshot evidence and release/config hashes.

Done when every promised shared action passes in both environments and intentional differences are named in the UI and matrix. Visual similarity alone is not parity.

## Workstream D: buyer scenarios and MiroFish

1. Pin the upstream MiroFish version and review AGPL obligations, data handling, dependency security, model/Zep requirements, and cost. Keep its runtime isolated from the proprietary product until legal/security approval. Existing `src/lib/mirofishGtm.ts` is a prompt-based hypothesis aid, not a MiroFish run.
2. Define a stratified persona frame across job-to-be-done, organization size, industry, geography/language, budget, privacy sensitivity, procurement role, and AI literacy. Include nonbuyers and adverse scenarios. Use the same product evidence pack for each cohort, with no real customer data unless consented.
3. Pilot tens of personas and a handful of scenarios with spending caps and output-quality review. Compare findings to actual user interviews and observed journey friction. Expand to hundreds, then up to 10,000 only if the sample adds signal, the tool can handle it, and a hard total spend cap plus explicit approval is in place. Record seeds, prompts, model/version, sample weights, run counts, costs, and failure rates.
4. Cluster objections and failures, turn the highest-evidence issues into product tickets, implement the high-priority fixes, and repeat the relevant journey/parity tests. Label synthetic findings as simulated, not predicted conversion or representative demand.

Done when an actual MiroFish run has reproducible artifacts and a prioritized, tested improvement set. Ten thousand personas is a scale target, not a prerequisite for safe discovery or a claim of market validation.

## Workstream E: AI engineering evaluation and tracing

1. Define release-critical AI behaviors for provider routing, policy denials, budget reservation/settlement, artifact validity, source grounding, and tenant isolation. Build a versioned fixture set with expected outcomes and explicit failure labels; do not use customer or course content in public test fixtures.
2. Run deterministic tests on every candidate and repeat stochastic model-backed evaluations only inside an approved staging tenant with a hard spend ceiling. Record model, prompt/fixture version, sample size, pass rate, failure rate, latency distribution, token use, and uncertainty; a single green sample is not reliability evidence.
   Local harness now has a nine-case versioned fixture and release receipt (`npm run verify:ai-evaluation`). The first development run passed 9/9 on a dirty tree; repeat on a clean candidate before publishing. This is not hosted or model-backed evidence.
3. Trace each hosted job from admission through provider and persistence with tenant-scoped, bounded, redacted stage timing. Keep prompts, outputs, credentials, and raw provider responses out of trace metadata. Validate the read API and user-visible trace view against cross-tenant and malformed-metadata cases.
   The local read API now rejects any returned audit, job, or ledger row whose tenant does not match the runtime, bounds old audit labels, and drops secret-like values before responding. The panel shows a retryable failure state instead of disappearing. Local regression tests cover malformed metadata and a mixed-tenant response; hosted two-tenant execution and alert delivery remain unverified.
4. Add alerts and incident review for policy bypass, budget/settlement failures, provider errors, stalled jobs, and artifact failures. Reconcile job status, ledger, and trace evidence in staging before claiming production observability. Keep a retention and deletion policy for trace data.

The first local slice stores redacted worker-stage timings in existing job metadata and reads them through authenticated observability. It is not yet full OpenTelemetry coverage, a hosted trace receipt, a stochastic eval corpus, or an alerting signoff. Those remain release work, not an implied completed pipeline.

## Skills and order

Use `skill-creator` to make one small repo-local `agentos-release-acceptance` skill for the release evidence invariants, if validation shows it adds reusable guidance. Apply existing `e2e-testing`/`playwright` to A and C, `ux-audit` to C, `web-scraper` only for permitted collection in B, and `agent-evaluation`/`advanced-evaluation` to D and E. Do not install or create extra skills merely to increase the count; the repository's actual contract is authoritative.

Execution order: establish baseline and test matrix; implement the authorized import path and first end-to-end sample; run local/cloud parity audit and fix blocking routes; run staged MiroFish; then produce an evidence-backed release decision. A, B, and C can progress independently after the baseline. D may proceed with a sanitized product evidence pack but should not drive release claims without A/C verification.

## Immediate next steps

1. Capture current Git/deployment baseline and run the focused test suite and non-strict readiness check.
2. Create the testable customer-journey matrix and one smoke journey against disposable infrastructure.
3. Specify the export format and graph migration, then implement the first authorized import slice.
4. Capture local/cloud route screenshots and action parity, fixing the first verified discrepancy.
5. Prepare the isolated MiroFish pilot and explicit cost proposal before any paid run.
