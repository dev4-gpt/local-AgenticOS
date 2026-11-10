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
   Local harness now has a ten-case versioned fixture and release receipt (`npm run verify:ai-evaluation`). The first development run passed 9/9 on a dirty tree; repeat on a clean candidate before publishing. This is not hosted or model-backed evidence.
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

## Execution checkpoint — 2026-10-13

This is a measured checkpoint, not a production-readiness claim. The repository
was clean at source commit `da73092d2a41727d7e4dfef11d67b1093df34127` on
`wip/backup-2026-10-03`.

- The strict evidence verifier returned `releaseReady: false`. Its configured
  ledger bucket is missing, and deployment, migration, customer-journey,
  source-import, parity, buyer-pilot, AI-evaluation, operations, legal, and
  rollback evidence are not attached to this candidate.
- The offline AI release suite ran 14/14 cases successfully with no provider
  requests. The first run under Node v26.4.0 was rejected by the verifier; a
  rerun under installed Node v24 passed the local gate. The report is
  local-only and explicitly does not establish model quality or hosted behavior.
- The latest parity observation remains **unproven**: local and cloud data and
  capability surfaces differed, the cloud build identity route was unavailable,
  and no contemporaneous same-tenant comparison is recorded.
- The Skool archive inventory remains partial. No complete authorized source
  package has been imported and verified in the tenant graph. Use the
  user-provided/official export path; do not automate authenticated bulk
  collection without platform-level authorization.
- The latest MiroFish preparation record describes a two-buyer, ten-round
  candidate that passed offline preflight, but records no executed simulation
  or validated buyer interaction. A run must remain within the user's approved
  zero-paid-spend limit and current provider-account limits.
- Making the GitHub repository public is not equivalent to publishing or
  accepting the AgentOS production service.

The previous baseline-and-evaluation step is now complete. Next, make the local
AI gate reproducible in the project's documented runtime setup, refresh the
customer journey and parity evidence on a single identified candidate, then
finish the authorized import and pilot evidence before attempting strict
release acceptance. Preserve the stated cost, deployment, tenant-data, and
scraping constraints throughout.

### Verification refresh — 2026-10-13

- Re-ran the offline AI evaluator with Node 24: **14/14 cases passed** and the
  local gate passed. No provider calls were made.
- `npm run verify:html-source-pack` passed **5/5** tests.
- `npm run verify:source-import-postgres` passed its disposable local Postgres
  smoke and **2/2** source-guard schema-evidence tests.
- `npm run verify:mirofish-buyer-artifacts` passed **23/23** offline tests.
  These validate pilot attribution, telemetry, and review guards; they are not
  evidence that a MiroFish simulation or buyer interaction occurred.
- `npm run verify:policy-gates` passed: 696 license entries, 8 provider-egress
  manifests, 48 tenant-boundary routes, 3 navigation-policy tests, integration
  catalog validation, and ECC provenance.
- `npm run verify:public-beta`, `npm run verify:public-launch`,
  `npm run verify:engineering-controls`, and
  `npm run verify:client-provider-policy` all passed.
- `npm run verify:client-lifecycle` passed **22/22** retention, ownership,
  and offboarding contract tests.
- The client-runtime observability, telemetry-boundary, and job-trace suite
  passed **24/24**, including desktop/mobile status states, bounded redacted
  traces, and cross-tenant fail-closed behavior. No external provider requests
  were made.
- `npm run test:focused` under Node 24 passed **349/350** tests (one skipped).
  This broad local regression suite includes customer-journey and release-gate
  contracts, buyer-pilot evidence validation, and two-tenant isolation tests;
  it does not replace signed-in hosted acceptance.
- A Node 24 production build passed. The general workspace build does not
  include the client-runtime `Community sources` control, so the first browser
  attempt against that edition was invalid for this feature.
- `npm run verify:source-import-browser` subsequently passed **5/5** against
  the configured local internal-beta client runtime on port 3941. The private
  env file passed its safe config check, provider calls were disabled, and the
  tests intercepted every API request. This validates the local UI contract,
  not a hosted import or customer content.
- A read-only navigation in the existing Chrome session reached local
  `/memory`; the session, records, and memory-graph endpoints returned HTTP
  200. The user/tenant identity and returned records were not inspected, so
  this is partial local-journey evidence, not a same-tenant parity result.
- The final `npm run verify:production-readiness` on clean pushed HEAD
  `2cbb9cb33f330f224ed30fffcb232141b1407984` returned
  `releaseReady: false`. The only hard failure is the unconfigured release
  ledger bucket; 37 release-evidence items remain unevaluated. The earlier
  dirty-tree warning was cleared by committing and pushing the checkpoint. No
  production release artifact was created.

No hosted database, tenant data, Skool content, provider, or deployment was
changed during this refresh. Next: re-run the signed-in customer journey and
parity checks on one source-identified candidate, then complete the authorized
sample import and pilot evidence. Do not label the product production-ready
until the release verifier has complete evidence and passes.
