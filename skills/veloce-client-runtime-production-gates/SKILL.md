---
name: veloce-client-runtime-production-gates
description: Repeat the Veloce client-runtime release process: seed a tenant, promote a tested image, classify operator dependencies, and gate hosted capabilities with tenant, secret, budget, queue, approval, and recovery evidence.
---

# Veloce Client Runtime Production Gates

Use this skill when preparing a Veloce client edition for a new tenant or
reviewing whether a `3939` operator feature can be enabled in Cloud Run.

## Required order

1. Apply the four core control-plane migrations in the GCP client runbook,
   then apply the additive artifact lifecycle and hosted-capability migrations:
   `product-experience/supabase-client-runtime-lifecycle.sql` and
   `product-experience/supabase-client-runtime-hosted-capabilities.sql`.
2. Create the Auth user and run
   `product-experience/supabase-seed-veloce-cloud-test.sql` with the client's
   approved email and slug.
3. Confirm the final SQL query returns an active tenant and membership.
4. Set `CLIENT_RUNTIME_DATA_MODE=supabase` only after that confirmation.
5. Validate the manifest, build a versioned image, and deploy with a dedicated
   service account, bucket namespace, secret prefix, and approved capability
   allowlist.
6. Run the client-runtime verification script and the tenant-isolation tests.
7. Enable one capability at a time using
   `docs/hosted-capability-adapter-roadmap.md`.
8. Record export, deletion, backup/restore, rollback, and offboarding evidence.

## Classification rule

- `client-safe`: authenticated, tenant-scoped, server-backed, and tested.
- `api-adapter-required`: replace local CLI, provider login, filesystem,
  helper service, or operator vault before enabling.
- `operator-only`: keep on `127.0.0.1:3939` and never expose through Cloud Run.

Never treat a provider API key as a replacement for a local process or local
filesystem. Never place a provider key, service-role key, personal CLI session,
or raw secret in a manifest, image, browser response, or log.

## Worker and provider approval gate

The shared client runtime includes an API-only text adapter boundary, a
tenant-scoped job table, a Cloud Tasks submission path, and an OIDC-verified
worker path. It also contains explicitly gated workflow, Firecrawl SEO, and
ElevenLabs artifact adapters. Keep each path disabled until all of the
following are true:

- The controls migration is applied and the tenant row has a worker-token hash.
- The raw worker token exists only as the client-scoped Secret Manager secret.
- The Cloud Tasks queue and service-account token-minting IAM are verified.
- `providerCallsEnabled: true` is set only after provider key, model pricing,
  monthly budget, and human approval ownership are recorded. The provisioner
  derives `CLIENT_PROVIDER_CALLS_ENABLED=1`; do not set that switch through
  free-form runtime environment values.
- A job moves through queued/running/succeeded or failed, and transient errors
  demonstrate bounded retry without exposing keys or local paths.

The default is fail-closed. Enabling a UI capability alone must never authorize
provider spend or hosted execution.

## Completion standard

A client runtime is not complete merely because its URL loads. It needs
functional, authentication, authorization, tenant-isolation, secret, budget,
rate-limit, approval, retry/idempotency, accessibility, observability,
backup/restore, export, and deletion evidence. The canonical 13-layer matrix
is `docs/client-runtime-13-layer-readiness.md`.
