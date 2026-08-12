# Veloce Product Model: Local Innovation to Every Client Edition

**Status:** Operating model and comparative readiness map  
**Updated:** 2026-08-01  
**Decision:** One Veloce codebase and one tested client image. The private
operator OS remains the product laboratory and control plane. Each client gets
an isolated cloud edition, not a fork and not a copy of the operator machine.

## The Master Plan

The intended product model is correct, with one necessary boundary:

```text
Build and prove locally
        ↓
Convert the capability into a client-safe contract
        ↓
Prove it in the isolated Cloud Run test tenant
        ↓
Ship the same immutable image to eligible client editions
        ↓
Activate only where that client's manifest, data policy, budget,
provider credentials, and approval rules allow it
```

This lets Veloce continuously improve as one product without creating a code
fork per client. Shipping code and enabling a capability are separate decisions.

| Decision | Shared across the fleet? | Why |
| --- | --- | --- |
| Source code, UI system, fixes, tests, container image | Yes | Keeps the product maintainable and prevents client forks. |
| Client capability availability | Only after cloud-test evidence | A visible tab must not imply hosted execution is safe. |
| Provider/model activation | Per client manifest | Keys, pricing, data terms, budgets, and approvals differ. |
| Data, secrets, storage, queues, audit records | Never shared | Every client needs an isolated tenant boundary. |
| External delivery or publishing | Per action and per client | Consequential actions remain human-approved. |

The product goal is **shared experience plus isolated execution**. The six
Veloce lenses and approved UI move to client editions; operator credentials,
Mac paths, private notes, local CLIs, and unrestricted agent execution do not.

## Four Product Surfaces

| Surface | Purpose | Current state | Boundary |
| --- | --- | --- | --- |
| Public product and intake | Explain Veloce and collect scoped runtime requests | Deployed Vercel front door with server-side lead/request storage | Not a client runtime; never collects API keys, passwords, or private documents. |
| Local Operator Edition | Build, test, operate, and use Veloce on the operator Mac | Broadest product surface; local-first models, tools, vault, workspaces, and services live here | Private only. Do not expose its port, filesystem, credentials, or personal sessions. |
| `veloce-cloud-test` | Controlled Cloud Run client-edition reference | All 13 release gates are documented as proven for a provider-disabled baseline; the owner-cloud checkpoint now adds bounded OpenRouter and Gemini/Antigravity activation | Test tenant, not the permanent shared runtime for future clients. |
| Future client editions | Client-branded, isolated, workflow-specific runtimes | Provisioning, manifest, and validation machinery exist | Each real client still needs its own approved scope and acceptance evidence. |

The public front door and client runtime are deliberately separate. The public
site collects a workflow request; manual approval then creates an isolated
client manifest and deployment. See [the public product README](../product-experience/README.md)
and [the GCP runbook](./gcp-client-runtime-runbook.md).

## Comparative Capability State

Status words in this table are intentional:

- **Proven** — source and a bounded acceptance path are recorded.
- **Implemented, gated** — code exists but the current cloud-test manifest keeps it off.
- **Adapter required** — the local experience needs a tenant-safe hosted replacement.
- **Operator-only** — it is correctly private until a replacement is designed and evidenced.

