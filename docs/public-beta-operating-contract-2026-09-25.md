# Public Beta Operating Contract

**Status:** controlled beta definition; not a promise of general availability.
**Date:** 2026-09-25

This contract defines what Veloce AgenticOS can honestly offer while the
canonical product application is hosted at `app.veloceos.cloud`. It works with
the [production topology](./production-topology-2026-09-25.md) and the
[beta security readiness audit](./beta-security-readiness-2026-09-25.md).

## First customer cohort

The initial beta is for agency owners, founder-operators, operations leads,
and technical delivery leads who have a repeatable workflow and can name an
accountable owner. It is not a general consumer AI product or an autonomous
outreach/publishing service.

Applications may be public. Activation is selectively approved, scoped, and
evidence-gated.

## What a beta customer receives

- A reviewed scope for one initial operating workflow.
- A governed workspace design with tenant-scoped memory, records, artifacts,
  approvals, budgets, and audit evidence.
- Research-to-delivery and quality-review contracts that stay inside the
  agreed tenant and approval boundary.
- A visible provider catalog, credits policy, and capability requirements.
- Client-owned provider credentials only after an authenticated tenant runtime
  and server-side credential lifecycle are approved.

## Customer journey

1. Submit a work email, operating scope, data sources, integrations, budget,
   and approval rules at `/start`; no secrets or private documents belong in
   the intake.
2. Verify email and receive an operator-reviewed scope recommendation and
   quote.
3. Complete any approved payment setup, then approve the tenant manifest.
4. Provision a dedicated runtime only after its configuration, tenant
   isolation, rollback, and evidence checks pass.
5. Connect approved BYOK providers in the private portal. Provider execution
   remains subject to the tenant budget, manifest, and human approvals.

## Deliberate beta limits

- No instant self-service tenant activation.
- No raw local operator workspace or local machine access for customers.
- No browser-visible provider keys, OAuth material, or service-role data.
- No automatic publishing, outreach, paid action, or external delivery.
- No managed-provider execution until account ownership, pricing, health,
  reserve/execute/settle/refund, reconciliation, and disable/restore evidence
  are complete.
- No use of the legacy `agentos-mvp` Cloud Run service as a client runtime.

## Activation evidence

Every activated tenant requires:

1. an approved scope, manifest, owner, and provider/credential policy;
2. tenant-scoped access, budget, audit, export, deletion, and rollback
   evidence;
3. an authenticated user journey and two-tenant isolation check against the
   selected runtime;
4. a named operational owner for billing, incidents, access revocation, and
   customer-data deletion; and
5. explicit approval for any provider, integration, or external action beyond
   the core workflow.

## What success means

The beta is successful when a qualified customer can move from scoped request
to an approved tenant, complete the first governed workflow, review a
customer-owned artifact, and offboard without a cross-tenant, credential, or
unbounded-spend incident. Revenue, provider availability, and growth claims
must remain separate from this operational proof.

## Learning plan

Use the first customer cohort to test workflow clarity, willingness to approve
the control model, pricing comprehension, and time-to-first-value. First run a
calibrated synthetic buyer study across agency size, role, AI literacy, budget,
and risk tolerance; then conduct 20-30 real buyer conversations. A 10,000
persona simulation is a later messaging stress test, not product validation.

## Pending owner decisions

- Approve the intended apex and `www` marketing-domain mapping.
- Select and provision a current client-runtime backend before live tenant
  acceptance testing.
- The controlled-beta operational owner is Aryaman; the incident, billing,
  revocation, and deletion accountabilities are recorded in
  `docs/organizational-structure.md#interim-controlled-beta-operating-ownership`.
  Decide the initial commercial payment and support policy before activation.
