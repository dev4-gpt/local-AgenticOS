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
gcloud iam service-accounts create veloce-pub-prov-stg-run \
  --project veloce-agenticos-2026 --display-name="Veloce public provisioner runtime (staging)"
gcloud iam service-accounts create veloce-gcp-prov-stg-run \
  --project veloce-agenticos-2026 --display-name="Veloce private GCP provisioner runtime (staging)"
gcloud iam service-accounts create veloce-vercel-cp-staging \
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
`veloce-gcp-prov-stg-run` can't collide with any tenant service
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
PUBLIC_SA_STAGING=veloce-pub-prov-stg-run@veloce-agenticos-2026.iam.gserviceaccount.com
ADAPTER_SA_STAGING=veloce-gcp-prov-stg-run@veloce-agenticos-2026.iam.gserviceaccount.com

gcloud secrets add-iam-policy-binding control-plane-worker-token-staging --project veloce-agenticos-2026 --member="serviceAccount:${PUBLIC_SA_STAGING}" --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding control-plane-worker-token-staging --project veloce-agenticos-2026 --member="serviceAccount:${ADAPTER_SA_STAGING}" --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding control-plane-operator-secret-staging --project veloce-agenticos-2026 --member="serviceAccount:${ADAPTER_SA_STAGING}" --role=roles/secretmanager.secretAccessor
```

The CI deployer identities also need to read the operator secret directly —
`scripts/ci-deploy-staging.mjs`/`scripts/ci-promote-production.mjs` fetch it
themselves to authenticate their own callback POST to the platform-deploy
route. Being included in `iam/veloce-ci-deployer-role.yaml`'s permission list
is not sufficient on its own — Secret Manager also requires a resource-level
binding on the specific secret (caught live: the pipeline's first real
`ci-deploy-staging.mjs --action start` call failed with "unable to obtain
the operator secret" until this binding was added):

```bash
gcloud secrets add-iam-policy-binding control-plane-operator-secret-staging --project veloce-agenticos-2026 --member="serviceAccount:veloce-ci-deployer-staging@veloce-agenticos-2026.iam.gserviceaccount.com" --role=roles/secretmanager.secretAccessor
gcloud secrets add-iam-policy-binding control-plane-operator-secret --project veloce-agenticos-2026 --member="serviceAccount:veloce-ci-deployer-production@veloce-agenticos-2026.iam.gserviceaccount.com" --role=roles/secretmanager.secretAccessor
```

The CI deployer identities also need `roles/iam.serviceAccountUser` on each
target Cloud Run service's own runtime service account — deploying a
revision to a service that runs as a given identity requires
`iam.serviceAccounts.actAs` on that exact identity. This does **not** belong
in `iam/veloce-ci-deployer-role.yaml` itself: granting `actAs` at the
project-scoped custom role would let CI impersonate every service account in
the project, not just the ones it deploys to — grant it per-target-identity
instead (caught live: `gcloud run deploy` failed with "Permission
'iam.serviceaccounts.actAs' denied" until these were added):

```bash
gcloud iam service-accounts add-iam-policy-binding veloce-gcp-prov-stg-run@veloce-agenticos-2026.iam.gserviceaccount.com --project veloce-agenticos-2026 --member="serviceAccount:veloce-ci-deployer-staging@veloce-agenticos-2026.iam.gserviceaccount.com" --role=roles/iam.serviceAccountUser
gcloud iam service-accounts add-iam-policy-binding veloce-pub-prov-stg-run@veloce-agenticos-2026.iam.gserviceaccount.com --project veloce-agenticos-2026 --member="serviceAccount:veloce-ci-deployer-staging@veloce-agenticos-2026.iam.gserviceaccount.com" --role=roles/iam.serviceAccountUser
gcloud iam service-accounts add-iam-policy-binding veloce-gcp-provisioner-run@veloce-agenticos-2026.iam.gserviceaccount.com --project veloce-agenticos-2026 --member="serviceAccount:veloce-ci-deployer-production@veloce-agenticos-2026.iam.gserviceaccount.com" --role=roles/iam.serviceAccountUser
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
target. If the production mutable tags (`control-plane-gcp-latest`,
`control-plane-public-latest`) are already current, skip rebuilding and
resolve their digests directly:

```bash
gcloud builds submit . --project veloce-agenticos-2026 --config cloudbuild.control-plane.yaml

GCP_DIGEST=$(gcloud artifacts docker images describe asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/gcp-provisioner:control-plane-gcp-latest --project veloce-agenticos-2026 --format="value(image_summary.digest)")
PUB_DIGEST=$(gcloud artifacts docker images describe asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/public-provisioner:control-plane-public-latest --project veloce-agenticos-2026 --format="value(image_summary.digest)")
```

**Deploy by resolved digest, not the mutable tag** — `verify:control-plane-cloud`
requires an immutable `@sha256:...` reference, matching production's own
posture. Deploy `gcp-provisioner-staging` with no public access,
`GCP_PROVISIONER_ALLOW_APPLY=0`, `--timeout=1000s`, then
`public-provisioner-staging` with no public access — same safe-mode posture
production started in. **Every env var below is required**; the worker code
falls back to a default for a couple of them, but `verify:control-plane-cloud`
checks the Cloud Run service's *configured* value, not the runtime default,
so omitting any of them fails verification even though the service still
boots (confirmed the hard way — the first deploy attempt here was missing
`GCP_ALLOWED_PROJECT`/`GCP_ALLOWED_REGION`/`GCP_ALLOWED_ARTIFACT_REPOSITORY`/
`GCP_PROJECT_NUMBER` on the adapter and `GCP_PROVISIONER_URL`/
`GCP_PROVISIONER_ID_TOKEN_SOURCE` on the dispatcher):

