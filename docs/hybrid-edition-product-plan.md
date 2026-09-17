# Veloce Hybrid Edition: Current Status and Product Plan

**Status:** Product decision and execution plan
**Updated:** 2026-09-15
**Current release posture:** Staged GA candidate; not yet public-production GA.
**Decision:** Veloce will evolve as three compatible operating modes: Managed
Cloud, Private Local, and Hybrid. Hybrid is the default direction for
capabilities that need customer-owned files, hardware, local models, or local
tools.

This document is the current product planning record. It does not replace the
immutable release ledger or acceptance evidence. If a statement in this
document conflicts with current evidence, the evidence and strict verifier win.

## Product model

```text
Cloud app: identity, workflow, policy, approval, audit, tenant state
                 |
                 | narrow, authenticated, tenant-scoped jobs
                 v
Paired Local Worker: approved files, local models, local CLI/GPU, local tools
                 |
                 | selected result or approved artifact only
                 v
Cloud app: progress, review, optional artifact sync, audit outcome
```

The Local Worker is a customer-installed execution component, not a general
remote shell and not a permanent cloud-to-device tunnel. A cloud job cannot
read a local file, use a local credential, or execute a local command unless
the paired worker has an active policy grant for that specific capability and
resource scope.

## Rules already decided

1. Customers start work and approve consequential actions in the cloud app.
2. The worker may operate within a customer-approved scope after a
   user-started task. It must request a new approval for a new scope,
   destructive write, external sharing, paid call, publishing/outreach,
   security execution, or code/infrastructure change.
3. Source folders and vaults are selected by the customer. They do not need to
   copy all data to a special folder.
4. The worker has a separate Veloce workspace for generated artifacts,
   temporary files, and job state. It must not write to source locations unless
   the approved job explicitly permits it.
5. Default synchronization is job metadata and selected results, not raw local
   files, local paths, credentials, browser sessions, or complete vaults.
6. Local credentials live in the operating system's secure secret store. The
   cloud stores only a credential reference where needed, never a copy of a
   local provider key.
7. Catalog visibility is never execution permission. A capability needs the
   tenant's manifest, policy, budget, secret/IAM boundary, and its own evidence
   packet before it is active.

## Current status matrix

`Local available` below means the capability exists in the private
operator/local environment or has a practical local execution path. It does
**not** mean that it is ready to be distributed as a supported customer
feature. `Cloud state` describes the staged candidate's intended product
posture, not merely whether a UI route exists.

