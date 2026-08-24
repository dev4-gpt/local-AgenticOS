# Veloce AgenticOS v3.3 — Previous-Version Completion Plan

**Status:** in progress; payment-failure retry fix prepared, production gates remain open  
**Scope:** carry-forward gaps from V1, V2, V3, and V3.1 that are not already
covered by the V3.2 readiness and billing work  
**Release rule:** no feature is complete because it has a page, catalog row, or
static contract. It is complete only when its evidence gate, security boundary,
cost behavior, rollback path, and current named revision are recorded.

## Executive decision

### Current execution checkpoint — 2026-08-23

The Stripe Test evidence found and isolated a lifecycle defect: the
`payment_intent.payment_failed` handler changed a pending managed-credit plan
to `cancelled`, then a later successful retry of the still-open Checkout
Session could not settle because settlement accepts only `pending`. The v3.3
SQL source is now corrected so a failed PaymentIntent records its reason while
leaving the plan pending; only `checkout.session.expired` changes a pending
plan to `expired`. This fix is not production-ready until the migration is
applied to the target database, the webhook is deployed, and the retry,
duplicate, expiry, refund, and dispute cases are rerun on the same revision.

Immediate next gates, in order:

1. Apply the corrected v3.3 SQL migration in the authorized Supabase project.
2. Run the focused source/type checks and deploy the webhook revision.
3. Re-run the declined-payment → retry-success fixture and verify one wallet
   credit, `paid / matched`, and no 502 settlement retry.
4. Re-run expiry, refund, dispute, and invalid-allocation cases; attach only
   non-secret IDs/statuses to the evidence ledger.
5. Continue with two-tenant isolation and current-revision production gates.

Verification note: the focused managed-credit suite and
`verify:managed-credit` pass after the source change. Repository-wide and
`product-experience` typechecks currently stop on duplicate generated Next.js
declarations under `.next-v0/types` and `product-experience/.next/types`; this
must be cleared or excluded in the release build before claiming a green
release check.

V1, V2, V3, and V3.1 were not four fully shipped products. They were successive
local, operator, public-control-plane, and cost-governance tracks. V3.2 is the
current billing/readiness correction: it separates a settled Veloce wallet from
provider usability and keeps managed provider execution disabled.

V3.3 is therefore the completion release for unfinished work. It does not
silently turn every catalog item into a hosted feature. Every open item must
produce one of these outcomes:

1. **Implemented and proven** on a current named revision.
2. **Implemented as a governed adapter or isolated worker** with explicit
   permissions, cost, tenant, and rollback evidence.
3. **Closed as operator-only, reference-only, deferred, or blocked**, with the
   reason and next gate recorded.

The product remains controlled-beta ready until the V3.3 launch gates pass. A
successful Stripe Test payment is not provider credit, and a `$1.00 available`
wallet is not evidence of provider execution.

## What V3.2 already covers

These items are not to be reimplemented in V3.3; V3.3 must finish their
operational promotion and evidence where noted:

- Wallet/provider readiness states: `wallet_funded`,
  `awaiting_manifest_approval`, `credential_missing`, `provider_not_enabled`,
  `ready_for_execution`, `depleted`, and `suspended`.
- Credit API responses that distinguish wallet funds from provider usability.
- Checkout route allowlisting, Stripe mode metadata, actionable error mapping,
  and managed-payments-disabled behavior.
- A provider adapter contract with quote, health, reserve, execute, settle,
  refund, balance, and disable operations.
- An explicitly disabled OpenRouter managed route.
- Public onboarding approved-manifest persistence, secret-like manifest
  rejection, and provisioner bearer-auth contracts.
- The 101-repository portfolio / 53-attached-repository coverage and the
  structured 46-entry production-readiness catalog.
- Developer tooling tracked separately in `.agents/` and `skills-lock.json`.

V3.3 must not report any of the above as live managed execution until the
provider, account ownership, credential, quota, reconciliation, and current
cloud smoke gates pass.

## Version history and carry-forward rule

