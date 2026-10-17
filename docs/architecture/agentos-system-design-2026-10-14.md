# AgentOS System Design: Evidence-Based Production Readiness

**Status:** Proposed design; not a production approval  
**Owner:** Aryaman  
**Last updated:** October 16, 2026
**Authors:** AgentOS project team  
**Reviewers:** Product owner, runtime/security owner, operations/billing owner (to be named)  
**Related docs:** [Production-readiness execution board](../production-readiness-execution-board.md), [retention data-class inventory](../retention-data-class-inventory-2026-10-15.md), [canonical production topology](../production-topology-2026-09-25.md), [production-readiness program](../superpowers/plans/2026-09-26-production-readiness-program.md)
**Scope:** Establish one architecture and test-led sequence for completing AgentOS readiness without confusing local tests, synthetic studies, partial imports, or historical deployments with release evidence.

## 1. Abstract

AgentOS is a governed AI workspace with a public intake surface, tenant-scoped workspaces, asynchronous agent jobs, provider controls, artifacts, memory/graph capabilities, and operator tooling. The intended workflow is: a team submits an approved request and sources; AgentOS checks identity, tenant membership, capability, policy, and budget; a bounded job runs; the result is stored with provenance and review state; a human decides whether it can be used or exported.

The system has substantial local implementation and regression coverage, but it is not accepted as production-ready. The local readiness verifier reports a dirty working tree, no configured release-ledger bucket, and unevaluated release-evidence categories. Current counts and candidate-bound results belong in the generated readiness report and execution board. The Notebook journey's earlier synthetic acceptance was reopened after a regression proved that preview did not enforce durable approval before download. The same-user hosted customer journey and local/cloud parity are not verified. The Skool archive is partial and has not been imported to a confirmed tenant graph. MiroFish evidence is synthetic and is not buyer validation; no additional provider run is authorized by these results.

This design does not add another runtime stack. It sets the boundaries, contracts, tests, and ordered milestones for completing the existing system. A local green test is evidence only for the behavior it actually exercised. Hosted mutation, paid provider use, public rollout, and destructive data actions remain separately approved operations.

## 2. Goals and Non-Goals

| Goals | Non-goals |
|---|---|
| Make one customer workflow verifiable from sign-in through reviewed, source-linked deliverable and export. | Claim broad enterprise readiness or market demand from implementation activity alone. |
| Ensure every job is tenant-scoped, policy-gated, budget-bounded, traceable, and recoverable. | Replace the existing Next.js, Supabase, Cloud Run, Vercel, worker, or graph architecture without evidence that replacement is necessary. |
| Establish a canonical source-pack and graph-import acceptance process with coverage and provenance. | Use session cookies or bypass platform controls to collect Skool content. Use owner/platform-approved exports or material supplied by the user. |
| Compare a source-identified local candidate with the exact intended hosted beta revision using read-only checks first. | Treat the marketing site, legacy Cloud Run service, or a single-tenant Cloud Test URL as a shared customer login. |
| Make release decisions from versioned evidence and explicit human approvals, not subjective percentages. | Treat MiroFish personas as real buyers or run another provider-backed simulation without fresh cost authorization. |
| Preserve cost, privacy, retention, rollback, and tenant-isolation boundaries through every milestone. The owner-selected content policy is 28 active days from item creation plus a separate seven-day object recovery window (up to 35 days recoverable). | Change production Supabase, IAM, retention, bucket lifecycle, domains, service traffic, or public visibility as part of this design. |

## 3. Background and Problem Statement

The repository contains the main application, client runtime, public product/intake surface, worker routes, provider adapters, Supabase-backed tenant data, graph and notebook workflows, observability, and an evidence verifier. The topology document identifies the current internal-beta service as a controlled Cloud Run runtime, while the public Vercel surface is a separate editorial/intake experience. Historical and current documents must be reconciled before deployment decisions because service targets and evidence can become stale.

