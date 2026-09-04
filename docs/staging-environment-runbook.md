# Staging environment deployment runbook

This runbook stands up the staging tier for Phase 2 Slice 1: a full parallel
set of Cloud Run services, identities, secrets, and a queue in the **same**
`veloce-agenticos-2026` GCP project and the **same** Supabase project as
production, distinguished entirely by environment-suffixed resource names
and separate secret values — not by a second GCP project. It does **not**
create a second GCP project, a second Supabase project, or touch any
existing production resource.

## Preconditions

- Project: `veloce-agenticos-2026`
- Region: `asia-south1`
- Run all commands from `source/` with a human Google account that can
  manage IAM, Cloud Run, Cloud Tasks, Secret Manager, and Workload Identity
  Federation (`aryamandev777@gmail.com` holds Owner).
- The custom role source
  [`iam/veloce-ci-deployer-role.yaml`](../iam/veloce-ci-deployer-role.yaml)
  has been reviewed. It deliberately excludes `run.services.create`,
  `run.services.setIamPolicy`, `run.services.delete`, and all
  `iam.serviceAccounts.*` — CI deploys to services a human already
  bootstrapped here; it can never create a service or change who can invoke
  one.
- Read [`docs/control-plane-provisioner-runbook.md`](control-plane-provisioner-runbook.md)
  first if you haven't — this runbook mirrors its structure and reuses its
  §2 Vercel-OIDC pattern for step 6 below, just for GitHub's OIDC issuer
  instead.

## 1. Create the staging identities

```bash
gcloud iam service-accounts create veloce-public-provisioner-staging-run \
  --project veloce-agenticos-2026 --display-name="Veloce public provisioner runtime (staging)"
gcloud iam service-accounts create veloce-gcp-provisioner-staging-run \
  --project veloce-agenticos-2026 --display-name="Veloce private GCP provisioner runtime (staging)"
gcloud iam service-accounts create veloce-vercel-control-plane-staging \
  --project veloce-agenticos-2026 --display-name="Vercel control-plane invoker (staging)"
gcloud iam service-accounts create veloce-ci-deployer-staging \
  --project veloce-agenticos-2026 --display-name="Veloce CI deployer (staging)"
gcloud iam service-accounts create veloce-ci-deployer-production \
  --project veloce-agenticos-2026 --display-name="Veloce CI deployer (production)"
```

These follow the naming rule that keeps environment resources from ever
colliding with a tenant slug: the environment suffixes an existing platform
*component* name (`public-provisioner`, `gcp-provisioner`, `ci-deployer`),
never a bare `veloce-staging-*`. A tenant `clientSlug` can never contain a
second segment matching one of these component names, so
`veloce-gcp-provisioner-staging-run` can't collide with any tenant service
account — see the reserved-slug denylist added in PR 2 for the
belt-and-suspenders half of this guarantee.

## 2. Create and bind the CI deployer role

```bash
gcloud iam roles create veloceCiDeployer \
  --project veloce-agenticos-2026 --file iam/veloce-ci-deployer-role.yaml

for SA in veloce-ci-deployer-staging veloce-ci-deployer-production; do
  gcloud projects add-iam-policy-binding veloce-agenticos-2026 \
    --member="serviceAccount:${SA}@veloce-agenticos-2026.iam.gserviceaccount.com" \
    --role="projects/veloce-agenticos-2026/roles/veloceCiDeployer"
done
```

Bound at project level (not per-service) because `run.services.update`
must reach both the staging and, for the production SA only, the production
Cloud Run services this role's own permission set already limits to
update-not-create/delete.

Grant the production CI deployer impersonation rights on the release-ledger
writer, so the promotion job can call `npm run publish:release-ledger`
itself — this is exactly the grant
[`docs/release-evidence-ledger-runbook.md`](release-evidence-ledger-runbook.md)
flagged as deferred to Phase 2:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  veloce-release-ledger-writer@veloce-agenticos-2026.iam.gserviceaccount.com \
  --project veloce-agenticos-2026 \
  --member="serviceAccount:veloce-ci-deployer-production@veloce-agenticos-2026.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountTokenCreator
```

## 3. Create staging secrets — distinct values, not just distinct names

A leaked staging token must never work against production. Generate fresh
random values for these (do not reuse the production secret's value):

```bash
gcloud secrets create control-plane-worker-token-staging --project veloce-agenticos-2026 --replication-policy=automatic
gcloud secrets create control-plane-operator-secret-staging --project veloce-agenticos-2026 --replication-policy=automatic

