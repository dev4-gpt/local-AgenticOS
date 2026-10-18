# GCP Client Runtime Runbook

> **Historical runtime evidence:** the deployment details in this document
> refer to `veloce-agenticos-2026`, which is not a verified current target.
> Do not reuse its project, service, image, URL, or secret names. For the
> connected `agentos-mvp` project, see
> [the beta runtime assessment](./agentos-mvp-beta-runtime-assessment-2026-09-25.md).

This runbook provisions an approved, isolated client runtime on GCP. It is for
the 3939-style client edition, not for exposing the private local operator OS.

## Boundary

- Vercel remains the public marketing and intake layer.
- Supabase stores lead/intake/deployment request state.
- GCP hosts approved client runtime services.
- Client credentials live in Secret Manager, never in source, browser bundles,
  chat, terminal logs, screenshots, or client blueprints.

## Historical Internal Test Status

As of 2026-07-29, the first client-safe Cloud Run test is live and verified.

```text
Client slug: veloce-cloud-test
GCP project: veloce-agenticos-2026
Region: asia-south1
Cloud Run service: veloce-cloud-test
Current verified image: asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/client-runtime:v54
Current verified digest: asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/client-runtime@sha256:91ca3cf6d1bc15d5b7e7ce673173deb42de1f7f0b64528906321d977c81f99a9
Current verified revision: veloce-cloud-test-00073-8gh
Runtime service account: veloce-cloud-test-run@veloce-agenticos-2026.iam.gserviceaccount.com

Gate 9 status: provider-disabled v54 is routed at 100%.
The original delivery task exhausted ten HTTP 503 callbacks, so v54 added safe
claim-status logging and collision-free task names. One corrected task returned
HTTP 200, the approved destination recorded a POST, and the existing action is
durably `executed` with no error. Do not repeat delivery unless the worker,
approval helper, destination guard, or runtime image changes.
Storage bucket: gs://veloce-agenticos-2026-veloce-cloud-test
Primary URL: https://veloce-cloud-test-1075094991117.asia-south1.run.app
Product dropdown login URL: https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/login?next=%2F
Secret Manager: veloce-veloce-cloud-test-supabase-anon-key
Allowed user: aryamandev777@gmail.com
```

Rollback checkpoint completed 2026-07-28: traffic was shifted to the healthy
previous revision `veloce-cloud-test-00057-9p4`, the protected route returned
the expected authentication redirect, and traffic was restored to
`veloce-cloud-test-00058-9sf` at 100%. No image was rebuilt or redeployed.

Operational evidence for the current revision:

- Cloud Tasks queue `veloce-veloce-cloud-test` is `RUNNING`, with one concurrent
  dispatch and ten maximum attempts.
- The dedicated storage bucket has uniform bucket-level access, a 14-day delete
  lifecycle for the `veloce-cloud-test/` prefix, and seven-day soft-delete
  retention.
- Four runtime alert policies are enabled and attached to the configured email
  notification channel. On 2026-07-29, the channel was verified, a controlled
  payload-free runtime-throttle event delivered the expected email, and the
  throttle policy was restored to its normal `>10 events for five minutes`
  condition.
- Gate 10 is proven: two approved Anthropic jobs settled usage-based ledger
  amounts, the isolated $0.000001-cap job failed with `budget_exceeded` before
  any ledger row or provider dispatch, and the existing authenticated refund
  acceptance covers the rate-limit and failed-enqueue refund paths. The active
  v54 revision restores `CLIENT_PROVIDER_CALLS_ENABLED=0`, removes
  `text-agents` and model pricing, and restores the normal $1 cap.
- Gate 13 is proven on disposable tenant `veloce-cloud-test-b`: a credential-safe
  export plus marker-object backup survived an applied offboarding and restore;
  the marker, bucket, original queue, verified test channel, and worker-token
  secret were deleted before recovery. A fresh worker-token version was then
  created without printing the token or hash. Cloud Tasks reserved the deleted
  queue name, so a tenant-B-only replacement queue
  `veloce-veloce-cloud-test-b-recovery` was created and verified `RUNNING`.
  No primary-tenant resource, provider, or deployed service was changed.

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
- Cloud Tasks, Secret Manager, Cloud Run, Cloud Build, and Artifact Registry
  APIs are enabled by a project administrator.
- An Artifact Registry repository exists in the target region and a client-safe
  image has been built into it from `Dockerfile.client`.
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

- runtime service account
- client storage bucket
- Secret Manager secret containers
- least-privilege IAM grants

It does not enable project APIs, create an Artifact Registry repository, add
secret values, or deploy Cloud Run. Those bootstrap operations require a
separate project-administrator decision so a tenant provisioner cannot broaden
project-level capability on its own.

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
7. `product-experience/supabase-client-runtime-workflow-reconciliation.sql`
8. `product-experience/supabase-client-hermes-content-factory.sql`

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
file; do not switch the manifest yet. If this migration has already been
applied, rerun the current repository copy when the controls SQL changes; it is
idempotent and now prevents duplicate budget reservations for the same job.

After the lifecycle migration, verify the artifact status columns and worker
confirmation function before enabling the `artifacts` capability. Uploads are
created as `pending`, checked against Cloud Storage metadata, and only then
marked `ready`; downloads reject every other state.

The GCP prepare phase may apply the manifest's `storage.corsOrigins` to the
private bucket for compatibility with older clients. Current artifact uploads
and downloads use authenticated same-origin server proxy routes, so browser
workflows do not access the bucket directly and do not depend on bucket CORS.
Keep any retained origins HTTPS-only and specific; CORS does not make the
bucket public.

The same prepare phase applies a Cloud Storage lifecycle rule from
`retention.days`. The rule deletes only objects below the client namespace
prefix after that many days; it does not apply to other tenant prefixes in a
shared bucket. Verify it with `gcloud storage buckets describe` and inspect
`lifecycle_config.rule` before treating retention as live.

Before release, stream the reviewed bucket snapshot into the read-only storage
preflight using the actual Cloud Run `status.url` as the origin:

```sh
gcloud storage buckets describe gs://BUCKET --project PROJECT --format=json \
  | node scripts/verify-client-storage-config.mjs \
      --bucket BUCKET --namespace TENANT_SLUG --expected-origin https://CLIENT_RUNTIME.run.app
```

