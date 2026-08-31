# Control-plane provisioner deployment runbook

This runbook deploys a new control-plane boundary. It does **not** modify the
existing `veloce-cloud-test` service or reuse its service account.

## Preconditions

- Project: `veloce-agenticos-2026`
- Region: `asia-south1`
- Existing Secret Manager secrets, using the same values as Vercel:
  - `control-plane-operator-secret`
  - `control-plane-worker-token`
- Vercel Production control-plane secrets are already stored as **Secret**.
- Run all commands from `source/` with a human Google account that can manage
  IAM, Cloud Run, Artifact Registry, and Workload Identity Federation.

## 1. Enable services and create identities

```bash
gcloud config set project veloce-agenticos-2026
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com iamcredentials.googleapis.com cloudtasks.googleapis.com sts.googleapis.com --project veloce-agenticos-2026

gcloud iam service-accounts create veloce-public-provisioner-run --project veloce-agenticos-2026 --display-name="Veloce public provisioner runtime"
gcloud iam service-accounts create veloce-gcp-provisioner-run --project veloce-agenticos-2026 --display-name="Veloce private GCP provisioner runtime"
gcloud iam service-accounts create veloce-vercel-control-plane --project veloce-agenticos-2026 --display-name="Vercel control-plane invoker"
```

Record these emails; they should be:

```text
veloce-public-provisioner-run@veloce-agenticos-2026.iam.gserviceaccount.com
veloce-gcp-provisioner-run@veloce-agenticos-2026.iam.gserviceaccount.com
veloce-vercel-control-plane@veloce-agenticos-2026.iam.gserviceaccount.com
```

## 2. Configure Vercel OIDC federation

In Vercel, open **product-experience → Settings → Security → Secure backend
access with OIDC federation** and select the team issuer mode. Then create a
Google Workload Identity Pool `vercel` and OIDC provider
`product-experience`. The provider issuer is your Vercel team issuer shown in
that Vercel panel.

Map `google.subject=assertion.sub` and restrict the provider to the Vercel
Production project identity. Grant that pool principal `roles/iam.workloadIdentityUser`
on `veloce-vercel-control-plane`. Grant
`roles/run.invoker` on **only** `veloce-public-provisioner` to that service
account after the service is deployed.

Do not use global issuers without an attribute condition that binds the pool
to this Vercel team, project, and Production environment.

## 3. Bind only the required secrets and service invocation roles

```bash
PUBLIC_SA=veloce-public-provisioner-run@veloce-agenticos-2026.iam.gserviceaccount.com
ADAPTER_SA=veloce-gcp-provisioner-run@veloce-agenticos-2026.iam.gserviceaccount.com

gcloud secrets add-iam-policy-binding control-plane-worker-token --project veloce-agenticos-2026 --member="serviceAccount:${PUBLIC_SA}" --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding control-plane-worker-token --project veloce-agenticos-2026 --member="serviceAccount:${ADAPTER_SA}" --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding control-plane-operator-secret --project veloce-agenticos-2026 --member="serviceAccount:${ADAPTER_SA}" --role=roles/secretmanager.secretAccessor
```

The public dispatcher never receives `control-plane-operator-secret`; the
private adapter is the sole terminal-status callback writer. For an upgrade
from the deployed legacy dispatcher, remove its old accessor only after the
new public revision is serving:

```bash
gcloud secrets remove-iam-policy-binding control-plane-operator-secret \
  --project veloce-agenticos-2026 \
  --member="serviceAccount:${PUBLIC_SA}" \
  --role=roles/secretmanager.secretAccessor
```

The adapter requires a reviewed custom role before it can provision tenants.
Do not grant Owner, Editor, or project-wide Secret Manager Admin. Its role
must be limited to the Cloud Run, Cloud Tasks, Storage, Secret Manager,
Artifact Registry **read**, and service-account operations performed by
`scripts/provision-gcp-client.mjs`. API enablement and Artifact Registry
repository creation are one-time operator bootstrap actions and are not in the
tenant provisioner role.

The reviewable role source is
[`iam/veloce-gcp-provisioner-role.yaml`](../iam/veloce-gcp-provisioner-role.yaml).
After review, an operator can create it with:

