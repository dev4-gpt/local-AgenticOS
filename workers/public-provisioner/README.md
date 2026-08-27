# Public provisioning worker

This small Cloud Run service is the least-privileged control-plane boundary. It accepts only an approved manifest, enforces the configured project and region, rejects secret-like manifest content, and durably queues a separately controlled GCP adapter request. It returns `202 Accepted`; the adapter, not this dispatch service, reports the terminal result to the product control plane.

It does not accept public traffic and does not expose `gcloud`, Secret Manager, or tenant credentials to the browser. Configure:

- `CONTROL_PLANE_WORKER_TOKEN`: token used by the product control plane. The product's approval route sends it as a bearer token.
- `GCP_PROVISIONER_URL`: private adapter that performs the approved GCP mutations.
- `GCP_PROVISIONER_AUDIENCE`: explicit service-specific audience configured on
  the adapter with Cloud Run custom audiences. Production must set this instead
  of deriving identity from a generated `run.app` hostname.
- `GCP_PROVISIONER_ID_TOKEN_SOURCE`: `metadata` by default, or
  `iam-credentials` when the runtime must mint its Google-signed OIDC token
  through the IAM Credentials API. The latter requires only
  `roles/iam.serviceAccountOpenIdTokenCreator` on the runtime service account
  itself; do not grant the broader Service Account Token Creator role. This is
  used by the non-mutating adapter-health probe; Cloud Tasks mints the OIDC
  identity for queued provisioning work.
- `GCP_PROVISIONER_TASK_PROJECT`, `GCP_PROVISIONER_TASK_LOCATION`, and
  `GCP_PROVISIONER_TASK_QUEUE`: the dedicated Cloud Tasks queue that dispatches
  to the adapter. The queue must use one attempt and one concurrent dispatch
  until canary idempotency and rollback evidence are complete.
- `GCP_PROVISIONER_TASK_SERVICE_ACCOUNT`: this worker's dedicated runtime
  identity. Cloud Tasks uses it only to mint the adapter's OIDC invocation
  token. Each task sets a 960-second dispatch deadline: above the
  provisioning script's 15-minute limit and below the adapter's 1000-second
  Cloud Run timeout.
- `GCP_ALLOWED_PROJECT` and `GCP_ALLOWED_REGION`: hard scope boundary.

The GCP adapter must use a dedicated service account with only the resource
roles required by the approved tenant blueprint. The public worker receives
only its worker token, queue-enqueuer access, and Cloud Run Invoker access on
the adapter; it does not receive the control-plane callback secret. Its
runtime identity also receives `roles/iam.serviceAccountUser` on itself
(`iam.serviceAccounts.actAs`) so it can select that exact identity for task
OIDC, while the Cloud Tasks service agent alone receives token-creator access
on that identity.
