# Production release acceptance checklist

Use this checklist only after the source and infrastructure changes are ready.
It is a record of required evidence, not permission to activate a provider,
bill a customer, or publish a campaign.

## Evidence rules

- Record a result only after running the matching test in the production
  environment.
- Store IDs, revisions, timestamps, redacted output, and rollback targets; do
  not store credentials, payment details, or customer content.
- A failed test is evidence. Keep it, restore the known-good revision, and do
  not substitute a passing local test for a production result.

## 1. Source and infrastructure baseline

| Gate | Operator action | Passing evidence |
| --- | --- | --- |
| Clean release source | Commit or safely stash user-owned changes, then run `git status --short`. | No output; a recorded commit SHA. |
| Focused regression | Run `npm run test:focused`. | A current reviewed passing count from a clean runner. |
| Public provisioner | Run `npm run verify:control-plane-cloud -- --probe`. | `ok: true`, apply disabled, current public/adapter revisions and immutable adapter digest. |
| Managed gateway boundary | Run `npm run verify:managed-openrouter-cloud -- --expected-digest sha256:<digest> --expected-models openai/gpt-4o-mini`. | Private IAM, exact secret bindings, one invoker, immutable image, approved allowlist, and `/readyz` passing. |
| Vercel metadata | Run `npm run verify:vercel-production-env`. | Required production names present; sensitive values remain typed sensitive; pricing snapshot fields present after activation configuration. |

Local-only artifact check on 2026-10-09: source `dd6b6cd22c7f8571408eadf34fc41290e300949c` built with the client Docker flags, then `node scripts/prune-client-runtime-artifact.mjs` removed 235 disallowed route entries and retained 118. `npm run verify:client-build-trace` passed on that local artifact. The verifier now requires the build-identity route; its positive and missing-route tests pass. This is not a hosted image digest, deployment, or current-candidate acceptance receipt.

## 2. Managed OpenRouter: owner-controlled activation

1. In the OpenRouter workspace that owns the **managed** key, configure a $4
   lifetime cap and disable auto-top-up. Preserve a redacted screenshot or
   management-API response showing the workspace/key identity, `$4`,
   `lifetime`, and timestamp. Do not paste a key into this repository or chat.
2. If the account cannot enforce a lifetime cap, stop. A daily or monthly cap
   is not equivalent to a hard total cap.
3. Generate a fresh review-only pricing artifact:

   ```bash
   npm run prepare:openrouter-pricing -- \
     --models openai/gpt-4o-mini \
     --out tmp/openrouter-managed-pricing-review.json
   ```

   Review the model ID and normalized pricing. Add exactly the resulting
   snapshot ID and JSON to Vercel Production, never a secret value.
4. Apply and record the exact pending Supabase migrations, including
   `product-experience/supabase-v34-managed-credit-execution-claims.sql` and
   `product-experience/supabase-v34-managed-provider-reconciliation-gate.sql`.
   Before any funded configuration, run
   `product-experience/supabase-v34-managed-openrouter-health-canary.sql`.
   It creates a zero-credit, execution-disabled disposable tenant and reports
   the migration and connection preflight in one result. The connection refers
   only to the existing Secret Manager resource; it must not contain an API key
   value.
5. Apply `product-experience/supabase-v44-stripe-financial-event-dispositions.sql`
   with the application deployment that reads it. It adds the append-only,
   service-role-only public-launch financial-event review trail. Do not apply
   the route before the migration.
   Apply `product-experience/supabase-v45-onboarding-verify-token.sql` before
   deploying the verification API. Attach that exact migration to the release
   ledger; other migration evidence does not satisfy the verification gate.
   Apply `product-experience/supabase-v47-financial-offboard-guard.sql` after
   the managed-credit tables exist and before permitting tenant offboarding.
   It prevents a tenant delete or truncate from cascading away credit history,
   including a row written after the operator preflight. This is a deletion
   guard, not a financial archive or an approved retention procedure.
6. Enable only `openai/gpt-4o-mini` on the private Cloud Run gateway. Keep
   video generation disabled.