It requires an exact 28-day namespace Delete rule and seven-day soft-delete
recovery. It also rejects overlapping Delete rules, object versioning, default
event-based holds, and bucket retention periods that extend beyond the 28-day
active window. The active client origin is still provided for the verification
receipt, but browser access no longer depends on direct-bucket upload/download
CORS methods. The selected recovery window means objects can remain recoverable
for up to 35 days. A bucket snapshot does not reveal every existing object's
individual hold or retention configuration; inspect the complete tenant object
inventory as a separate release check. A passing bucket check alone does not
prove that bytes, backups, or vendor copies were purged.

The current lifecycle SQL also provides authenticated tenant-scoped artifact
deletion. The runtime removes the Cloud Storage object first, treats an already
missing object as idempotently deleted, and then removes its Supabase metadata.
Apply or reapply the lifecycle SQL and rerun the final verification query before
using the artifact `DELETE` route.

The hosted-capabilities migration is required before enabling the new hosted
workflow, media, SEO, artifact, or delivery-action boundaries. It adds separate
authenticated and worker-only artifact creation RPCs and the approval-only
delivery action table. It does not
grant a client permission to publish, execute local tools, or read another
tenant's artifacts.

The workflow-reconciliation migration is required before enabling provider
dispatch from Paperclip, Ruflo, Loop, Pipeline, or Kanban surfaces. It adds one
worker-authenticated RPC that updates only the workflow card's execution status;
provider output remains in the job record and is never copied into workflow
metadata. It is idempotent and reports `Success. No rows returned` when applied.

The current migration also adds `client_runtime_records` for tenant-scoped
memory, journal, goals, and notebook entries. These records use Supabase RLS
and are separate from the operator vault. The `tenant-data` capability must be
enabled in a manifest before the client UI can use them; these four surfaces do
not require a provider API key.

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
    'complete_client_delivery_action_worker',
    'update_client_runtime_record_worker'
  )
order by p.proname;
```

Run each SELECT separately in the Supabase SQL Editor so the result panel is
not showing only the last statement. The first result should contain one row.
The second should contain twelve function rows after all listed migrations are
applied. The `complete_client_delivery_action_worker` row must show five
identity arguments, including `p_error_code text`; an old four-argument row
means the current hosted-capabilities migration has not been rerun. An empty
result means
the query was run in the wrong Supabase project or the migration stopped
before completion; do not enable the worker or hosted capabilities in that
case.

Then verify the new tenant record table separately:

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'client_runtime_records';
```

This should return one row. If it returns zero, rerun the current
`supabase-client-runtime-hosted-capabilities.sql` file before deploying the
image that includes tenant memory, journal, goals, or notebook surfaces.

If the saved Supabase query is an older or partial copy and rerunning the full
hosted-capabilities file does not create the table, apply the standalone
`product-experience/supabase-client-runtime-records.sql` migration instead.
It is idempotent, contains only the tenant records table and its RLS policies,
and can be run independently after the control-plane tables exist.

## Promote or rotate a provider credential

The browser submission is an encrypted Secret Manager inbox event, not an
active provider configuration. After manual review, promote one matching
provider value into the client-scoped target secret without printing the raw
value:

### Recovering a failed workflow execution

If a workflow card shows `Execution: failed` with
`task_runtime_not_configured`, it was created before the Cloud Tasks callback
environment was deployed. Refresh the client runtime and use the circular-arrow
retry action on that card. The retry creates a new tenant-scoped orchestration
job and preserves the four bounded workflow steps; it does not retry provider
dispatches while provider calls are gated.
If the rate-limit RPC is unavailable, the current workflow routes return
`runtime_limit_unavailable` with HTTP 503; that is a backend recovery signal,
not a 15-minute user throttle.

The credentials screen can accept a catalogued provider key even while that
provider is not active. This is intentional: submission only writes a reviewed
inbox event. The provider remains unavailable until the operator promotes the
value, adds the client-scoped target secret to the manifest, verifies its
enabled Secret Manager version, and deploys an approved revision.

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

For a deliberate rotation, add `--disable-previous` to the applied command.
The script records currently enabled target versions, writes the new version
first, then disables only those older versions. It refuses this option during a
dry run. After the operator has confirmed the promotion, add
`--disable-source-version` to disable the reviewed inbox version as well; this
is available only with `--apply` and happens after the target write succeeds.

The target secret must already exist and must begin with
`veloce-<clientSlug>-`. The promotion script verifies the source client and
provider names before writing, and never prints the secret value.

The GCP provisioner normalizes `CLIENT_CREDENTIAL_INBOX_SECRET` and
`CLIENT_REQUEST_INBOX_SECRET` into the `veloce-<clientSlug>-` namespace and
keeps `CLIENT_STORAGE_NAMESPACE` equal to the tenant slug. Do not use a shared
inbox, shared object prefix, or custom storage namespace across clients.

Provider activation is an explicit manifest decision, separate from accepting
credentials in the inbox. Set `providerCallsEnabled: true` only after review,
then provide a global `modelAllowlist`, a `providerModelAllowlist` mapping each
provider alias to its allowed models, and a non-secret `modelPricing` object
with input/output rates for every model. The provisioner derives
`CLIENT_PROVIDER_CALLS_ENABLED` and `CLIENT_MODEL_PRICING_JSON`; free-form
`runtimeEnv` values cannot override them. It also requires the matching
provider Secret Manager slots and the reviewed `text-agents` capability. A
model allowed for one provider cannot be selected through a different provider
alias.

## Revoking and deleting a provider credential (Phase 3d)

Before this stage, `client_provider_connections.status` could only ever be
`submitted` -- the table's schema already allowed `connected`/`revoked`/
`rotating`/`rejected`, but nothing ever set them, and `promote-client-credential.mjs`
only ever touched Secret Manager, never this table. That meant Supabase could
silently drift from reality after every real promotion, and there was no way
to revoke or delete a single BYOK credential short of destroying the entire
tenant.