```bash
gcloud iam roles create veloceTenantProvisioner \
  --project veloce-agenticos-2026 \
  --file iam/veloce-gcp-provisioner-role.yaml
```

Do not bind the role to `veloce-gcp-provisioner-run` or set
`GCP_PROVISIONER_ALLOW_APPLY=1` until the controlled adapter test has passed.

### 3A. Create the durable provisioning queue

The Vercel approval request has a short execution window, while tenant
provisioning may take up to 15 minutes. Do not bridge that mismatch with a
long synchronous HTTP request. Create one dedicated queue, initially with one
attempt and one concurrent dispatch:

```bash
PROJECT_NUMBER=1075094991117
TASK_QUEUE=veloce-control-plane-provisioning

gcloud tasks queues create "$TASK_QUEUE" \
  --project veloce-agenticos-2026 \
  --location asia-south1 \
  --max-attempts 1 \
  --max-concurrent-dispatches 1

gcloud tasks queues add-iam-policy-binding "$TASK_QUEUE" \
  --project veloce-agenticos-2026 \
  --location asia-south1 \
  --member="serviceAccount:${PUBLIC_SA}" \
  --role=roles/cloudtasks.enqueuer

# The queue creator must be allowed to attach this exact identity to its OIDC
# task target. This grants only iam.serviceAccounts.actAs on itself, not token
# creation or impersonation of another service account.
gcloud iam service-accounts add-iam-policy-binding "$PUBLIC_SA" \
  --project veloce-agenticos-2026 \
  --member="serviceAccount:${PUBLIC_SA}" \
  --role=roles/iam.serviceAccountUser

gcloud iam service-accounts add-iam-policy-binding "$PUBLIC_SA" \
  --project veloce-agenticos-2026 \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-cloudtasks.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountTokenCreator
```

Cloud Tasks uses `PUBLIC_SA` only to mint a scoped OIDC token for the private
adapter. `PUBLIC_SA` retains `roles/run.invoker` on the adapter; no broad
invoker grant is needed. Do not increase queue retries until a completed
canary proves the operation's idempotency and cleanup record.

## 4. Build and deploy in safe mode

Build both images from the repository root with:

```bash
gcloud builds submit . --project veloce-agenticos-2026 --config cloudbuild.control-plane.yaml
```

Deploy `gcp-provisioner` with no public access,
`GCP_PROVISIONER_ALLOW_APPLY=0`, and `--timeout=1000s`, then deploy
`public-provisioner` with no public access. Bind each control-plane secret by
name using `--update-secrets`; this preserves existing bindings when adding a
second secret. Do not place secret values on the command line.

Configure the Cloud Tasks audience as the canonical origin of the exact
adapter target. Do not use a short custom audience for this queue:

```bash
ADAPTER_URL="https://veloce-gcp-provisioner-1075094991117.asia-south1.run.app"
GCP_PROVISIONER_AUDIENCE="$ADAPTER_URL"

gcloud run services update veloce-public-provisioner \
  --project veloce-agenticos-2026 \
  --region asia-south1 \
  --update-env-vars="GCP_PROVISIONER_AUDIENCE=$GCP_PROVISIONER_AUDIENCE"
```

Set these non-secret dispatcher values on `veloce-public-provisioner`:

```text
GCP_PROVISIONER_TASK_PROJECT=veloce-agenticos-2026
GCP_PROVISIONER_TASK_LOCATION=asia-south1
GCP_PROVISIONER_TASK_QUEUE=veloce-control-plane-provisioning
GCP_PROVISIONER_TASK_SERVICE_ACCOUNT=veloce-public-provisioner-run@veloce-agenticos-2026.iam.gserviceaccount.com
```

Set these on `veloce-gcp-provisioner`:

```text
CONTROL_PLANE_CALLBACK_URL=https://app.veloceos.cloud/api/onboarding/provision-result
```

