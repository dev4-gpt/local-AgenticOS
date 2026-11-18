# Veloce AgenticOS: Current-State Handoff

**As of:** 2026-10-18 UTC  
**Purpose:** Explain the existing product, the production-readiness goal, work
completed, evidence boundaries, and the proposed next integration direction.  
**This is a narrative handoff, not a second execution tracker.** The
[execution board](./production-readiness-execution-board.md) and
[system design](./architecture/agentos-system-design-2026-10-14.md) remain the
authoritative operational plan and architecture.

## Executive Summary

Veloce AgenticOS is an existing, broad AI-workspace product, not just a landing
page or one chatbot. Its intended operating loop brings together identity and
tenant context, research and memory, agent/workflow execution, creative
artifacts, governance and human review, and controlled delivery. The codebase
contains a substantial Next.js application, tenant runtime, Supabase data and
policy layer, worker/provider integrations, public intake and commercial
surfaces, operator tooling, and a large offline verification suite.

The work requested in this project was to move this existing system toward
evidence-backed production readiness, using the canonical system-design
document, architecture diagram, and repository structures as the implementation
source of truth. The goal is not satisfied by feature count or a guessed
percentage. It is satisfied only when each required customer, import, parity,
evaluation, cost, retention, and release gate has current evidence tied to an
exact source candidate and environment.

At the source snapshot used for this handoff, branch
`wip/backup-2026-10-03` was clean and equal to `origin` at `f7260ed` before this
documentation update. No application-code change is made by this handoff. The
strict verifier on `f7260ed` returned `releaseReady=false`: the release ledger
bucket is not configured, the release environment is unresolved, and 59
ledger-backed categories were unevaluated. This is **not production-ready**.

## Original Goal

The agreed objective has six connected workstreams:

1. **End-to-end customer journey:** Verify the intended journey from public
   request and onboarding through tenant activation, first useful action,
   reviewed artifact, usage/budget, support, export/offboarding, and recovery.
   Include denial, retry, billing/webhook, and two-tenant isolation cases.
2. **Authorized Skool-to-graph import:** Build an owner/platform-authorized
   path from supplied classroom material into a source-linked knowledge graph.
   Reconcile every in-scope lesson, preserve provenance and scope, and prove a
   post-import graph can be queried and removed. Do not bypass platform
   controls or call a partial archive complete.
3. **Local/cloud parity:** Compare like-for-like product editions using an
   identified source, image, deployment, configuration, schema, identity, and
   tenant. Verify what is intentionally different as well as what matches.
4. **AI evaluation and observability:** Keep deterministic, candidate-bound
   evaluations reproducible; test tenant-safe, redacted traces, job lifecycle,
   alerting, and budget/ledger reconciliation. Model-backed evaluations require
   separate bounded-cost approval.
5. **Cost-controlled MiroFish buyer pilot:** Test hypotheses with a sanitized
   seed, pinned tool/model inputs, bounded cost and quality review. Synthetic
   personas are research aids, never customer interviews or market validation.
6. **Strict release verification:** Bind all critical results, approvals,
   migrations, deployment identity, retention/recovery proof, and rollback to
   one clean immutable candidate. A failed or missing critical gate means no
   release claim.

The cross-cutting data policy is **28 days of active tenant retention plus a
separate seven-day recovery window**, with deletion, backup, and restore behavior
to be verified. No deployment, hosted-data mutation, external publishing, or
provider/infrastructure spend is authorized by ordinary local development.

## What Is In The Product

The six user-facing operating lenses in the app are **Command, Context,
Orchestrate, Create, Govern, and Deliver**. They describe the product's
operating model; they should not be confused with the six production-readiness
workstreams above or the separate proposal for six Creator OS agents.

| Product area | What exists in the repository | Evidence boundary |
| --- | --- | --- |
| Command and intake | Public product/intake and onboarding routes; tenant login/session flows; intent, request, and workflow entry points. | Local route, security, and contract tests are not a complete live signup/checkout/provisioning journey. |
| Context and memory | Tenant records, memory graph, source packs, classroom research, notebooks, notebook sources/chunks, citations, and research records. | Local parsers, graph normalization, and notebook journeys are tested; the Skool archive is partial and no complete hosted import is verified. |
| Orchestrate | Durable job/request routes and worker paths; workflows, pipeline, boards/Kanban, Loop, Paperclip, Ruflo, and multi-agent room surfaces. | Local lifecycle, retry, settlement, and tenant-boundary tests do not prove all hosted jobs execute or settle correctly. |
| Create | Creative and content workflows, generated artifacts, Hermes content factory, visual QA, and related production/review surfaces. | Availability varies by edition/configuration; local feature presence is not proof of current hosted parity or production quality. |
| Govern | Authentication/membership checks, capability and provider policies, credential handling/revocation, budgets/credits, approval gates, audit/telemetry, retention controls, and release verification. | Source and mock tests verify many controls; actual hosted enforcement, sink delivery, billing reconciliation, and 28+7 physical deletion/recovery remain open. |
| Deliver | Artifact storage metadata, provenance, review state, authenticated upload/download/delivery paths, exports, support and lifecycle/offboarding operations. | Local ownership and approval contracts are tested; the full hosted reviewed-artifact/export journey and backup restore are not accepted. |

