# Public provisioning worker

This small Cloud Run service is the least-privileged control-plane boundary. It accepts only an approved manifest, enforces the configured project and region, rejects secret-like manifest content, dispatches to the separately controlled GCP adapter, and reports a redacted result to the product control plane.

It does not accept public traffic and does not expose `gcloud`, Secret Manager, or tenant credentials to the browser. Configure:

- `CONTROL_PLANE_WORKER_TOKEN`: token used by the product control plane.
- `GCP_PROVISIONER_URL`: private adapter that performs the approved GCP mutations.
- `CONTROL_PLANE_CALLBACK_URL`: product route ending in `/api/onboarding/provision-result`.
- `CONTROL_PLANE_OPERATOR_SECRET`: callback authentication secret.
- `GCP_ALLOWED_PROJECT` and `GCP_ALLOWED_REGION`: hard scope boundary.

The GCP adapter must use a dedicated service account with only the resource roles required by the approved tenant blueprint. The worker itself should receive only network access to that adapter and callback access to the control plane.