7. Run the non-spending managed-provider health check first. Its only allowed
   fixture is `managed-openrouter-hc-20260831`, and it must remain disabled
   with zero credit. Run
   `product-experience/supabase-v34-managed-openrouter-health-canary-cleanup.sql`
   after recording its evidence. Then, only with
   the $4 cap evidence and explicit owner approval, use
   `product-experience/supabase-v34-managed-openrouter-paid-canary.sql`. It
   creates exactly one distinct $0.01 tenant wallet and starts health-gated;
   it is not reusable. Run one idempotent reserve/execute/settle/refund
   acceptance, disable the route, then run the paired exact cleanup SQL.
   Record the request ID, reservation ID, pricing snapshot ID, exact ledger
   outcome, remaining account balance metadata, and cleanup result.
   Revoke/disable the managed route immediately if anything differs from the
   recorded quote or cap policy.

## 3. Public product acceptance

Run the disposable test fixture before any live billing action. It requires
`STRIPE_MODE=test`, a Stripe `sk_test_` key, and
`STRIPE_TEST_FIXTURE_ENABLED=1`; the default fixture is 50¢ setup plus 50¢
monthly ($1 initial total per tenant). It never authorizes a live charge.
A separate billing-owner approval with a real total cap is still required for
the later live-mode Stripe smoke.

Before the live $2 setup/subscription fixture is replayed or refunded, the
operator must confirm that V44 is live. A `charge.refunded` event is classified
as managed credit only by a managed-credit plan reference. A refund with an
exact persisted public-launch setup payment reference is recorded as
`public_launch` plus a `review_required` disposition, returns `422`, and never
changes a wallet. An event without either proof also remains `422` and must
not be broadly acknowledged. The billing owner records one matching,
hash-bound review disposition through the operator-only webhook-review route;
Stripe must then redeliver the original signed event. Only that redelivery is
recorded as processed. Record only IDs, hashes, disposition, reviewer,
timestamp, and reconciliation outcome.

After deployment, the owner can generate a single test checkout link without
placing a secret in the command line by loading the operator secret into the
current shell and running `npm run approve:stripe-test-fixture -- --request-id
<uuid> --email <test-email> --approved-by <operator>`. The command refuses
anything except the explicit $1 test fixture and prints no secret.

After retaining the Test-mode webhook and idempotency evidence, remove the
fixture variables, restore the separately approved live Stripe configuration,
and deploy again. Test-mode evidence must never be recorded as a live-mode
payment result or used for the strict final attestation.

