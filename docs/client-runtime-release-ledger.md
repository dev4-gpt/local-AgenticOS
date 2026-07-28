# Client Runtime Release Ledger

Updated 2026-07-28. This is the canonical continuation ledger for the hosted
client-runtime release. Do not restart from the requirements document or infer
completion from a screenshot. Each gate is either proven by the evidence below,
implemented but unproven, or waiting on an explicitly listed external input.

## Current Snapshot

## Finish Target

The immediate finish target is a controlled hosted release candidate: the
approved tenant can authenticate, use tenant-scoped data and storage, run a
four-step queued workflow, retry a failed workflow, and remain provider-gated
with auditable evidence. Full provider-enabled, multi-tenant production is a
separate target and cannot be honestly closed without approved provider
credentials, a disposable second tenant, a verified alert destination, and a
disposable delivery endpoint.

| Item | Authoritative value |
|---|---|
| Client | `veloce-cloud-test` |
| Cloud Run revision | `veloce-cloud-test-00058-9sf` |
| Image | `client-runtime:v51` |
| Image digest | `sha256:87bb112e1d41815f67f40654803458a33e16f2851d9d39c10a12fcb497d13575` |
| Traffic | 100% |
| Runtime URL | `https://veloce-cloud-test-mquo4bf7aq-el.a.run.app` |
| Provider calls | Disabled: `CLIENT_PROVIDER_CALLS_ENABLED=0` |
| Provider secrets | Supabase runtime secrets only |
| Authenticated acceptance | Passed 2026-07-28: workflow + four-step execution + artifact roundtrip |
| Worker identity | Cloud Tasks OIDC binding and tenant worker hash synchronized |

The desktop terminal may still display the historical failed `v42` deploy. It
is not the current service state and must not be used as a release signal; the
current manifest and Cloud Run service are v51/00058-9sf above.

## Proven And Must Not Be Repeated

- v51 production build, immutable Cloud Build image, manifest validation, and
  Cloud Run deployment passed.
- Live unauthenticated runtime verification passed against the canonical alias.
- Worker boundary, provider policy, lifecycle, security, repository-secret, and
  TypeScript checks passed.
- Cloud Tasks queue, OIDC worker binding, Cloud Storage bucket controls,
  tenant-prefix retention, and the runtime service account are provisioned.
- Provider execution is intentionally gated; no provider key is present in the
  client manifest or Cloud Run environment values.
- Network safety, bounded provider-output reads, delivery destination guards,
  workflow reconciliation, budget settlement fail-closed behavior, and secret
  output redaction are implemented in source.
- Authenticated acceptance passed against the canonical URL after synchronizing
  the tenant worker hash and granting the runtime service account the minimal
  self-scoped Cloud Tasks OIDC act-as permission. The harness verified workflow
  execution, four completed steps, signed artifact upload/download byte
  integrity, and cleanup.
- Authenticated rate-limit/refund acceptance passed with isolated temporary
  buckets: allow, deny, refund, recovery, and cleanup all returned the expected
  results without invoking a provider.
- Queue retry acceptance passed on 2026-07-28: the previously failed diagnostic
  workflow accepted `retry_execution` with HTTP 202 and reached `completed`
  with four `done` steps and no error code.

Evidence commands:

```bash
npm run build
npm run verify:client-worker
npm run verify:client-provider-policy
npm run verify:client-lifecycle
npm run verify:security
npm run verify:secrets
npm run validate:client-manifest -- .private-client-kits/veloce-cloud-test.gcp.json
CLIENT_RUNTIME_URL=https://veloce-cloud-test-mquo4bf7aq-el.a.run.app npm run verify:client-runtime
```

## Gate Matrix

| Gate | Status | Evidence or next action |
|---|---|---|
| 1. Public intake and boundary | Proven | Public/runtime boundary checks and security release verifier passed. |
| 2. Auth and capability gate | Proven for approved user | Authenticated acceptance passed with the approved tenant member and capability set. |
| 3. Tenant data and storage | Proven for primary tenant | Authenticated acceptance proved signed upload/download byte integrity and cleanup. |
| 4. Provider adapters | Implemented, deliberately gated | Requires approved provider key, model allowlist, pricing, live smoke, redaction, and rollback evidence. |
| 5. Workflow orchestration | Proven for deterministic runner | Authenticated acceptance reached `completed` with four `done` steps. |
| 6. Queue and compute | Proven for failure and recovery | Live redacted workflow state contains terminal `task_enqueue_failed` executions; the authenticated retry accepted HTTP 202 and recovered one workflow to `completed` with four `done` steps. |
| 7. CI/CD and rollback | Proven | Immutable v51 digest is recorded; traffic shifted to healthy revision `00057-9p4`, the protected route returned the expected redirect, and traffic restored to `00058-9sf` with the same boundary behavior. |
| 8. RLS and security | Static boundary proven; database proof pending | Reapply controls/workflow SQL and run the final verification query plus two-token isolation. |
| 9. Approval and delivery | Code path implemented; external drill pending | Use a disposable HTTPS destination and prove approval, one-time execution, audit, and rollback. |
| 10. Budget enforcement | Code path implemented; live accounting pending | Prove reserve, settle, deny, refund, and failed-enqueue refund using an approved test provider. |
| 11. Alerts and observability | Policies provisioned; email unproven | Complete the Monitoring email verification and trigger one controlled alert. |
| 12. Hosted Local/Engine/Free Claude replacements | Hosted surfaces implemented; provider parity pending | Keep provider calls gated until provider-backed parity is reviewed. |
| 13. Recovery and offboarding | Credential-safe CLI implemented; drill pending | Use a disposable second tenant for export, restore, rotation, and deletion. |

## Exact Continuation Order

1. In Supabase SQL Editor, run only the read-only
   `supabase-client-runtime-final-verification.sql` now. The canonical
   control-plane, controls, lifecycle, hosted-capabilities, and workflow-
   reconciliation migrations have already been applied and live acceptance
   depends on them. Reapply a migration only if the verification query
   directly proves that a required object is missing. The final query must
   show the expected tables/functions, `worker_hash_select = false`,
   worker-only grants, and the delivery guard.
2. Using the authenticated acceptance harness at
   `/private/tmp/veloce-runtime-cookie.txt`, keep the workflow/artifact result
   as the baseline evidence; do not repeat it unless the image, runtime env,
   SQL functions, or worker secret changes.
3. Keep the authenticated workflow, artifact, rate-limit/refund, and queue
   retry results already recorded above. The remaining live runtime drills are
   terminal queue failure/recovery and delivery approval.
4. Supply two disposable Auth access tokens and run
   `verify:client-isolation`, followed by the lifecycle export/restore drill.
5. Complete alert email verification and the controlled alert check.
6. Only after gates 1-5 are evidenced, activate one approved provider at a time.
   Never enable all providers together, and never place credentials in chat,
   source, browser storage, or Cloud Run environment values.
7. Run the final audit and update this ledger and the release-evidence document.

## External Inputs Still Required

These cannot be fabricated safely by the coding agent:

- Two disposable tenant/Auth identities and their access tokens.
- Supabase SQL Editor execution of the current migrations and final query.
- Verified Monitoring email destination.
- Disposable HTTPS delivery destination.
- User-approved provider account/key, model, pricing, and spending limit for
  each provider to be activated.

Until those inputs exist, the correct release state is a controlled hosted
runtime with provider capabilities gated, not full 3939/provider parity.

## Why This Is Not Restarted

Future continuations must begin with this ledger, inspect only the first row
whose status is not proven, and append evidence rather than recreating prior
work. The requirements attachment remains the scope definition; this file is
the execution state.