| Capability | Local available | Managed cloud state | Hybrid decision | Why it remains controlled | Next evidence or build step |
| --- | --- | --- | --- | --- | --- |
| Local files, vaults, Obsidian, local CLI sessions | Yes | Not exposed as filesystem/session access | Local Worker, selected sources and scoped local actions | Cloud must not inherit a customer's filesystem, Mac keychain, browser sessions, or personal subscriptions | Signed worker; pairing; path/vault grants; local policy enforcement; safe result sync |
| Ollama and local models | Yes | No assumption of customer hardware/model state | Local Worker model adapter | Hardware, data residency, model availability, and local data are customer-specific | Model discovery, allowed-model policy, local job limits, offline/outage behavior |
| Claude, Codex, OpenClaw, Hermes, and similar agents | Yes, including local sessions/tools where available | Cloud provider execution is intentionally not broadly enabled for invitees | Split execution: cloud-safe API agents in cloud; local CLI/model agents in worker | Personal sessions are not shared hosted credentials; cloud calls need API terms, model allowlists, budgets, queues, audit, and approval | BYOK lifecycle proof; managed-provider canary; tenant budget enforcement; local agent connector contract |
| Pipeline, Kanban, Loop, Ruflo, room, boards, workflow planning | Broad local/operator workflow use | Tenant workflow records and provider-free planning are the safe baseline; paid/model dispatch remains controlled | Cloud control plane with optional local execution steps | Provider execution introduces cost, retries, tenant boundaries, and external effects | Complete current tenant-isolation/queue evidence; add local-step job contract |
| Memory, notebook, journal, goals, context | Local vault-backed workflows | Tenant data contracts exist but lifecycle proof is incomplete | Cloud tenant records plus optional selected local sources | Requires storage/RLS isolation, retention, export, deletion, restore, and import evidence | Complete data lifecycle and two-tenant evidence for each enabled flow |
| Research, SEO, scraping | Local tools/configuration | Read-only controlled research is the intended boundary; broad crawling/publishing stays gated | Cloud read-only research plus local-source research through worker | SSRF, crawl policy, source rights, citations, spend, and publishing risk | Domain/source policy, citations, budget, rate limits, separate publishing adapter |
| External delivery, email, outreach, publishing | Operator-directed actions | Approval records rather than unattended delivery | Cloud or local destination adapters only after explicit approval | Consent, brand/reputational risk, privacy/unsubscribe duties, idempotency, rollback | Destination-specific approval, audit, unsubscribe, retry, and undo/rollback evidence |
| Security tools and target scanning | Operator use only | Operator-only | Separate explicit security/developer mode; never default product automation | Legal authority, target scope, egress, and potentially destructive behavior | Target authorization, isolated worker, egress policy, review and audit package |
| Autonomous coding and worktrees | Local operator workflows | Operator-only | Local developer mode only in a disposable scoped worktree | Can alter repositories, credentials, and infrastructure | Repository grant, disposable worktree, change review, rollback, no unrestricted shell |
| Video/GPU media, visual QA, creative generation | Some local tooling/references | Not broadly active | Local GPU/BYOK first; isolated cloud GPU later | GPU cost, artifact ownership, content/moderation, storage, licensing, and likeness rights | Isolated worker, budget, retention/deletion, moderation and artifact access evidence |
| Basic voice: transcription, captions, normal text-to-speech | Practical local/provider path | Not yet promoted as a standard product capability | Early Hybrid candidate | Microphone permission, provider cost, artifact retention, browser-key avoidance | Local microphone grant; server/provider adapter where used; retention/budget tests |
| Voice cloning or identity-sensitive speech | Potentially feasible | Not active | Later opt-in only | Speaker consent, impersonation/likeness risk, disclosure, revocation, and deletion | Verified speaker consent, restricted sharing, immutable audit, revocation/deletion proof |
| OpenScreen capture/editing | Local desktop application path | Cataloged; not a hosted generator | Local Worker capture/import connector | User capture consent, tenant-owned artifact import, malware/SBOM, retention and render isolation | Capture permission, selected-artifact import, scan, storage/deletion and budget evidence |
| OpenMontage production workflow | Local/reference path | Not commercially activated as a hosted capability | Build a customer-local connector first | Provider/GPU spend, asset rights, local dependencies, and its upstream licensing/distribution terms | Legal approval of integration/distribution design; local connector contract; BYOK/GPU/artifact controls |
| Recordly | Reference only | Reference only | Do not ship or host | Its AGPL terms require a deliberate legal and product decision before Veloce distributes, modifies, embeds, or hosts it | Counsel-approved license/provenance decision; otherwise retain as a reference only |
| Workplace/third-party integrations | Local inventory and selective tools | No broad shared connector set | Read-first, per-tenant adapters | OAuth least privilege, revocation, webhooks/events, retention, audit, and write consequences | Per-integration OAuth contract; read-only proof; writes separately approval-gated |

## What is real in the current staged GA candidate

The control plane has meaningful commercial and tenancy foundations. Current
evidence records focused tests, typecheck, security/policy checks, product
checks, public-site smoke, provisioner boundaries, Stripe refund repair and
idempotent replay as passed. The live USD 2 refund is classified as
`public_launch`, durably reviewed, replayed, and has no managed-credit wallet
effect.

The candidate is **not** release-ready. The current evidence record explicitly
leaves these gates open:

