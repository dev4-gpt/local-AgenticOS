# Staging environment deployment runbook

**Scope warning:** This is a control-plane staging tier, not a disposable
database for migration, deletion or recovery tests. It shares production's
Supabase project. Environment-suffixed services and fresh secrets do not isolate
project-wide SQL, grants, triggers, tenant tables or database backups. Do not
apply a schema rehearsal or destructive fixture to that shared project under
this runbook. Such testing requires a separately approved test database with
synthetic users/data, exact target identity, bounded costs and reviewed cleanup.

For that separate database, follow the
[disposable database rehearsal procedure](./disposable-database-rehearsal.md).
It is not permission to execute this control-plane runbook or create resources.

This runbook stands up the staging tier for Phase 2 Slice 1: a full parallel
set of Cloud Run services, identities, secrets, and a queue in the **same**
`veloce-agenticos-2026` GCP project and the **same** Supabase project as
production, distinguished entirely by environment-suffixed resource names
and separate secret values — not by a second GCP project. It does **not**
create a second GCP project or a second Supabase project. The commands below
include shared-project IAM changes and production Vercel environment variables;
they require explicit approval and must not be treated as read-only setup.

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
- **`cloudresourcemanager.googleapis.com` must be enabled on the project**
  (`gcloud services enable cloudresourcemanager.googleapis.com --project
  veloce-agenticos-2026`) — not required by production's original runbook
  API list, but genuinely needed once a WIF-authenticated identity (not a
  human user session) calls `gcloud projects describe` to resolve the
  project number, which `scripts/verify-control-plane-cloud.mjs` does.
  Caught live: identical `projects describe` calls succeed under a human
  user's own `gcloud auth login` session regardless of this API's state,
  but fail with `SERVICE_DISABLED` under service-account impersonation or
  WIF, which explicitly bills the call against the target project's own
  quota — a real, one-time project-level gap, not a role/IAM-binding issue.

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
  --member="principalSet://iam.googleapis.com/${WIP}/attribute.environment/Production"
```

**Case-sensitivity gotcha, found live:** `attribute.environment` is a
verbatim, untransformed copy of `assertion.environment` (see the
`--attribute-mapping` above) — GitHub's OIDC `environment` claim carries the
*exact* configured GitHub Environment name, case included. This repo's
`promote-production` job specifies `environment: Production` (capital P,
matching the GitHub Environment actually configured in repo settings — see
PR 4's environment-casing fix), so the principal-set member above must be
`attribute.environment/Production`, not `attribute.environment/production`.
Binding the lowercase form (an easy mistake — `staging`'s job legitimately
does use lowercase `environment: staging`, so the natural pattern-match is
wrong for production specifically) makes the WIF-federated token never
match this principal at all: `google-github-actions/auth@v2` still succeeds
(the WIF *authentication* step doesn't check this binding), but every
subsequent `gcloud`/API call that relies on the credential file's
`service_account_impersonation_url` (i.e. every call in the job) fails with
`PERMISSION_DENIED` / `iam.serviceAccounts.getAccessToken` — a generic
"impersonation denied" error with no hint that the actual cause is a casing
mismatch one layer up in the WIF principal binding, not a permissions gap
on the target SA itself. Confirm the live binding's case matches the
job's `environment:` value exactly:
`gcloud iam service-accounts get-iam-policy veloce-ci-deployer-production@veloce-agenticos-2026.iam.gserviceaccount.com --project=veloce-agenticos-2026`.

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

**Recorded, 2026-09-05:**

- Staging deploy (`control-plane-image-deploy.yml`, `build-audit-sign-stage`,
  run [33926621319](https://github.com/dev4-gpt/local-AgenticOS/actions/runs/33926621319)):
  `platform_deploy_runs` id `ad834fc7-8db7-455e-92f4-dd21e41edc6e`, status
  `succeeded`, image
  `asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/gcp-provisioner@sha256:5864d14d93a7396696283666c3952b00d2a61759a48ffd41ae9a9050005c7292`.
- Production promotion (`workflow_dispatch`, `promote-production`, run
  [33940554463](https://github.com/dev4-gpt/local-AgenticOS/actions/runs/33940554463)):
  `platform_deploy_runs` id `c67f3ef2-96a9-49af-8964-447a51e66683`, status
  `succeeded`, promoted from the staging run above, identical digest
  deployed to `veloce-gcp-provisioner` as revision
  `veloce-gcp-provisioner-00036-c9d`, post-deploy health probe `200 ok`.
- Release ledger record:
  `gs://veloce-agenticos-2026-veloce-release-ledger/releases/90aa0bedf1d31638abce3c22f88793ec5d5725ef/production-20260905T030004Z.json`.