Bind both `CONTROL_PLANE_OPERATOR_SECRET` and `CONTROL_PLANE_WORKER_TOKEN` to
the adapter with merge-safe `--update-secrets`; do not use `--set-secrets` for
a partial update because it replaces the existing secret bindings.
The public dispatcher returns `202 Accepted` after queueing an idempotently
named task. The adapter is the only component that writes the terminal
success/failure callback, preventing a short caller timeout from incorrectly
marking a still-running mutation as failed.
Each task has a 960-second Cloud Tasks dispatch deadline; it must remain below
the adapter's 1000-second Cloud Run timeout.

Cloud Tasks mints its OIDC token for this exact service URL. The adapter's
default generated URL remains the only accepted audience at the Cloud Run IAM
boundary. The public worker separately mints a metadata-server ID token only
for the non-mutating adapter health probe.

### Cloud Run readiness path

Do not use the exact `/healthz` path for the private adapter acceptance probe.
In the affected Cloud Run frontend, that path returns Google's generic
1568-byte HTML 404 before the request reaches the container, even though other
paths on the same revision route normally. This can be distinguished from an
application 404 by its HTML content type and the absence of a Cloud Run request
log.

The internal bridge calls `GET /readyz`. Workers keep `/healthz` only as a
local/backwards-compatible alias; production acceptance must use `/readyz`.
Confirm the distinction without weakening IAM by comparing the redacted caller
diagnostic and request logs. Never respond by granting `allUsers` or moving the
adapter to another project.

Verify configuration drift and the read-only end-to-end bridge with:

```bash
npm run verify:control-plane-cloud -- --probe
```

Then run the Cloud Tasks-specific read-only acceptance probe. It must receive
adapter HTTP 200 while `GCP_PROVISIONER_ALLOW_APPLY=0`:

```bash
node scripts/probe-control-plane-task-auth.mjs
```

The probe enters through the operator-secret-protected Vercel
`/api/internal/control-plane/task-authz` bridge, which mints the same WIF
identity used by an approval. Do not call the private public-provisioner URL
directly from Cloud Shell or grant additional invokers merely to test it.

The verifier never calls `/provision`. Keep
`GCP_PROVISIONER_ALLOW_APPLY=0` until this probe passes and the scoped custom
role is created and reviewed.

Here, **no public access** means that neither service grants `allUsers` the
Cloud Run Invoker role. For the direct public-provisioner-to-adapter call used
by this architecture, configure the adapter with `--ingress=all` and enforce
privacy with IAM (`roles/run.invoker` only for the public worker service
account). Do not use `--ingress=internal` unless both services are configured
to route through a VPC path that Cloud Run recognizes as internal; otherwise
Cloud Run rejects the request before it reaches the adapter, commonly as HTTP
404.

After both URLs exist:

1. Grant the public worker service account `roles/run.invoker` on the private
   adapter only.
2. Grant the Vercel control-plane service account `roles/run.invoker` on the
   public worker only.
3. Add the two service URLs and the OIDC configuration values to Vercel
   Production, then redeploy.

## 5. Acceptance checks before mutations

With `GCP_PROVISIONER_ALLOW_APPLY=0`, verify:

1. Public requests to either Cloud Run URL receive authentication failures.
2. Invalid worker tokens are rejected by both workers.
3. A wrong project, region, repository, or inline secret in a manifest is
   rejected.
4. The public worker can reach the private adapter only with its Cloud Run
   identity.

Safe mode blocks both `prepare` and `deploy`: neither phase may create project
resources until the scoped custom role and the acceptance evidence are
reviewed.

Only after these checks and the custom adapter role are reviewed may the
adapter be updated to `GCP_PROVISIONER_ALLOW_APPLY=1`.

## 6. Managed OpenRouter gateway (separate, later boundary)

This gateway is required before enabling Veloce-managed OpenRouter execution.
It is independent of tenant provisioning and must remain private. The Vercel
application stores only the Secret Manager resource reference; it never reads
the OpenRouter key.

Create a dedicated runtime identity:

```bash
gcloud iam service-accounts create veloce-managed-openrouter-run \
  --project veloce-agenticos-2026 \
  --display-name="Veloce managed OpenRouter runtime"
```

After the Veloce-owned OpenRouter key has been created manually in Secret
Manager as `openrouter-managed-api-key`, grant that identity access to **only**
that secret and the existing operator secret:

```bash
MANAGED_OPENROUTER_SA=veloce-managed-openrouter-run@veloce-agenticos-2026.iam.gserviceaccount.com

gcloud secrets add-iam-policy-binding openrouter-managed-api-key \
  --project veloce-agenticos-2026 \
  --member="serviceAccount:${MANAGED_OPENROUTER_SA}" \
  --role=roles/secretmanager.secretAccessor

gcloud secrets add-iam-policy-binding control-plane-operator-secret \
  --project veloce-agenticos-2026 \
  --member="serviceAccount:${MANAGED_OPENROUTER_SA}" \
  --role=roles/secretmanager.secretAccessor
```

Deploy `managed-openrouter` from the image built by
`cloudbuild.control-plane.yaml`, without public access. Resolve and deploy the
resulting immutable digest rather than the mutable build tag. Bind both values by
Secret Manager name with `--set-secrets`; never pass their values in a command.
Grant `roles/run.invoker` on this service only to
`veloce-vercel-control-plane`, then set these Vercel **Production Config**
values and redeploy:

```bash
# Build the gateway image (this config also rebuilds the two provisioner images).
gcloud builds submit . \
  --project veloce-agenticos-2026 \
  --config cloudbuild.control-plane.yaml

MANAGED_OPENROUTER_IMAGE="asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/managed-openrouter@sha256:<verified-build-digest>"

gcloud run deploy veloce-managed-openrouter \
  --project veloce-agenticos-2026 \
  --region asia-south1 \
  --image "$MANAGED_OPENROUTER_IMAGE" \
  --service-account veloce-managed-openrouter-run@veloce-agenticos-2026.iam.gserviceaccount.com \
  --no-allow-unauthenticated \
  --set-secrets OPENROUTER_API_KEY=openrouter-managed-api-key:latest,CONTROL_PLANE_OPERATOR_SECRET=control-plane-operator-secret:latest \
  --set-env-vars PUBLIC_SITE_URL=https://app.veloceos.cloud,OPENROUTER_MODEL_ALLOWLIST=<reviewed-model-id> \
  --cpu 1 --memory 512Mi --concurrency 8 --max-instances 2 --timeout 100s

gcloud run services add-iam-policy-binding veloce-managed-openrouter \
  --project veloce-agenticos-2026 \
  --region asia-south1 \
  --member="serviceAccount:veloce-vercel-control-plane@veloce-agenticos-2026.iam.gserviceaccount.com" \
  --role=roles/run.invoker
```

Obtain the exact service URL from the successful `gcloud run deploy` output,
or with this non-mutating command:

```bash
gcloud run services describe veloce-managed-openrouter \
  --project veloce-agenticos-2026 \
  --region asia-south1 \
  --format='value(status.url)'
```

```text
OPENROUTER_MANAGED_GATEWAY_URL=https://<managed-openrouter-url>
OPENROUTER_MANAGED_SECRET_RESOURCE=projects/veloce-agenticos-2026/secrets/openrouter-managed-api-key/versions/latest
OPENROUTER_MANAGED_PRICING_SNAPSHOT_ID=<reviewed-snapshot-id>
OPENROUTER_MANAGED_PRICING_JSON=<matching-reviewed-json>
```

Prepare those two pricing values from the official live OpenRouter model
catalog. This command creates review evidence only; it does not update Vercel
or enable the managed route:

```bash
npm run prepare:openrouter-pricing -- \
  --models <exact-reviewed-model-id> \
  --out tmp/openrouter-managed-pricing-review.json
```

Review the source per-token values, normalized conservative rates, model ID,
and account spend cap before using the generated `snapshotId` and `pricing`
object in Production configuration. Insert the artifact's exact
`databaseRecord` into `client_pricing_snapshots`, and bind that ID plus the
same managed secret resource and manifest version to the approved
`client_provider_connections` row. The runtime rejects a missing, stale,
hash-mismatched, price-mismatched, BYOK, or unapproved connection before a
provider request. Paid execution also requires a recent successful connection
validation (30 days by default); the protected health operation refreshes both
the budget health status and authoritative provider-connection evidence.
Tiered and zero-priced models require a
separate quote policy and are rejected or flagged rather than flattened.