`npm run promote:client-credential -- --apply` now also PATCHes the matching
`client_provider_connections` row to `status: 'connected'`, points
`secret_resource` at the real target secret (not the inbox), and stamps
`last_validated_at`. This requires `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
in the operator's shell in addition to `gcloud` credentials; a service-role
key bypasses RLS for this direct table write, so no new SQL function was
needed for this half.

**Revoke** is tenant self-service: an authenticated, active member can
disconnect their own provider from inside the client runtime by calling
`POST /api/client-runtime/credentials/revoke` with `{ "providerKey": "..." }`.
This calls the new `revoke_client_provider_connection(p_tenant_slug,
p_provider_key)` Supabase function
(`product-experience/supabase-v38-managed-credential-lifecycle.sql`), the one
piece of this stage that genuinely needed new SQL: it is security definer and
gated on `auth.uid()` plus an active `client_memberships` row, mirroring
`record_client_provider_connection` exactly, since this table blocks direct
authenticated access entirely. Revoking sets `status = 'revoked'` and
`revoked_at`; it does not touch Secret Manager -- the credential material is
left in place until an operator deletes it. Revoking an already-revoked or
never-submitted connection is a safe no-op, not an error.

**Delete** is operator-only, since only the operator's own `gcloud` identity
can destroy a per-provider target secret (the tenant's own Cloud Run identity
can only write to the shared inbox secret, confirmed by reading
`credential-submissions/route.ts`):

```bash
npm run delete:client-credential -- \
  --project veloce-agenticos-2026 \
  --client-slug veloce-cloud-test \
  --provider ANTHROPIC_API_KEY \
  --target-secret veloce-veloce-cloud-test-anthropic-api-key
```

Dry run by default; add `--apply --confirm-delete` to actually destroy the
target secret (`gcloud secrets delete ... --quiet`) and remove the connection
row. It refuses to run if the connection's recorded `secret_resource` does not
match `--target-secret`, and refuses to touch the shared credential-inbox
secret under any name.

**Verification**: `product-experience/supabase-v38-managed-credential-lifecycle-canary.sql`
/ `-cleanup.sql` prove the revoke function's authorization gate against a
disposable tenant, using a real (disposable) `auth.users` row plus
`set_config('request.jwt.claim.sub', ...)` to simulate an authenticated
session inside the SQL Editor -- direct table access is fully revoked for
`authenticated`/`anon`/`public` on `client_provider_connections`, so this is
the only way to exercise the function's real auth path in SQL rather than
just its update logic. Four assertions: an unauthenticated call is refused
and leaves the row untouched; the tenant's own active member revokes
successfully; revoking again is a harmless no-op; revoking a provider with no
connection at all is refused. The "mark connected" and "delete" paths are
plain service-role table writes (PATCH/DELETE), not new SQL functions, so
there is no auth-gate logic to verify for them in SQL -- their correctness is
proven by actually running the two scripts above.

**Result (2026-09-06): passed.** The database owner applied the migration,
then the canary. All four assertions passed with no exception raised inside
the `do $$ ... $$` block -- a failed `assert` aborts the transaction with a
hard error in the SQL Editor, and none occurred -- including the disposable
`auth.users` insert succeeding on the first attempt against this project's
real Auth schema. The cleanup query returned `fixture_removed`,
`connection_removed`, `membership_removed`, and `fixture_user_removed` all
`true`. The revoke function's real authorization gate is proven live.

**Live drill (2026-09-06): passed.** The promote and delete scripts were run
for real, end-to-end, against disposable fixtures (`byok-drill-20260907`
tenant, `veloce-byok-drill-20260907-inbox`/`-fixture-key` secrets, fake
placeholder value, never a real provider key), with independent verification
after each step rather than trusting the scripts' own success messages:
- `promote-client-credential.mjs --apply`: dry run first, then applied.
  Independently confirmed with `gcloud secrets versions access latest` that
  the target secret's actual value matched the fixture's inbox envelope
  (proving the value genuinely moved, not just an HTTP 200), and confirmed
  via a direct Supabase read that the connection row flipped to
  `status: connected` with `secret_resource` pointing at the target secret
  and `last_validated_at` set.
- `delete-client-credential.mjs --apply --confirm-delete`: dry run first
  (correctly reported the real pre-deletion status), then applied.
  Independently confirmed with `gcloud secrets describe` (`NOT_FOUND`) and a
  direct Supabase read (`[]`) that both the secret and the connection row
  were actually gone, not just that the script exited 0.
- All fixtures (inbox secret, fixture tenant row) were cleaned up
  afterward, with a final independent check confirming zero residue.

Both scripts are now proven live end-to-end, in addition to the CI build
verification (`gh run 34076562302`) already confirming they compile/typecheck
correctly.

## Worker identity and long jobs

The controls migration adds idempotent job enqueue, claim, completion, retry,
cancel, and worker-budget functions. The application now has a Cloud Tasks
submission route and an OIDC-verified worker route. The release-gate baseline
keeps provider calls disabled; the current owner-cloud test revision
`veloce-cloud-test-00078-xbc` enables `text-agents` for approved Anthropic,
OpenRouter, and Gemini/Antigravity lanes only. Successful text, media, and SEO
work settles its bounded budget reservation after the provider result is
durably stored; terminal provider failures settle to zero, while retryable or
still-processing work retains its reservation. Authenticated end-to-end job
and artifact checks remain separate gates. The worker never receives the
Supabase service-role key or a client browser session.

The workflow write limiter is durable per tenant, bucket, and authenticated
user. It allows 30 writes per 15 minutes. A failed enqueue attempt is refunded
through the authenticated, server-derived refund RPC after the job is
cancelled. Reapply the controls migration before relying on that recovery;
without the refund function, wait for the `Retry-After` window or clear only
the affected test bucket as an operator. Do not repeatedly refresh the submit
action while a `429 runtime_rate_limited` result is visible.

Workflow execution reads are also rate-limited, but the client polls queued
cards every 10 seconds and the route allows 240 reads per 15 minutes. This
leaves headroom for a normal long-running worker run. If the board reports
`runtime_rate_limited` after repeated testing, clear both test buckets before
retrying so a stale read token cannot mask a successful write:

```sql
delete from public.client_runtime_rate_limits
where tenant_slug = 'veloce-cloud-test'
  and bucket in ('workflow-read', 'workflow-write');
```

An empty result is normal when no matching limiter row exists. DDL and the
delete statement also normally show `Success. No rows returned`; verify the
effect with the next authenticated workflow request, not by expecting rows in
the SQL editor.

The supported operator path generates a random token, writes it to the client
Secret Manager namespace, and patches only its SHA-256 hash into the matching
tenant row. It requires the Supabase service-role key in the operator shell,
never prints either token or hash, and is dry-run by default:

```bash
npm run provision:client-worker-token -- \
  --project veloce-agenticos-2026 \
  --slug veloce-cloud-test