| Track | What it established | Unfinished work carried into V3.3 |
| --- | --- | --- |
| V1 local-first operator OS | Local dashboard, Obsidian/Graphify memory, local agents, studios, and integration slots | Local-to-cloud capability graduation, regression evidence, selected integration activation, and a deliberate disposition for every waiting service |
| V2 governed product boundary | Public/local split, Flow Lab source policy, review-first capability policy, local cost-saving roadmap | Local cost-saving UI, measured tool evaluations, Giskard/evaluation scenarios, Flow Lab parity, and explicit closure of deferred runtimes |
| V3 public launch | Public intake, consent, onboarding, Stripe, wallet, credentials, provisioning, tenant lifecycle design | Applied migrations, production configuration, live/test payment operations, provider adapters, refunds, quotas, support, legal, and current cloud evidence |
| V3.1 cost/provider governance | Provider matrix, pricing snapshots, BYOK/managed separation, cost-aware routing, native/open-source/BYOK/managed order | Provider-specific smoke, quota/settlement in each paid worker, shadow migration benchmarks, two-tenant evidence, and promotion of any managed route |
| V3.2 readiness correction | Truthful wallet/provider semantics and disabled managed route | Operational application, deployment proof, and all rows below that remain open |

## V3.3 completion matrix

Status values are stricter than “implemented”: `planned` means the work belongs
in V3.3; `evidence-refresh` means code exists but current proof is missing;
`decision-required` means the safe outcome may be a formal closure rather than a
hosted feature.