Do not enable a tenant's managed provider route until the account spend cap,
current pricing snapshot, health check, reserve/execute/settle-or-refund test,
and a human approval record all exist.

Apply `product-experience/supabase-v34-managed-credit-execution-claims.sql`
before deploying the matching Vercel revision. The route fails closed unless a
real, unexpired, tenant/provider/snapshot-matched reservation is atomically
claimed before the provider request; a second execution cannot reuse it.

After deployment, verify the live service, IAM boundary, secret references,
and non-spending readiness endpoint without reading either secret value:

```bash
npm run verify:managed-openrouter-cloud -- --probe \
  --expected-digest sha256:<verified-build-digest> \
  --expected-models <reviewed-model-id>
```

Before the production redeploy, check Vercel configuration metadata without
downloading or printing any environment value:

```bash
npm run verify:vercel-production-env
```

### Video catalog before video generation

The gateway's video-model catalog and individual job-status reads are safe
preflight operations. They are deliberately separate from `POST /videos`,
which can start a billable asynchronous job. Before approving any video model:

1. Fetch the live catalog through the protected managed-provider route and
   record the chosen model's supported duration, resolution, aspect ratio, and
   `pricing_skus` in the reviewed pricing snapshot.
2. Set and document a small OpenRouter account/key spend cap. A tenant wallet
   balance alone does not cap the Veloce-owned provider account.
3. Exercise a free text health smoke first; then reserve, submit, poll, and
   settle or refund one tightly capped paid video job.
4. Only after that evidence exists, deploy a new gateway revision with both
   `OPENROUTER_VIDEO_GENERATION_ENABLED=1` and a single-model
   `OPENROUTER_VIDEO_MODEL_ALLOWLIST`. Keep the allowlist scoped to the
   approved model until reconciliation has been reviewed.

Never infer a video's price, duration, or capability from an old marketing
page. The live video-model catalog is the pricing and capability source for
each approved snapshot.
# Disposable mutation canary

The Cloud Tasks authorization probe proves only the non-mutating path. Before
calling the provisioner production-ready, run exactly one disposable
**prepare-only** canary and retain the resulting queue/callback/cleanup
evidence. The tracked canary is `cp-canary-a826-rollback`; it is not the
existing `dofgfood` tenant and must never be renamed to a client slug.

1. Deploy the current public provisioner, GCP adapter, and Vercel operator
   route from an immutable source revision. Confirm `npm run
   verify:control-plane-cloud -- --probe` returns `applyEnabled: false`.
2. Run the read-only collision check. It must report every exact canary
   resource as absent:

   ```bash
   npm run verify:control-plane-canary
   node scripts/control-plane-disposable-canary.mjs --mode preflight
   ```

3. Verify the adapter service account has only the reviewed
   `roles/veloceTenantProvisioner` custom role needed to create the canary.
   Enable `GCP_PROVISIONER_ALLOW_APPLY=1` only immediately before dispatch.
4. POST the tracked manifest to the operator-only canary route. Wait for the
   Cloud Tasks request and adapter callback to report `succeeded`, then record
   the returned deterministic `resourceManifest`. A prepare canary may create
   only one service account, one empty bucket, one queue, and the listed empty
   Secret Manager container; it must not create a Cloud Run service or job.
5. Restore `GCP_PROVISIONER_ALLOW_APPLY=0` before cleanup. Verify the adapter
   again with `npm run verify:control-plane-cloud -- --probe`.
6. Delete only the inventory-derived canary resources and atomically record
   the absence evidence back to the operator route:

   ```bash
   node scripts/control-plane-disposable-canary.mjs \
     --mode record-cleanup --apply \
     --confirm-slug cp-canary-a826-rollback \
     --run-id <run-id> --onboarding-id <onboarding-id> \
     --record-url https://app.veloceos.cloud/api/internal/control-plane/canary
   ```

   The tool refuses a non-empty bucket, an unreadable resource state, a wrong
   slug, or a missing explicit confirmation. It never targets `dofgfood`.

Do not use the general client offboarding tool as a canary shortcut: it exports
tenant database data and has a broader lifecycle scope than this exact
four-resource cleanup.