npm run provision:client-worker-token -- \
  --project veloce-agenticos-2026 \
  --slug veloce-cloud-test \
  --apply
```

The older manual shape is shown only to explain the storage boundary. Keep the
raw token in the client Secret Manager namespace:

```bash
umask 077
openssl rand -hex 32 | tr -d '\\n' > /tmp/veloce-cloud-test-worker-token
shasum -a 256 /tmp/veloce-cloud-test-worker-token
gcloud secrets versions add veloce-veloce-cloud-test-worker-token \
  --project veloce-agenticos-2026 \
  --data-file=/tmp/veloce-cloud-test-worker-token
rm /tmp/veloce-cloud-test-worker-token
```

If the provisioner cannot be used, add only the displayed hash through the
operator-only Supabase SQL editor and add the raw token as a Secret Manager
version named `veloce-<clientSlug>-worker-token`. The SQL update is shaped like
this; paste only the hash, never the raw token:

```sql
update public.client_tenants
set worker_token_hash = 'PASTE_SHA256_HEX_HASH', updated_at = now()
where slug = 'veloce-cloud-test';
```

The hash column must not be readable by client members. Re-run the controls
migration after adding it; that migration replaces the broad tenant read grant
with an explicit grant for only `slug`, `name`, `status`, `retention_days`,
`created_at`, and `updated_at`.

For a read-only post-migration check, run
`product-experience/supabase-client-runtime-final-verification.sql` in the
Supabase SQL Editor. Its `worker_hash_select` result must be `false`; the
worker RPC list should include workflow reconciliation and the artifact,
delivery, rate-limit, and budget functions.

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

### Authenticated acceptance verifier

The repository includes a credential-safe acceptance harness for the controlled
cloud-test tenant. It creates a provider-free `/orchestrate` plan, waits for
`Execution: completed` with four `done` steps, then uploads and downloads a
small proxy-uploaded artifact and verifies the returned bytes before deleting both test
records. It never prints the cookie, response bodies, signed URLs, or provider
output.

Create a local file containing only the authenticated `Cookie:` header copied
from the browser session. Keep it private (`chmod 600`) and do not paste its
contents into chat, source control, or a terminal transcript. Then run:

```bash
npm run verify:client-authenticated -- \
  --url https://veloce-cloud-test-mquo4bf7aq-el.a.run.app \
  --cookie-file /private/tmp/veloce-runtime-cookie.txt
```

Use `--workflow-only` only when intentionally isolating the workflow path; the
default run is the required workflow plus signed-storage evidence. A successful
run prints only a pass summary. On failure, the status code and redacted
failure class identify the next gate without disclosing session material.

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

Do not use this command until the current hosted-capabilities and
workflow-reconciliation migrations have been applied and the twelve-function
verification query passes.

## Build The Client Image

Cloud Build keeps Docker Desktop optional:

```bash
export CLIENT_IMAGE=asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/veloce/client-runtime:v1
npm run build:client-image
```

The image is built from `Dockerfile.client`. It contains no provider values.
`build:client-image` refuses a dirty checkout and passes its exact Git commit
to Cloud Build as `_SOURCE_COMMIT`. A direct Cloud Build invocation without
that substitution stamps `unverified`, which the runtime reports as unknown.
After deployment, an authenticated tenant member can read
`/api/client-runtime/build-identity` for the reported source commit and Cloud
Run revision. Compare both with the reviewed image digest and deployment
record; this self-reported endpoint is not independent build attestation.

The current internal test image is:

```text
asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/client-runtime:v51
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

Runtime throttles, budget denials, provider failures, and delivery failures are
emitted as redacted structured Cloud Run log events. Provision four log-based metrics and alert
policies per client:

```bash
npm run provision:runtime-alerts -- \
  --project veloce-agenticos-2026 \
  --slug veloce-cloud-test \
  --service veloce-cloud-test \
  --notification-channel CHANNEL_ID \
  --apply
```

The command is idempotent. If a policy already exists, rerunning with
`--notification-channel CHANNEL_ID` attaches that channel instead of silently
leaving the policy disconnected. Without a channel, the policy still appears
in Cloud Monitoring but does not send email or another notification.
For the current cloud-test tenant, the four policies are attached to the
operator channel `projects/veloce-agenticos-2026/notificationChannels/11435881475361291593`.
Google's email verification and one controlled runtime-throttle delivery
completed on 2026-07-29 for channel `11435881475361291593`. The temporary test
condition was restored and read back as `COMPARISON_GT 10` with a `300s`
duration; do not rerun this check unless the channel or policy changes.
The event payload contains only tenant slug, bucket/provider label, status, and
reason-safe fields; it never contains prompts, keys, or file contents.

Local trace contract (not a hosted delivery receipt): newly recorded job traces
use version 2, retaining the first 24 and latest eight completed spans and up to
seven stage summaries. Counts distinguish `ok`, `error` and `unknown` and cap
at 1,000,000 per outcome with `summaryTruncated`; `inFlight` marks work without
a recorded outcome. `truncated` means detail is incomplete. Timing caps at
24 hours. An outcome-observer exception records unknown without replacing the
operation result; actual operation exceptions still propagate. Snapshot/read
validation isolates copies and rejects inconsistent summaries/timelines.
Historical version-1 traces remain redacted but have no invented summary.
Their independently rounded offset/duration may overrun the rounded total by
one millisecond only; start offsets still cannot exceed the total. Version 2
uses rounded relative endpoints and has no such allowance.

Console and detached vendor sink failures cannot force a business retry.
That isolation does not prove telemetry arrived or that missing events were
detected. A persisted pre-completion trace does not attest to completion RPC
success, queue delay, retries in other invocations or every provider adapter.
Use the durable job/ledger state and separately operated alert/sink receipts.
Do not enable a sink, change retention or run a live drill without approval.
Trace metadata inherits its job's retention and recovery/deletion obligations.

Required multi-agent settlement (local source, not deployed): Ruflo, Loop and
Room use the same required-settlement guard as other artifact-producing lanes.
A false settlement blocks successful completion and attempts a failed domain
state. Room submits unclipped actual usage. Review unknown responses against
the durable ledger before replaying; do not repeat provider work or invent a
refund from a failed/uncertain response. Domain and job writes are separate,
so reconciliation failures remain an operations concern.

