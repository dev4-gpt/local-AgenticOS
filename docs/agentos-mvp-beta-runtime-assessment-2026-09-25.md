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
| Cloud Build | Client-safe build `e53232d7-620b-4783-b720-903486ae2ae2` succeeded | Its pruned, immutable image is deployed below. |
| Cloud Tasks | Enabled | The client provisioner can create its isolated queue after manifest approval. |
| Secret Manager | Internal beta has `veloce-internal-beta-supabase-anon-key`, version 1 enabled | The runtime has a tenant-scoped publishable-key reference; no service-role or provider key is bound. |
| Runtime service accounts | `agentos-internal-beta-run` exists | It owns only the internal beta runtime resources. |
| Cost control | `$5` monthly alert and legacy max scale 1 | An alert is not a spend cap; the new runtime must keep min instances 0 and max instances 1. |

## Deployed Architecture

Use `agentos-mvp` only for a **new**, client-safe service built from
`Dockerfile.client`, with its own service account, Cloud Tasks queue, bucket,
Secret Manager bindings, and tenant slug. Keep the public product front end on
`https://app.veloceos.cloud`.

`agentos-internal-beta-00034-v69` serves
`https://agentos-internal-beta-vbimnfseva-ew.a.run.app` with min instances zero,
max instances one, and one concurrent request. It uses the pinned image, a
dedicated service account, bucket, queue, and workspace job. Only
`aryamandev777@gmail.com` is allowlisted. Provider calls, local files, local
CLI access, worker execution, and intent routing are disabled.

The service receives only the tenant-scoped Supabase publishable key at runtime.
It does not receive a service-role key, the existing Groq key, a Vercel
credential value, or a provider credential.

## Verified Build Evidence

- Source: uploaded worktree source now committed as `ed822d7`.
- Build: `e53232d7-620b-4783-b720-903486ae2ae2`, completed successfully on
  2026-09-26 with the client Dockerfile's route-pruning and artifact-verifier
  stages.
- Image:
  `europe-west1-docker.pkg.dev/agentos-mvp/veloce-client-runtime/client-runtime@sha256:70d24863d095aa9753cf02629a30458f7fdd8ef81bfc5ed2ce35e2c0ed16da57`.
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
7. Complete: password authentication previously passed with a disposable user,
   tenant-scoped API access, logout, and cleanup. The separate live email-link
   browser acceptance now also passes with HTTP-only cookies, protected-page
   access, logout rejection, and disposable fixture cleanup.
8. Complete: the client artifact now has a post-build allowlisted route
   boundary; the live internal-beta smoke passed after deployment of the
   pruned image.
9. Complete: Aryaman is recorded as the controlled-beta incident, billing,
   access-revocation, and data-deletion owner.

## Internal Beta Acceptance

The exact internal-beta `/auth/callback` URL is now in Supabase Auth Redirect
URLs; the configured Site URL was left unchanged. The live disposable link
resolved to that callback, and the browser completed session exchange,
protected-page access, and logout. Supabase's issued refresh token was 12
characters, so the runtime now lets Supabase validate the opaque token rather
than rejecting it by an unsupported minimum length. Disposable records were
cleaned and the service's owner-only allowlist and `internal-beta` tenant slug
were restored on revision `agentos-internal-beta-00034-v69`, which receives
100% of service traffic. The unauthenticated runtime check and `/status` also
passed after restoration.

## Decision

`agentos-mvp` now hosts a tightly constrained **internal beta** runtime. It is
not approved for public customer activation, paid traffic, provider execution,
or general availability. Public-domain, provider, and commercial activation
remain separate decisions.
