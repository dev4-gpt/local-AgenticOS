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
- Production Vercel deployment: `dpl_7j3niUmBrLotZc6oFWR1rYpaxiZJ`, status
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
