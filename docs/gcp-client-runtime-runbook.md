# GCP Client Runtime Runbook

This runbook provisions an approved, isolated client runtime on GCP. It is for
the 3939-style client edition, not for exposing the private local operator OS.

## Boundary

- Vercel remains the public marketing and intake layer.
- Supabase stores lead/intake/deployment request state.
- GCP hosts approved client runtime services.
- Client credentials live in Secret Manager, never in source, browser bundles,
  chat, terminal logs, screenshots, or client blueprints.

## Current Internal Test Status

As of 2026-07-26, the first client-safe Cloud Run test is live and verified.

```text
Client slug: veloce-cloud-test
GCP project: veloce-agenticos-2026
Region: asia-south1
Cloud Run service: veloce-cloud-test
Artifact Registry image: asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/client-runtime:v6
Runtime service account: veloce-cloud-test-run@veloce-agenticos-2026.iam.gserviceaccount.com
Storage bucket: gs://veloce-agenticos-2026-veloce-cloud-test
Primary URL: https://veloce-cloud-test-1075094991117.asia-south1.run.app
Product dropdown login URL: https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/login?next=%2F
Secret Manager: veloce-veloce-cloud-test-supabase-anon-key
Allowed user: aryamandev777@gmail.com
```

The runtime uses `app-auth` mode: Cloud Run allows unauthenticated edge access
so `/login` can render, then the application requires a Supabase Auth session
for protected runtime routes. The current connected secret is the Supabase
publishable/anon key stored in Secret Manager. The raw key is not stored in the
manifest, container image, or browser bundle.

Verification completed:

```bash
CLIENT_RUNTIME_URL='https://veloce-cloud-test-mquo4bf7aq-el.a.run.app' npm run verify:client-runtime
```

## First Version Flow

```text
/start intake
  -> deployment_requests.pending_approval
  -> Veloce manual approval
  -> create client manifest
  -> dry-run GCP provisioner
  -> review commands
  -> apply GCP provisioner
  -> add secret versions manually
  -> invite client identities
  -> smoke test gated runtime
```

For `veloce-cloud-test`, the prepare, secret-version, image-build, deploy, and
verification steps have been completed. Use the remaining sections for future
client clones and reruns.

## Prerequisites

- `gcloud` installed and authenticated.
- A GCP project selected for Veloce client runtimes.
- Artifact Registry image already built from `Dockerfile.client`.
- The client manifest has `approved: true`.
- The client manifest has `acknowledgeClientSafeRuntime: true`.

The current private 3939 app is not automatically client-safe. Do not point the
manifest image at a raw private operator image.

## Prepare A Manifest

Copy:

```bash
cp client-blueprints/gcp-client-runtime.example.json client-blueprints/acme.gcp.json
```

Edit the copy:

- `clientSlug`
- `clientName`
- `gcp.projectId`
- `gcp.region`
- `gcp.image`
- `access.allowedUserEmails`
- `access.invokerEmails` only for `cloud-run-iam`
- `secretRefs`
- `enabledCapabilities`
- `providerAllowlist`
- `budget`, `approvalPolicy`, `storage`, and `retention`

Keep `approved` and `acknowledgeClientSafeRuntime` as `false` until reviewed.

## Dry Run

```bash
npm run provision:gcp-client -- --config client-blueprints/acme.gcp.json
```

Dry-run prints the exact `gcloud` commands but does not execute them.

## Prepare Isolated Resources

After review, prepare only the client-owned infrastructure:

```bash
npm run provision:gcp-client -- \
  --config client-blueprints/acme.gcp.json \
  --phase prepare \
  --apply
```

The prepare phase is idempotent and creates or updates:

- required GCP APIs
- Artifact Registry repository
- runtime service account
- client storage bucket
- Secret Manager secret containers
- least-privilege IAM grants

It does not deploy Cloud Run.

## Add Secret Values

The provisioner creates secret containers only. Add values directly through GCP:

```bash
printf "%s" "$CLIENT_PROVIDER_KEY" \
  | gcloud secrets versions add veloce-acme-anthropic-api-key --project YOUR_PROJECT_ID --data-file=-
```

Do not save raw keys in files.

When the service is deployed, the provisioner maps configured secrets into the
Cloud Run runtime with `--set-secrets`, for example:

```text
ANTHROPIC_API_KEY=veloce-acme-anthropic-api-key:latest
```

The application can then read standard provider env vars without receiving
secret values in source code or deployment manifests.

## Build The Client Image

Cloud Build keeps Docker Desktop optional:

```bash
export CLIENT_IMAGE=asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/veloce/client-runtime:v1
npm run build:client-image
```

The image is built from `Dockerfile.client`. It contains no provider values.

The current internal test image is:

```text
asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/client-runtime:v6
```

## Deploy The Prepared Runtime

The deploy phase refuses to continue if any declared secret lacks an enabled
version:

```bash
npm run provision:gcp-client -- \
  --config client-blueprints/acme.gcp.json \
  --phase deploy \
  --apply
```

The command prints the Cloud Run URL after a successful deployment. It uses
`app-auth` by default: Cloud Run serves the login shell, while application
middleware protects the runtime routes.

For the current internal test manifest:

```bash
npm run provision:gcp-client -- \
  --config .private-client-kits/veloce-cloud-test.gcp.json \
  --phase deploy \
  --apply
```

## Local 3940 Client Credential Test

Copy the local env example into a private ignored path:

```bash
mkdir -p .private-client-kits
cp client-blueprints/local-client-runtime.env.example .private-client-kits/local-test.env
chmod 600 .private-client-kits/local-test.env
```

Fill only the credentials you want to test, then run:

```bash
npm run dev:client-runtime -- --env-file .private-client-kits/local-test.env --port 3940
```

Check connected credential status without exposing values:

```bash
curl http://127.0.0.1:3940/api/client-runtime/credentials
```

## Verify Before Sharing

- In `app-auth` mode, the Cloud Run URL reaches only the login shell and the
  application requires a valid individual Supabase Auth session for runtime
  routes.
- In `cloud-run-iam` mode, the Cloud Run URL requires authentication and an
  invited client identity can access it; an uninvited identity cannot.
- Runtime shows client edition mode.
- Only `access.allowedUserEmails` can sign into the runtime.
- Browser bundle and logs contain no local paths or secret values.
- Provider calls use the client secret namespace.
- Budget cap and approval gate are visible.
- Long jobs run through a worker/queue or are explicitly disabled.
- Offboarding path is documented in the client manifest.

For a second client dry run, create a new manifest with different values for
`clientSlug`, `gcp.serviceName`, `gcp.runtimeServiceAccount`,
`gcp.storageBucket`, `storage.namespace`, `access.allowedUserEmails`, and every
Secret Manager reference. A second deployment must not be able to read
`veloce-cloud-test` storage or secrets.

## Rollback

Cloud Run retains revisions. Roll back from the console or CLI after identifying
the previous approved revision:

```bash
gcloud run services update-traffic SERVICE \
  --region REGION \
  --to-revisions REVISION=100
```
