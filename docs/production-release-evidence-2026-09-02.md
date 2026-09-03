# Production release evidence — 2026-09-02

Status: **in progress; not release-ready.** This note records observed
acceptance evidence only. It does not authorize production billing, tenant
activation, provider execution, or an OpenReply/VoxCPM rollout.

## Public onboarding and Stripe Test fixture

Two disposable public requests completed the following path independently:

1. public intake;
2. Resend email verification;
3. operator-approved Stripe **Test** fixture (50 cents setup plus 50 cents
   monthly); and
4. signed Stripe webhook processing.

Supabase recorded both test requests as `billing_status = succeeded` and
`client_onboarding_accounts.status = manifest_review`. This is direct evidence
that the public Stripe Test checkout and webhook path reached the server-side
state machine. The fixture is not a live-mode payment and created no real
charge.

The post-checkout confirmation route was initially absent. It was added in
commit `5649c69` and checked on the production deployment without passing a
Checkout Session identifier. The page deliberately shows no payment, customer,
or session data.

## Deployed product-control-plane changes

- Commit `5649c69`: billing confirmation page.
- Commit `2ced985`: two-stage disposable tenant provisioning.
- Commit `902a79c`: hardens the fixed disposable control-plane canary to the
  standard provider-disabled tenant-manifest contract. It pins one Veloce-only
  CORS origin, one-dollar Veloce budget metadata, min=0/max=1 sizing, and the
  required safe runtime environment; both the local canary tool and the live
  API route now reject drift from that contract.
- Production Vercel deployment: `dpl_7j3niUmBrLotZc6oFWR1rYpaxiZJ`, status
  `Ready`, aliased to `https://app.veloceos.cloud`.
- Canary-hardening deployment: `dpl_FFCeQPLjfDXtPUmx6DMJYFmzEJyo`, status
  `Ready`, aliased to `https://app.veloceos.cloud`.
- Current operator-secret reconciliation deployment: `dpl_91MKJNUAsX8Acsc2ZanZEJJdTDH9`,
  status `Ready`, current Production deployment, aliased to
  `https://app.veloceos.cloud`.
- Current bounded-recovery deployment: `dpl_9arXq1Lc6a57cCe2RPKB5CrMX99f`,
  status `Ready`, aliased to `https://app.veloceos.cloud`. It was deployed
  from an isolated `product-experience` snapshot of source commit `552abdf`,
  which includes the recovery-route change in `c4e2953`.
- Current governed-integration deployment: `dpl_B8gXkt3zBgnxF693zJbxpKJJEpky`,
  status `Ready`, aliased to `https://app.veloceos.cloud`. It was deployed
  from source commit `97ff20a`, which machine-checks coverage for Ponytail,
  Headroom, OpenReply, and VoxCPM across pipeline, infrastructure, stack, and
  backend.
- Current canary-isolation baseline: `dpl_2eqtuDtpfkwqQQ7H6mifuYhgmnxJ`,
  status `Ready`, promoted to `https://app.veloceos.cloud` from commit
  `22bc6fd`. It pins the canary manifest and route to the immutable,
  non-dogfood runtime image
  `asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/client-runtime:v3-3-295bdd3b5efe@sha256:8498b6fa61645b9168db74b1454738c6ffb1d33155303d52fd8f6a90dfe39765`.
  `CONTROL_PLANE_CANARY_ENABLED` was explicitly set to `0` before this
  deployment; no secret value was read or recorded.
- The product app now has a secret-protected prepare route and a separate
  secret-protected deploy route. The deploy route requires a successful
  prepare run and uses an independent `deploy:<request id>` idempotency key.
- Two reviewed manifests are present for the disposable tests. Each has a
  distinct tenant slug, Cloud Run service account, bucket, task queue, and
  Secret Manager namespace; provider calls are disabled; min instances are
  zero; max instances are one; and retention is one day.