```bash
gcloud run deploy veloce-gcp-provisioner-staging \
  --project veloce-agenticos-2026 --region asia-south1 \
  --image "asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/gcp-provisioner@${GCP_DIGEST}" \
  --service-account "$ADAPTER_SA_STAGING" \
  --no-allow-unauthenticated --timeout=1000s \
  --update-secrets=CONTROL_PLANE_WORKER_TOKEN=control-plane-worker-token-staging:latest,CONTROL_PLANE_OPERATOR_SECRET=control-plane-operator-secret-staging:latest \
  --set-env-vars="GCP_ALLOWED_PROJECT=veloce-agenticos-2026,GCP_ALLOWED_REGION=asia-south1,GCP_ALLOWED_ARTIFACT_REPOSITORY=veloce,GCP_PROVISIONER_ALLOW_APPLY=0,CONTROL_PLANE_CALLBACK_URL=https://app.veloceos.cloud/api/onboarding/provision-result,GCP_PROJECT_NUMBER=1075094991117"

gcloud run deploy veloce-public-provisioner-staging \
  --project veloce-agenticos-2026 --region asia-south1 \
  --image "asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/public-provisioner@${PUB_DIGEST}" \
  --service-account "$PUBLIC_SA_STAGING" \
  --no-allow-unauthenticated \
  --update-secrets=CONTROL_PLANE_WORKER_TOKEN=control-plane-worker-token-staging:latest \
  --set-env-vars="GCP_ALLOWED_PROJECT=veloce-agenticos-2026,GCP_ALLOWED_REGION=asia-south1,GCP_ALLOWED_ARTIFACT_REPOSITORY=veloce,GCP_PROVISIONER_URL=https://veloce-gcp-provisioner-staging-1075094991117.asia-south1.run.app/provision,GCP_PROVISIONER_AUDIENCE=https://veloce-gcp-provisioner-staging-1075094991117.asia-south1.run.app,GCP_PROVISIONER_ID_TOKEN_SOURCE=metadata,GCP_PROVISIONER_TASK_PROJECT=veloce-agenticos-2026,GCP_PROVISIONER_TASK_LOCATION=asia-south1,GCP_PROVISIONER_TASK_QUEUE=veloce-control-plane-provisioning-staging,GCP_PROVISIONER_TASK_SERVICE_ACCOUNT=${PUBLIC_SA_STAGING}"
```

`CONTROL_PLANE_CALLBACK_URL` above points at the same production tenant-
provisioning callback route as production's adapter, because Slice 1 does
**not** exercise staging tenant provisioning (see the Phase 2 plan's scope —
PR previews sharing the staging backend tier is aspirational future work,
not exercised yet). What Slice 1 *does* exercise is the platform-deploy job
tracking callback (`/api/internal/platform-deploy`, added in PR 3), which
is authenticated by the staging operator secret regardless of URL — revisit
this callback URL when a real staging tenant-provisioning flow is built.

Grant the invoker bindings — public dispatcher may invoke the adapter,
Vercel's staging identity may invoke the public dispatcher:

```bash
gcloud run services add-iam-policy-binding veloce-gcp-provisioner-staging \
  --project veloce-agenticos-2026 --region asia-south1 \
  --member="serviceAccount:${PUBLIC_SA_STAGING}" --role=roles/run.invoker

gcloud run services add-iam-policy-binding veloce-public-provisioner-staging \
  --project veloce-agenticos-2026 --region asia-south1 \
  --member="serviceAccount:veloce-vercel-cp-staging@veloce-agenticos-2026.iam.gserviceaccount.com" \
  --role=roles/run.invoker
```

Verify the whole configuration in one shot — this is the actual command
this runbook was validated against:

```bash
node scripts/verify-control-plane-cloud.mjs \
  --public-service veloce-public-provisioner-staging \
  --adapter-service veloce-gcp-provisioner-staging \
  --task-queue veloce-control-plane-provisioning-staging \
  --public-identity veloce-pub-prov-stg-run@veloce-agenticos-2026.iam.gserviceaccount.com \
  --adapter-identity veloce-gcp-prov-stg-run@veloce-agenticos-2026.iam.gserviceaccount.com \
  --operator-secret-name control-plane-operator-secret-staging \
  --worker-secret-name control-plane-worker-token-staging
```

Expect `"ok": true`, `"applyEnabled": false`, `"failures": []`. The
`--probe` flag is intentionally omitted here — the health-bridge probe hits
a production-only Vercel route (`/api/internal/control-plane/provisioner-health`)
that isn't staging-aware yet; that's follow-on work, not required for this
slice's structural verification.

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
3. The full `verify:control-plane-cloud` command in §5 above returns
   `"ok": true`, `"applyEnabled": false`, `"failures": []` (confirmed —
   see the command as actually run, output recorded there).
4. Neither staging service account carries `roles/veloceTenantProvisioner`
   (that role is production-only; staging in this slice never provisions a
   tenant) — confirm via `gcloud projects get-iam-policy veloce-agenticos-2026`
   that only `veloce-gcp-provisioner-run@…` (production) holds it. The two
   CI deployer service accounts (`veloce-ci-deployer-staging`,
   `veloce-ci-deployer-production`) should each hold exactly one project-level
   role, `roles/veloceCiDeployer` — confirm no broader role (e.g. Editor,
   Owner) is also bound to either.

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
