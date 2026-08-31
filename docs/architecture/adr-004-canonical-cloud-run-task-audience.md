# ADR 004: Canonical Cloud Run audience for Cloud Tasks

**Status:** accepted
**Date:** 2026-08-31
**Scope:** Cloud Tasks dispatch from `public-provisioner` to `gcp-provisioner`

## Context

The previous custom audience (`veloce-gcp-provisioner`) passed a direct
metadata-server health bridge but failed the first real Cloud Tasks dispatch
with a Cloud Run `401`. Those are different identity paths, so health was not
sufficient proof that queued mutable work was safe.

## Decision

The dispatcher uses the canonical origin of `GCP_PROVISIONER_URL` as
`GCP_PROVISIONER_AUDIENCE` (for example,
`https://veloce-gcp-provisioner-1075094991117.asia-south1.run.app`). The value
must match exactly. The adapter accepts no additional custom audiences.

Before a mutation canary, the release process queues `POST /queue-authz`.
This endpoint exercises the same Cloud Tasks OIDC token and independent
worker-token header as provisioning, but performs no provisioning, callback,
or resource mutation.

## Consequences

- A valid task probe must receive adapter HTTP 200 while apply is disabled.
  A 401 blocks release; it never justifies weakening IAM.
- `/readyz` remains an availability probe, not proof of queue authentication.
- The cloud verifier rejects audience drift and extra custom audiences.