# Generate and store a fresh random value for each (do not print these —
# pipe directly from a generator into `gcloud secrets versions add`):
openssl rand -hex 32 | gcloud secrets versions add control-plane-worker-token-staging --project veloce-agenticos-2026 --data-file=-
openssl rand -hex 32 | gcloud secrets versions add control-plane-operator-secret-staging --project veloce-agenticos-2026 --data-file=-
```

Bind read access to the staging identities only:

```bash
PUBLIC_SA_STAGING=veloce-public-provisioner-staging-run@veloce-agenticos-2026.iam.gserviceaccount.com
ADAPTER_SA_STAGING=veloce-gcp-provisioner-staging-run@veloce-agenticos-2026.iam.gserviceaccount.com

gcloud secrets add-iam-policy-binding control-plane-worker-token-staging --project veloce-agenticos-2026 --member="serviceAccount:${PUBLIC_SA_STAGING}" --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding control-plane-worker-token-staging --project veloce-agenticos-2026 --member="serviceAccount:${ADAPTER_SA_STAGING}" --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding control-plane-operator-secret-staging --project veloce-agenticos-2026 --member="serviceAccount:${ADAPTER_SA_STAGING}" --role=roles/secretmanager.secretAccessor
```

Add `CONTROL_PLANE_OPERATOR_SECRET_STAGING` to the **production** Vercel
environment too (as its own Sensitive variable, alongside the existing
`CONTROL_PLANE_OPERATOR_SECRET`) — the platform-deploy callback route (PR 3)
runs as part of the one production Vercel app and distinguishes staging vs.
production requests by which of the two secrets authenticated the call, not
by which URL was hit. Set it with `vercel env add CONTROL_PLANE_OPERATOR_SECRET_STAGING production`
from `source/` (same root-directory caveat as any other Vercel CLI command
here — see Project facts in the Phase 2 plan).

## 4. Create the staging Cloud Tasks queue

```bash
gcloud tasks queues create veloce-control-plane-provisioning-staging \
  --project veloce-agenticos-2026 \
  --location asia-south1 \
  --max-attempts 1 \
  --max-concurrent-dispatches 1

gcloud tasks queues add-iam-policy-binding veloce-control-plane-provisioning-staging \
  --project veloce-agenticos-2026 \
  --location asia-south1 \
  --member="serviceAccount:${PUBLIC_SA_STAGING}" \
  --role=roles/cloudtasks.enqueuer

gcloud iam service-accounts add-iam-policy-binding "$PUBLIC_SA_STAGING" \
  --project veloce-agenticos-2026 \
  --member="serviceAccount:${PUBLIC_SA_STAGING}" \
  --role=roles/iam.serviceAccountUser

gcloud iam service-accounts add-iam-policy-binding "$PUBLIC_SA_STAGING" \
  --project veloce-agenticos-2026 \
  --member="serviceAccount:service-1075094991117@gcp-sa-cloudtasks.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountTokenCreator
```

## 5. Build and deploy both staging services in safe mode

Build from the same `cloudbuild.control-plane.yaml` used for production —
no separate staging Cloud Build config is needed, only a separate deploy
target:

```bash
gcloud builds submit . --project veloce-agenticos-2026 --config cloudbuild.control-plane.yaml
```

Deploy `gcp-provisioner-staging` with no public access,
`GCP_PROVISIONER_ALLOW_APPLY=0`, `--timeout=1000s`, then
`public-provisioner-staging` with no public access — same safe-mode posture
production started in:

```bash
gcloud run deploy veloce-gcp-provisioner-staging \
  --project veloce-agenticos-2026 --region asia-south1 \
  --image asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/gcp-provisioner:control-plane-gcp-latest \
  --service-account "$ADAPTER_SA_STAGING" \
  --no-allow-unauthenticated --timeout=1000s \
  --update-secrets=CONTROL_PLANE_WORKER_TOKEN=control-plane-worker-token-staging:latest,CONTROL_PLANE_OPERATOR_SECRET=control-plane-operator-secret-staging:latest \
  --set-env-vars="GCP_PROVISIONER_ALLOW_APPLY=0,CONTROL_PLANE_CALLBACK_URL=https://app.veloceos.cloud/api/onboarding/provision-result"

