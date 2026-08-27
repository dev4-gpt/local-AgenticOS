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
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --project veloce-agenticos-2026

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

gcloud secrets add-iam-policy-binding control-plane-operator-secret --project veloce-agenticos-2026 --member="serviceAccount:${PUBLIC_SA}" --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding control-plane-worker-token --project veloce-agenticos-2026 --member="serviceAccount:${PUBLIC_SA}" --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding control-plane-worker-token --project veloce-agenticos-2026 --member="serviceAccount:${ADAPTER_SA}" --role=roles/secretmanager.secretAccessor
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

## 4. Build and deploy in safe mode

Build both images from the repository root with:

```bash
gcloud builds submit . --project veloce-agenticos-2026 --config cloudbuild.control-plane.yaml
```

Deploy `gcp-provisioner` with no public access and
`GCP_PROVISIONER_ALLOW_APPLY=0`, then deploy `public-provisioner` with no
public access. Bind each control-plane secret by name using `--set-secrets`;
do not place values on the command line.

Configure one explicit audience contract instead of deriving authentication
from either of Cloud Run's generated hostnames:

```bash
GCP_PROVISIONER_AUDIENCE=veloce-gcp-provisioner

gcloud run services update veloce-gcp-provisioner \
  --project veloce-agenticos-2026 \
  --region asia-south1 \
  --add-custom-audiences="$GCP_PROVISIONER_AUDIENCE"

gcloud run services update veloce-public-provisioner \
  --project veloce-agenticos-2026 \
  --region asia-south1 \
  --update-env-vars="GCP_PROVISIONER_AUDIENCE=$GCP_PROVISIONER_AUDIENCE"
```

The public worker mints its metadata-server ID token for this exact audience;
the adapter accepts that audience at the Cloud Run IAM boundary. The request
URL remains the adapter's current generated `run.app` URL.

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
object in Production configuration. Tiered and zero-priced models require a
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