| Capability group | Local Operator Edition | Cloud-test client edition | Future-client requirement | Current gap / next proof |
| --- | --- | --- | --- | --- |
| Shell, navigation, six lenses | Full presentation reference | Shared shell and allowed routes | Branding and approved route/capability manifest | Maintain accessibility and error-state parity with shared UI releases. |
| Authentication and tenancy | Personal local access | Proven app-auth, Supabase membership, tenant isolation | Dedicated tenant, members, service account, and client manifest | Provision every real client; never reuse the test tenant. |
| Context, memory, journal, goals, notebook | Local vault and knowledge tools | Tenant records, artifacts, signed storage, export/delete/restore contracts | Client retention, data-source, import, and storage policy | Evidence each selected data/import flow after migration and manifest activation. |
| Workflow planning | Local Paperclip, Pipeline, Kanban, Loop, Ruflo state/services | Deterministic tenant workflow board and queue contract | Client-selected workflow and approval owner | Rich local orchestration is not cloud parity; provider-backed execution remains opt-in. |
| Text agents | Local CLI, Hermes credentials, Ollama, direct provider routes | Queued API adapter exists; revision `veloce-cloud-test-00078-xbc` enables Anthropic, OpenRouter, and Gemini/Antigravity for the owner-cloud test under a $1 cap | Key, model allowlist, pricing, cap, approver, smoke evidence | Enable one provider and one workflow at a time per client; Codex/OpenAI remains gated until API billing is approved. |
| Sakana Fugu | UI and direct OpenAI-compatible route exist; no supported local key was found | Adapter, credential catalog, contract, and shell route exist; provider calls disabled | `SAKANA_API_KEY`, reviewed model, pricing, budget, reviewed-plan approval policy | First Sakana cloud-test activation and proof remain outstanding. |
| Local / Local Engine / Free Claude Code | Local Ollama, helper service, and/or CLI | Hosted replacements were smoke-tested with OpenRouter, then disabled | Approved hosted provider configuration only | Never carry local services or personal CLI sessions into Cloud Run. |
| Creative workspaces | Local design, media, HTML/video, and project tooling | Brief/request workspaces plus speech, music, video, image, and artifact foundations | Specific provider, storage, budget, and approval policy | Full media and workspace parity is not yet proven. |
| Research, SEO, integrations | Local connectors and operator research tools | Read-only Firecrawl SEO adapter and tenant brief surfaces | Domain allowlist, rights policy, provider key, retention, approval model | Publishing, broad integrations, and licensed-source handling remain gated. |
| Delivery and external actions | Operator-controlled local actions | Approval-only record, worker, destination guard, one controlled delivery proof | Client destinations, approver, idempotency, audit, rollback expectation | Add each external destination as a separately reviewed adapter. |
| Workplace integrations | Local integrations hub is an inventory, not a universal connector set | No Slack, Teams, WhatsApp, Drive, Gmail, Calendar, or CRM connector is active as shared client functionality | OAuth/credential model, least privilege, event, audit, and approval policies | Build read-first connector contracts before any write capability. |

The detailed boundary inventory is in [runtime-capability-matrix.md](./runtime-capability-matrix.md),
[hosted-capability-adapter-roadmap.md](./hosted-capability-adapter-roadmap.md),
and [client-runtime-13-layer-readiness.md](./client-runtime-13-layer-readiness.md).

## What Is Already Reusable for Every Client

The shared platform already has the backbone required to avoid starting from
zero for every client:

1. `VELOCE_CLIENT_EDITION=1` selects the client shell, which swaps local
   surfaces for client-safe workspaces or explicit gates.
2. A reviewed manifest controls identity, routes, capabilities, provider/model
   allowlists, budgets, retention, storage namespace, and approval policy.
3. The GCP provisioner creates or updates a client-scoped Cloud Run service,
   service account, Cloud Storage boundary, Secret Manager namespace, Cloud
   Tasks queue, and least-privilege IAM wiring.
4. Supabase provides tenant membership, records, jobs, artifacts, audit state,
   rate limits, budgets, and lifecycle controls.
5. Long-running work is queue/worker based; browser requests do not keep local
   shells or personal sessions open.
6. The worker validates a tenant request, resolves an allowlisted provider and
   model, reserves and settles budget, redacts sensitive output, and writes
   tenant-owned results or artifacts.
7. Export, deletion, restoration, rollback, isolation, alerting, and failure
   paths have controlled evidence for the baseline tenant.

The provider-disabled cloud-test revision is a healthy baseline, not missing
wiring: it proves the client control plane without silently spending provider
money. Its precise image and evidence remain in the release ledger. The
current owner-cloud revision deliberately moves beyond that baseline for the
operator-owned test account by enabling bounded Anthropic, OpenRouter, and
Gemini/Antigravity provider lanes. That is a controlled parity checkpoint, not
a fleet-wide client activation.