Both generated-file download paths require a successful, error-free,
nonblocked producing job. Assets exposes `job_released` and disables an
unreleased artifact's actions. This flag is not human approval: Notebook
citation/hash/approval gates still apply. Non-Notebook downloads recheck the
job/artifact after storage responds and cancel a denied stream before returning
bytes. They do not promise mid-stream revocation. Direct member uploads keep
their existing owner checks. Rejected ready objects remain private and keep
their original expiry; no cleanup or retention extension is implied.
These guards do not establish quote sufficiency, missing-usage accuracy,
hosted grants, provider hard caps, invoice reconciliation or recovery. No
deployment, provider enablement or hosted cleanup is authorized here.

## Unknown Multi-Agent Usage (Local Contract Only)

Ruflo, Loop and Room stop on missing/unpriceable usage, unsafe subtotals or a
provider failure whose charge is unverified. Successful blocked completion
records `budget_usage_unverified`, `failureDisposition=blocked` and bounded
`budgetAccounting` metadata. `knownCostMicros` covers only earlier priced
calls, not the unknown call's charge. `reservationDisposition=unsettled` means
this worker did not settle/refund it, not a fresh hosted ledger attestation.
If completion persistence fails, the job can remain running; do not replay it.

Reconcile the exact job, original reservation and provider operation against
approved authoritative evidence before any explicit correction. Do not turn
absent usage into zero, refill budget to bypass a hold, rerun a possibly charged
call, or renew retention. No automatic reconciliation, operator mutation or
provider request is authorized by local tests. Preflight failures also remain
conservative because the current adapter does not distinguish no-charge
failures. Other worker lanes and earlier inline Room/Ruflo output need separate
acceptance; generated-file denial is not blanket quarantine of those rows.

## Multi-Agent Prompt Envelopes (Local Contract Only)

Ruflo admission prices each specialist prompt plus bounded coordinator
findings. Loop separately prices the first/later builder prompts and the
judge's own model for every permitted round. Room includes the bounded growth
of later agents' transcript prompts. Invalid or overflowing totals fail before
reservation or provider work. The existing pricing heuristic is not proof of
the provider's protocol overhead, token invoice or account-level spending cap.

Every stage reprices its actual next prompt against the reservation minus the
known prior cost. If it cannot fit, do not dispatch it. Required settlement of
the unmodified known subtotal precedes `budget_envelope_exceeded` completion;
`budgetAccounting.status=settled_prior_usage` distinguishes that case from
`reconciliation_required` after failed accounting. A false settlement retains
`budget_settlement_failed`. Missing usage remains on the separate unsettled
path above. Unknown settlement/completion outcomes must be inspected, not
replayed. These markers inherit the job's original retention, with no new
clock or permission to extend it. Hosted ledger/grants and the remaining
worker lanes, earlier inline output and external limits still need acceptance.

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
metadata plus optional Cloud Storage objects. It uses an explicit, credential-
safe column allowlist: worker-token hashes, provider values, and secret-like
metadata are refused. Tenant-scoped manifest proposals, provider-connection
metadata, support tickets,
and research-worker failure records are included. Provider secret references and
validation payloads are not exported. Restored proposals and connections return
to `submitted`; they need fresh review and credential validation before use.
This is not a complete onboarding, support, or financial-record archive:
`client_onboarding_accounts`, deployment requests, and credit history remain
outside this snapshot.

A restore is dry-run by default. Pass the matching object backup directory to
restore Cloud Storage objects too:

```bash
npm run client:lifecycle -- \
  --mode restore \
  --slug veloce-cloud-test \
  --config .private-client-kits/veloce-cloud-test.gcp.json \
  --manifest-sha256 "$REVIEWED_MANIFEST_SHA256" \
  --input .private-client-kits/exports/veloce-cloud-test-EXPORT.json \
  --objects .private-client-kits/exports/veloce-cloud-test-EXPORT-objects \
  --apply --confirm-restore
```

An applied restore requires `--confirm-restore`. If the snapshot contains
artifact metadata, the matching `--objects` backup is required in both dry-run
and apply modes. Object exports now create a private sibling sidecar named
`OBJECT_BACKUP_DIRECTORY.manifest.json`; keep it with the exact metadata JSON
and object directory. It binds the snapshot SHA-256, namespace, layout, and
every local object's path, size, SHA-256, and MD5. Restore rejects a missing
sidecar, changed snapshot, added/missing/changed files, unsafe paths, symlinks,
ambiguous layouts, missing ready-artifact bytes, and artifact-size mismatch
before any cloud or database write. Pending artifacts can lack bytes; deleted
artifact bytes cannot be restored. Legacy backups without a sidecar are not
silently trusted: use a new verified export where possible, or obtain an
independent review of original source digests before any legacy recovery.

