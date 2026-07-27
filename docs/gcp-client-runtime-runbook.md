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
5. `product-experience/supabase-client-runtime-lifecycle.sql`
6. `product-experience/supabase-client-runtime-hosted-capabilities.sql`

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

After the lifecycle migration, verify the artifact status columns and worker
confirmation function before enabling the `artifacts` capability. Uploads are
created as `pending`, checked against Cloud Storage metadata, and only then
marked `ready`; downloads reject every other state.

The hosted-capabilities migration is required before enabling the new hosted
workflow, media, SEO, or delivery-action boundaries. It adds the worker-only
artifact creation RPC and the approval-only delivery action table. It does not
grant a client permission to publish, execute local tools, or read another
tenant's artifacts.

If an earlier copy of this migration was already applied, rerun the current
repository copy. It is intentionally idempotent and upgrades the delivery
action table with `error_code`, permits the `running` state, and removes the
obsolete four-argument completion-function overload. Supabase may show a
"Potential issue detected" warning because the migration drops policies and
that old function signature; choose **Run query** only when you intend to
apply this schema update. A successful run reports `Success. No rows returned`.

For a read-only Supabase verification, open a new SQL Editor query and run:

```sql
select table_schema, table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'client_tenants'
  and column_name = 'worker_token_hash';

select n.nspname as schema_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'consume_client_runtime_rate_limit',
    'enqueue_client_runtime_job',
    'retry_client_runtime_job',
    'cancel_client_runtime_job',
    'reserve_client_runtime_budget_worker',
    'confirm_client_runtime_artifact_worker',
    'create_client_runtime_artifact_worker',
    'checkpoint_client_runtime_job_worker',
    'create_client_delivery_action',
    'claim_client_delivery_action_worker',
    'complete_client_delivery_action_worker'
  )
order by p.proname;
```

Run each SELECT separately in the Supabase SQL Editor so the result panel is
not showing only the last statement. The first result should contain one row.
The second should contain eleven function rows after all listed migrations are
applied. The `complete_client_delivery_action_worker` row must show five
identity arguments, including `p_error_code text`; an old four-argument row
means the current hosted-capabilities migration has not been rerun. An empty
result means
the query was run in the wrong Supabase project or the migration stopped
before completion; do not enable the worker or hosted capabilities in that
case.

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

The controls migration adds idempotent job enqueue, claim, completion, retry,
cancel, and worker-budget functions. The application now has a Cloud Tasks
submission route and an OIDC-verified worker route. They remain disabled for
the current v11 test until the migration, queue, token, and end-to-end checks
below are complete. The worker never receives the Supabase service-role key or
a client browser session.

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
`veloce-<clientSlug>-worker-token`. The SQL update is shaped like this; paste
only the hash, never the raw token:

```sql
update public.client_tenants
set worker_token_hash = 'PASTE_SHA256_HEX_HASH', updated_at = now()
where slug = 'veloce-cloud-test';
```

Set these runtime values in the approved manifest, with the raw worker token
declared only in `secretEnv`:

```json
{
  "CLIENT_RUNTIME_WORKER_ENABLED": "1",
  "CLIENT_RUNTIME_BASE_URL": "https://YOUR-CLOUD-RUN-URL",
  "CLIENT_RUNTIME_TASK_QUEUE": "veloce-veloce-cloud-test",
  "CLIENT_TASK_INVOKER_SERVICE_ACCOUNT": "veloce-cloud-test-run@veloce-agenticos-2026.iam.gserviceaccount.com"
}
```

Keep `CLIENT_PROVIDER_CALLS_ENABLED=0` until the provider key, model pricing,
budget cap, approval owner, and smoke test have all been reviewed. Setting it
to `1` is a deliberate operator approval to spend the client's provider
budget; it is separate from merely enabling the UI capability.

The provisioner enables Cloud Tasks, creates the queue with a maximum of ten
attempts and one concurrent dispatch, and grants the Cloud Tasks service agent
permission to mint the per-client OIDC token. Do not enable the worker until
the service URL in `CLIENT_RUNTIME_BASE_URL` is the actual deployed URL.

After deployment, submit a job through the authenticated client shell and poll
`/api/client-runtime/jobs/<job-id>`. Confirm the row moves from `queued` to
`running` and then `succeeded` or `failed`, that a transient provider error can
return to `queued`, and that the tenth attempt fails closed. The browser sees
only the job record and output metadata; it never sees the worker token.

## Approve and dispatch delivery

Delivery actions are created as `pending_approval`. Only the operator may
approve and enqueue them. The helper is a dry run unless `--apply` is present;
`--enqueue` then creates a Cloud Tasks request using the worker service account.
The destination must match the client manifest's HTTPS allowlist, and the
adapter sends metadata and artifact identifiers only, never raw provider keys
or private file contents.

```bash
npm run approve:client-delivery -- \
  --project veloce-agenticos-2026 \
  --slug veloce-cloud-test \
  --action-id ACTION_UUID \
  --service-url https://veloce-cloud-test-mquo4bf7aq-el.a.run.app \
  --region asia-south1 \
  --queue veloce-veloce-cloud-test \
  --service-account veloce-cloud-test-run@veloce-agenticos-2026.iam.gserviceaccount.com \
  --apply --enqueue
```

Do not use this command until the current hosted-capabilities migration has
been rerun and the eleven-function verification query passes.

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

## Runtime Alerts

Runtime throttles and budget denials are emitted as redacted structured Cloud
Run log events. Provision one log-based metric and alert policy per client:

```bash
npm run provision:runtime-alerts -- \
  --project veloce-agenticos-2026 \
  --slug veloce-cloud-test \
  --service veloce-cloud-test \
  --notification-channel CHANNEL_ID \
  --apply
```

The command is idempotent. Without `--notification-channel`, the policy still
appears in Cloud Monitoring but does not send email or another notification.
The event payload contains only tenant slug, bucket/provider label, status, and
reason-safe fields; it never contains prompts, keys, or file contents.

## Export, Restore, and Offboarding

Lifecycle actions are operator-only and require the Supabase service-role key
in the operator environment. The CLI defaults to a metadata export and never
prints provider values:

```bash
export SUPABASE_URL='https://YOUR_PROJECT.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='use-an-operator-shell-secret'

npm run client:lifecycle -- \
  --mode export \
  --slug veloce-cloud-test \
  --config .private-client-kits/veloce-cloud-test.gcp.json \
  --include-objects
```

The export is written with mode `0600` and includes tenant-scoped Supabase
metadata plus optional Cloud Storage objects. A restore is dry-run by default:

```bash
npm run client:lifecycle -- \
  --mode restore \
  --slug veloce-cloud-test \
  --input .private-client-kits/exports/EXPORT.json
```

Offboarding requires an explicit confirmation and destroys the client-scoped
Secret Manager containers only when `--destroy-secrets` is supplied:

```bash
npm run client:lifecycle -- \
  --mode offboard \
  --slug veloce-cloud-test \
  --config .private-client-kits/veloce-cloud-test.gcp.json \
  --apply --confirm-offboard --destroy-secrets --delete-bucket
```

`--delete-bucket` is intentionally explicit. Use it only when the bucket is
dedicated to that client and the export has been reviewed; otherwise the
offboarding command removes the client namespace objects but leaves the empty
bucket for an operator-controlled retention decision.

Run export and restore in a disposable second tenant before using offboarding
for a real client. Do not put the service-role key in a manifest, Vercel, Cloud
Run, browser storage, or source file.

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