| Gate | Required evidence |
| --- | --- |
| Public journey | Consent-only intake, one-time email verification, human-reviewed final manifest hash matching the prepare run and deploy, queued provisioning, smoke test, activation, and offboarding. Legacy prepare runs without pinned hash evidence require manual review and a fresh authorized prepare. |
| Stripe | Signed webhook, duplicate-event idempotency, success path, failure path, and no customer amount or card data in evidence. |
| Provider catalog | Only reviewed/selectable providers appear; unreviewed and reference-only entries cannot execute. |
| BYOK lifecycle | Server-side validation, rotation, revocation, deletion, and proof that the browser/evidence contains no credential value. |
| Tenant isolation | Tenant A cannot read, execute, export, or delete Tenant B data; run the deletion/export/rollback drill. |
| Artifact member ownership | Apply `supabase-client-runtime-artifact-owner-guard.sql` before the client image. Prove uploader-only completion, uploader or producing-job requester deletion, and owner-scoped, unexpired delivery references with two members in one tenant. Verify denied calls leave object bytes untouched; direct RPC tests are required in addition to HTTP tests. |
| Notebook source references | Apply `supabase-client-notebook-source-reference-guard.sql` after the artifact owner guard. With two members and two tenants, prove a source cannot link another tenant's notebook, another member's artifact, an expired artifact, or a source lifetime longer than its artifact; include direct PostgREST insert/update tests. |
| Notebook draft provenance and retention | Apply `supabase-client-notebook-execution-sources.sql` after the notebook and runtime control-plane migrations. Prove queued Studio jobs contain only source IDs, content hashes, source links, and draft settings, never copied source text; the service-role-only worker RPC must require the matching running job, tenant worker token, active notebook scope, active records, and age under 45 days. Verify the worker compares fetched source hashes before any provider call and rejects expired, changed, archived, or cross-scope sources. This is a required hosted migration receipt; local SQL tests do not establish the hosted function or grant state. |
| Source-pack RPC isolation | Apply `supabase-client-runtime-source-pack-rpc-guard.sql` after the source graph and artifact lifecycle migrations. Internal beta shares the production Supabase project; this public-function migration is project-wide and needs explicit project-wide approval, not beta-only approval. Prove direct `authenticated` and `service_role` calls to the legacy and four-argument RPCs fail, a missing or wrong worker token fails, and a valid server-held token still cannot import through an expired artifact, overwrite another member's source-key memory, or cross tenants. Verify `CLIENT_WORKER_TOKEN` is Secret Manager-backed on the exact client revision, unavailable to browser code, and rotated if exposed. The release ledger queries the hosted function and grants through Supabase's read-only Management API and rechecks them on validation; a local SQL file hash alone is insufficient. The SQL cannot independently read GCS bytes; require the HTTP route's exact-byte review and hash check before its token-bearing RPC call. |
| Client runtime configuration | On the candidate Cloud Run revision, verify `CLIENT_ALLOWED_API_ROUTES` includes `/api/client-runtime/source-import` and `/api/client-runtime/build-identity`, source import has a Secret Manager-backed `CLIENT_WORKER_TOKEN`, `CLIENT_ALLOWED_ROUTES` exposes only approved client pages, and `CLIENT_RETENTION_DAYS` matches the approved 45-day customer-data policy. The provisioner now refuses deploy apply without Supabase anon and worker-token secret bindings and rejects plaintext worker tokens before a dry run can print them. The checked-in internal-beta manifest now sets 45-day retention and declares a `CLIENT_WORKER_TOKEN` Secret Manager reference, but the referenced secret version and matching tenant worker-token hash have not been verified or provisioned. The candidate still pins the September 26 image digest with no source-commit provenance; replace that image only after a clean, reviewed current-source build and digest receipt. It is not deploy-ready until image provenance, secret/hash, hosted schema, and exact API/page allowlists pass. The active `agentos-internal-beta-00034-v69` revision still runs with one-day retention, and its rendered Cloud Console configuration plus browser behavior fail the parity checks. Capture the exact revision and a redacted configuration receipt; do not treat a new image alone as parity. |
| Source publication-date metadata | Apply `supabase-client-runtime-source-pack-published-date.sql` after the source-pack RPC guard. Verify an imported date is visible in review, stored as `source_published_at`, updated on reimport, and rejected if malformed. The migration leaves the guarded public RPC and revoked legacy grants unchanged. |
| Client storage configuration | Bind the serving Cloud Run `status.url` and exact tenant/bucket to an exact 45-day tenant-prefixed Delete rule and reviewed versioning/soft-delete policy. Artifact bytes flow through authenticated same-origin proxy routes; bucket CORS is not a client access control. The release ledger requires a live Cloud Run plus bucket configuration receipt and rechecks it for drift. A passing receipt does not prove byte, backup, or vendor-copy deletion. |
| Retention and deletion | The owner selected 45 days from each customer-data item's creation. Apply and verify `supabase-v48-ecc-learning-retention-references.sql` before purging source jobs or records, so a younger learning item is detached rather than cascade-deleted. Apply and verify `supabase-client-notebook-source-retention.sql` before Notebook-source cleanup. The operator command checks the hosted service-role-only learning reference probe before any record purge; it fails closed if the migration is absent or the constraints drift. Learning cleanup requires `--confirm-retention-learning`; Notebook-source cleanup requires `--confirm-retention-sources`. Each selects at most 100 eligible items per run; repeat until no eligible batch remains, and review sources with missing or extended expiry or newer dependent chunks separately. Approve covered data classes and a separate financial-record schedule. Prove database, object, export, backup, and vendor-copy deletion with tenant-scoped post-deletion checks; an age inventory or partial cleanup alone does not pass. |
| Client workspace parity | Record the exact local commit and hosted Cloud Run revision/image digest. On a newly stamped image, read `/api/client-runtime/build-identity` as an authenticated tenant member and reconcile its reported commit and revision with the immutable image and deployment record; the endpoint alone is not an attestation. On that revision, signed-in Memory must show the consent-gated `Community sources` JSON import; default client navigation must omit operator-only Classroom/Social Research. Verify a reviewed source pack reaches tenant-scoped records and URL graph, then compare desktop/mobile behavior. The older internal-beta observation fails this gate. |
| Operations | Named owner, cost caps, alerts, dashboards, bounded-load and recovery test, and a known-good rollback revision. |
| Legal | Terms, privacy, consent, retention, support, and marketing/voice policies reviewed by the responsible owner. |

