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
must be limited to the Cloud Run, Cloud Tasks, Storage, Artifact Registry, and
service-account operations performed by `scripts/provision-gcp-client.mjs`.

## 4. Build and deploy in safe mode

Build both images from the repository root with:

```bash
gcloud builds submit . --project veloce-agenticos-2026 --config cloudbuild.control-plane.yaml
```

Deploy `gcp-provisioner` with no public access and
`GCP_PROVISIONER_ALLOW_APPLY=0`, then deploy `public-provisioner` with no
public access. Bind each control-plane secret by name using `--set-secrets`;
do not place values on the command line.

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

Only after these checks and the custom adapter role are reviewed may the
adapter be updated to `GCP_PROVISIONER_ALLOW_APPLY=1`.
