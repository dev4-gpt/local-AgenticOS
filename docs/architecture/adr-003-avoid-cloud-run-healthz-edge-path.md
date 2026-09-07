# ADR 003: Avoid the Cloud Run `/healthz` edge path

**Status:** accepted
**Date:** 2026-08-26
**Scope:** public-provisioner to gcp-provisioner acceptance probe

## Context

The control-plane health bridge returned HTTP 502 with
`gcp_adapter_health_failed_404`. The adapter image visibly registered
`GET /healthz`, but calls produced Google's generic 1568-byte HTML 404 and no
Cloud Run request log. Rebuilding the image, changing generated hostnames,
adding a custom audience, and reproducing the service in a clean project did
not change that response.

A bounded path/method matrix with apply disabled proved that `/`, `/health`,
and `/provision` reached the same container and returned its JSON responses.
Only the exact `/healthz` path was intercepted by Google Front End, independent
of method. The deployed application route was therefore correct but
unreachable at that external path.

## Decision

Use `GET /readyz` for all internal Cloud Run readiness and acceptance calls.
Workers may retain `/healthz` as a backwards-compatible local alias, but no
production bridge or verifier may depend on it.

Keep the original architecture and trust boundaries:

- both provisioners remain in `veloce-agenticos-2026`;
- the adapter remains IAM-protected;
- the public provisioner remains its only `roles/run.invoker` principal;
- the metadata-server ID token uses the explicit custom audience; and
- the independent worker token continues in its own application header.

## Consequences

- No cross-project secret copy or runtime migration is required.
- A Google HTML 404 on `/healthz` is treated as an edge-path collision, not
  evidence that the Node route is missing.
- Future workers expose `/readyz` before launch so their health contract does
  not depend on the intercepted path.
- `GCP_PROVISIONER_ALLOW_APPLY=0` remains mandatory until readiness, IAM,
  manifest rejection, custom-role, and rollback evidence pass.

## Rollback

Roll back both worker revisions together. Do not restore `/healthz` as the
production probe path. If `/readyz` ever exhibits the same edge fingerprint,
select a versioned non-reserved path and record a new path matrix before
deployment.