## Capability Graduation Contract

Every new local feature receives one classification before being offered to a
client edition.

| Classification | Meaning | Required outcome |
| --- | --- | --- |
| `local-only` | Relies on a Mac, local vault, personal session, loopback service, arbitrary tool, or operator-only data | Keep it in the Operator Edition. Do not expose it through Cloud Run. |
| `client-safe` | Has authenticated tenant state and no operator dependency | Add it to the shared client image, test it, then make it manifest-selectable. |
| `hosted-adapter` | Client value is clear but the local implementation is not cloud-safe | Build a narrow API/worker/storage contract, keep it gated, and prove it in cloud-test. |
| `workflow-template` | Reusable business process rather than platform primitive | Store it as client-scoped configuration/briefs; activate only for clients who selected it. |
| `future-research` | Worth tracking but lacks an approved product contract | Keep it in `docs/future-integrations/`; do not present it as a shipped connector. |

No capability is complete because a UI tab exists or a key was submitted. It
becomes complete only after this request path is proven:

```text
authenticated client member
  -> validated tenant request
  -> approved capability and provider/model
  -> budget reservation
  -> private queue and worker when needed
  -> tenant-owned result or artifact
  -> redacted audit event
  -> approval before an external side effect
```

## Release Process: Local Change to Client Fleet

### 1. Build locally

- Add the feature to the Operator Edition and prove its local acceptance path.
- Record all dependencies: files, CLI/session, local service, provider API,
  data writes, outbound actions, cost, and long-running work.
- Decide whether the client need is the same feature, a smaller workflow, or
  only the output of an operator workflow.

### 2. Create or extend the hosted adapter

- Replace local state with tenant records and/or client-prefixed object storage.
- Replace local process execution with a bounded server-side provider API or
  private queue worker.
- Add validation, output redaction, rate limits, idempotency, budget, retention,
  audit events, error states, and an approval boundary.
- Keep the feature disabled by default in the shared client image.

### 3. Prove it in `veloce-cloud-test`

- Update the private test manifest with the minimum capability, provider, and model.
- Use a harmless bounded prompt/workflow and a small approved budget.
- Verify success and denial paths: wrong tenant, missing secret, unallowlisted
  model, exhausted budget, and denied external action where relevant.
- Capture redacted evidence, image digest, manifest diff, and rollback decision.
- Restore the provider-disabled baseline if the test was temporary.

### 4. Make it eligible for real clients

- Update the runtime matrix, adapter roadmap, this product model, and the
  capability-matrix template when the shared contract changes.
- Mark the feature **eligible**, never automatically enabled.
- Define migration sequencing and backward compatibility when data schema or
  queue contracts change.

### 5. Roll out the same image without forking

- Build one immutable client image from the shared repository.
- Validate every target manifest against that image.
- Deploy in rings: cloud-test, one internal/low-risk client, then compatible
  client services.
- A client receives the active feature only when its manifest includes the
  capability and all prerequisites. Otherwise the new image renders the safe
  gate or existing workflow.
- Monitor client-scoped alerts, budgets, queue health, audit failures, and
  error rates. Roll back the image or disable the manifest capability if needed.

### 6. Update client records

For every client whose capability changes, update its Client Edition Manifest,
capability matrix, provider/model approval, budget, retention statement,
acceptance evidence, and support/rollback record. Never add raw secrets.

## “Push to Every Client at Once” — Correct Meaning

| Change type | Fleet deployment policy |
| --- | --- |
| Shared UI, security, or non-provider bug fix | Ship the same tested image to every compatible client after regression checks. |
| New client-safe feature with no new client input | Deploy the code fleet-wide; activate only for manifests that already explicitly allow it. |
| New provider or model | Do not activate globally. Each client needs secret ownership, model approval, pricing, budget, data terms, and a smoke test. |
| Schema/data migration | Release backward-compatible code first; apply and verify migration per tenant; then activate. |
| Third-party business-data or write integration | Add per-client OAuth/authorization and approval policy before activation. |
| Local-only tooling improvement | Keep it local until its hosted adapter passes the graduation contract. |

