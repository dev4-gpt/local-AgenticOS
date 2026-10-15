# AgentOS System Design: Evidence-Based Production Readiness

**Status:** Proposed design; not a production approval  
**Owner:** Aryaman  
**Last updated:** October 14, 2026  
**Authors:** AgentOS project team  
**Reviewers:** Product owner, runtime/security owner, operations/billing owner (to be named)  
**Related docs:** [Production-readiness execution board](../production-readiness-execution-board.md), [canonical production topology](../production-topology-2026-09-25.md), [production-readiness program](../superpowers/plans/2026-09-26-production-readiness-program.md)  
**Scope:** Establish one architecture and test-led sequence for completing AgentOS readiness without confusing local tests, synthetic studies, partial imports, or historical deployments with release evidence.

## 1. Abstract

AgentOS is a governed AI workspace with a public intake surface, tenant-scoped workspaces, asynchronous agent jobs, provider controls, artifacts, memory/graph capabilities, and operator tooling. The intended workflow is: a team submits an approved request and sources; AgentOS checks identity, tenant membership, capability, policy, and budget; a bounded job runs; the result is stored with provenance and review state; a human decides whether it can be used or exported.

The system has substantial local implementation and regression coverage, but it is not accepted as production-ready. The current strict verifier still lacks a release-ledger record and reports 37 required evidence categories unevaluated on the last documented candidate. A same-user signed-in journey and local/cloud parity are not verified against the intended browser session. The Skool archive is partial and has not been imported to a confirmed hosted graph target. MiroFish evidence is synthetic and its quality gate failed; it is not buyer validation.

This design does not add another runtime stack. It sets the boundaries, contracts, tests, and ordered milestones for completing the existing system. A local green test is evidence only for the behavior it actually exercised. Hosted mutation, paid provider use, public rollout, and destructive data actions remain separately approved operations.

## 2. Goals and Non-Goals

| Goals | Non-goals |
|---|---|
| Make one customer workflow verifiable from sign-in through reviewed, source-linked deliverable and export. | Claim broad enterprise readiness or market demand from implementation activity alone. |
| Ensure every job is tenant-scoped, policy-gated, budget-bounded, traceable, and recoverable. | Replace the existing Next.js, Supabase, Cloud Run, Vercel, worker, or graph architecture without evidence that replacement is necessary. |
| Establish a canonical source-pack and graph-import acceptance process with coverage and provenance. | Use session cookies or bypass platform controls to collect Skool content. Use owner/platform-approved exports or material supplied by the user. |
| Compare a source-identified local candidate with the exact intended hosted beta revision using read-only checks first. | Treat the marketing site, legacy Cloud Run service, or a single-tenant Cloud Test URL as a shared customer login. |
| Make release decisions from versioned evidence and explicit human approvals, not subjective percentages. | Treat MiroFish personas as real buyers or run another provider-backed simulation without fresh cost authorization. |
| Preserve cost, privacy, retention, rollback, and tenant-isolation boundaries through every milestone. | Change production Supabase, IAM, retention, bucket lifecycle, domains, service traffic, or public visibility as part of this design. |

## 3. Background and Problem Statement

The repository contains the main application, client runtime, public product/intake surface, worker routes, provider adapters, Supabase-backed tenant data, graph and notebook workflows, observability, and an evidence verifier. The topology document identifies the current internal-beta service as a controlled Cloud Run runtime, while the public Vercel surface is a separate editorial/intake experience. Historical and current documents must be reconciled before deployment decisions because service targets and evidence can become stale.

The readiness problem is not a lack of features or tools. It is that several evidence classes are being mixed: fixture-backed UI checks versus a signed-in customer flow; local configuration versus hosted configuration; partial archive versus complete import; synthetic personas versus buyer interviews; and a deployed image versus an image tied to a current source commit. That makes status hard to interpret and creates rework when browser profiles, tenants, or cloud targets are ambiguous.

**Design invariant:** Every claim of readiness must be tied to one immutable source candidate, one named environment/tenant, a bounded test or operation, a timestamped result, and an evidence artifact. A failed or unknown critical gate blocks release regardless of the number of passing local tests.

**Known evidence snapshot (2026-10-14):** The latest pushed SHA recorded by the active work log is `487adba836456a990f7de9e5b0b434a5599f13d6`. Local focused tests, deterministic AI checks, typecheck, trace tests, and source-pack parsing have passed on current or code-identical revisions; these are local-only evidence. The release verifier last documented a non-ready result with 37 unevaluated categories and no ledger record. The board contains older candidate SHAs in several sections and must be reconciled before relying on its current-head claims. The connected Chrome surface available to this task exposes only the unrelated College profile, so the signed-in Veloce flow remains unobserved.

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
- Honor per-item retention and deletion policy only after the effective policy, backup behavior, object soft-delete window, database cleanup, and vendor copies are reconciled. The selected 45-day customer-data period conflicts with a documented seven-day object recovery window if interpreted as permanent deletion exactly at day 45; retain recovery until a compliant end-to-end policy is approved.
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

1. **Browser access:** Which exact signed-in Veloce Chrome profile/tab can be connected to this task so the same-user journey can be recorded? Current connected browser inventory exposes only the unrelated College profile.
2. **Hosted target:** What exact service, revision, tenant, and Supabase project are authorized for the next read-only parity check? The internal-beta tenant shares a Supabase project with production, so beta approval does not imply project-wide migration permission.
3. **Retention:** Does the 45-day rule mean logical inaccessibility at day 45 or irreversible deletion after the recovery window? Who approves backup/vendor exceptions? Keep the seven-day recovery window until resolved.
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

M0 can be completed locally without external access. M1 should follow immediately. M2/M3 must not mutate hosted data until source coverage, target environment, tenant, and rollback are explicit. M4 does not require another provider run to make progress. M5 is a decision gate, not a deployment authorization.

## Appendix A. Evidence Rules

- **Local deterministic test:** proves only local code behavior represented by its fixtures.
- **Mock-backed browser test:** proves UI/API contract under the configured mocks, not signed-in data or service parity.
- **Synthetic persona simulation:** tests scenario mechanics and response quality, not demand, budget ownership, or willingness to pay.
- **Partial source archive:** proves only the listed pages/segments and must remain labeled partial.
- **Hosted acceptance:** requires named service/revision, source/image identity, tenant/user scope, timestamp, read/write boundary, and result artifact.
- **Release acceptance:** requires the strict verifier and every mandatory reviewer/evidence category for the same candidate. Passing a subset never implies readiness.