For the candidate, run the read-only configuration preflight with the reviewed
service, revision, image digest, and tenant. Set the variables to reviewed
values first. The script prints only identity and failure codes, never
environment values. A green result is a configuration check, not a signed-in
journey, source-SHA attestation, or deletion proof.

```sh
set -o pipefail
gcloud --account="$APPROVED_GCP_ACCOUNT" --quiet run services describe "$SERVICE" \
  --project "$PROJECT" --region "$REGION" --format=json |
  node scripts/verify-client-runtime-config.mjs \
    --service "$SERVICE" --expected-revision "$REVISION" \
    --expected-image-digest "$IMAGE_DIGEST" --tenant "$TENANT_SLUG" \
    --expected-provider-calls disabled
```

The preflight requires runtime authentication enforcement and checks the
provider-call setting against this explicit expectation. Keep it `disabled`
for internal beta; use `enabled` only for a separately reviewed client whose
provider, model, budget, and credential allowlists have been verified.

## 4. External integration release rules

- **OpenReply:** remain disabled until the selected upstream commit has no
  critical/high production advisories, its own test/typecheck/audit evidence is
  retained, and the Meta/Instagram pilot has explicit consent and human reply
  approval. No customer data is sent to it before that point.
- **VoxCPM:** remain private and disabled until license, GPU cost/performance,
  voice consent, retention/deletion, disclosure, and rollback tests pass.
- **Ponytail/Headroom:** remain engineering controls only. Do not introduce a
  runtime plugin or a context proxy that can receive tenant secrets.
- **Personal video Content OS:** remain a manual pilot until the owner has
  supplied a portfolio brief, likeness/voice consent scope, an approved script
  and visual plan, provider-specific terms/cost controls, disclosure review,
  retention/deletion evidence, and a native-publishing acceptance record. Do
  not connect Gemini Flow/Veo, HeyGen, ElevenLabs, or a social account as part
  of a general product release.

## 5. Final attestation

After every preceding row has real evidence, publish it to the release
evidence ledger, then validate the current commit against what was published.
Run `npm run verify:ai-evaluation` on the clean, committed release candidate
before publishing. The resulting `tmp/ai-release-local-v1-report.json` must
match that commit and the versioned fixture; the ledger stores this receipt and
refuses an AI approval without it. Rerun after any source change. This local
receipt covers eleven deterministic cases only: it does not replace hosted job,
ledger, trace, model-quality, or customer-journey evidence for
`--ai-engineering-result passed`.
The public-journey gate also requires `--customer-journey-report` when publishing.
That redacted JSON receipt must have `schemaVersion: 1`, the exact clean
`sourceCommit`, `environment`, `vercelDeployment`, `cloudRunRevision`,
`imageDigest`, an ISO `checkedAt`, and exactly one passed case for each
`J01` through `J15` in the customer-journey matrix. Each case needs at least
one `evidence` entry with a private `gs://` or redacted `docs/evidence/` `ref`
and its 64-hex `sha256`. Every case must include exactly one entry with
`kind: "case-attestation"` and at least one separate `kind: "artifact"` entry.
The attestation
is redacted JSON with `schemaVersion: 1`, the matching `caseId`, `status:
"passed"`, the same source/deployment identity, an ISO `checkedAt` no later
than the report, a named `reviewedBy`, and `observations` recording `checkId`,
`action`, `observed`, and `result: "passed"`. The required `checkId` values for
each J-row are defined in `scripts/lib/customer-journey-evidence.mjs`; they
cover the positive and failure paths from the matrix. Record each required
check once with its own observed result, and attach redacted test output,
deployment evidence, or a review record as the hashed artifact. The verifier
checks this structure
and reads each referenced artifact (at most 1 MB) to verify its hash. Private
`gs://` receipts require read access and may incur Cloud Storage request costs;
do not run this against an unreviewed bucket or billing project. Hash validity
does not prove that an observation satisfies its J-row: the named reviewer must
inspect the receipts and avoid putting customer content or secrets in the
report. The attestation is a review record, not an automated proof that the
observation happened. A plain `--public-journey-result passed` is insufficient.
Do not use placeholder values or mark a missing test as passed — the ledger
accepts a partial record, but `--strict` will fail loud on anything still
missing rather than let it through. See
[`docs/release-evidence-ledger-runbook.md`](release-evidence-ledger-runbook.md)
for the one-time bucket/IAM setup this depends on.

