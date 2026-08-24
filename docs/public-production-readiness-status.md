# Veloce AgenticOS Public Production Readiness — Current Status

**Snapshot:** 2026-08-24  
**Current branch:** `v3.3-managed-credit-lifecycle`  
**Current baseline commit:** `d75a944cb90148cab0cb19fa84ef944f769e939b`  
**Status:** Local implementation and verification complete; public production launch is not yet accepted.

## What is complete locally

- Managed-credit wallet lifecycle, including duplicate, decline/retry, expiry, refund, dispute, and invalid-allocation handling.
- Tenant wallet, allocation, and purchase-history isolation checks.
- Managed-provider request flow that lets a client ask the Veloce team to fund and operate a provider on its behalf.
- OpenRouter managed-provider route, server-side credential boundary, readiness gates, reservation/settlement/refund controls, and disable/restore behavior.
- Recovery-safe provider lifecycle: health can be rechecked, settlement/refund still work after disable, and restore requires a new health check before execution.
- Production evidence verifier for commit, deployment, image digest, migrations, tests, configuration hash, and rollback target.
- Production operations, managed-provider, and public-launch runbook documentation.

## Local verification passed

- Root typecheck.
- Product typecheck.
- Focused tests: **131/131 passed**.
- Managed-credit verification.
- Public-launch contract verification.
- Client lifecycle verification.
- Public provisioner verification.
- Root production build.
- Product production build.
- `git diff --check`.

## What remains before public production

These are primarily owner-controlled external gates and are intentionally not claimed as complete by local tests.

1. **Release identity and deployment**
   - Commit the verified source revision.
   - Deploy that exact revision to Vercel, Cloud Run, and the private provisioner.
   - Record the Vercel deployment, Cloud Run revision, immutable image digest, Supabase migration result, and rollback target.
   - Re-run `verify:production-readiness` against those recorded artifacts.

2. **Production configuration**
   - Configure production domains, email delivery/team routing, Turnstile or equivalent abuse protection, production Supabase control-plane secrets, Stripe live configuration, and the OpenRouter managed Secret Manager resource.
   - Verify configuration by hash/presence only; never place secret values in logs or evidence.

3. **Live commercial journey**
   - Complete request → email verification → Stripe setup/payment → manifest approval → provisioning → smoke test → activation.
   - Run owner-approved low-value live Stripe smoke tests for signatures, duplicates, refunds, disputes, and suspension behavior.

4. **Provider catalog evidence**
   - Keep providers gated unless each exposed provider has current pricing, health, safe smoke, failure, budget, audit, and rollback/disable evidence.
   - The current catalog has **7 providers selectable with current pricing evidence** and **9 providers visible but gated** until pricing evidence is refreshed.

5. **BYOK lifecycle evidence**
   - For every exposed provider, prove server-side validation, rotation, revocation, suspension, offboarding, quota, retry, timeout, redaction, budget enforcement, and disable behavior.
   - Provider-account smoke evidence is still required; local contract tests do not replace it.

6. **Two-tenant lifecycle evidence**
   - Run disposable provision → activate → suspend → export → delete → restore/rollback → offboard flows for two tenants.
   - Verify no cross-tenant access to balances, credentials, jobs, artifacts, queues, audit records, or secret references.

7. **Managed OpenRouter production evidence**
   - Use the Veloce-owned server-side credential and prove balance reconciliation plus reserve → execute → settle/refund.
   - Test success, failure, timeout, rate limit, over-budget, duplicate, refund, disable, and restore cases.

8. **Operations and approval**
   - Approve quotas/spend caps, depletion and outage alerts, dashboards, SLOs, incident escalation, support ownership, backups/restore, refunds, privacy, terms, retention, tax, abuse, and offboarding procedures.

## Billing model

There are two supported commercial modes:

- **BYOK:** the client supplies a provider key and pays that provider directly. Veloce governs access, budgets, approvals, and execution but does not fund the provider account.
- **Veloce-managed provider:** the client funds a Veloce wallet or requests team assistance; Veloce approves the request, pays the provider from a Veloce-owned account, and meters the tenant allocation. Wallet funding alone never activates execution.

The client-facing managed-provider request flow is implemented. Team approval, provider-account funding, and production accounting remain human-controlled gates.

## Source-of-truth files

- [Public launch runbook](./public-launch-runbook.md)
- [Production operations](./production-operations.md)
- [Managed provider access and billing model](./managed-provider-access.md)
- [Production readiness matrix](./production-readiness-matrix.md)
- [V3.3 managed-credit lifecycle runbook](./v3.3-managed-credit-lifecycle-runbook.md)
- [Production readiness evidence verifier](../scripts/verify-production-readiness.mjs)

The evidence verifier is authoritative for whether a particular release has the required recorded artifacts. The runbooks explain how to obtain them.

## Verification command

```bash
npm run verify:production-readiness -- --allow-dirty \
  --test-result typecheck=passed \
  --test-result focused=passed \
  --test-result root-build=passed \
  --test-result product-build=passed
```

`--allow-dirty` is useful while working locally. A public release must pass without it and must include the external deployment, migration, billing, tenant, provider, and approval evidence listed above.
