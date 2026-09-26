# AgentOS MVP Beta Runtime Assessment

**Date:** 2026-09-25  
**Status:** bootstrap and client-safe image complete; no beta runtime has been
provisioned.

This is the current, read-only assessment of `agentos-mvp` as a possible host
for a new Veloce client-safe Cloud Run runtime. It does not authorize reuse of
the existing `agentos` service.

## Verified Project State

| Item | Result | Consequence |
| --- | --- | --- |
| Region | `europe-west1` | Use this region consistently for any new runtime resources. |
| Cloud Run | `agentos` is the only service | Reserve a new service name; do not replace or route traffic through the legacy service. |
| Legacy service | Public `agentos-00013-q7f` from 2026-05-27 | It remains constrained to min 0 / max 1 and is not a current repository deployment. |
| Artifact Registry | `veloce-client-runtime` Docker repository created in `europe-west1` | Dedicated location for client-safe images; no service consumes it yet. |
| Cloud Build | Client-safe build `c626934e-ccff-4397-8e67-5dd9ce245c6a` succeeded | Verified image is pinned below; no deployment followed the build. |
| Cloud Tasks | Enabled | The client provisioner can create its isolated queue after manifest approval. |
| Secret Manager | Enabled; only `GROQ_API_KEY` exists | Do not reuse this key. A client runtime needs a separately named Supabase anon-key secret version. |
| Runtime service accounts | No dedicated client-runtime account | The provisioner will create one after bootstrap and manifest approval. |
| Cost control | `$5` monthly alert and legacy max scale 1 | An alert is not a spend cap; the new runtime must keep min instances 0 and max instances 1. |

## Candidate Architecture

Use `agentos-mvp` only for a **new**, client-safe service built from
`Dockerfile.client`, with its own service account, Cloud Tasks queue, bucket,
Secret Manager bindings, and tenant slug. Keep the public product front end on
`https://app.veloceos.cloud`.

The first runtime must be provider-disabled and scoped to a disposable internal
tenant. It needs only the Supabase publishable/anon key at runtime. It must not
receive a service-role key, the existing Groq key, any Vercel credential value,
or a provider credential.

## Verified Build Evidence

- Source: local `main` at commit `f3c4bc7653d0`.
- Build: `c626934e-ccff-4397-8e67-5dd9ce245c6a`, completed successfully on
  2026-09-26.
- Image:
  `europe-west1-docker.pkg.dev/agentos-mvp/veloce-client-runtime/client-runtime@sha256:1c7ce74c9df18d3e92ad315fe9f21955071bee70f3b21072f8424fe9f5b9992f`.
- Build context excluded local environment files, credentials, documentation,
  test results, and local caches through `.gcloudignore`.

The Next.js build completed successfully but emitted dynamic-filesystem tracing
warnings for legacy operator routes. The client runtime has not been deployed;
resolve or explicitly accept that warning set during the pre-GA hardening pass.

## Required Sequence

1. Complete: Cloud Tasks is enabled and the dedicated `veloce-client-runtime`
   Artifact Registry repository exists in `europe-west1`.
2. Complete: the current client-safe image is built and pinned to the immutable
   digest recorded above.
3. Confirm the intended current Supabase project, apply the client control-plane
   migrations there, and create two disposable internal users and tenants.
4. Add only the current Supabase anon-key value to a new tenant-scoped Secret
   Manager secret. Do not copy values into a manifest or shell history.
5. Review an unapproved manifest with `minInstances: 0`, `maxInstances: 1`,
   provider calls disabled, a one-dollar internal tenant cap, and a named
   allowed user.
6. Apply preparation, then deploy the new service only after the image and
   secret-version checks pass. Keep the legacy service unchanged.
7. Run live auth, two-tenant isolation, and platform isolation evidence against
   the selected current backend. Roll back or tear down the disposable runtime
   when those tests complete.

## Decision

`agentos-mvp` is a tightly constrained **candidate** project with its required
project bootstrap and a pinned client-safe image. It is not yet ready to host a
beta runtime. The immediate blockers are a current Supabase target, a dedicated
anon-key secret, client runtime preparation, and live tenant evidence. No
runtime, secret version, user access, or traffic change was made during this
assessment.