1. Current-revision two-tenant public journey.
2. Current-revision OpenRouter BYOK lifecycle.
3. Current-revision tenant isolation checks.
4. Owner proof that managed OpenRouter auto-top-up is disabled, followed by
   the planned bounded health and paid canaries.
5. Operations approval and drills.
6. Business/legal approvals.
7. Clean candidate tree, immutable release ledger publication, and strict
   verification returning `releaseReady: true`.

The current staged baseline keeps client provider calls disabled until those
canaries and budget evidence are complete. This is a safety and commercial
control, not missing product wiring.

## Plan now: finish the foundation before widening capability access

### A. Close the staged GA release evidence

1. Reissue and complete fresh setup links for the two disposable tenants and
   prove runtime-session handoff on each tenant's own Cloud Run domain.
2. Run the full two-tenant journey: consent, verification, manifest approval,
   provisioning, smoke, activation, suspend, export, deletion/offboarding,
   and rollback. Capture redacted identifiers and remove disposable resources.
3. Run authenticated A/B isolation checks across records, writes, budgets,
   jobs, artifacts, queues, audit, export/delete, and revoked credentials.
4. Complete OpenRouter BYOK connection validation, model execution, rotation,
   revocation, suspension, deletion, offboarding, browser non-exposure, and
   cross-tenant denial.
5. Obtain owner evidence for the USD 4 lifetime managed-provider limit and
   disabled auto-top-up. Execute a zero-spend health canary, then one hard
   capped paid canary under the USD 0.25 invitee ceiling; disable the route and
   verify settlement/refund/reconciliation.
6. Execute the remaining operational drills: quota exhaustion, throttling,
   provider outage, queue retry, failed settlement/refund, alert delivery,
   bounded load, recovery, and rollback traffic.
7. Attach owner business/legal approvals and export/restore boundaries.
8. Freeze a clean candidate, publish the immutable ledger, and run the strict
   verifier. Do not call public GA complete unless it reports
   `releaseReady: true`.

### B. Build the Hybrid Local Worker foundation

The worker foundation is the next product build after the GA evidence—not an
unbounded port of the operator machine.

| Deliverable | Required behavior |
| --- | --- |
| Signed installer and supported platform matrix | Customer can install a signed, versioned worker on a supported device/server; unsupported hardware is clearly refused or warned. |
| Secure device pairing | Cloud sign-in creates a user-visible pairing; worker and cloud mutually authenticate with revocable device identity. No open inbound port or general remote shell. |
| Resource grants | Customer selects folders, repositories, Obsidian vaults, local models, microphone/capture devices, and allowed tools. Grants are capability- and scope-specific. |
| Policy/approval engine | Enforces task-start, scope, escalation, recurring-policy, and revocation decisions locally. |
| Veloce workspace | Holds generated artifacts and temporary state separately from customer source locations. |
| Local secret boundary | Uses OS secure storage for local BYOK/CLI secrets. Job payloads and logs never export secret values. |
| Narrow job protocol | Cloud requests typed jobs such as `search_vault`, `run_local_model`, `render_project`, or `import_capture`; worker cannot receive arbitrary shell strings. |
| Safe sync and audit | Returns selected results/artifacts and redacted audit metadata. Raw sources stay local unless the customer explicitly shares them. |
| Lifecycle controls | Supports update, rollback, pause, unpair, revoke, local-data deletion, offline behavior, and provider-outage behavior. |

### C. First Hybrid capability set

Promote the following in this order, each with tests and an evidence packet:

1. Selected-folder and Obsidian retrieval, with result-only sync by default.
2. Local Ollama/model execution under user-selected model policy.
3. Local repository analysis in read-only mode.
4. Transcription, captions, and non-cloned text-to-speech with microphone and
   artifact-retention controls.
5. OpenScreen capture/import of customer-selected artifacts.
6. OpenMontage local connector after the legal integration decision; it must
   use selected assets and customer-local/BYOK compute by default.

