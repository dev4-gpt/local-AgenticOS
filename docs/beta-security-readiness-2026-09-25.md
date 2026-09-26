# Beta Security Readiness Audit

**Date:** 2026-09-25
**Status:** source controls pass; live tenant evidence remains incomplete.

This audit covers the beta-critical boundaries for the canonical Vercel product
described in [the production topology](./production-topology-2026-09-25.md).
It is not a GA security certification.

## Source controls verified

- The public-site boundary check found no private-runtime endpoints, local
  addresses, or provider secrets in browser-shipped files.
- Provider credential submission and revocation are restricted to active tenant
  owners and admins. Viewers and members are rejected before a Secret Manager
  write can occur.
- Tenant records, jobs, artifacts, pipeline data, and other hosted surfaces are
  tenant-scoped through Supabase RLS and `client_member(tenant_slug)` checks.
- Managed-provider routes are disabled by default, require the server-side
  operator boundary, and preserve fail-closed reserve, settle, refund, and
  reconciliation behavior.
- Vercel-to-Cloud-Run delegation is designed around short-lived OIDC federation
  rather than a long-lived Google service-account key stored in Vercel.
- External pilot integrations remain disabled or manual-only until their own
  evidence and approvals exist.

## Fresh evidence

| Check | Result |
| --- | --- |
| `npm run verify:security` | Passed. The OpenReply pilot correctly reported that no live health check was attempted. |
| `npm run verify:public-beta` | Passed. |
| `npm run verify:client-provider-policy` | Passed. |
| `npm run verify:provider-egress-budget` | Passed for 7 manifests. |
| GA security, SQL, and release regressions | 27/27 passed under Node 24. |

## Evidence still required before beta acceptance

1. **Two-tenant isolation:** run `verify:client-isolation` against the selected
   current runtime with two disposable tenants and short-lived test tokens.
   The verifier must prove that each tenant can read its own records across all
   scoped tables and sees no rows for the other tenant.
2. **Platform environment isolation:** run the controlled
   `verify:platform-isolation` probe only after the current Supabase target is
   confirmed. It writes and removes two synthetic service-role rows; the local
   attempt could not resolve its configured Supabase host, so it is
   inconclusive rather than failed.
3. **Live auth journey:** verify a disposable user through email callback,
   session establishment, protected-route rejection, tenant membership, and
   logout against the canonical product stack.
4. **Operational ownership:** name the incident, billing, access-revocation,
   and customer-data deletion owners before opening paid or unmanaged traffic.

## Decision

No beta-critical source vulnerability was identified in this pass. The product
remains **not accepted for a multi-tenant public beta** until the three live
evidence runs above are completed against a deliberately selected backend.
The legacy `agentos-mvp` Cloud Run service is not an acceptable test target.