The repository also contains a public Vercel/front-door experience and separate
tenant workspace/runtime surfaces. Those are distinct product/security
boundaries. A successful marketing page or a different AgentOS deployment is
not workspace parity evidence.

## What Has Been Built And Changed

- A documented system design defines the logical components, request lifecycle,
  data contracts, failure behavior, trust boundaries, evidence taxonomy, and
  milestone order. Its architecture diagram is the canonical visual companion.
- The application and data layer include tenant-aware APIs and schemas for
  records, notebooks and citations, graph/source imports, async jobs, artifacts,
  workflows, room conversations, boards, Paperclip, Ruflo, budget/credit and
  audit/observability flows.
- Human control is represented in contracts for capability checks, approval
  state, artifact ownership, source provenance, bounded execution, budget
  reservation/settlement, and delivery. Many local tests specifically prevent
  cross-tenant access, unreviewed download, invalid references, duplicate work,
  or false-success accounting.
- Retention work covers a broad set of tables, object clocks/crosswalks, restore
  windows, and cleanup eligibility. Local schema/lifecycle tests are extensive;
  hosted behavior for the agreed 28+7 policy has not been demonstrated.
- A separate free Supabase staging project was created deliberately so schema
  installation and synthetic two-tenant isolation preparation would not touch
  the existing Veloce project. Approved schema and synthetic fixture actions
  are recorded on the execution board. This is staging preparation, not a
  customer run or production change.
- The Skool register-to-graph importer was hardened so missing transcript scope
  remains `unknown`, excerpts remain excerpts, invalid scope labels are
  rejected, and source-provided verification flags are not trusted. This
  improves provenance accuracy without claiming missing videos or lesson text
  were captured.
- MiroFish evidence capture/review and budget/evidence gates exist in the repo.
  Synthetic outputs are explicitly labeled as hypotheses; they cannot be
  promoted into buyer validation.

## Results And Status

| Workstream | Current result | Status |
| --- | --- | --- |
| Candidate and release | Clean pushed `f7260ed` was the exact source before this docs update. Strict check: `releaseReady=false`; ledger bucket and release environment block; 59 evidence categories were not evaluated. | **Open; release prohibited by evidence gate.** A documentation commit changes the candidate and needs a fresh strict run. |
| Customer journey | Local Notebook execution/review/provenance behavior has meaningful coverage. Prior candidate results include Notebook `6/6`, source/provenance `46/46`, lifecycle `179/179`, and all `62/62` declared tenant tables classified across 88 migrations. | **Local portions pass; hosted customer journey unverified.** No passing current-candidate Auth/RLS/job/review/export/recovery journey. |
| Staging isolation | Schema and synthetic two-tenant fixture preparation were separately approved and recorded. A current-candidate Auth/read check was attempted but canceled at the hidden key prompt because the PTY was not visible. Its receipt records zero sign-ins and zero hosted requests. Focused `f7260ed` tests for Skool parsing and the owner-isolation harness passed `64/64`. | **Not tested against hosted Auth or RLS.** No credentials were entered and no hosted request was made by that attempt. |
| Skool archive/import | Private graph: 1,471 nodes / 10,735 edges; 107 of 110 lessons have page-text segments; overall completeness remains false. Video audit distinguishes YouTube embeds and Skool-native players but does not save their media. Transcript scope is 0 full, 1 excerpt, 2 unknown in the normalized transcript subset. | **Partial, not imported as a complete hosted archive.** Authorized full exports and destination confirmation remain needed. |
| Local/cloud parity and isolation | Read-only observations identify service/config differences; the selected Cloud Test snapshot reports a 14-day runtime policy versus the 28+7 target, while source identity and behavioral recovery proof are missing. | **Open/blocked.** No current same-identity, same-tenant, same-build acceptance. |
| AI evaluation and observability | Offline deterministic AI suite previously passed `24/24` with zero model samples. Local tests cover trace redaction, observability resilience, lifecycle, and accounting boundaries. | **Local engineering evidence only.** Hosted telemetry delivery/alerts, real spend reconciliation, provider quality, and end-to-end operations remain open. |
| MiroFish and buyer evidence | Validation harness and synthetic scenario artifacts exist. | **No market-validation claim.** No verified Design Studio 9 outcome or buyer acceptance. A no-cost public-presence review was scoped, not delivered or published. |
| Retention/recovery | Policy is 28 active days plus seven-day recoverability; local inventory and lifecycle checks are broad. | **Hosted enforcement unverified.** Metadata/soft-delete settings alone do not prove expiration, permanent deletion, backup expiry, or restore. |

