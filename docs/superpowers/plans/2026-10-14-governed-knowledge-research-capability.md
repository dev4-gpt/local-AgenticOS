# Governed Knowledge and Research Capability Plan

**Status:** Proposed follow-on product plan; not a release approval  
**Updated:** 2026-10-14  
**Scope:** Fold the reusable knowledge, research, document-understanding, and review capabilities discussed in this chat into Veloce AgentOS. Exclude the Luma AI project idea.

## Goal

Let a small AI automation or development consultancy select approved material for one client, research and organize it with traceable provenance, and produce a useful, source-linked proposal, audit, or report for human review without mixing client context or taking unapproved external actions.

This is a staged capability plan, not a replacement for the active production-readiness goal and not a claim that the product is production-ready.

## Done Means

1. A customer can create or select an isolated client knowledge space and ingest only sources they are authorized to use.
2. Each source and extracted passage retains tenant/client scope, source identity, capture time, content type, rights/retention metadata where available, and a link back to the original.
3. Search and synthesis can show which approved source passages support each material claim; unsupported or conflicting claims are marked, not silently filled in.
4. A user can produce a proposal, audit, or recurring client report from selected sources, inspect the source register, edit/reject the draft, and approve it before export or delivery.
5. Authentication, tenant isolation, retention/deletion, spend limits, redacted traces, and failure/retry behavior have automated tests and hosted evidence for every enabled capability.
6. The chosen customer workflow has evidence from real interviews or a manually assisted pilot. Synthetic personas and simulations remain hypothesis tools, not market validation.

## Current State

The repository already contains useful foundations: [Notebook Studio](../../../src/app/notebook/page.tsx), [tenant source import](../../../src/app/api/client-runtime/source-import/route.ts), [memory graph](../../../src/app/api/client-runtime/memory-graph/route.ts), [graph utilities](../../../src/lib/graphify.ts), [research routing](../../../src/lib/researchProviderRouter.ts), [research worker adapters](../../../src/lib/researchWorkerAdapters.ts), and [Notebook execution provenance](../../../src/lib/clientNotebookExecutionProvenance.ts). These indicate implementation surfaces, not proof of complete or production-safe behavior.

The active release gate is still open. The latest recorded checks report `releaseReady: false` because the release-ledger bucket is not configured and 37 release-evidence fields are unevaluated. Local deterministic AI checks passed, but include no model samples; Cloud Test, Internal Beta, and local views have not been proven to represent the same build, principal, or data. The Skool archive remains partial and has not been imported; the current policy-safe path is to reconcile owner-supplied authorized files or obtain an approved export, not to bypass access controls or forward browser cookies. The MiroFish run is synthetic and does not establish buyer demand.

For the full live status and track owners, use the [production-readiness execution board](../../production-readiness-execution-board.md) as the source of truth. Do not copy its status into this plan without refreshing the evidence.

## Gap

- Existing import, graph, Notebook, and research components need one end-to-end product contract for source selection, extraction, retrieval, citations, reviewer actions, and export.
- Content provenance, client-level separation, uncertain extraction, conflicting evidence, and source rights/retention need to remain visible across the whole workflow.
- Document and media parsing must be bounded, isolated where needed, and optional by content type; integrations such as OCR, transcription, or research frameworks must earn their place through a measured gap and license/security review.
- Hosted parity, data lifecycle, and release evidence are incomplete, so new capabilities cannot be promoted based only on local success.
- The initial buyer segment and repeated deliverable are still hypotheses. The working hypothesis is a small consultancy repeatedly turning client material into a proposal, audit, or report.

## Plan

Effort is a relative planning estimate, not a commitment. S = small, M = medium, L = large. Re-estimate after each phase gate.

