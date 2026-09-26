# AgentOS MVP Beta Runtime Assessment

**Date:** 2026-09-25  
**Status:** candidate project only; no beta runtime has been provisioned.

This is the current, read-only assessment of `agentos-mvp` as a possible host
for a new Veloce client-safe Cloud Run runtime. It does not authorize reuse of
the existing `agentos` service.

## Verified Project State

| Item | Result | Consequence |
| --- | --- | --- |
| Region | `europe-west1` | Use this region consistently for any new runtime resources. |
| Cloud Run | `agentos` is the only service | Reserve a new service name; do not replace or route traffic through the legacy service. |
| Legacy service | Public `agentos-00013-q7f` from 2026-05-27 | It remains constrained to min 0 / max 1 and is not a current repository deployment. |
| Artifact Registry | Only `cloud-run-source-deploy` exists | Create a dedicated client-image repository before building a client-safe image. |
| Cloud Build | Enabled and successfully built the legacy image | A new build can use `cloudbuild.client.yaml` and `Dockerfile.client` after the repository exists. |
| Cloud Tasks | Disabled | A project administrator must enable it before client runtime preparation. |
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

## Required Sequence

1. A project administrator enables Cloud Tasks and creates a dedicated,
   regional Artifact Registry repository for client-safe images.
2. Build the current commit with `cloudbuild.client.yaml`; record the immutable
   image digest.
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

`agentos-mvp` is usable as a tightly constrained **candidate** project, but it
is not currently ready to host a beta runtime. The immediate blockers are
project bootstrap, a current Supabase target, a dedicated anon-key secret, and
live tenant evidence. No runtime, image, secret version, or traffic change was
made during this assessment.
