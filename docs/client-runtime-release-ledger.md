# Client Runtime Release Ledger

Updated 2026-07-29. This is the canonical continuation ledger for the hosted
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
| Cloud Run revision | `veloce-cloud-test-gate10restore` |
| Image | `client-runtime:v54` |
| Image digest | `sha256:91ca3cf6d1bc15d5b7e7ce673173deb42de1f7f0b64528906321d977c81f99a9` |
| Traffic | 100% to `veloce-cloud-test-gate10restore` |
| Runtime URL | `https://veloce-cloud-test-mquo4bf7aq-el.a.run.app` |
| Provider calls | Disabled: `CLIENT_PROVIDER_CALLS_ENABLED=0` |
| Provider secrets | Cloud Run uses Supabase runtime secrets only; Anthropic target slot staged but not deployed |
| Authenticated acceptance | Passed 2026-07-28: workflow + four-step execution + artifact roundtrip |
| Worker identity | Cloud Tasks OIDC binding and tenant worker hash synchronized |

The desktop terminal may still display historical deploy output. It is not the
current service state and must not be used as a release signal; the current
manifest and Cloud Run service are v54/`veloce-cloud-test-gate10restore` above.

## Proven And Must Not Be Repeated

- v53 production build and the immutable v54 delivery-correction image,
  manifest validation, and Cloud Run deployment passed.
- Live unauthenticated runtime verification passed against the canonical alias.
- Worker boundary, provider policy, lifecycle, security, repository-secret, and
  TypeScript checks passed.
- Cloud Tasks queue, OIDC worker binding, Cloud Storage bucket controls,
  tenant-prefix retention, and the runtime service account are provisioned.
- Provider execution is intentionally gated; the deployed Cloud Run revision
  has no provider key or provider runtime mapping. The approved Anthropic
  target slot is staged in the local private manifest but is not deployed.
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
- Anthropic credential inbox validation and approved Secret Manager promotion
  passed on 2026-07-28. The client-scoped envelope matched
  `ANTHROPIC_API_KEY`; target secret version `1` was created without printing
  the raw value. The approved `claude-sonnet-5` model, $2/M input and $10/M
  output pricing, and $1 test cap are staged in the disabled local private
  manifest. Smoke testing and provider activation remain pending, and provider
  calls remain disabled.

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
| 1. Public intake and boundary | Proven | On 2026-07-29 the Vercel production service-role credential was replaced and the product site was redeployed. Synthetic non-personal submissions to both `POST /api/lead` and `POST /api/deployment-request` returned HTTP 200; one row was found in each of `signups` and `deployment_requests`, then both rows were deleted with HTTP 204. |
| 2. Auth and capability gate | Proven for approved user | Authenticated acceptance passed with the approved tenant member and capability set. |
| 3. Tenant data and storage | Proven for primary tenant | Authenticated acceptance proved signed upload/download byte integrity and cleanup. |
| 4. Provider adapters | Proven | The authorized v53 smoke revision exposed only Anthropic / `claude-sonnet-5` with the $1 cap. Authenticated normal job `48701a99-f3ec-481d-be00-b3fa44525e41` succeeded; authenticated secret-shaped-output job `279e0bdd-52df-4af3-b010-4ea34bc3b976` succeeded with its output withheld by the provider-output redactor. No raw output or credential was printed. Traffic is now 100% to v54 `veloce-cloud-test-gate10restore`, where provider calls are disabled and `text-agents` is absent. |
| 5. Workflow orchestration | Proven for deterministic runner | Authenticated acceptance reached `completed` with four `done` steps. |
| 6. Queue and compute | Proven for failure and recovery | Live redacted workflow state contains terminal `task_enqueue_failed` executions; the authenticated retry accepted HTTP 202 and recovered one workflow to `completed` with four `done` steps. |
| 7. CI/CD and rollback | Proven | Immutable v53 digest is recorded; traffic shifted to healthy revision `00057-9p4`, the protected route returned the expected redirect, and traffic restored to `00058-9sf` with the same boundary behavior. |
| 8. RLS and security | Proven for primary and disposable second tenants | Final summary returned all required tables/functions, `worker_hash_select=false`, worker-only execution grants, delivery guard, and active tenant. The two-token probe passed for `veloce-cloud-test` and disposable `veloce-cloud-test-b` across records, jobs, and artifacts; tokens and row content were not printed. |
| 9. Approval and delivery | Proven | After the original task exhausted ten HTTP 503 callbacks, provider-disabled v54 added safe claim-status logging, request-ID audit correlation, and collision-free task names. One corrected task returned HTTP 200, the approved Webhook.site destination recorded a POST, and action `366e5d05-4918-486d-8227-6e0b30df865f` is durably `executed` with `error_code=null` at 2026-07-29T09:44:12Z. |
| 10. Budget enforcement | Proven | The two authorized Anthropic jobs settled usage-based ledger amounts of 204 and 1,392 micros. Isolated live job `56e3e67d-ae89-4aa9-88e9-af5ca4475c5e` then failed terminally with `budget_exceeded` under the $0.000001 cap, with no ledger row; Cloud Run logged the matching redacted budget denial before provider dispatch. The authenticated temporary-bucket acceptance already proved allow, deny, rate-limit refund, failed-enqueue refund, recovery, and cleanup. Traffic was restored to the provider-disabled v54 revision. |
| 11. Alerts and observability | Pending external input | Four policies are provisioned and attached to the enabled email channel `11435881475361291593`; a read-only Monitoring API check returned `verificationStatus: null`. Google email verification and one controlled alert remain required. |
| 12. Hosted Local/Engine/Free Claude replacements | Pending external input | Hosted surfaces are implemented; provider-backed parity requires approved provider access and review. |
| 13. Recovery and offboarding | Pending external input | Credential-safe CLI is implemented; a disposable second tenant is required for export, restore, rotation, and deletion. |