gcloud run deploy veloce-public-provisioner-staging \
  --project veloce-agenticos-2026 --region asia-south1 \
  --image asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/public-provisioner:control-plane-public-latest \
  --service-account "$PUBLIC_SA_STAGING" \
  --no-allow-unauthenticated \
  --update-secrets=CONTROL_PLANE_WORKER_TOKEN=control-plane-worker-token-staging:latest \
  --set-env-vars="GCP_PROVISIONER_TASK_PROJECT=veloce-agenticos-2026,GCP_PROVISIONER_TASK_LOCATION=asia-south1,GCP_PROVISIONER_TASK_QUEUE=veloce-control-plane-provisioning-staging,GCP_PROVISIONER_TASK_SERVICE_ACCOUNT=${PUBLIC_SA_STAGING}"
```

`CONTROL_PLANE_CALLBACK_URL` above points at the same production tenant-
provisioning callback route as production's adapter, because Slice 1 does
**not** exercise staging tenant provisioning (see the Phase 2 plan's scope —
PR previews sharing the staging backend tier is aspirational future work,
not exercised yet). What Slice 1 *does* exercise is the platform-deploy job
tracking callback (`/api/internal/platform-deploy`, added in PR 3), which
is authenticated by the staging operator secret regardless of URL — revisit
this callback URL when a real staging tenant-provisioning flow is built.

Configure the Cloud Tasks audience and remaining public-dispatcher wiring
exactly as `docs/control-plane-provisioner-runbook.md` §4 describes for
production, substituting the staging service URLs and queue name.

## 6. Configure GitHub Actions OIDC federation

Mirrors [`docs/control-plane-provisioner-runbook.md`](control-plane-provisioner-runbook.md)
§2's Vercel OIDC pattern, for GitHub's issuer instead:

```bash
gcloud iam workload-identity-pools create github-actions \
  --project veloce-agenticos-2026 --location global \
  --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc github-actions \
  --project veloce-agenticos-2026 --location global \
  --workload-identity-pool github-actions \
  --display-name="GitHub Actions OIDC" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.environment=assertion.environment" \
  --attribute-condition="assertion.repository == 'dev4-gpt/local-AgenticOS'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

Bind each CI deployer SA to the principal set filtered by GitHub's
`environment` claim (populated only when a workflow job specifies
`environment:`, which both the staging-deploy and production-promotion jobs
do — see PR 4):

```bash
WIP="projects/1075094991117/locations/global/workloadIdentityPools/github-actions"

gcloud iam service-accounts add-iam-policy-binding veloce-ci-deployer-staging@veloce-agenticos-2026.iam.gserviceaccount.com \
  --project veloce-agenticos-2026 \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${WIP}/attribute.environment/staging"

gcloud iam service-accounts add-iam-policy-binding veloce-ci-deployer-production@veloce-agenticos-2026.iam.gserviceaccount.com \
  --project veloce-agenticos-2026 \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${WIP}/attribute.environment/production"
```

Verify the exact attribute-condition and principal-set syntax against
Google's current Workload Identity Federation docs at execution time — this
is standard `google-github-actions/auth` usage, not novel to this repo, but
syntax has changed across `gcloud` versions before.

## Acceptance checks before mutations

With `GCP_PROVISIONER_ALLOW_APPLY=0` on the staging adapter, verify:

1. Public requests to either staging Cloud Run URL receive authentication
   failures.
2. Invalid worker tokens are rejected by both staging workers.
3. `npm run verify:control-plane-cloud -- --public-service veloce-public-provisioner-staging --adapter-service veloce-gcp-provisioner-staging --task-queue veloce-control-plane-provisioning-staging --probe` returns `applyEnabled: false`.
4. The staging adapter service account has only the reviewed
   `roles/veloceCiDeployer` custom role — confirm it does **not** also carry
   `roles/veloceTenantProvisioner` (that role is for the production tenant
   provisioner only; staging in this slice never provisions a tenant).

## Disposable pipeline canary

Before calling the staging→production pipeline production-ready, PR 5 runs
exactly one real deploy end-to-end (build → sign → deploy digest to staging
→ verify → manually promote the identical digest to production → publish a
release-ledger record) and records the resulting `platform_deploy_runs` row
IDs and the published `gs://` ledger object path here as acceptance
evidence, mirroring how the tenant provisioner required one disposable
canary (`cp-canary-b903-rollback`) before being called production-ready.

*(Evidence recorded after PR 5 lands — see the Phase 2 Slice 1 plan's
Sequencing §5 and Verification §5–6.)*