The readiness problem is not a lack of features or tools. It is that several evidence classes are being mixed: fixture-backed UI checks versus a signed-in customer flow; local configuration versus hosted configuration; partial archive versus complete import; synthetic personas versus buyer interviews; and a deployed image versus an image tied to a current source commit. That makes status hard to interpret and creates rework when browser profiles, tenants, or cloud targets are ambiguous.

**Design invariant:** Every claim of readiness must be tied to one immutable source candidate, one named environment/tenant, a bounded test or operation, a timestamped result, and an evidence artifact. A failed or unknown critical gate blocks release regardless of the number of passing local tests.

**Current evidence snapshot (2026-10-16):** AgentOS HEAD is `7344a7d9d47a93a5553d4b0d57c9bdeab8a70b87` on `wip/backup-2026-10-03`, using supported Node `v24.18.0`. The exact dirty-path count, source/config fingerprints, AI and Notebook results, and remaining release categories are recorded in `/private/tmp/agentos-production-readiness-current.json`; tracked documentation edits themselves change the candidate fingerprint. Notebook approval/rejection is durable and hash-bound. A ready storage object alone is insufficient: preview, approval and export also require a successful producing job naming that artifact and a passing citation audit. Post-storage settlement/completion failure cases are included in the six-scenario browser contract. Current evidence is `tmp/notebook-job-release-evidence-2026-10-16.json`; earlier passes are historical until rebound. No local result substitutes for ledger-backed review, hosted telemetry/billing, migration grants, real-customer acceptance or production readiness.

The focused suite passes **421/422** (one optional private-package skip); `verify:security` passes, including **84** lifecycle/retention, **29** Notebook provenance, and **25** runtime/storage configuration tests. Typecheck and the standard production build pass. A separate local standalone build was pruned to the client surface (**235** disabled routes removed, **120** retained) and passed the build-trace verifier. This is local artifact evidence only: no Cloud Build, deployment, hosted identity check, or remote image digest was run or established.

The owner-reconciled private Skool graph now accounts for **110** exact lesson IDs, **107** with linked page text and **three** without. Authorized Work Chrome inspection added 15 inline captures consisting of resource labels, community CTA and a ZIP usage note, not video contents or transcripts; three pages have a player but no inline body. The full main-player audit found **93** YouTube embeds and **17** Skool-native players; 112 sidebar items reconcile to 110 lessons plus heading/progress. Player presence is not full playback, transcript capture, video backup, or source completeness. The legacy **25** pending-page counter is overlapping/non-comparable; **3** transcript links remain one excerpt and two unknown scope, none declared full. No complete or hosted import receipt exists. See the execution board and coverage audit for current artifact identities rather than treating these counts as a release gate. Historical Internal Beta evidence observed one-day retention; the selected Cloud Test runtime and bucket instead report 14 days, also contrary to the selected 28-day active plus seven-day recovery policy. Bucket metadata reports seven-day soft delete, not behavioral recovery proof. Hosted source/image identity, same-member tenant parity, two-tenant isolation, applied migrations, and behavioral deletion/recovery remain unverified. MiroFish review and harness tests do not establish provider spend or buyer demand. No deployment, hosted mutation, provider request, or spend is authorized by these results.

## 4. Proposed Architecture

### 4.1 Logical boundaries

```text
Member browser
  -> Public Vercel surface (information / intake; not the client workspace)
  -> Tenant client runtime (authenticated UI and API boundary)
       -> Supabase Auth + tenant-scoped Postgres / graph / job / audit state
       -> Cloud Tasks -> private worker -> policy + budget checks -> provider adapter
       -> private artifact storage through authenticated proxy
  -> Human review -> approved artifact/export

Operator workstation -> local operator edition / local tools (separate trust boundary)
```

The diagram is a logical design, not proof that every route or hosted integration is currently deployed. The exact service, region, revision, source identity, image digest, route allowlist, and Supabase project must be captured from the target environment before accepting hosted evidence.

### 4.2 Core components

