# Private GCP provisioner

This is the Cloud Run-internal mutation boundary for an approved tenant
manifest. It is invoked only by `public-provisioner` with both Cloud Run IAM
and `CONTROL_PLANE_WORKER_TOKEN` authentication.

It deliberately does not accept a service-account key or a secret value in a
manifest. It runs the existing, reviewed `scripts/provision-gcp-client.mjs`
script with the service's attached Google identity. The attached identity must
be a dedicated service account with the minimum roles required by that script.

Project API enablement and Artifact Registry repository creation are operator
bootstrap actions. This worker can only use the approved, pre-existing
repository; it cannot enable services or create repositories from a tenant
manifest.

## Required configuration

- `CONTROL_PLANE_WORKER_TOKEN` — Secret Manager binding; same value as the
  public provisioner, never a plain environment value.
- `GCP_ALLOWED_PROJECT=veloce-agenticos-2026`
- `GCP_ALLOWED_REGION=asia-south1`
- `GCP_ALLOWED_ARTIFACT_REPOSITORY=veloce`
- `GCP_PROVISIONER_ALLOW_APPLY=0` for the first deployment and all acceptance
  checks. In this mode **no request can mutate GCP**, including a `prepare`
  request. Set it to `1` only after the scoped IAM role and acceptance checks
  pass.

Once mutations are explicitly enabled, the service defaults to the `prepare`
phase. A deployment manifest must explicitly set `provisioning.phase` to
`deploy`, and an enabled Secret Manager version must already exist for every
entry in `secretEnv` before a deployment can succeed.