The reviewed runtime image reference is
`asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/client-runtime:v3-3-9a540fc`.
The private provisioner resolves and records its immutable digest at deploy
time.

## Verification performed

- Both disposable manifests passed `npm run validate:client-manifest`.
- The control-plane canary now also passes `npm run validate:client-manifest`
  and `npm run verify:control-plane-canary`; its inventory remains exactly one
  service account, bucket, queue, and tenant-scoped credential-inbox secret.
- The new operator scripts passed `node --check`.
- `git diff --check` passed before commit.
- Vercel completed the production build of commit `2ced985` successfully.
- Vercel completed the current bounded-recovery build with the production
  Next.js build and TypeScript check. A metadata-only Production environment
  check then passed: all 37 required variables are production-scoped and all
  seven sensitive variables are Vercel `sensitive` values. No values were
  read or recorded.
- `npm run typecheck`, `npm run verify:integration-governance`, and `npm run
  verify:engineering-controls` passed for the governed-integration release.

The local root type-check and Vercel clean remote build passed. On 2026-09-03,
the focused Playwright suite completed from clean source commit `cc35e6d`:
**158 passed in 4.4 seconds**. This replaces the earlier local transformer
collection failure; it is source-regression evidence only, not a substitute
for the remaining production acceptance tests.

## Current control-plane evidence and qualification

An authorized project-owner Cloud Shell session reran the full read-only
control-plane probe after reconciling the Vercel operator secret with Secret
Manager. It returned `ok: true`, `applyEnabled: false`, HTTP `200`, and
`adapterWorker: "gcp-provisioner"` for the current private adapter revision
`veloce-gcp-provisioner-00027-slg`. This proves the expected Cloud Tasks queue
configuration, OIDC boundary, callback target, immutable adapter image, and
the Vercel-to-private-adapter health bridge with writes disabled.

The historical disposable canary record was read directly from Supabase and
again through the secret-protected status endpoint:

- onboarding `ed55b31a-7e8b-44f5-926f-c2b6b816465e` is `offboarded`;
- run `3fdf20ae-44e4-4fc7-8a55-8c1a05190578` is `rolled_back` with
  `canary_cleanup_complete`;
- its exact service account, bucket, queue, and inbox secret are all absent;
- no Cloud Run service or job was created, and no `dofgfood` resource was
  selected or changed.

The historical run predates the later canary hardening. Its retained adapter
output reports a wildcard bucket CORS configuration and a mutable-canary queue
configured with ten max attempts. The present manifest and route reject those
settings (Veloce-only CORS and the narrowed contract), but the old run must not
be presented as end-to-end proof of the newer policy. A second, newly named
disposable canary would require explicit owner approval if that current-policy
execution evidence is required.

## 2026-09-03 current-policy canary baseline

The owner Cloud Shell preflight passed for the new canary inventory: the exact
service account, bucket, queue, and credential-inbox secret are all absent,
and the private provisioner service account holds the reviewed
`veloceTenantProvisioner` role. The inventory contains no Cloud Run service or
job. The Cloud Shell control-plane probe also returned `ok: true`, health
`200`, adapter revision `veloce-gcp-provisioner-00029-5ws`, immutable adapter
digest `sha256:28b328536c80ea3c682d7255e04dfc3f5945edfed817e9347ea8b8a40660fc00`,
and `applyEnabled: false`.

The current `veloce-cloud-test-00204-bil` revision is serving 100% of Cloud
Run traffic from image digest
`sha256:8498b6fa61645b9168db74b1454738c6ffb1d33155303d52fd8f6a90dfe39765`.
Its unauthenticated credits endpoint returns `401 not_authenticated`, which
proves the public runtime still enforces authentication. The Vercel canary
route on the promoted alias also returns `401 not_authorized` without the
operator header. This is an access-boundary check only; it does not execute a
canary.