| Source | Carry-forward gap | Current evidence | V3.2 disposition | V3.3 deliverable | Acceptance evidence | Dependency | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V1 | Local operator features are not client-safe by default | Local dashboard and memory are documented; cloud shell is intentionally smaller | Preserved as a boundary | Capability graduation register for every local surface | Each surface is `client-safe`, `adapter-required`, or `operator-only` with permissions and rollback | Capability inventory | planned |
| V1 | Paperclip/Hermes/Ruflo local state is not hosted parity | Local/operator evidence exists | Keep operator-only until a tenant contract exists | Hosted work-item contract or formal operator-only closure | Tenant-safe inputs/outputs, queue, audit, and isolation test—or closure record | Tenant data model | planned |
| V1 | Plausible, Cal.com, Ghost/Listmonk, Stirling PDF, and Penpot are waiting integrations | Integration slots and local notes exist | Not part of V3.2 billing | Activate only the first business-critical integration; close the rest as optional adapters | Auth, retention, tenant boundary, failure, and rollback smoke per activated integration | Product use case and credentials | decision-required |
| V1 | HeyGen, Suno, Hunter/Apollo, Firecrawl, OpenAI media, Grok, and GLM were waiting or skipped | Catalog/provider rows exist | Remain gated | Provider-specific decision packet for each: activate, BYOK-only, isolated worker, or close | License, key ownership, quota, budget, approval, smoke, refund, and rollback evidence | Provider adapter contract | planned |
| V1 | Regression command was recommended | Several focused verifiers now exist | Partially superseded by current checks | One release orchestrator covering typecheck, builds, route policy, secret scan, and smoke evidence | CI artifact names commit, image digest, test results, and no secrets | CI permissions | planned |
| V1 | Local memory and Graphify growth depended on manual content | Local markdown and Graphify export work | Not a hosted billing issue | Durable tenant memory import/export/retention policy | Tenant-scoped export, deletion, rebuild, and no-cross-tenant test | Tenant storage contract | planned |
| V2 | “Local Cost-Saving Tools” page was planned but not completed | Tool roadmap is documentation only | No automatic installation in V3.2 | Add a read-only local-tool decision surface | Shows replacement, install state, disk fit, license, risk, and official docs; never auto-installs | UI and service detection | planned |
| V2 | Handy, OmniVoice, ComfyUI/Wan, and HeyGem installation was deferred for disk/hardware reasons | Roadmap records storage thresholds and recommendation | Keep deferred | Add readiness checks and explicit operator install/runbook; do not bundle in client image | Hardware/storage/license check and reversible install test where approved | Operator approval | decision-required |
| V2 | Deep local integration (launch, API/MCP, output folders, Obsidian writeback) was not completed | No general contract exists | Keep operator-only until useful workflow is proven | Implement only for one measured tool; create closure record for the rest | Detection, bounded launch, output ownership, writeback, cleanup, and rollback | Selected tool | planned |
| V2 | Flow Lab and reference-analysis protections needed ongoing evidence | Source policy is documented | Preserve human approval and authorized-source rule | Add source provenance, prompt-injection, derivative-content, and approval evidence | Negative tests for copied branding/code/private data and audit trail | Research policy | planned |
| V2 | Giskard/evaluation scenarios were policy-level, not complete release evidence | Evaluation is named in V2 policy | Not covered by wallet work | Build a minimal evaluation suite for grounding, injection, attribution, no-secret leakage, and approval gates | Pass/fail report attached to current revision | Test fixtures and safe models | planned |
| V3 | Public-launch migrations were not all proven applied in the target database | SQL files exist; no key inspection permitted | V3.2 adds readiness SQL but does not apply it | User-authorized migration application and schema-result verification | Migration version/result only; no keys or secret values | Authorized SQL Editor action | evidence-refresh |
| V3 | Production Vercel/Cloud Run configuration, domains, HTTPS, Turnstile, and email sender setup were incomplete | Test surfaces and configuration docs exist | Kept outside V3.2 | Production configuration checklist and current-domain smoke | `/start`, verification email, abuse challenge, domain/HTTPS, generic errors, and notification evidence | Account owner and live config | planned |
| V3 | Public provisioner/private GCP adapter was contract-level rather than full journey | Manifest and bearer-auth contracts pass static checks | Contract retained | Disposable tenant provisioning and activation run | Payment → approval → provision → smoke → activate with revision/resource evidence | Authorized GCP deployer | planned |
| V3 | Stripe Test checkout proved wallet funding, not live commercial billing | `$1` Test allocation and webhook settlement proven | Correctly labeled as wallet funding | Test-mode matrix for success, decline, 3DS, duplicate, refund, dispute/failure simulation, invalid allocation, and disabled provider | Idempotent ledger and UI state for every case | Test Stripe account | planned |
| V3 | Live Stripe readiness was not complete | Test mode only | No live key handling in V3.2 | Separate live-release checklist, not live activation | Live keys/webhooks/refund/legal/support approval recorded by owner; never in Git or UI | Explicit owner approval | planned |
| V3 | Paid-worker accounting was incomplete | Wallet ledger and readiness fields exist | Contract exists, execution disabled | Enforce estimate → reserve → execute → settle/refund for every paid worker | Provider ownership, pricing snapshot, quota decision, reservation, settlement/refund, audit ID | Adapter implementations | planned |
| V3 | Refunds, disputes, reconciliation, and alerts were partial | Webhook settlement exists | No provider balance claim | Complete financial lifecycle and reconciliation jobs | Duplicate webhook, refund, provider failure, stale reservation, negative-balance, alert, and operator repair tests | Ledger schema and Stripe events | planned |
| V3 | BYOK rotation/offboarding and provider-specific validation lacked full smoke coverage | Server-side credential contract exists | Key values remain out of scope | Per-provider credential lifecycle tests | Submit, validate, use, rotate, revoke, suspend, offboard; browser never sees secret | User-authorized provider test keys | planned |
| V3.1 | OpenRouter managed execution was disabled | Explicit disabled flag and adapter contract | Must remain disabled | Only prepare an account-ownership and reconciliation packet; enable only after approval | Health, balance, reserve, execute, settle, refund, disable, cap, and rollback smoke on disposable tenant | Managed account strategy | planned |
| V3.1 | OpenAI/Anthropic/Gemini/Groq/Firecrawl/Brave/Jina provider smoke was incomplete | Catalog and some historical evidence exist | Provider calls remain gated | Provider adapter conformance suite, initially BYOK | Positive/negative smoke, cost snapshot, timeout, rate limit, quota, redaction, and rollback per provider | Provider credentials and safe fixtures | planned |
| V3.1 | Two-tenant isolation, deletion, rollback, suspension, and offboarding needed current evidence | Historic disposable evidence exists; current source changed | Refresh required | Repeat disposable tenant A/B lifecycle against the tested revision | No cross-tenant balance, credential, job, artifact, queue, audit, or secret-reference access | Applied RLS/control-plane migrations | evidence-refresh |
| V3.1 | Quotas, alerts, and scaling were partial | Runtime has bounded controls and some alert evidence | Not complete for launch | Per-tenant quotas, budget alerts, queue alerts, provider caps, and load rules | Exhaustion, throttling, retry, refund, recovery, and notification tests | Observability configuration | planned |
| V3.1 | Plunk/Novu/InsForge/Openship/Plano and other replacements were cataloged, not promoted | Provenance/catalog rows and roadmap exist | Shadow candidates only | Benchmark packet and rollback decision for each candidate | Cost, deliverability/latency, isolation, backup, migration, support, and rollback comparison | Representative workload | decision-required |
| V3.1 | Repomix/Headroom/Ponytail were contract/native candidates, not a complete operating discipline | Current contracts and focused tests exist | Safe to use operator-side | Measure token reduction, restraint, and secret exclusion in CI/operator workflows | Before/after cost/context report and no customer-private packing by default | Representative repositories | planned |
| V3.1 | Media, GPU, security assessment, autonomous outreach, and external publishing remain gated | Catalog and safety notes exist | Keep isolated or operator-only | Per-capability promotion/closure packets; no public enablement by default | License, isolation, approval, egress, cost, rollback, and legal evidence | Dedicated worker and owner approval | decision-required |
| V3 | Legal, refund, privacy, retention, support, abuse, tax, and domain language was incomplete | Pages/routes exist; commercial terms need owner confirmation | Not covered by V3.2 | Commercial launch policy pack and support runbook | Owner-approved text, refund workflow, contact route, retention/deletion policy, and incident procedure | Business/legal owner | planned |
| All | Historic cloud evidence can become stale after source changes | Many older reports name old revisions | V3.2 has source changes after older evidence | Current evidence ledger tied to commit, image digest, Cloud Run revision, migration result, and test report | Reproducible evidence bundle for every claimed status | Authorized deployment | planned |

