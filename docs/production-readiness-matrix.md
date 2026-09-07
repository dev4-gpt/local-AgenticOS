# Veloce AgentOS production-readiness matrix

This matrix is generated from the tracked portfolio source at
`src/lib/productionReadinessMatrix.ts`. It covers the 101-repository starred
portfolio snapshot and the 53 repositories supplied in the attached prompt.
The attached repositories are already represented in the portfolio; the
separate test asserts that coverage so a future portfolio refresh cannot drop
them silently.

## Readiness meanings

| Status | Meaning |
| --- | --- |
| `end-to-end-current-revision` | Current source, focused tests, and a named deployed revision prove the behavior. |
| `source-tests-cloud-evidence-stale` | Source and focused tests exist, but cloud evidence must be refreshed against the current revision. |
| `contract-static-only` | A Veloce contract, catalog row, or static verifier exists; upstream execution is not granted. |
| `pilot-isolated-worker` | Candidate requires an isolated worker, cost/license review, and rollback evidence. |
| `operator-only` | Available only to the operator in a disposable, reviewed workspace. |
| `reference-only` | Research or provenance input with no runtime activation. |
| `blocked-review` | License, credential, safety, infrastructure, or permission review blocks activation. |

## Current product matrix

| Capability | Evidence | Status | Remaining gate |
| --- | --- | --- | --- |
| Public onboarding and consent | Source and public-launch contract checks | Source/tests proven; cloud journey stale | Verification → payment → manifest → provisioner smoke |
| Provider matrix and catalog | Provider policy tests and dated pricing snapshots | Source/tests proven; cloud journey stale | Current deployed UI and manifest evidence |
| BYOK credentials | Server-side tenant vault contract | Contract/static plus focused tests | Provider validation, rotation, revocation, offboarding |
| Stripe Test checkout | `$1` test allocation settled into Veloce wallet | End-to-end in Test mode | Live-mode keys, webhook, refund, dispute, monitoring |
| Provider execution | Cost routing and budget ledger contracts | Managed route disabled | Provider-specific adapter, health, reserve, execute, settle, refund |
| Tenant isolation | Tenant-scoped RPCs and runtime policy | Partial | Two-tenant read/write/spend/delete evidence |
| Provisioner | IAM/OIDC public-to-private boundary, immutable public/adapter images, Cloud Tasks queue with one attempt/concurrency, adapter callback ownership, and live health bridge | Durable safe-mode end-to-end current | Run one disposable tenant provisioning and rollback with apply enabled only for the canary window |
| Quotas and alerts | Partial runtime budget controls | Partial | Per-provider quota, alert, suspension, and support evidence |
| Open-source replacements | Cataloged or gated candidates | Evaluation only | Shadow benchmarks before replacing Supabase, Vercel, Resend, or Stripe |
| OpenReply Instagram delivery | Secret-free isolated deployment blueprint, verifier, and reviewed blocked upstream candidate | Staged; disabled; upstream candidate blocked by production advisories | Patched upstream commit with zero critical/high production advisories, separate Railway/Vercel deployment, Meta tester setup, healthy worker, private test DM, rollback evidence |

## Billing truth model

The visible wallet balance means `wallet_funded`. It does not mean
`ready_for_execution`. The API now returns both wallet and provider readiness
fields, and the UI explains that a payment funds the Veloce ledger rather than
automatically purchasing provider credits.

The managed OpenRouter route remains disabled. BYOK remains the usable provider
path until a tenant-scoped managed account, reconciliation, and execution smoke
bundle exists.

## Release gates

Before a test deployment, run typecheck, production builds, route and provider
policy tests, public-launch/provisioner checks, managed-credit readiness tests,
and the repository coverage tests. Then deploy a known `linux/amd64` image and
verify the revision digest matches the tested commit.

Before live payments, configure live Stripe keys and webhook secrets separately
from Test mode, then verify success, decline, 3DS, duplicate webhook, refund,
and reconciliation behavior. Do not use real card details with Test-mode keys.