Two real bugs were found and fixed by this canary run, both now folded into
this runbook and the workflow itself: the WIF principal-set case-sensitivity
gotcha in §6 above, and a missing `gcloud auth configure-docker` step in the
`promote-production` job (cosign's registry pull was unauthenticated without
it — `build-audit-sign-stage` already had this step, `promote-production`
didn't).

## 7. Policy-as-code release gates (Phase 2 closer)

Closes the last remaining piece of Phase 2's roadmap scope: *"Add
policy-as-code release gates for dependency advisories, licenses, secret
exposure, infrastructure drift, tenant-boundary rules, provider budgets,
approved egress, and connector risk classification."* Dependency advisories
and secret exposure were already covered by the pipeline's existing `npm
audit`/`verify:secrets` steps. Connector risk classification and the
customer-facing paid-approval governance model are explicitly deferred —
the former depends on a "risk tier" concept that belongs to the later
ecosystem/registry control-plane phase; the latter depends on the
managed-credit system being proven live first.

Four new gates, three new read-only scripts plus one reused script invoked
earlier in the pipeline:
- `scripts/verify-license-compliance.mjs` — checks every `package-lock.json`
  entry's license against an explicit allowlist.
- `scripts/verify-provider-egress-budget.mjs` — applies
  `client-provider-policy.mjs`'s existing `validateProviderActivation`/
  `validateResearchWorkerConfig` to every checked-in client manifest
  automatically (previously only run by hand, one manifest at a time).
- `scripts/verify-client-runtime-tenant-boundary.mjs` — static check that
  every `src/app/api/client-runtime/**/route.ts` file imports
  `@/lib/clientAuth`/`@/lib/clientDataPlane`, directly or via an explicit
  allowlisted data-layer module.
- `scripts/verify-control-plane-cloud.mjs --probe` reused as a *pre*-build
  (staging) and *pre*-deploy (production) drift gate, alongside its existing
  post-deploy use.

**Recorded, 2026-09-05:**

All three static gates and the drift gate were proven with a real failure
before being proven clean, not just claimed:
- License: temporarily removing `MPL-2.0` from the allowlist correctly
  failed citing `axe-core`/every `lightningcss` platform variant; reverted.
- Provider egress/budget: temporarily enabling `providerCallsEnabled` on
  `client-blueprints/dofgfood-visual-qa.gcp.json` without pricing/allowlist
  correctly failed citing that file; reverted.
- Tenant boundary: temporarily breaking the `clientAuth`/`clientDataPlane`
  import markers in `src/app/api/client-runtime/telemetry/route.ts`
  correctly failed citing that route; reverted.
- Infra drift: temporarily passing a wrong `--adapter-identity` in the new
  staging pre-build step correctly failed against live GCP state (proven
  via workflow run
  [33942757312](https://github.com/dev4-gpt/local-AgenticOS/actions/runs/33942757312),
  reverted via `git revert`).

Clean end-to-end proof, both gates now permanently wired in:
- Staging (run
  [33942839870](https://github.com/dev4-gpt/local-AgenticOS/actions/runs/33942839870)):
  `platform_deploy_runs` id `1434fa3b-d1b8-4455-8655-4525f28c0204`, all
  steps green including the new `verify:policy-gates` and pre-build drift
  steps.
- Production promotion (run
  [33943178662](https://github.com/dev4-gpt/local-AgenticOS/actions/runs/33943178662)):
  promoted from the staging run above, production revision now
  `veloce-gcp-provisioner-00037-np2`, new pre-deploy drift step green, new
  release-ledger record at
  `gs://veloce-agenticos-2026-veloce-release-ledger/releases/6ee180b26d782a034877eada3ba1e7cd1d0a30e2/production-20260905T035734Z.json`.