These results are not a meaningful single completion percentage. The
execution board's strict gate count and customer-action evidence matrix are the
right ways to report progress; a critical open gate cannot be averaged away.

## The New Integration Idea: Proposal, Not Existing Capability

The pasted conversation describes three products: (1) Veloce AgenticOS as the
host, (2) a Creator OS with six individually sandboxed pillar agents, and
(3) a Simlink/REA reverse-engineered adapter. It proposes native and external
adapters with private per-adapter memory plus a shared, reviewable workspace
memory. It also suggests Perplexity SPACE as a possible microVM execution
backend.

That is a reasonable architecture direction to investigate, but the pasted text
is not evidence that these components are currently integrated. In this repo
and this work session, we have **not** inspected the Creator OS or Simlink/REA
repositories, implemented a shared-memory adapter contract, connected their
stores, or deployed SPACE. The discussion's claimed APIs are suggestions, not
verified interfaces. SPACE would be an execution-isolation backend, not the
shared-memory layer itself; its operating requirements, maturity, license, and
cost need current review before adoption.

The proposal to take into a separate planning pass is:

- Veloce owns workspace identity, policy, review, and shared-memory authority.
- Each adapter receives a stable identity and a private namespace. It may read
  its own records and approved shared records, but not another adapter's
  private namespace.
- Adapter-private writes remain private by default. Promotion requests a
  shared-memory write and records source adapter/agent, timestamp, provenance,
  confidence, and host approval where required.
- A versioned contract should cover context reads, events, task execution, and
  promotion. The host enforces scopes; adapters do not receive raw database
  credentials or unrestricted shared-store access.
- Creator OS agents should be independent least-privilege principals.
  Simlink/REA should be treated as a fragile, untrusted connector, with upstream
  terms review, network/egress policy, version pinning, failure isolation,
  rebuildable private state, and no direct authority to promote claims.
- A sandbox backend such as SPACE can be evaluated behind the execution
  contract later. It does not replace Veloce's tenant memory, provenance,
  approval, or retention system.

Keep this proposal separate from production-readiness gates until the relevant
repositories, ownership, licenses/terms, data flows, interfaces, and acceptance
criteria are reviewed. It must not silently expand hosted scope or weaken the
existing tenant and retention model.

## Next Work In Order

1. Keep the six production-readiness workstreams and evidence rules as the
   active Veloce goal. Re-run the strict verifier after this documentation
   change and attach its result to the resulting clean candidate.
2. For the staging isolation attempt, use a user-visible terminal and the
   reviewed hidden-input command. Enter the staging anon/publishable key and
   existing test credentials only into the local hidden prompt. Never put them
   in chat, a file, command arguments, or environment variables. Stop if the
   destination, account, target identity, or request behavior differs from the
   approved 142-request/$0 scope.
3. Reconcile current Skool evidence with the source inventory; obtain only
   permitted full transcripts/media or owner exports; report each lesson and
   video state accurately; confirm the import tenant before any import.
4. Continue local/cloud parity and retention work from the selected deployment
   identity, then prove hosted two-tenant behavior and 28+7 lifecycle only in
   specifically authorized staging. Do not extrapolate from local PostgreSQL
   or configuration metadata.
5. Refresh local AI/observability and MiroFish evidence on the exact candidate.
   Keep provider calls at zero unless there is new hard-cap approval. Obtain
   actual human/buyer review before making customer-value or market claims.
6. Run the release checklist and strict verifier against one clean candidate.
   Do not deploy or announce production readiness while required categories,
   operational/legal review, rollback evidence, or customer acceptance remain
   open.

## Primary References

- [Canonical AgentOS system design](./architecture/agentos-system-design-2026-10-14.md)
- [Production-readiness execution board](./production-readiness-execution-board.md)
- [Customer journey acceptance matrix](./customer-journey-acceptance-matrix-2026-09-26.md)
- [Production release acceptance checklist](./production-release-acceptance-checklist.md)
- [Skool coverage audit](./skool-coverage-audit-2026-10-15.md)
- [Retention data-class inventory](./retention-data-class-inventory-2026-10-15.md)
- [Disposable database rehearsal](./disposable-database-rehearsal.md)
- [MiroFish buyer-pilot plan](./mirofish-real-buyer-pilot-2026-09-26.md)
