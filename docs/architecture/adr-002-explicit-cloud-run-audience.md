# ADR 002: Explicit Cloud Run audience for the GCP adapter

**Status:** accepted  
**Date:** 2026-08-26  
**Scope:** public-provisioner to gcp-provisioner authentication

## Context

Cloud Run exposes more than one generated `run.app` hostname for a service.
Deriving an ID-token audience from whichever hostname is present in
`GCP_PROVISIONER_URL` couples authentication to deployment output and makes a
front-door rejection difficult to distinguish from an application 404.

The boundary must remain IAM protected, use short-lived Google-signed tokens,
retain the independent control-plane worker token, and support a safe health
probe without enabling provisioning.

## Decision

The adapter accepts the custom audience `veloce-gcp-provisioner`. The public
worker receives the same value as `GCP_PROVISIONER_AUDIENCE` and uses it when
requesting an ID token from the Cloud Run metadata server.

The Google ID token is sent in `Authorization`. The independent application
credential is sent in `X-Control-Plane-Worker-Token` for provisioning calls.
Health failures emit only a structured status, target host, audience, issuer,
and service-account email; tokens and response bodies are never logged.

## Rationale

- Authentication no longer changes when Cloud Run selects a legacy hashed or
  project-number service URL.
- IAM remains the outer boundary and the shared worker token remains a
  defense-in-depth application boundary.
- Sanitized telemetry makes audience and runtime-identity mismatches directly
  observable without exposing credentials.

## Trade-offs

- The adapter and public worker now share one additional configuration value.
- Operators must configure the custom audience on the adapter before deploying
  a public-worker revision that uses it.
- The URL-derived audience remains only as a backwards-compatible fallback;
  production readiness requires the explicit value.

## Consequences

- Generated Cloud Run URL changes do not alter the authentication contract.
- Audience rotation requires an ordered rollout: add the new accepted audience,
  update the caller, verify, then remove the old custom audience.
- `GCP_PROVISIONER_ALLOW_APPLY=0` remains mandatory during acceptance checks.