## Exact Continuation Order

1. Gate 1 is proven. The Vercel production service-role credential was
   replaced, the product site was redeployed, and synthetic non-personal rows
   were stored then deleted from both public intake tables. The product page
   and `/start` are safe to market for lead capture.
2. Gate 4 is complete. Keep its normal smoke, secret-shaped-output redaction,
   and disabled rollback results as the baseline. Do not re-enable the provider
   or repeat its calls unless the adapter, approved model, budget, or runtime
   environment changes.
3. Gate 9 is proven. The corrected task returned HTTP 200, the approved
   destination recorded a POST, and the existing action is durably `executed`
   with no error. Do not repeat this delivery check unless its worker, approval
   helper, destination guard, or runtime image changes.
4. Gate 10 is proven. Keep its settled-usage rows, zero-spend denial, existing
   refund acceptance, and provider-disabled v54 restore as the baseline; do
   not repeat provider work or budget calls unless the accounting boundary
   changes.
5. Gate 11 is now the first unproven gate. Complete Google email verification
   for the existing Monitoring channel, then run one controlled alert check.
6. Keep the Gate 8 final verification, authenticated workflow/artifact,
   rate-limit/refund, queue recovery, rollback, and isolation results as the
   baseline. Do not repeat them unless their stated runtime or data boundaries
   change.
7. After Gate 11, review Gate 12's distinct hosted-provider parity requirement,
   then perform the Gate 13 lifecycle drill with a disposable tenant.

## External Inputs Still Required

These cannot be fabricated safely by the coding agent:

- Disposable second tenant/Auth identity remains available for the lifecycle
  export/restore and offboarding drill; its access tokens are local-only.
- Verified Monitoring email destination.
- A reviewed provider account/key, model, pricing, and spending limit for any
  distinct provider needed by the Gate 12 hosted-parity review.

Until those inputs exist, the correct release state is a controlled hosted
runtime with provider capabilities gated, not full 3939/provider parity.

## Why This Is Not Restarted

Future continuations must begin with this ledger, inspect only the first row
whose status is not proven, and append evidence rather than recreating prior
work. The requirements attachment remains the scope definition; this file is
the execution state.