| Component | Responsibility | Primary storage | Failure behavior |
|---|---|---|---|
| Public Vercel surface | Product information and runtime/intake requests; never impersonates the authenticated tenant workspace. | Vercel deployment; intake state as configured. | Fail closed on unavailable or misrouted login; show explicit unavailable state rather than a misleading login. |
| Tenant client runtime | Authenticate member, resolve tenant membership, render enabled capabilities, validate requests, and expose scoped APIs. | Supabase Auth and tenant-scoped tables/RPCs. | Deny unauthenticated, inactive, or cross-tenant actions; do not fall back to another tenant or legacy runtime. |
| Policy and budget boundary | Check capability, consent, allowlist, request limits, budget reserve, and approval requirements before external side effects. | Versioned runtime configuration and durable ledger/state. | Fail closed when policy, budget, or required approval cannot be read or reserved. |
| Job dispatcher and worker | Enqueue bounded work, claim idempotently, execute provider/tool calls, persist outputs, and settle/refund budget. | Cloud Tasks, database job/ledger rows, private secrets. | Retry only idempotent stages; terminally fail and reconcile uncertain provider outcomes. |
| Source, notebook, and graph pipeline | Accept approved user material, validate pack/consent, preserve source IDs/links, extract/index content, and provide grounded retrieval. | Private object storage plus tenant-scoped relational and graph records. | Reject incomplete/malformed or unauthorized packs; no partial publication as “complete.” |
| Artifact and review boundary | Store result bytes privately, attach source register/provenance, record reviewer decision, and mediate download/export. | Private object storage plus tenant-scoped metadata. | Keep output unapproved and unavailable for consequential export until review; proxy failure does not expose bucket access. |
| Audit and observability | Record bounded, redacted lifecycle events and job-stage traces; support incident triage and release evidence. | Tenant-scoped audit/job metadata and configured telemetry sink. | Preserve local durable status if telemetry sink is unavailable; alert on missing critical events without leaking content. |
| Release verifier and ledger | Bind test, configuration, deployment, migration, approval, and rollback evidence to a candidate SHA. | Versioned repository evidence and configured release ledger. | Return not-ready on missing, stale, mismatched, or incomplete evidence; never infer missing proof. |

### 4.3 Request lifecycle

1. The member enters through the tenant runtime, not the public editorial surface. The session is authenticated and active tenant membership is resolved server-side.
2. The API validates the requested capability, input shape, consent, source IDs, tenant ownership, idempotency key, and configured limits. Client-supplied document text is not treated as authoritative when approved server-side source IDs exist.
3. The runtime loads the effective capability/policy configuration and required budget or approval state. Unknown or stale critical configuration blocks the request.
4. A durable job and budget reservation are created before external execution. The durable identity includes tenant, job, idempotency key, source/version references, and policy/config version.
5. A private worker claims the job. It rechecks eligibility and reservation, obtains only the minimum provider secret required, makes bounded calls, and records stage outcomes without raw secrets or unrestricted prompt/output payloads in trace metadata.
6. The worker writes artifacts privately, records provenance/source references, settles or refunds the budget according to outcome, and transitions the job to a terminal state. Retries use the same logical operation identity and do not duplicate charges or artifacts.
7. The UI reads the durable job/artifact state, displays source links and review state, and permits export only under the applicable approval policy. User-visible failures remain retryable when safe and identify a supportable next step.
8. The release and operations path can reconstruct the lifecycle from bounded events, job/ledger state, artifact metadata, and the deployment identity without exposing protected content.

### 4.4 API and data contracts

Use the repository's existing schemas and route contracts as the authority; this design does not introduce new table names or pretend the current schema has been independently revalidated. Each request/record should preserve these semantic fields where applicable:

| Field | Type | Required | Meaning / constraint |
|---|---|---|---|
| tenant identity | opaque identifier | Yes | Resolved from authenticated server context; never trusted from a user-controlled body alone. |
| actor identity | authenticated subject | Yes | Member or service identity responsible for the action. |
| operation identity | stable identifier | Yes for async/mutating work | Supports idempotency, retry, and audit correlation. |
| source references | IDs + versions + canonical URLs | When source-grounded | Must resolve inside the same tenant and be authorized for this operation. |
| policy/config version | immutable reference or hash | Yes for gated execution | Explains which allowlist, budget, capability, and approval rules were applied. |
| lifecycle status | versioned enum | Yes | State transitions are validated and terminal states cannot silently reopen. |
| budget outcome | amount/unit + reservation/settlement reference | For metered work | Must reconcile against durable ledger state; no UI-only budget accounting. |
| artifact provenance | source IDs, generation metadata, review state | For generated output | Lets a reviewer distinguish grounded, ungrounded, and approved output. |
| evidence metadata | candidate SHA, environment, time, result, evidence URI | For release records | Contains no secrets or customer content unless specifically approved and minimized. |

**Contract guarantees:** authorization precedes enqueue and storage access; the job record and reservation precede provider side effects; identifiers are stable across retries; version/config/source references are captured; telemetry is not the system of record for money, permissions, or job state. Keep versioned schemas/tests alongside the implementation and update compatibility tests on contract changes.

**Required accounting invariant:** Ruflo, Loop and Room must not publish
successful job completion when required settlement returns false. Preserve
actual usage without clipping to the reservation; an overrun is a blocked
accounting outcome, not permission to hide usage. Generated-file downloads
require a durably successful, error-free, nonblocked producing job; Notebook
citations and hash-bound human approval remain additional gates. Direct
uploads retain uploader ownership checks. Metadata/state rejection does not
prove quote adequacy, an external spend cap, atomic domain reconciliation or
physical deletion; retain those separate acceptance requirements.

**Observation invariant:** A trace outcome observer or optional log/vendor
sink must not turn a successful operation into a retry or replace an actual
operation error. Version-2 local traces use bounded early/recent span detail
plus fixed stage outcome totals, unknown outcomes, in-flight and truncation
markers. Readers validate timing and summary consistency. These observations
are not durable completion/settlement, cross-attempt execution, sink-delivery
or provider-quality attestations; preserve those separate acceptance gates.

**Room directive invariant:** Model directives are proposed payloads, not
permission to write approved memory or capture a Pipeline item. Retain them
under their originating job; only its active requester may approve the exact
payload after durable, error-free, nonblocked success. Review/record creation
must commit atomically and retries must not duplicate records. Memory creation
and Pipeline expiry inherit the original job deadline, not the approval date.
Legacy unreviewed Room records cannot silently become approved context. This
does not quarantine every inline chat reply or establish hosted acceptance.

**Room retention invariant:** Conversation activity cannot renew its original
active deadline. Messages, rounds and copied Room-job payloads expire no later
than that source deadline and enter the same seven-day recovery-only window.
Worker admission, publication and human review must stop on expiry. Approved
derived notes/Pipeline items and ordinary restore cannot renew the source
window. Bounded parent cleanup must not cascade through another tenant's rows.
This is a local database/handler contract, not operated hosted deletion proof.

**Unknown usage invariant:** Missing/unpriceable usage and an unverified
provider failure are not proof of a free call. Ruflo, Loop and Room stop at
that boundary, leave the reservation unsettled and record bounded
reconciliation metadata without successful completion or automatic replay.
Known prior subtotals are not the total invoice. Valid numeric zero usage and
explicit free pricing remain distinct from unknown usage. Earlier persisted
inline output, other worker fallbacks, quote adequacy, real invoices and
provider-side hard caps remain separate acceptance requirements.

**Multi-agent envelope invariant:** Ruflo, Loop and Room price their bounded
future prompts at each stage's model rate, reject invalid/overflowing totals,
and reprice the real next prompt against the reservation minus known usage.
An unfundable call is not dispatched. Known earlier usage still requires
settlement before blocked completion; unknown usage remains unsettled for
reconciliation. These configured prompt-price projections are not a provider
hard cap, complete protocol-token estimate or invoice attestation.

