# ADR 003: Isolate the private Cloud Run adapter project

**Status:** accepted for recovery
**Date:** 2026-08-26
**Scope:** public-provisioner to gcp-provisioner deployment

## Context

New Cloud Run services in `veloce-agenticos-2026` reported `Ready` and
`RoutesReady`, but requests to both generated hostnames returned Google's
generic 1568-byte HTML 404 without a Cloud Run request-log entry. The same
result occurred for:

- an IAM-protected adapter called with a Google-signed ID token;
- the active project Owner through `gcloud run services proxy`; and
- a disposable public canary using the exact immutable adapter image, with
  apply disabled and no worker token.

The image registers `GET /healthz`; a clean project's disposable hello canary
returned HTTP 200. Therefore the failing response is outside the application
container and cannot be corrected by changing the Node router.

## Decision

Run only the private GCP adapter in the clean billed project
`project-8b32b88c-13b5-46c4-b29`. Keep the Vercel-facing public provisioner,
tenant target project, Artifact Registry repository, and product control plane
in `veloce-agenticos-2026`.

The cross-project boundary uses:

- the adapter project's dedicated runtime service account;
- one project-local copy of `control-plane-worker-token`;
- repository-scoped Artifact Registry read access for the target Cloud Run
  service agent;
- service-scoped `roles/run.invoker` for the existing public provisioner;
- the explicit audience `veloce-gcp-provisioner`; and
- the project-number Cloud Run hostname.

`GCP_PROVISIONER_ALLOW_APPLY=0` remains mandatory until health, IAM, manifest
rejection, custom-role, and rollback evidence pass.

## Consequences

- No customer, payment, or tenant runtime moves to the adapter project.
- The adapter runtime needs a reviewed custom role in the control project only
  when apply mode is intentionally enabled.
- The worker-token copy must rotate together with the source secret.
- A read-only cloud verifier prevents later deploys from silently restoring a
  legacy hostname, wrong audience, broad invoker, wrong service account, or
  enabled apply mode.

## Rollback

Set the public provisioner back to the prior adapter URL, verify that it fails
closed, then delete the isolated adapter service, its project-local secret, and
runtime service account. Remove the isolated Cloud Run service agent's reader
binding from the source Artifact Registry repository. This does not affect the
product application or tenant resources.