## Future plan: promote one high-risk capability at a time

Each future release needs a promotion packet with license/provenance, tenant
boundary, secret/IAM review, budget/rate limits, consent/approval policy,
isolated-worker design where needed, functional and denial tests, cloud/local
smoke, deletion, rollback, and release-ledger evidence.

| Future wave | Capability | Promotion condition |
| --- | --- | --- |
| Cloud intelligence | One approved managed model for invitees | Current canary, USD 0.25 tenant ceiling, reserve/settle/refund/reconciliation, and strict GA release evidence all pass |
| Cloud intelligence | Additional provider/model adapters | Per-provider terms, key ownership, model allowlist, price/cap, health, success/failure smoke, and disable/rollback packet |
| Data plane | Cloud attachments, richer memory/notebooks/imports | RLS, signed object access, retention, export, deletion, restore, two-tenant and private-cache evidence |
| Creative | Customer-local GPU/BYOK video production | OpenMontage/license decision, isolated local worker, artifact rights, project deletion, local budget/cost display |
| Creative | Isolated managed cloud GPU | Fixed job caps, tenant artifacts, moderation, cost controls, queue recovery, retention/deletion, and rollback |
| Voice | Consent-based voice cloning | Verified speaker authorization, disclosure, sharing limits, revocation, deletion, and abuse handling |
| Integrations | Read-first workplace integrations | OAuth least privilege, per-tenant data model, revocation, audit, event handling, export/delete proof |
| Delivery | Outbound publishing/outreach | Explicit per-action approval, destination adapter, consent/unsubscribe, preview, idempotency, audit, and rollback/undo where possible |
| Developer/security | Autonomous worktrees and security execution | Explicit scope, isolated disposable environment, egress controls, change/target approval, review, and rollback |
| Reference catalog | Recordly and other restricted licenses | Counsel-approved commercial use and distribution model; otherwise remain catalog references only |

## Packaging and pricing direction

| Offering | Customer receives | Cost/operations boundary |
| --- | --- | --- |
| Managed Cloud Edition | Hosted runtime, governed workflows, tenant data plane, approved providers, audit, and managed operations | Veloce manages infrastructure; provider spend is BYOK or clearly capped/pass-through. |
| Private Local Edition | Supported local worker/runtime, local capabilities, updates, workflows, policy, and support boundaries | Customer manages device/server availability, local backup, hardware, and most provider accounts. |
| Hybrid Edition | Cloud control plane plus paired local execution for selected local capabilities | Veloce provides the product and governance; customer keeps local data/hardware/keys under their control. |

Comparable platform pricing can be appropriate where product value and support
level are comparable. It must not imply identical infrastructure/SLA. GPU,
specialized local hardware, managed-provider use, security mode, and high-risk
automations should be separately scoped or priced because they change Veloce's
support, cost, and risk profile.

## Non-negotiable boundaries

- Do not send local credentials, full filesystem access, browser sessions, or
  unrestricted shell control to the cloud.
- Do not treat a visible page, reference catalog entry, or submitted key as an
  enabled customer capability.
- Do not activate a provider globally because it passed for one tenant.
- Do not use an AGPL component in a commercial bundle or hosted service without
  a legal decision covering the exact integration and distribution model.
- Do not make delivery, publishing, security testing, or autonomous code and
  infrastructure change unattended default actions.
- Do not claim GA completion until the strict release ledger validates it.

## Related records

- [Local-to-cloud product model](./local-to-cloud-client-product-model.md)
- [Client runtime 13-layer readiness](./client-runtime-13-layer-readiness.md)
- [Hosted capability adapter roadmap](./hosted-capability-adapter-roadmap.md)
- [V9.6 capability reference register](./future-integrations/v96-capability-reference-register.md)
- [Current staged candidate evidence](./evidence/ga-current-candidate-status-2026-09-14.json)
- [Production readiness verifier](../scripts/verify-production-readiness.mjs)