**Artifact/object evidence invariant:** Object expiry annotations cannot attest
to their own original deadline. Bind every generation to the exact tenant's
database artifact identity and original expiry, with complete artifact reads
bracketing complete object listings and no observed drift. The schema-4
receipt hashes the minimized artifact projection alongside object metadata;
it fails on missing, ambiguous or mismatched references. This is metadata
evidence, not byte integrity, transactional consistency, deletion or recovery
proof. Missing recovery references do not authorize longer active retention.

**File-clock invariant:** Copying or delaying a file upload must not renew its
original artifact deadline. Native uploads and restores carry an expiry-derived
Cloud Storage Custom-Time clock, while the bucket has both age fallback and
Custom-Time deletion eligibility rules for the exact tenant prefix. Restores
bind the destination window to a reviewed manifest, not the backup tenant's
window. Configuration and metadata receipts do not prove physical deletion:
[Cloud Storage lifecycle actions are asynchronous](https://docs.cloud.google.com/storage/docs/lifecycle#lifecycle_behavior).
The selected 28+7 bound still requires operated deletion/recovery evidence;
the policy is not relaxed to accommodate lifecycle lag.

### 4.5 Consistency, idempotency, and replay

The database ledger and job state are authoritative for admission, budget, and terminal status. Queue delivery is at-least-once in practice, so workers must claim through a durable compare-and-set/lease pattern and use idempotency at provider-adapter and artifact-write boundaries where supported. Exactly-once external provider execution must not be claimed unless the provider offers and the adapter verifies that guarantee.

Replays are operator-controlled and scoped to an operation/tenant. A replay must identify whether it resumes a safe internal stage, repeats a provider action, or rebuilds a derived index; it must never silently re-charge, overwrite an approved artifact, cross tenant boundaries, or bypass consent. Configuration changes apply to new jobs unless a documented revocation requires cancelling/rechecking in-flight work.

| Scenario | Expected behavior | Reason |
|---|---|---|
| Duplicate request or queue delivery | Return/continue the existing operation; do not reserve twice or create duplicate final artifacts. | Prevent double work and double billing. |
| Reservation/job write fails | Do not call the provider; return an observable retryable failure if appropriate. | No external side effect without durable admission. |
| Provider times out after possible completion | Mark outcome uncertain, reconcile before replay, and avoid blind retry unless idempotency is verified. | Prevent duplicate spend and inconsistent outputs. |
| Artifact write succeeds but status update fails | Reconcile by operation/artifact identity, then finalize or quarantine; do not expose unreviewed output. | Preserve privacy and recoverability. |
| Policy changes mid-job | Use recorded policy version, with explicit cancellation/recheck path for revocation. | Make decisions auditable and deterministic. |

## 5. Security and Privacy Considerations

- Authenticate every client route and enforce active tenant membership server-side. Verify row-level policy and API authorization independently; a hidden UI control is not authorization.
- Pass tenant identity from trusted runtime context into queries, jobs, graph edges, storage paths, and audit events. Add negative tests with two tenants for every new read/write path.
- Treat uploaded documents, URLs, graph imports, retrieved text, model output, and browser content as untrusted input. Validate schema, size, MIME/type, URL policy, parser limits, prompt-injection boundaries, and source ownership.
- Keep provider keys and signing credentials server-side in the existing secret boundary. Do not put key material, session cookies, raw customer text, or complete prompts/results into logs, test fixtures, or screenshots.
- Store artifacts privately. Serve only through authenticated, tenant-checked routes/proxy; avoid widening IAM solely to simplify signed URL creation.
- Enforce the owner-selected policy across all tenant data and files: up to 28 active days from each item's creation, followed by a seven-day recovery-only window, then permanent deletion. This decision does not yet prove that every tenant table, export, backup, or vendor copy follows the window. Any statutory or contractual exception must be narrowly justified, owner-approved, minimized, and represented as an explicit deviation; financial/credit and security/audit records are not silently exempt. Keep release blocked until coverage, hosted behavior, recovery, and post-deletion verification are evidenced.
- Require explicit approval and rollback for hosted database migrations, policy changes, secret rotation, IAM, retention/lifecycle changes, traffic shifts, public launch, and any paid external request. Billing alerts are not a hard spending cap.
- Use synthetic data in tests. For authorized course/community materials, use user-supplied/platform-approved exports and preserve attribution/provenance; do not inject browser cookies or bypass access controls.

## 6. Operational Readiness

No numerical SLO is approved by the evidence currently available. Define owners, targets, measurement windows, and thresholds before public rollout. Start by verifying that the following signals are available and trustworthy.

| Signal | Required evidence / alert | Owner | Launch gate |
|---|---|---|---|
| Customer workflow completion | Journey success by step, with failed login, source selection, generation, review, and export visible. Baseline and SLO still to be set. | Product/runtime owner | Required |
| Tenant and policy denials | Expected deny cases plus alert on unexpected cross-tenant access or policy bypass. | Security/runtime owner | Required |
| Job and provider lifecycle | Admission, queue delay, execution, timeout, retry, settlement/refund, and terminal state reconcile. | Runtime/operations owner | Required |
| Cost and budget | Per-tenant reservations/settlement reconcile; provider account hard cap and actual spend receipt verified before model-backed test. | Billing/provider owner | Required for metered providers |
| Artifact/source integrity | Source register is complete, links resolve, object access is private, and review gate is enforced. | Product/data owner | Required |
| Retention and deletion | Per-item expiry, object lifecycle, database deletion, recovery window, and vendor copies tested end-to-end. | Privacy/operations owner | Required |
| Build/deployment identity | Running image digest, source SHA, config/migration versions, route allowlist, and rollback revision are recorded. | Release owner | Required |
| Telemetry health | Bounded, redacted traces and alert delivery tested; missing telemetry is visible and does not corrupt durable job state. | Observability owner | Required |

**Rollout constraint:** use the existing controlled beta and disposable tenant for acceptance. First run read-only/configuration checks, then fixture-backed local tests, then one explicitly approved low-risk hosted test if needed. Promote only an immutable candidate with a tested rollback target and all critical gates accepted. No public promotion is implied by this design.

## 7. Alternatives Considered

| Alternative | Why considered | Why not selected |
|---|---|---|
| Replace Supabase/Cloud Run/Vercel with an all-in-one new stack | Could simplify a greenfield product. | Adds migration, identity, storage, privacy, and operational risk before proving the existing boundaries are the blocker. |
| Add a new observability platform immediately | Could provide a dedicated trace UI. | Existing trace and observability code already covers local contracts; hosted delivery and alerts need evidence first. New infra expands surface area and cost. |
| Build a second release tracker or orchestration service | Might look like more structure. | Creates competing sources of truth. Keep the execution board canonical and make this design its architecture companion. |
| Run 10,000 synthetic personas now | Could generate broad hypotheses quickly. | Current small synthetic pilot did not pass its quality gate; increasing scale cannot fix role fidelity or prove willingness to pay. Validate with real interviews first. |
| Automate authenticated Skool collection with cookies | Could increase archive coverage. | Cookie injection/platform-control bypass is not an acceptable product or collection design. Use an authorized export or owner-provided source material. |

## 8. Open Questions

1. **Customer journey:** The Work-profile session and one Memory view have been matched read-only, but the full signed-in journey through approved-source selection, draft generation, provenance, review, and export still needs current-source acceptance receipts. Reconfirm the exact app revision and tenant at the start of that run.
2. **Hosted target:** What exact service, revision, tenant, and Supabase project are authorized for the next read-only parity check? The internal-beta tenant shares a Supabase project with production, so beta approval does not imply project-wide migration permission.
3. **Retention:** The owner selected 28 active days plus seven recovery-only days for all tenant data and files. Do verified legal, billing, backup, or vendor obligations require a narrowly approved exception? The local policy migrations and tests do not establish complete coverage or hosted enforcement.
4. **Archive scope:** Can the user supply or export the remaining authorized lesson pages and video references through a platform-supported path? Current archive counts disagree and are partial; no hosted import should run until reconciled.
5. **Product wedge and buyer:** Which repeatable client deliverable is most frequent and costly for reachable small AI/dev consultancies? The MiroFish output is synthetic and insufficient; real interviews are needed.
6. **Release ownership:** Who owns operations, privacy/legal, provider billing, rollback, and customer support approvals? The evidence ledger requires accountable reviewers.
7. **Canonical evidence state:** Refresh the release verifier and reconcile stale candidate SHAs/category counts in the execution board before deriving any numeric completion rate.

## 9. Decision and Next Steps

**Recommendation:** adopt this as the architecture companion to the existing production-readiness board. Do not add a replacement infrastructure stack or treat a new tool as progress by itself. Keep one active critical-path item at a time and parallelize only independent, read-only work that does not compete for the same browser, tenant, or files.

| Milestone | Deliverable | Exit criteria |
|---|---|---|
| M0: Evidence baseline | Reconciled candidate SHA, worktree state, release-verifier result, test receipts, known environment identities, and a corrected board summary. | One current source of truth; stale evidence explicitly labeled; no guessed percent. |
| M1: Local customer journey | Current-source end-to-end flow from sign-in fixture/test tenant through approved sources, draft, provenance, review, and export; targeted negative/security cases. | Journey passes on supported runtime; evidence distinguishes fixtures from real customer data; defects fixed and regression tests added. |
| M2: Archive/import readiness | Canonical inventory and coverage report for user-supplied/authorized material; source pack validates; import run is dry-run first and destination tenant explicitly verified. | All in-scope items accounted for, no unresolved duplicate/count discrepancy, no unauthorized collection, import is idempotent and tenant-scoped. |
| M3: Hosted parity/security | Connect intended browser; compare same candidate, same user, same tenant read-only; verify route/config/build identity and isolation. | Source SHA/image/config match is established or differences are listed; two-member isolation and storage-proxy/retention behavior verified before any migration. |
| M4: AI/evaluation operations | Re-run deterministic evaluations and trace tests on final candidate; define model-backed test cases and provider-side hard limits only if a fresh approval is granted. | Offline gate passes; hosted telemetry claims have real receipts; synthetic evidence remains labeled; no unauthorized spend. |
| M5: Release decision | Strict release verifier, complete evidence bundle, security/operations/privacy/billing approvals, deployment identity, and rollback plan. | Verifier returns ready for the exact candidate and all required reviewers accept. Otherwise record “not ready” with concrete missing gates. |

M0 can be completed locally without external access. M1 should follow immediately. M2/M3 must not mutate hosted data until source coverage, target environment, tenant, and rollback are explicit. The selected all-tenant 28+7 retention rule is not a release pass until table/object coverage, any explicitly approved exceptions, backup/vendor behavior, recovery, and hosted deletion checks are complete. M4 does not require another provider run to make progress. M5 is a decision gate, not a deployment authorization.

## Appendix A. Evidence Rules

- **Local deterministic test:** proves only local code behavior represented by its fixtures.
- **Mock-backed browser test:** proves UI/API contract under the configured mocks, not signed-in data or service parity.
- **Synthetic persona simulation:** tests scenario mechanics and response quality, not demand, budget ownership, or willingness to pay.
- **Partial source archive:** proves only the listed pages/segments and must remain labeled partial.
- **Hosted acceptance:** requires named service/revision, source/image identity, tenant/user scope, timestamp, read/write boundary, and result artifact.
- **Release acceptance:** requires the strict verifier and every mandatory reviewer/evidence category for the same candidate. Passing a subset never implies readiness.

