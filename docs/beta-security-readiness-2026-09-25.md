# Beta Security Readiness Audit

**Date:** 2026-09-25, updated 2026-09-26
**Status:** source controls and controlled internal-runtime evidence pass;
public customer activation remains incomplete.

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
| Platform environment isolation | Passed live against `ppmoqjtmjtfxadsnejqc.supabase.co`; two synthetic service-role rows were removed after staging and production filtering proved isolated. |
| Two-tenant isolation | Passed live with two disposable users, tenants, and short-lived sessions across every scoped-table probe; all fixtures were removed. |
| Internal runtime smoke | Passed on `agentos-internal-beta`: protected-route redirect, password login, HTTP-only session cookies, tenant-scoped API read, logout, and fixture cleanup. |
| Client artifact boundary | Passed locally and in Cloud Build: the standalone client image prunes disabled route entries and verifies its remaining route manifests and trace paths. |
| Operational ownership | Passed: Aryaman is recorded as the interim incident, billing, revocation, and deletion owner. |

## Evidence still required before beta acceptance

1. **Email callback journey:** the repository now has a browser-level,
   disposable verifier that creates and cleans its tenant fixtures, but it has
   not yet run live because the Supabase owner dashboard session expired before
   the short-lived service-role capability could be supplied. Reauthenticate
   and run the verifier before opening paid or unmanaged traffic.

## Decision

No beta-critical source vulnerability was identified in this pass. The product
is accepted for a **controlled internal beta runtime**, not a multi-tenant
public beta or GA. The legacy `agentos-mvp/agentos` Cloud Run service remains
an unacceptable test or customer-runtime target until the live email callback
evidence and separate public activation decisions exist.
