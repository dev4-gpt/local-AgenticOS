# AgentOS MVP Beta Runtime Assessment

**Date:** 2026-09-25, updated 2026-09-26
**Status:** controlled internal beta runtime deployed; public customer
activation remains closed.

This is the current, read-only assessment of `agentos-mvp` as a possible host
for a new Veloce client-safe Cloud Run runtime. It does not authorize reuse of
the existing `agentos` service.

## Verified Project State

| Item | Result | Consequence |
| --- | --- | --- |
| Region | `europe-west1` | Use this region consistently for any new runtime resources. |
| Cloud Run | `agentos` and `agentos-internal-beta` | The new beta service is isolated from the legacy workload. |
| Legacy service | Public `agentos-00013-q7f` from 2026-05-27 | It remains constrained to min 0 / max 1 and is not a current repository deployment. |
| Artifact Registry | `veloce-client-runtime` Docker repository created in `europe-west1` | Holds the pinned image consumed only by the internal beta service. |
| Cloud Build | Client-safe build `7728f333-deda-4e6b-ab1c-2e17c8f7ccee` succeeded | Its pruned, immutable image is deployed below. |
| Cloud Tasks | Enabled | The client provisioner can create its isolated queue after manifest approval. |
| Secret Manager | Internal beta has `veloce-internal-beta-supabase-anon-key`, version 1 enabled | The runtime has a tenant-scoped publishable-key reference; no service-role or provider key is bound. |
| Runtime service accounts | `agentos-internal-beta-run` exists | It owns only the internal beta runtime resources. |
| Cost control | `$5` monthly alert and legacy max scale 1 | An alert is not a spend cap; the new runtime must keep min instances 0 and max instances 1. |

## Deployed Architecture

Use `agentos-mvp` only for a **new**, client-safe service built from
`Dockerfile.client`, with its own service account, Cloud Tasks queue, bucket,
Secret Manager bindings, and tenant slug. Keep the public product front end on
`https://app.veloceos.cloud`.

`agentos-internal-beta-00010-d68` serves
`https://agentos-internal-beta-vbimnfseva-ew.a.run.app` with min instances zero,
max instances one, and one concurrent request. It uses the pinned image, a
dedicated service account, bucket, queue, and workspace job. Only
`aryamandev777@gmail.com` is allowlisted. Provider calls, local files, local
CLI access, worker execution, and intent routing are disabled.

The service receives only the tenant-scoped Supabase publishable key at runtime.
It does not receive a service-role key, the existing Groq key, a Vercel
credential value, or a provider credential.

## Verified Build Evidence

- Source: local `main` at commit `caf30a0`.
- Build: `7728f333-deda-4e6b-ab1c-2e17c8f7ccee`, completed successfully on
  2026-09-26 with the client Dockerfile's route-pruning and artifact-verifier
  stages.
- Image:
  `europe-west1-docker.pkg.dev/agentos-mvp/veloce-client-runtime/client-runtime@sha256:66ba7063e1ef673de3e746ba79d4f9513d2c452883cffaf6d992bed9a0275f98`.
- Build context excluded local environment files, credentials, documentation,
  test results, and local caches through `.gcloudignore`.

The source build still compiles the shared operator application, but the client
Dockerfile now removes 234 disabled server-route entries from the standalone
artifact, removes their route-manifest registrations, and verifies that only
the client/auth/system surface remains. The verifier also rejects home,
environment-file, and local-operator trace paths without printing them. The
pruned artifact gate passed locally and in the successful Cloud Build.

## Required Sequence

1. Complete: Cloud Tasks is enabled and the dedicated `veloce-client-runtime`
   Artifact Registry repository exists in `europe-west1`.
2. Complete: the current client-safe image is built and pinned to the immutable
   digest recorded above.
3. Complete: the current Supabase project was confirmed, platform environment
   isolation passed, and two disposable users and tenants passed the full
   cross-tenant read probe with cleanup.
4. Complete: version 1 of the tenant-scoped publishable-key secret is enabled.
5. Complete: the reviewed internal manifest pins the image, zero-to-one scale,
   one-dollar budget, one user, and provider-disabled policy.
6. Complete: the isolated service and workspace job are deployed without
   replacing or routing traffic through the legacy service.
7. Complete for password authentication: a disposable user passed runtime
   login, HTTP-only session issuance, tenant-scoped API access, logout, and
   cleanup. Email-callback acceptance remains a separate public-beta gate.
8. Complete: the client artifact now has a post-build allowlisted route
   boundary; the live internal-beta smoke passed after deployment of the
   pruned image.
9. Complete: Aryaman is recorded as the controlled-beta incident, billing,
   access-revocation, and data-deletion owner.

## Remaining Acceptance Gate

The live magic-link attempt generated a Supabase action link, but Auth fell
back to the project's configured Site URL instead of redirecting to the
internal-beta `/auth/callback`. Disposable records were removed and the
service's owner-only allowlist was restored on revision
`agentos-internal-beta-00010-d68`, which receives 100% of service traffic. Add
the exact callback URL to Supabase Auth URL Configuration while keeping the
Site URL unchanged, then rerun the disposable verifier.

## Decision

`agentos-mvp` now hosts a tightly constrained **internal beta** runtime. It is
not approved for public customer activation, paid traffic, provider execution,
or general availability. The remaining gates are the live email-callback
journey and the public-domain/commercial activation decisions.
