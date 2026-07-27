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
Artifact Registry image: asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/client-runtime:v11
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

## Apply the client control-plane schema

For a production client edition, apply these SQL files in order in the client
Supabase project:

1. `product-experience/supabase-deployment-requests.sql`
2. `product-experience/supabase-public-request-hardening.sql`
3. `product-experience/supabase-client-runtime-control-plane.sql`
4. `product-experience/supabase-client-runtime-controls.sql`

Create the approved tenant and membership from the Supabase SQL editor or an
operator-only migration job. Never accept membership creation from the
browser. For the first internal test, run
`product-experience/supabase-seed-veloce-cloud-test.sql`; it finds the approved
Auth user by email and ends with a verification query:

```sql
insert into public.client_tenants (slug, name, retention_days)
values ('example-client', 'Example Client', 30)
on conflict (slug) do update set name = excluded.name;

insert into public.client_memberships (tenant_slug, user_id, role)
values ('example-client', 'AUTH_USER_UUID', 'owner')
on conflict (tenant_slug, user_id) do update set role = excluded.role, status = 'active';
```

Only after the final query returns an active tenant and membership should you
set `CLIENT_RUNTIME_DATA_MODE=supabase` in the approved manifest. The current
internal cloud test has this mode enabled and has verified request persistence.
The additional controls migration is required before deploying the durable
runtime throttles and budget reservations. If the verification query returns
zero membership rows, invite or create the Auth user first and rerun the seed
file; do not switch the manifest yet.

## Promote or rotate a provider credential

The browser submission is an encrypted Secret Manager inbox event, not an
active provider configuration. After manual review, promote one matching
provider value into the client-scoped target secret without printing the raw
value:

```bash
npm run promote:client-credential -- \
  --project veloce-agenticos-2026 \
  --client-slug veloce-cloud-test \
  --provider ANTHROPIC_API_KEY \
  --inbox-secret veloce-veloce-cloud-test-client-credential-inbox \
  --target-secret veloce-veloce-cloud-test-anthropic-api-key \
  --version latest
```

Review the dry run, then repeat with `--apply`. Rotation uses the same command
with the newly reviewed inbox version; the target Secret Manager `latest`
alias then points to the new version. Keep the old version disabled or destroy
it only under the documented incident/offboarding procedure.

The target secret must already exist and must begin with
`veloce-<clientSlug>-`. The promotion script verifies the source client and
provider names before writing, and never prints the secret value.

## Worker identity and long jobs

The controls migration also adds an idempotent job enqueue function and
worker-token claim/complete functions. A future Cloud Tasks or self-hosted
worker uses a per-client random token held in Secret Manager; it never receives
the Supabase service-role key or a client browser session.

Generate the token locally and add only its hash to the tenant record. Keep the
raw token in the client Secret Manager namespace:

```bash
umask 077
openssl rand -hex 32 > /tmp/veloce-cloud-test-worker-token
shasum -a 256 /tmp/veloce-cloud-test-worker-token
gcloud secrets versions add veloce-veloce-cloud-test-worker-token \
  --project veloce-agenticos-2026 \
  --data-file=/tmp/veloce-cloud-test-worker-token
rm /tmp/veloce-cloud-test-worker-token
```

Add the displayed hash through the operator-only Supabase SQL editor, and add
the raw token as a Secret Manager version named
`veloce-<clientSlug>-worker-token`. The worker contract is intentionally not
enabled in the current client manifest until Cloud Tasks/OIDC verification,
retry limits, and completion tests are in place.

## Build The Client Image

Cloud Build keeps Docker Desktop optional:

```bash
export CLIENT_IMAGE=asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/veloce/client-runtime:v1
npm run build:client-image
```

The image is built from `Dockerfile.client`. It contains no provider values.

The current internal test image is:

```text
asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/client-runtime:v11
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