Restore copies each verified file to its exact tenant object key before
writing metadata. It passes a create-only generation precondition and the
verified file's MD5 to `gcloud storage cp`; transfer failure stops before
metadata writes. Existing destination objects require an explicit recovery
decision, not a blind overwrite or unchecked retry. See Google's
[copy flags](https://docs.cloud.google.com/sdk/gcloud/reference/storage/cp)
and [generation-zero precondition](https://docs.cloud.google.com/storage/docs/request-preconditions#the_0_value_in_a_generation-match_precondition).
These local checks do not establish hosted recovery, remote source-checksum
parity, signature authenticity, backup expiry/encryption, or recovery-only
access. Ordinary restore refuses expired artifact backups, missing original
clocks, expiry beyond the tenant's capped window, and files without matching
ready-artifact metadata. It does not renew an original retention deadline.

Before an applied metadata restore, separately review and install
`product-experience/supabase-client-lifecycle-restore.sql` **after** the client
tables and their retention migrations. No installation is authorized here.
The CLI requires its service-role-only `restore_client_lifecycle_metadata`
RPC; there is no sequential-write fallback. It sends ordered batches of at
most 500 rows inside **one** metadata transaction, capped at 50,000 rows and
32 MiB of batch JSON. Original clocks are restored after ordinary insert
guards, then verified on returned rows. Typed insert, retention or clock-drift
failure rolls back the metadata transaction. The 49 table projections match
the credential-safe export allowlist. Existing tenants/rows are not upserted;
restore requires a reviewed empty target, not an overwrite decision inferred
from `--confirm-restore`.
Both `retention_expires_at` and ECC revision `expires_at` are checked against
their original clocks. Learning items must be proposed without old approvals;
revisions must remain revoked evidence. Restore does not reactivate a previous
learning approval or extend a revision's own deadline.

These semantics are tested against local PostgreSQL-compatible fixtures,
including the actual record, Pipeline and Notebook source retention guards;
hosted grants, all-family constraints and a complete hosted restore remain
unverified. A dry run performs local validation, not database constraint or
migration verification. Copy failure can leave private transferred objects,
and a lost/unverified RPC response requires target inspection before retry.
There is no cross-resource transaction or automatic object cleanup; quiesce
writes and use a reviewed recovery procedure and target.

File-copy clock update (local source, not applied): Native member, source-pack
and worker uploads now set bytes and deadline metadata in one create-only XML
PUT. The `Custom-Time` anchor is the original artifact expiry minus the bucket's
configured retention days; this also handles shorter per-item deadlines.
A create-only conflict triggers a read-only metadata check. Reuse requires
matching checksum, size, content type, anchor, expiry and clock-policy tag;
it never overwrites the existing object or advances its clock.
Restore uses the reviewed destination manifest's window, which can differ
from the backup tenant's window. Applied object transfers now require
`--config` and matching `--manifest-sha256`, with the client, bucket, namespace
and 1-28-day destination window checked before copying. Local source hashes
do not establish that a live bucket matches that manifest.

The proposed bucket configuration has two tenant-prefixed Delete rules:
`age` and `daysSinceCustomTime`, both using the configured window. The age
rule remains a fallback for legacy objects; legacy/missing clock metadata
still fails the schema-4 inventory gate. A minimum bucket retention period
can block a copied/shorter-lived object's original deadline and is rejected.
Keep seven-day soft delete; do not disable recovery or silently rewrite
existing objects to pass the checks. Review migration, IAM, original artifact
crosswalk and rollback separately before any hosted change.

References: [atomic XML upload headers](https://docs.cloud.google.com/storage/docs/xml-api/put-object-upload),
[copy metadata flags](https://docs.cloud.google.com/sdk/gcloud/reference/storage/cp),
[lifecycle conditions and asynchronous behavior](https://docs.cloud.google.com/storage/docs/lifecycle).
These define eligibility, not a guaranteed deletion time. Exact 28+7 behavior,
recovery-only access, backup/vendor expiry, and private orphan cleanup remain
unverified. This runbook update authorizes no hosted write or spend.
Worker credentials are deliberately not restored. After a successful restore,
run `npm run provision:client-worker-token` with operator credentials and
redeploy the approved revision before enabling queued work.

Offboarding requires an explicit confirmation and destroys the client-scoped
Secret Manager containers only when `--destroy-secrets` is supplied:

```bash
npm run client:lifecycle -- \
  --mode offboard \
  --slug veloce-cloud-test \
  --config .private-client-kits/veloce-cloud-test.gcp.json \
  --manifest-sha256 REVIEWED_MANIFEST_SHA256 \
  --project REVIEWED_PROJECT_ID \
  --notification-channel projects/veloce-agenticos-2026/notificationChannels/11435881475361291593 \
  --include-objects \
  --apply --confirm-offboard --destroy-secrets --delete-queue --delete-notification-channel
```

`--delete-queue` is required for an applied offboarding so no durable work can
remain queued for a deleted tenant. Record the SHA-256 of the reviewed manifest
independently and pass the exact project from that manifest; the CLI rejects
changed bytes, a different tenant, project, bucket, or storage namespace before
destructive work. It also requires a real tenant row and successful object,
queue, alert, and secret inventories before changing tenant status. An
unreadable inventory is not treated as an empty one. A secret matched only by
the tenant-name prefix is refused unless its exact name is derivable from the
reviewed manifest; externally managed secret references are never deleted.
When tenant objects exist, `--include-objects` is required. The command creates
a new private object-backup directory, copies the reviewed namespace, and
checks that each inventoried object has a local file before changing tenant
status or deleting cloud objects. An existing backup directory, failed copy,
or incomplete copy stops the offboard. Snapshot-bound local file hashes are
also rechecked before suspension and before object deletion. The command rereads the object
inventory after the backup and after suspending the tenant, and refuses a
changed set. It also refuses to delete the tenant row if objects remain after
the cloud delete command. Keep the backup under the separately approved
28-day active content-retention procedure; these checks do not make
concurrent writes impossible or prove checksum parity, backup expiry, or
vendor-copy deletion. A disposable-tenant restore and independent
post-deletion inventory are still required before accepting the offboarding
gate.
`--delete-bucket` is an
additional explicit flag and is accepted only for the provisioner's canonical
`PROJECT_ID-veloce-TENANT_SLUG` dedicated bucket; otherwise the offboarding
command removes tenant-namespace objects but leaves the bucket for an
operator-controlled retention decision.

Offboarding also removes the client-scoped runtime alert policies and log-based
metrics created by `provision:runtime-alerts`, then deletes the matching
Secret Manager containers. When supplied with
`--notification-channel` and `--delete-notification-channel`, it also verifies
the channel display name belongs to the client before deleting that channel.
Review the export and confirm the resource list before applying this operation.
Applied offboarding also stops if tenant-linked support tickets or onboarding
accounts still exist. Both survive tenant deletion, and support tickets lose
their tenant link. Resolve their retention and reconciliation under an approved
policy before retrying; do not bypass this check or treat the metadata export
as proof of deletion. Managed-credit history and nonzero balances also block
offboarding independently.

Run export and restore in a disposable second tenant before using offboarding
for a real client. Do not put the service-role key in a manifest, Vercel, Cloud
Run, browser storage, or source file.

For tenant-isolation evidence, use two Auth access tokens with the read-only
probe script:

```bash
npm run verify:client-isolation -- \
  --url https://YOUR_PROJECT.supabase.co \
  --anon-key "$SUPABASE_ANON_KEY" \
  --tenant-a client-a \
  --tenant-b client-b \
  --access-token-file-a /private/tmp/client-a-access-token.txt \
  --access-token-file-b /private/tmp/client-b-access-token.txt
```

Store each user token locally with mode `0600`; never put tokens in chat, shell
arguments, source, or browser storage. The project public anon/publishable key
is sent as `apikey`; each user token is sent only as the `Authorization` bearer
token. The script checks each token's own tenant and confirms the opposite
tenant returns zero rows for records, jobs, and artifacts. It never prints
tokens or row content. Run it before enabling a second client manifest.

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

## Verify Existing Tenant File Retention

The bucket lifecycle and seven-day soft-delete settings do not prove that
existing object generations are free of holds or longer per-object retention.
Before release evidence is collected, obtain separate approval for the exact
project, bucket, tenant, Supabase project and bounded listing/read cost. The
collector does not authorize itself. Configure `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` through the existing operator secret boundary;
never paste their values into evidence or command arguments. The URL must
exactly match the reviewed `--supabase-project-ref` before any request. Then
run a current inventory:

```bash
npm run prepare:client-storage-object-inventory -- \
  --project YOUR_PROJECT_ID \
  --bucket YOUR_CLIENT_BUCKET \
  --namespace YOUR_TENANT_NAMESPACE \
  --supabase-project-ref YOUR_SUPABASE_PROJECT_REF \
  --account YOUR_OPERATOR_EMAIL \
  --output tmp/client-storage-object-inventory.json
```

The collector brackets an all-versions listing and an exhaustive soft-deleted
listing with complete, stable artifact GETs using an eight-column projection
(IDs, tenant, object key, size/type, status and original clocks). Each sample
has a 101-request bound, 500 rows/page, a 4-MiB response bound and 50,000 accepted
rows maximum. Every generation must match its artifact's original expiry and
size/type. Orphans, missing active ready files, live bytes for deleted records,
ambiguous generations, incomplete samples and observed drift fail closed.
No object writes or deletes are performed. It writes a mode-0600 schema-4
receipt only if the output path does not already exist. The receipt contains
counts and hashes, not object names, artifact IDs or credentials. Review the
receipt and its `ok` result, then pass the same account and target identity
when collecting release evidence:

```bash
npm run publish:release-ledger -- \\
  --client-cloud-project YOUR_PROJECT_ID \\
  --client-cloud-region YOUR_REGION \\
  --client-cloud-service YOUR_SERVICE \\
  --client-storage-bucket YOUR_CLIENT_BUCKET \\
  --client-storage-namespace YOUR_TENANT_NAMESPACE \\
  --client-cloud-account YOUR_OPERATOR_EMAIL \\
  --client-storage-object-inventory tmp/client-storage-object-inventory.json
```

For a later readiness recheck, provide a newly generated receipt with the same
`--client-storage-object-inventory` flag; the inventory must be less than 24
hours old and match the current object-generation and artifact-snapshot hashes,
Supabase project and tenant. Schema-3 and older receipts are not accepted.
Collect on a reviewed quiescent target: bracketed reads detect observed drift,
not every possible concurrent change or a cross-resource transaction. This
compares metadata, not byte hashes or a cryptographic database attestation.
Unmatched soft-deleted generations remain a failed gate until their permitted
recovery references are reviewed; do not recreate or retain expired active
database rows just to produce a passing crosswalk. Recovery-only access and
physical deletion still require operated evidence.
These listings are read-only but may incur Cloud Storage listing charges.
Never treat a bucket-only configuration snapshot as proof of object-level
retention.

## Repository Schema Rehearsal

Run `npm run verify:client-schema-upgrade` before reviewing a retention rollout.
This isolated PostgreSQL test applies 47 actual repository predecessor files
and the 27 retention/review/restore/privilege migrations together. It checks 49 lifecycle
column projections, worker argument/grant compatibility, service-only purge
previews, a synthetic original-clock metadata restore and two-member reads.
It is also included in `npm run verify:client-lifecycle`.

The populated rehearsal seeds active, recovery-only and purge-due synthetic
Board/Loop, Room, Pipeline and job records before migration, including recent
activity on old parents and multiple child records. It verifies original-clock
backfills, shorter tenant policy, member read denial, and child-first cleanup.
Board/Loop parents must wait until all comments/events/rounds are drained;
otherwise a foreign-key cascade can exceed the requested per-table batch and
undercount deletions. Retry bounded batches until the preview reports no due
rows; never increase limits or remove guards merely to force completion.
Paperclip issue parents likewise wait for all comments and runs, including any
legacy foreign-tenant reference. The populated test verifies three one-row child
batches before issue deletion, exact reported counts, recovery-only rows and an
unchanged foreign tenant. This does not bound unrelated `SET NULL` updates or
prove multi-connection contention behavior.

Keep the existing named worker parameters when using `create or replace
function`; PostgreSQL rejects replacing named parameters with unnamed arguments,
and PostgREST callers depend on those names. Do not drop functions or weaken
grants to make an upgrade pass. The test uses synthetic auth claims and a fresh
repository schema: it is not a deployed-database clone, an existing-data
backfill, a backup restore drill, or permission to apply SQL to a hosted target.

### Administrative Table Privileges

Install `supabase-client-table-privilege-hardening.sql` after the client schema
and include its exact hash in the release ledger. Before any separately
approved installation, inspect effective/default grants on the named target.
Supabase's future-object defaults may grant more than the explicit application
migrations suggest. RLS does not constrain whole-table `TRUNCATE` or
`REFERENCES`; the local regression reproduces cross-tenant comment truncation
under broad defaults, then rolls the synthetic transaction back.

The migration removes `TRUNCATE`, `REFERENCES`, `TRIGGER` and `MAINTAIN` from
`PUBLIC`, `anon` and `authenticated` on existing public `client_*` tables and
the public intake table `deployment_requests`. It
also removes those global/public-schema table defaults for the applying creator.
It leaves row-level SELECT/INSERT/UPDATE/DELETE permissions, RLS policies,
function/sequence grants, direct service-role grants, data and retention clocks
unchanged. Removing a PUBLIC grant can also reduce another role's inherited
privileges; review effective service/operator access on the target. Effective
member inherited or owner privileges cause an atomic abort;
review role ownership/membership instead of disabling the check. Repeat apply
is idempotent. A table created later by a different owner is not covered by
the applying creator's defaults and requires independent review.

The schema test verifies two-role truncate denial on comments and intake,
audits administrative privileges across all repository public tables, and
checks existing/future effective
privileges, preserved member reads/service access, global `PUBLIC` grants,
repeat apply and rollback of revokes when inherited privileges remain. These
are synthetic local checks, not proof of a reachable public exploit, a deployed
fix, Supabase login, or the full hosted deletion/export boundary. Do not infer
hosted approval from the test result or from a Free staging project.

Research lifecycle exports and restores must include the original `created_at`
for both records and citations, independently of `retrieved_at`. Their current
retention policy uses creation time; a database default of `now()` on restore
would renew the active window. Ordinary restore rejects missing, future or
already-expired creation clocks atomically, including older snapshots that
contain only retrieval time. Do not infer a missing creation clock, rewrite an
old backup or substitute its export date to force acceptance. Any exceptional
recovery path needs independent review. The full repository-schema regression
round-trips active research metadata and checks rollback and an untouched
foreign tenant; it does not exercise hosted backups, object bytes or recovery.

## Room Schema Order

The operator `client-lifecycle --mode retention` command also previews the
runtime-job purge RPC with a 500-job batch limit. Apply requires the separate
`--confirm-retention-jobs` flag in addition to the other family confirmations.
Job cleanup follows the content-family and due learning-item steps; its result
appears under `runtimeJobs`. A job RPC failure stops the command before the
audit/budget step. Earlier scopes may already have committed: inspect their
results before a separately authorized rerun. This does not install a scheduler
or prove hosted deletion; never run apply solely because the local tests pass.

The command also previews `purge_expired_client_credit_records` with a
100-row per-table batch and returns its result under `creditRetention`. Apply
requires `--confirm-retention-credit` alongside every other required family
confirmation, checked before any request. Credit cleanup follows runtime jobs
and precedes audit/budget cleanup; a failed credit RPC stops the command. These
RPCs are not one transaction: earlier scopes may already have committed.
Review results before authorizing a retry.

The existing V49 financial policy is unchanged: detail and purchase/allocation
linkage expire at day 35, nonzero wallet/provider balances remain, and later
refunds require manual review. Apply can release stale internal reservations
through the existing SQL refund path before deleting expired detail. It does
not issue a Stripe refund or call a provider. The confirmation flag is a
technical safeguard, not financial-policy approval, hosted cleanup authority,
or a scheduler. Local tests do not establish hosted financial behavior.

Before accepting Room retention/review, apply the reviewed schema in dependency
order: the existing 28-day policy and record/job/Room/Pipeline retention; then
`supabase-client-room-fixed-retention.sql`; then the current
`supabase-client-room-directive-review.sql`; then the current
`supabase-client-lifecycle-restore.sql`. Reapplying an older Room/job retention
migration afterward can replace the fixed guards. Verify installed definitions,
grants, RLS and migration hashes on the exact target before release.

The fixed migration validates tenant/parent relationships and backfills original
creation deadlines, never last activity. A mismatch must stop for an approved
remediation plan, not a foreign-tenant rewrite or destructive cascade. Expired
Room jobs cannot be claimed/completed successfully, and ordinary restore must
not reactivate recovery-only content. Keep Room provider calls disabled while
performing separately authorized schema/configuration verification. SQL tests
do not prove scheduled purge, backup expiry, physical deletion or recovery.

The review migration also shortens previously approved note/Pipeline copies to
their verified source deadline without renewing activity timestamps. It requires
the same tenant, requester, proposal kind/index and approved record ID. Orphaned
or conflicting provenance aborts the whole transaction, restoring the original
triggers. Inventory and resolve those mismatches under a separately approved
plan before rollout; do not disable the guard to force migration success.

## Selected Cloud Test Acceptance Plan

This is a proposed sequence, not authorization or a completed run. Use the
owner-selected origin `https://veloce-cloud-test-mquo4bf7aq-el.a.run.app` in
Aryaman (Work) Chrome. Do not substitute Internal Beta. Historical revision,
project, schema and secret references elsewhere in this runbook are not current
deployment parameters. Keep the execution board as the single status tracker.

1. Freeze and review one source candidate. Require its regression, offline AI,
   Notebook/Room browser and strict receipts to match its fingerprint. Record
   missing gates, then obtain authorization for any commit/push or hosted action
   not already explicitly approved. A dirty candidate is not releasable.
2. Revalidate service, region, project, active revision/image and nonsecret
   configuration read-only. Independently bind deployed image to source commit.
   Confirm the signed-in member and tenant ID; neither is inferred from the URL.
   Collect redacted evidence only, never credential values or cookies.
3. Before mutation, name the database, bucket, disposable test tenant/members,
   reviewed migration hashes/order, configuration diff, backup/recovery handling,
   rollback target, maximum cost and stop conditions in a specific approval.
   Stop if identity differs, provenance is orphaned, backups cannot preserve the
   original clocks, or a budget is absent. Do not change traffic in this step.
4. Only after that approval, stage/apply the reviewed schema and source-stamped
   image with providers disabled. Verify installed definitions, grants and RLS;
   reconcile 14-day runtime/object rules with the agreed 28+7 contract. Keep
   recovery-only bytes inaccessible to members; do not extend an old source's
   deadline during migration, derived writes, import or restore.
5. In the approved disposable tenant, run sign-in, authorized source intake,
   bounded job, grounded draft/citations, explicit review and export. Prove
   second-member/second-tenant denials and expired/recovery read denials. A real
   model run needs its own provider/cost approval; a provider-disabled fixture
   does not establish model quality or real customer acceptance.
6. Verify purge scheduling, object/row deletion after recovery, backup/vendor
   expiry and original-clock recovery with separately approved test fixtures.
   Controlled fixture aging proves boundary logic, not 35 days of operation.
   Run the strict release verifier against the exact candidate and reviewer
   evidence; retain a not-ready decision while any required category is absent.

The authorized Skool pack remains partial. Its first hosted import must be
explicitly scoped as partial, source-linked, tenant-confirmed and idempotent;
it cannot establish complete video coverage. Buyer acceptance likewise needs
an agreed studio workflow, baseline and owner/operator review, not synthetic
MiroFish personas. No rollout, import, contact or spend occurs from this plan.

## Rollback

Cloud Run retains revisions. Roll back from the console or CLI after identifying
the previous approved revision:

```bash
gcloud run services update-traffic SERVICE \
  --region REGION \
  --to-revisions REVISION=100
```