The unifying unit is the versioned image and release pipeline. The isolating
unit is the client manifest plus tenant infrastructure. This is how Veloce can
be one living product while respecting each client's data, cost, and authority.

## Current Incomplete Work Queue

### Platform-wide, before broad client expansion

| Priority | Work | Why it matters | Completion evidence |
| --- | --- | --- | --- |
| P0 | Keep the route gate, provider adapter, credential catalog, manifest template, and docs aligned | A mismatch can show the wrong credential or make a safe capability look unavailable | Focused static checks plus cloud-test gate rendering. Sakana naming is aligned as of this document. |
| P0 | Build a repeatable shared-image promotion pipeline | The product must update all eligible clients without manual drift or forks | Immutable image, manifest compatibility check, deploy ring, rollback record, and fleet release log. |
| P1 | Establish the client data migration and import matrix | A local Obsidian vault is not client cloud memory | RLS, artifact verification, retention, export/delete/restore, and each approved import path evidenced. |
| P1 | Turn provider activation into a reusable client release packet | A key alone cannot safely enable inference | Matrix, Secret Manager reference, model allowlist/pricing, cap, approver, and positive/negative smoke tests. |
| P1 | Build the integration framework | Workplace tools need consistent OAuth, permission, event, audit, and approval contracts | Read-only connector first; tenant isolation and revocation evidence; writes stay approval-gated. |
| P2 | Build vertical workflow packs | Clients buy outcomes, not a long tab list | A narrow client workflow with human handoff and measurable acceptance criteria. |
| P2 | Automate per-client provisioning and promotion further | Scripts exist, but sales-scale onboarding needs less operator-only work | Idempotent infrastructure configuration, manifest review, tenant setup, release evidence, and offboarding without cross-client drift. |

### Sakana-specific completion path

1. Obtain a Sakana API account/key outside source control and store it only in
   the approved local or client Secret Manager location.
2. Local: add the key to the supported Hermes location, start the local app,
   and run one deliberately bounded smoke test.
3. Cloud-test: add a Sakana Secret Manager reference, reviewed Fugu model,
   pricing, small cap, `text-agents`, and `SAKANA_API_KEY` to the test manifest;
   deploy and prove both success and denial paths.
4. Return cloud-test to its provider-disabled baseline unless Sakana is the
   deliberate next continuously operated capability.
5. Make Sakana eligible only for clients who select it and complete their own
   credential, budget, and approval record.

## Guardrails

- Never fork the repository per client.
- Never use a real client deployment to test a new local feature first.
- Never copy operator vault data, Mac paths, cookies, personal CLI sessions, or
  provider credentials into a client image.
- Never infer “enabled” from a submitted key, visible tab, or loading URL.
- Never enable a provider globally because it works for one client.
- Always keep a provider-disabled and rollback-capable baseline.
- Treat future-integration research as backlog until its hosted adapter, data
  boundary, and evidence bundle exist.

## Source-of-Truth Documents

- [V1 local status and gaps](../V1-STATUS-AND-GAPS.md)
- [Local release acceptance](../RELEASE-ACCEPTANCE-2026-07-22.md)
- [Runtime capability matrix](./runtime-capability-matrix.md)
- [13-layer client readiness](./client-runtime-13-layer-readiness.md)
- [Cloud-test release ledger](./client-runtime-release-ledger.md)
- [GCP client runtime runbook](./gcp-client-runtime-runbook.md)
- [Hosted capability adapter roadmap](./hosted-capability-adapter-roadmap.md)
- [V96 external corpus integration](./V96-EXTERNAL-CORPUS-INTEGRATION.md)
- [Client onboarding playbook](../skills/veloce-client-capability-onboarding/SKILL.md)
- [Client capability matrix template](../skills/veloce-client-capability-onboarding/references/client-capability-matrix-template.md)
- [Future integration register](./future-integrations/README.md)