## Dependency-ordered implementation plan

### Phase 0 — Freeze, inventory, and evidence baseline

- Record the current Git commit, branch containment, dirty-tree state, and
  historical branch relationship.
- Reconcile V1/V2/V3/V3.1 documents against the matrix above.
- Refresh `docs/production-readiness-matrix.md` and the 101/53 portfolio rows
  so every row has a current status, evidence revision, and next gate.
- Add a release evidence template that never includes keys, tokens, raw
  provider responses containing secrets, or private tenant data.

**Gate:** every historical gap has a matrix row and a disposition.

### Phase 1 — Control-plane and commercial configuration

- Apply and verify the user-authorized Supabase migrations, including the V3.2
  managed-credit readiness migration. Verification must use migration/schema
  results only; do not inspect Supabase keys.
- Complete test-mode configuration: verification email, Turnstile, domains,
  webhook endpoint, test prices, and generic failure handling.
- Prepare—but do not activate—the separate live Stripe checklist.

**Gate:** onboarding and billing configuration is reproducible in Test mode and
all secret values remain outside source, browser, logs, and documents.

### Phase 2 — Billing, ledger, and operational accounting

- Add ledger metadata for Stripe mode, Checkout Session, Payment Intent,
  webhook event, route/catalog, account ownership, credential reference,
  funding/reconciliation status, pricing snapshot, quota decision, and all
  reservation/settlement/refund/failure transitions.
- Implement idempotent duplicate, refund, dispute/failure, stale-reservation,
  and operator-repair behavior.
- Make the UI show wallet funding separately from `ready_for_execution`.
- Add per-tenant budget caps, usage alerts, and provider-not-enabled errors.

**Gate:** all Test-mode billing cases pass and no disabled route is shown as
usable.

### Phase 3 — Provider and credential completion

- Implement a conformance harness for `quote`, `healthCheck`, `reserve`,
  `execute`, `settle`, `refund`, `balance`, and `disable`.
- Complete BYOK lifecycle tests first, provider by provider.
- Prepare the OpenRouter managed-route packet, but keep execution disabled until
  account ownership, balance reconciliation, support ownership, and caps are
  approved.
- Add provider timeout, rate-limit, cost, redaction, and failure tests.

**Gate:** BYOK is proven for an explicitly enabled provider; managed execution
remains disabled unless every OpenRouter gate passes.

### Phase 4 — Provisioning, isolation, and lifecycle

- Run a disposable tenant through verification, payment, manifest approval,
  provisioner dispatch, runtime smoke, activation, suspension, rollback,
  export, deletion, and offboarding.
- Repeat with two tenants and assert no cross-tenant reads, spends, jobs,
  artifacts, credentials, queues, audit records, or secret references.
- Record Cloud Run image digest, revision, service account, resource scope, and
  rollback target.

**Gate:** two-tenant lifecycle evidence passes on a current named revision.