The current-policy prepare-only canary has **not yet been proved dispatched**.
Its Cloud Tasks callback and Supabase rollback record remain required before
release acceptance. Applies stay disabled outside a short, documented canary
window.

## 2026-09-03 interrupted-canary recovery evidence

One bounded current-policy window was opened after a protected `409
canary_disabled` check, with Vercel dispatch temporarily enabled and the
private adapter changed to `GCP_PROVISIONER_ALLOW_APPLY=1`. The Cloud Shell
session restarted before it retained the dispatch response identifiers, so no
current-policy callback, run status, or Supabase rollback record is claimed.

The recovery action was nevertheless exact and successful: the local cleanup
tool reported `ok: true` and independently proved absence of only the four
tracked resources for `cp-canary-a828-rollback` (service account, bucket,
queue, and credential-inbox secret) at `2026-09-03T13:51:36.807Z`. It did not
select or modify `dofgfood`, and it does not create a Cloud Run service or job.
Vercel dispatch was then explicitly set back to `0` and production was
promoted to closure deployment `dpl_BnqZKQevp4cgPmR6zvwnLzZg4vsR`.

The Cloud Run closure operation completed asynchronously. The authoritative
owner Cloud Shell probe then returned `ok: true`, adapter revision
`veloce-gcp-provisioner-00033-c5c`, health `200`, and
`applyEnabled: false`, with no failures or warnings. The dispatch gate is
closed in both systems. The current-policy canary still remains **not
accepted** as Cloud Tasks-to-adapter or callback evidence because its run IDs
were lost in the restarted Cloud Shell session and no Supabase callback record
was retained.

A read-only Supabase lookup subsequently showed that the only
`cp-canary-a828-rollback` record is the older, already-offboarded historical
canary. The operator route correctly rejects reusing that tenant slug, which
explains why no current-policy run was created. The next tracked candidate is
therefore `cp-canary-b903-rollback`; it has a newly derived four-resource
inventory, the same immutable non-dogfood runtime image, no Cloud Run
service/job, provider calls disabled, and a one-dollar cap. Its manifest,
route binding, inventory verifier, and focused tests passed locally. The
candidate route is deployed to Vercel production deployment
`dpl_3QJra4jek28ticr8dPSXrydcowmJ` with
`CONTROL_PLANE_CANARY_ENABLED=0`; `https://app.veloceos.cloud/` returned 200
and an anonymous canary request returned `401 not_authorized`. It has not been
dispatched, and the GCP apply gate remains closed. A subsequent owner Cloud
Shell preflight for this exact `b903` inventory returned `ok: true`: its
service account, bucket, queue, and credential-inbox secret were all absent,
and `veloce-gcp-provisioner-run@veloce-agenticos-2026.iam.gserviceaccount.com`
held `projects/veloce-agenticos-2026/roles/veloceTenantProvisioner`.

## Still required for release acceptance

- exact prepare resource inventory, Cloud Tasks → private-adapter callback,
  deploy smoke, activation, tenant access tokens, isolation test, export, and
  complete offboarding for both disposable tenants;
- duplicate-webhook and failed-payment Stripe Test evidence;
- BYOK validation, rotation, revocation, deletion, and browser/evidence secret
  scans;
- operations/legal/provider approvals and final strict release attestation;
- restore production Stripe Live keys and matching Live webhook signing secret
  only after the Test fixture is fully offboarded;
- OpenReply remains disabled pending an upstream security audit and explicit
  consented Meta/Instagram pilot approval; VoxCPM remains disabled pending
  license, cost/performance, and voice-consent approvals.

## Acceptance matrix