| Step | Action and preconditions | Effect / exit evidence | Effort and cost posture |
| --- | --- | --- | --- |
| 0. Close current release tracks | Continue the active production-readiness goal using its execution board. Keep provider calls at the approved $0 paid-spend limit; keep hosted writes/deploys held until the exact target, credentials, and approvals are verified. | Current customer journey, source-import, parity/security, AI evaluation, MiroFish, and release-verifier evidence is recorded with unresolved items named. No feature work is represented as release proof. | M/L; no new service spend. |
| 1. Validate the wedge and freeze v1 scope | Precondition: use existing outreach and available buyer access; no provider spend required. Interview reachable small AI/dev consultancies about their repeated client deliverable, frequency, time/cost, error risk, current process, and willingness to pilot. | Choose one first deliverable only if multiple interviews support it; otherwise preserve the three formats as hypotheses and run a manually assisted discovery pilot. Record disconfirming evidence and do not treat MiroFish personas as customers. | S/M; founder time. |
| 2. Define the source and evidence contract | Precondition: v1 user/workflow is chosen. Specify source types, client/tenant scope, source IDs, content hashes, extracted segments, citations, confidence, conflicts, rights/consent, retention, deletion lineage, and reviewer/export states. Map each field to existing schemas before adding tables. | Reviewed architecture note and data contract; no duplicate graph or memory system. Threat model covers prompt injection in source material, cross-client leakage, SSRF/import abuse, malicious files, and sensitive data in logs. | M; local design work. |
| 3. Reconcile and strengthen the existing pipeline | Precondition: contract accepted and current release evidence no longer changing the affected boundary. Inspect Notebook, source import, graph, research adapters, and provenance. Add only missing behavior: bounded parsing, source-to-segment lineage, selected-source retrieval, citation validation, unsupported-claim marking, and reviewer feedback. | Automated tests prove tenant scope, source selection, citation integrity, duplicate/idempotent import, malformed/untrusted-content handling, and export/register consistency. Existing interfaces remain compatible or get an explicit migration plan. | M/L; no new dependency by default. |
| 4. Ship the narrow local workflow | Precondition: Steps 1-3 pass locally. Implement one complete flow: choose client space and approved sources → select proposal/audit/report template → produce a source-grounded draft → inspect citations and source register → edit/reject/approve → export. Keep consequential actions manual. | Playwright journey and fixture-based evaluations pass on the supported runtime. Provider-free fixtures establish behavior; any live model test needs its own explicit budget/provider approval. | M; existing infrastructure first. |
| 5. Evaluate optional extraction/research components | Precondition: measure a concrete failure in Step 3 or 4. Assess one candidate at a time (for example, OCR/document parsing or a research framework) for license, maintenance, isolation, dependency footprint, privacy, quality, cost, rollback, and tenant behavior. | A written adopt/adapt/reject decision plus comparative fixtures and a rollback path. Add a component only if it materially improves a measured use case; keep it behind an adapter/feature gate. | S/M per candidate; no production GPU assumption. |
| 6. Prove hosted enablement and data lifecycle | Precondition: release gate is clear, approved non-production target is identified, migrations/config are reviewed, and zero-cost/hard-cap conditions are verified. Run same-build/same-principal tenant A/B tests for import, retrieval, draft, citation, review, export, retention, deletion, and rollback. | Signed evidence packet binds code/image, environment, tenant, test results, budgets, traces, retention, and rollback. Enable only the tested tenant/capability; no inferred parity from matching page counts. | L; hosted changes remain separately authorized. |
| 7. Pilot with real users and decide | Precondition: Steps 1-6 have a usable controlled pilot and the owner approves audience/data scope. Run a small, manually supported pilot with customer-owned or explicitly approved sources. | Record task completion, review edits, grounded-claim rate, time saved, failure modes, data handling, and willingness to continue/pay. Decide to iterate, narrow, or stop based on evidence; synthetic runs are reported separately. | M; spend must stay within explicit limits. |
| 8. Consider adjacent capabilities | Precondition: the focused workflow is reliable and buyers show a need that the current product cannot meet. Evaluate user-provided exports/official connectors for broader knowledge ingestion. Consider computer-use or code/data execution only as a separate isolated-worker project with per-tenant grants, deny-by-default egress, ephemeral execution, time/resource caps, full traces, and human confirmation for side effects. | Separate product decision and security/release gate. No browser-cookie injection, access-control bypass, unrestricted remote shell, or default autonomous external actions. | L; defer until evidence and isolation exist. |

## Product Boundaries

- **Build toward:** client-isolated, source-grounded knowledge and research feeding reviewable business deliverables.
- **Reuse before adding:** Notebook, source import, graph, research router/workers, existing approval/provenance, and observability. Do not replace the memory/graph foundations wholesale with a new framework.
- **Optional, not assumed:** OCR, transcription, external research frameworks, or additional connectors. Check their current licenses and terms before any adoption; this plan does not assert a license grant.
- **Later and separately gated:** computer use, sandboxed code/data execution, broad personal knowledge ingestion, and external write actions.
- **Out of this product scope for now:** a full ArtCraft/Storytold creative suite, uncensored model distributions, and heavy media-generation/GPU infrastructure. Treat free GPU capacity as an experiment, never as a production guarantee.
- **Explicit exclusion:** the Luma AI project idea and any product work specific to it.

## Cost, Safety, and Replanning Rules

1. Add no runtime dependency or hosted service until a measured gap justifies it.
2. Keep model/provider calls disabled by default and honor the current $0 paid-spend limit; free-tier availability is not assumed to guarantee quota, zero overage, or future access.
3. Treat imported text, documents, links, and transcripts as untrusted data, never as instructions. Preserve source identity and isolate parsing from application secrets.
4. Never import or expose one client's sources to another client; test cross-tenant reads, writes, citations, caches, jobs, exports, and deletion.
5. Do not scrape authenticated platforms by injecting session cookies or bypassing platform controls. Use user-provided authorized files/exports or supported official interfaces, subject to scope and terms.
6. Replan if buyer interviews contradict the wedge, a source/licensing restriction blocks an input, isolation or retention evidence fails, provider costs exceed the approved cap, or a new dependency increases operational risk without a measured benefit.

## Current Next Actions

1. Keep executing the active production-readiness board; do not replace or mark that goal complete with this capability plan.
2. Refresh the release verifier and close or explicitly assign its outstanding evidence fields.
3. In parallel, prepare a short interview script and record the first real buyer conversations; do not launch a broad platform pitch or paid campaign.
4. After the wedge and source contract are reviewed, map the smallest implementation delta in Notebook/source import and add focused offline tests before any hosted change.

## Decision Record

This plan incorporates the reusable knowledge and research direction discussed in the shared conversation while excluding the Luma AI project idea. It is a proposed sequence for future product work. It neither authorizes hosted mutation/deployment nor changes the acceptance criteria of the active production-readiness goal.