For hosted source-import verification, create a short-lived [scoped Supabase
personal access token](https://supabase.com/docs/guides/platform/personal-access-tokens)
restricted to the exact project with Database (Read) permission. Set it
privately as `VELOCE_SUPABASE_READ_ONLY_TOKEN`; do not put it on the command
line, in chat, or in the ledger. Publication and strict verification use
Supabase's [read-only query endpoint](https://supabase.com/docs/reference/api/v1-read-only-query)
to check the installed guard body and role grants. That endpoint is beta; an
unavailable endpoint or token fails the gate closed. The Cloud Run revision's
`SUPABASE_URL` must identify the same project. This catalog receipt does not
replace signed-in two-member import tests or permission to change the shared
production database.

```bash
npm run publish:release-ledger -- \
  --ledger-bucket <reviewed-ledger-bucket> \
  --impersonate-service-account <reviewed-ledger-writer-service-account> \
  --environment production \
  --vercel-deployment <reviewed-deployment-id> \
  --cloud-run-revision <reviewed-revision> \
  --image-digest sha256:<reviewed-image-digest> \
  --client-cloud-project <reviewed-project> \
  --client-cloud-region <reviewed-region> \
  --client-cloud-service <reviewed-service> \
  --client-storage-bucket <reviewed-client-bucket> \
  --client-storage-namespace <tenant-slug> \
  --supabase-project-ref <reviewed-supabase-project-ref> \
  --migration-file product-experience/supabase-v45-onboarding-verify-token.sql \
  --migration-file product-experience/supabase-v46-onboarding-setup-token.sql \
  --migration-file product-experience/supabase-v47-financial-offboard-guard.sql \
  --migration-file product-experience/supabase-client-runtime-source-pack-graph.sql \
  --migration-file product-experience/supabase-client-runtime-source-pack-rpc-guard.sql \
  --migration-file product-experience/supabase-client-runtime-source-pack-published-date.sql \
  --migration-file product-experience/supabase-client-runtime-record-retention.sql \
  --migration-file product-experience/supabase-client-runtime-artifact-owner-guard.sql \
  --migration-file product-experience/supabase-client-notebook-source-reference-guard.sql \
  --migration-file product-experience/supabase-client-notebook-execution-sources.sql \
  --rollback-cloud-run-revision <known-good-revision> \
  --rollback-vercel-deployment <known-good-deployment-id> \
  --customer-journey-report <reviewed-redacted-journey-report.json> \
  --public-journey-result passed \
  --stripe-smoke-result passed \
  --provider-catalog-result passed \
  --byok-lifecycle-result passed \
  --tenant-isolation-result passed \
  --source-import-result passed \
  --ui-parity-result passed \
  --buyer-simulation-result passed \
  --buyer-simulation-dir <private-reviewed-mirofish-run-dir> \
  --ai-engineering-result passed \
  --managed-openrouter-result passed \
  --operations-approval approved \
  --legal-approval approved \
  --test-result focused=passed

npm run verify:production-readiness -- --strict --ledger-bucket <reviewed-ledger-bucket> --out tmp/production-release-evidence.json
```

The only acceptable final result is `releaseReady: true` with a clean source
tree and a redacted evidence artifact validated against the published ledger
record (`ledgerRecordUsed` in the output points at the exact `gs://` object
used).