### Phase 5 — Local parity, evaluations, and cost-saving candidates

- Add the read-only local cost-saving tools surface and service detection.
- Run Giskard/evaluation scenarios and the Repomix/Headroom/Ponytail operator
  measurement suite.
- Shadow-test Plunk/Novu and infrastructure candidates without replacing the
  launch path until deliverability, isolation, migration, backup, rollback,
  and support evidence passes.
- Close or promote each V1/V2 waiting integration; do not leave “maybe later”
  without an owner and gate.

**Gate:** every candidate is promoted, deferred with an expiry/review date, or
closed with a reason.

### Phase 6 — Current revision release and launch decision

- Run typecheck, builds, focused contracts, route allowlist tests, provider
  policy tests, public-launch tests, provisioner tests, billing tests, tenant
  isolation tests, and evaluation tests.
- Build a known `linux/amd64` image and deploy only the tested commit.
- Verify the deployed revision digest matches the evidence bundle.
- Run Test-mode payment and disposable-tenant cases against that revision.
- Produce a separate live-mode checklist requiring explicit owner approval.

**Gate:** V3.3 may be called production-ready only after all mandatory gates
below pass. Otherwise it remains a controlled beta and the failed gate is
visible in the release ledger.

## Mandatory V3.3 acceptance gates

### Billing and provider truth

- [ ] Wallet funds and provider usability are separate in API, UI, and audit.
- [ ] Unauthenticated credit requests fail closed.
- [ ] Authenticated wallet requests return correct balance, reservations,
  provider state, funding state, and actionable errors.
- [ ] Invalid or missing allocations are rejected.
- [ ] Stripe Checkout and webhooks are signature-verified and idempotent.
- [ ] Success, decline, 3DS, duplicate, refund, and failure cases are tested.
- [ ] Every paid worker has estimate, reserve, execute, settle/refund, quota,
  provider ownership, pricing snapshot, and audit evidence.
- [ ] A disabled provider route can never be presented as usable.

### Onboarding and tenant safety

- [ ] A valid manifest persists and dispatches with bearer authentication.
- [ ] Missing or secret-like manifests fail closed.
- [ ] Project, region, tenant, provider, and capability scope violations fail.
- [ ] Provisioner callbacks, audit records, retry counts, and rollback targets
  are produced.
- [ ] Two tenants cannot read or spend each other’s balances, artifacts,
  credentials, jobs, queues, or audit records.
- [ ] Suspension, deletion, export, rollback, and offboarding are proven.

### Operations and release evidence

- [ ] Quotas, alerting, retry, timeout, and provider-outage behavior are tested.
- [ ] Current named Cloud Run revision proves the deployed behavior.
- [ ] Image digest, source commit, configuration hash, and migration result are
  recorded without secrets.
- [ ] Public claims match the matrix status; operator-only features are not
  marketed as hosted features.
- [ ] Live Stripe release approval, refund/legal language, support contacts,
  tax/domain configuration, and provider-account ownership are explicit.

## Versioning and release naming

The repository’s existing `VERSION` file is a date marker rather than a
semantic-release record. Do not overwrite it and imply that V3.3 has shipped.
This document is the V3.3 planned-release record. When the gates pass, create a
release commit/tag that names the exact source commit, image digest, migration
result, and evidence bundle. Until then, use “V3.3 planned” or “V3.3 in
progress,” not “V3.3 production.”

## Security and secret-handling rule

No Supabase API key, provider key, Stripe secret, webhook secret, bearer token,
or raw secret-manager value may be inspected, printed, committed, placed in a
Markdown matrix, or returned to the browser. User-authorized SQL Editor work
may apply migrations and return schema/migration results without exposing
secrets.

## Related records

- [V1 status and gaps](./V1-STATUS-AND-GAPS.md)
- [V2 product boundary](./VELOCE-AGENTICOS-V2.md)
- [V2 local tools roadmap](./V2-LOCAL-AI-TOOLS-ROADMAP.md)
- [V3 public launch and cost model](./VELOCE-AGENTICOS-V3-NEXT-VERSION.md)
- [V3.3 completion matrix](./docs/v3.3-completion-matrix.md)
- [Production-readiness matrix](./docs/production-readiness-matrix.md)
- [Public launch runbook](./docs/public-launch-runbook.md)
- [Client runtime release ledger](./docs/client-runtime-release-ledger.md)
