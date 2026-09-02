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

The local product type-check remains unavailable because the local dependency
tree contains malformed duplicate type-package directories (for example,
`@types/* 2`). Vercel's clean remote build succeeded; that is deployment
evidence, not a substitute for the clean-runner focused-test requirement.

## Current blocker before tenant preparation

The repository's read-only control-plane probe was run before enabling apply.
It failed because the local `gcloud` principal lacks permission to read Cloud
Run, Cloud Tasks, IAM policy, and project metadata in
`veloce-agenticos-2026`. No tenant was queued and no GCP resource was created.

Before the bounded disposable window is opened, an authorized project identity
must rerun:

```bash
npm run verify:control-plane-cloud -- --probe
```

Required result: `ok: true` with `applyEnabled: false`. Only then can an owner
temporarily enable apply, dispatch the two **prepare** manifests, add the
tenant-scoped Supabase anon-key Secret Manager versions, and dispatch the
separate **deploy** stage.

## Still required for release acceptance

- exact prepare resource inventory, Cloud Tasks → private-adapter callback,
  deploy smoke, activation, tenant access tokens, isolation test, export, and
  complete offboarding for both disposable tenants;
- duplicate-webhook and failed-payment Stripe Test evidence;
- BYOK validation, rotation, revocation, deletion, and browser/evidence secret
  scans;
- clean-runner focused regression output;
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
| Fixed, isolated canary scope | Canary commit `902a79c`, manifest validation, and inventory verifier pin four named disposable resources; no Cloud Run service or job is part of the prepare phase. | proved locally and deployed |
| Owner read-only control-plane preflight | Current local `gcloud` identity has no project permission. | blocked on GCP owner identity |
| Cloud Tasks to private-adapter callback | Requires the owner preflight followed by the single authorized prepare canary. | pending |
| Exact canary inventory and deletion proof | Inventory is fixed and cleanup code is fail-closed, but no resource has yet been created or deleted. | pending |
| Test tenant prepare/deploy/smoke/activation | Both Test requests are at `manifest_review`; no tenant resource has been created. | pending |
| Tenant isolation, export, and offboarding | Requires two activated disposable runtimes and access tokens. | pending |
| Headroom and Ponytail integration | Both are registered as Veloce-owned, dependency-free engineering controls; production tenant data is not proxied upstream. | proved by static governance checks |
| OpenReply integration | Isolated design is registered; upstream audit records 3 critical and 10 high advisories, so the pilot remains disabled. | correctly blocked |
| VoxCPM integration | Isolated private-GPU design is registered; commit pin, cost/performance, consent, and deletion evidence are not approved. | correctly blocked |
| BYOK lifecycle and secret-exposure evidence | No completed rotation/revocation/deletion or browser/export credential scan record. | pending |
| Clean-runner focused regression | Local Playwright packaging fails before discovery; clean-runner output has not been retained. | pending |
| Operations, legal, catalog approvals and strict attestation | No complete approval/attestation record. | pending |