| Requirement | Current evidence | Status |
| --- | --- | --- |
| Public intake and verified email | Two independent Test A/Test B records show verified email. | proved |
| Stripe Test Checkout and signed webhook | Both records reached `billing_status = succeeded`; no real charge was made. | proved |
| Post-Checkout customer confirmation | Commit `5649c69` deployed the non-sensitive confirmation page. | proved |
| Duplicate webhook idempotency and failed-payment flow | No retained Test evidence for either outcome yet. | pending |
| Fixed, isolated canary scope | Commits `902a79c` and `22bc6fd`, manifest validation, inventory verifier, and current Vercel baseline pin four named disposable resources and one immutable non-dogfood image; no Cloud Run service or job is part of the prepare phase. | proved locally and deployed |
| Owner read-only control-plane preflight | Owner Cloud Shell probe returned `ok: true`, health `200`, and `applyEnabled: false` for adapter revision `veloce-gcp-provisioner-00029-5ws`. | proved |
| Cloud Tasks to private-adapter callback | The current queue/OIDC/callback path and private adapter health bridge passed; the historical canary recorded `gcp_prepare` before rollback. | proved for the historical canary; current-policy execution not rerun |
| Exact canary inventory and deletion proof | Historical canary record is `rolled_back`, onboarding is `offboarded`, and its four exact resources are absent. Its raw output predates the current CORS/retry hardening. | proved for rollback; current-policy execution pending approval |
| Test tenant prepare/deploy/smoke/activation | Both Test requests are at `manifest_review`; no tenant resource has been created. | pending |
| Tenant isolation, export, and offboarding | Requires two activated disposable runtimes and access tokens. | pending |
| Headroom and Ponytail integration | Both are registered as Veloce-owned, dependency-free engineering controls; production tenant data is not proxied upstream. Their pipeline, infrastructure, stack, and backend placements are machine-checked. | proved by static governance checks |
| OpenReply integration | Isolated design is registered; upstream audit records 3 critical and 10 high advisories, so the pilot remains disabled. | correctly blocked |
| VoxCPM integration | Isolated private-GPU design is registered; commit pin, cost/performance, consent, and deletion evidence are not approved. | correctly blocked |
| BYOK lifecycle and secret-exposure evidence | No completed rotation/revocation/deletion or browser/export credential scan record. | pending |
| Clean-runner focused regression | `npm run test:focused` completed 158/158 passing tests in 4.4 seconds from clean source commit `cc35e6d`. | proved locally |
| Operations, legal, catalog approvals and strict attestation | No complete approval/attestation record. | pending |

## Recovery update — source commit `c4e2953`

Two disposable tenant deploy runs failed before mutation because the reviewed
runtime image tag was temporarily unavailable. Their callbacks recorded an
empty `completed_steps` array and empty `resource_manifest`; no tenant runtime,
queue, bucket, service account, or tenant binding was created by either run.

The exact image tag was subsequently confirmed available in Artifact Registry.
Commit `c4e2953` changes the deploy route to preserve the original failed run
and create a fresh, bounded retry run only for that precise zero-mutation
failure shape. It never reopens a completed Cloud Tasks task, accepts queued,
running, and successful deploys as idempotent, rejects any partial or unknown
failure for manual review, and permits at most two recovery retries.

Source validation on this commit passed `npm run typecheck`, the product
production build, `npm run verify:public-launch`, `npm run
verify:public-provisioner`, `npm run verify:engineering-controls`, `npm run
verify:integration-governance`, `npm run verify:openreply-pilot`, `npm run
verify:voxcpm-pilot`, and `npm run verify:control-plane-canary`. The local
focused Playwright runner still cannot collect tests because its installed
transformer reports `babelTransform is not a function`; this is not accepted
as clean-runner evidence.

The recovery route is now deployed to the production Vercel alias as
`dpl_9arXq1Lc6a57cCe2RPKB5CrMX99f`. Do not reopen the GCP apply window or
dispatch either retry until an authorized project-owner preflight again
reports the adapter healthy with apply disabled. The full strict readiness
verifier intentionally remains false until Cloud Run, migration, journey,
Stripe, BYOK, tenant-isolation, operations, and legal evidence are attached.
