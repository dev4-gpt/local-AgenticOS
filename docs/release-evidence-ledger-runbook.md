# Release-evidence ledger deployment runbook

**The release-ledger bucket exists and is configured, but its use for a new
release record still requires explicit release authorization.** The owner
selected `veloce-agenticos-2026` for read-only inspection on 2026-10-14. Do
not create resources, change IAM, deploy, or publish a record based only on
that inventory. The verifier has no default bucket; pass
`--ledger-bucket <reviewed-ledger-bucket>` explicitly when performing an
authorized verification or publication.

## Current read-only inventory (2026-10-14)

- `veloce-agenticos-2026` (`Veloce AgenticOS`): owner-confirmed for read-only
  inspection. Existing bucket
  `veloce-agenticos-2026-veloce-release-ledger` is in `ASIA-SOUTH1`; existing
  `releases/<commit>/` prefixes were listed. Uniform bucket-level access,
  public access prevention, and object versioning are enabled. The bucket has
  a seven-day soft-delete recovery window.
- The custom `veloceReleaseLedgerWriter` role includes only
  `storage.objects.create`, `storage.objects.get`, and `storage.objects.list`.
  The bucket policy also includes project owner/editor legacy bindings and
  grants `roles/storage.objectViewer` to `aryamandev777@gmail.com`. The writer
  service account's Token Creator binding includes that user and
  `veloce-ci-deployer-production@veloce-agenticos-2026.iam.gserviceaccount.com`.
- `agentos-mvp` and `Veloce Ai` were not used for this inspection. No billing,
  bucket, IAM, object, or deployment setting was changed. Inspection does not
  establish that a particular release is ready or authorize publication.

The bucket is an existing candidate, so creation and billing enablement are
not required for ledger access. Review the intended release and its evidence
before publishing. A missing record for a commit remains a release blocker;
it is not permission to publish an incomplete record.

This runbook creates the one-time, org-wide infrastructure for the release
evidence ledger. It is a singleton, like the provisioner service accounts and
the `veloceTenantProvisioner` role in
[`docs/control-plane-provisioner-runbook.md`](control-plane-provisioner-runbook.md)
— set up once by hand, not by an idempotent per-tenant script.

## Preconditions

After the owner selects the target, replace these placeholders only with
values verified in that project's console:

- `<PROJECT_ID>`: reviewed GCP project ID
- `<LEDGER_BUCKET>`: reviewed globally unique bucket name
- `<REGION>`: reviewed storage region
- `<WRITER_SERVICE_ACCOUNT>`: reviewed writer identity
- `<OPERATOR_IDENTITY>`: approved operator identity

Confirm the project and billing status directly before running any setup
command. The commands below are templates, not approval to incur charges or
change IAM.

## 1. Create the bucket: private and versioned

```bash
gcloud storage buckets create gs://<LEDGER_BUCKET> \
  --project <PROJECT_ID> --location <REGION> --uniform-bucket-level-access

gcloud storage buckets update gs://<LEDGER_BUCKET> --versioning
gcloud storage buckets update gs://<LEDGER_BUCKET> --public-access-prevention
```

Object versioning prevents release-evidence records from being silently
overwritten; the upload path also enforces create-only writes (see step 3).

## 2. Create the writer identity and its custom role

The reviewable role source is
[`iam/veloce-release-ledger-writer-role.yaml`](../iam/veloce-release-ledger-writer-role.yaml).
It deliberately excludes `storage.objects.delete` — this is what makes the
ledger append-only, not just convention.

```bash
gcloud iam service-accounts create <WRITER_SERVICE_ACCOUNT> \
  --project <PROJECT_ID> --display-name="Veloce release ledger writer"

gcloud iam roles create veloceReleaseLedgerWriter \
  --project <PROJECT_ID> --file iam/veloce-release-ledger-writer-role.yaml

gcloud storage buckets add-iam-policy-binding gs://<LEDGER_BUCKET> \
  --member=serviceAccount:<WRITER_SERVICE_ACCOUNT>@<PROJECT_ID>.iam.gserviceaccount.com \
  --role=projects/<PROJECT_ID>/roles/veloceReleaseLedgerWriter
```

Approved human operators impersonate the writer service account rather than
holding a static key for it:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  <WRITER_SERVICE_ACCOUNT>@<PROJECT_ID>.iam.gserviceaccount.com \
  --project <PROJECT_ID> \
  --member=<OPERATOR_IDENTITY> --role=roles/iam.serviceAccountTokenCreator
```

A CI service account can be granted the same `iam.serviceAccountTokenCreator`
binding once deploys are automated (Phase 2) — out of scope for now, since
this repo has no deploy automation yet.

## 3. Grant read access to operators running the verifier

No custom role is needed for reading; the predefined
`roles/storage.objectViewer` is already minimal (get/list, no write/delete):

```bash
gcloud storage buckets add-iam-policy-binding gs://<LEDGER_BUCKET> \
  --member=<OPERATOR_IDENTITY> --role=roles/storage.objectViewer
```

## Object layout

Records are stored under `releases/<full-40-char-commit-sha>/<compact-ISO8601-timestamp>.json`,
e.g. `releases/0cf0ac2.../20260904T031500Z.json`. This groups every record for
a commit under one prefix (`gcloud storage ls gs://<bucket>/releases/<sha>/`
finds them all; the lexicographically-latest name is also the chronologically
latest, since the timestamp is compact ISO-8601). Publishing uses
`--if-generation-match=0`, which fails the upload if an object already exists
at that exact path — belt-and-suspenders with the writer role's missing
delete permission, so two publish attempts for the same commit never collide
silently; each gets its own timestamped object instead.

**Why no pointer file in `docs/`:** the SHA-keyed object path plus the
`source.commit` field inside each record is the link back to Git — that is
sufficient and verifiable from any checked-out commit with one `gcloud
storage ls` call. A synced pointer file in `docs/` would recreate exactly the
"does docs/ match reality" drift problem that the hand-written markdown
ledgers this work replaces already have
(`docs/client-runtime-release-ledger.md`,
`docs/production-release-evidence-2026-09-02.md`).

## Usage

Publish a new record (see `npm run publish:release-ledger -- --help`-style
flags documented at the top of `scripts/verify-production-readiness.mjs`, or
[`docs/production-release-acceptance-checklist.md`](production-release-acceptance-checklist.md)
for the full flag list used at release time):

```bash
npm run publish:release-ledger -- \
  --ledger-bucket <reviewed-ledger-bucket> \
  --impersonate-service-account <reviewed-ledger-writer-service-account> \
  --environment production \
  --vercel-deployment <deployment-id> \
  --cloud-run-revision <revision> \
  --image-digest sha256:<digest> \
  --client-cloud-project <reviewed-project> \
  --client-cloud-region <reviewed-region> \
  --client-cloud-service <reviewed-service> \
  --client-storage-bucket <reviewed-client-bucket> \
  --client-storage-namespace <tenant-slug> \
  --migration-file product-experience/supabase-v45-onboarding-verify-token.sql \
  --migration-file product-experience/supabase-v46-onboarding-setup-token.sql \
  --migration-file product-experience/supabase-v47-financial-offboard-guard.sql \
  --migration-file product-experience/supabase-client-runtime-source-pack-graph.sql \
  --migration-file product-experience/supabase-client-runtime-source-pack-rpc-guard.sql \
  --migration-file product-experience/supabase-client-notebook-execution-sources.sql \
  --rollback-cloud-run-revision <known-good-revision> \
  --source-import-result passed \
  --ui-parity-result passed \
  --buyer-simulation-result passed \
  --buyer-simulation-dir <private-reviewed-mirofish-run-dir> \
  --ai-engineering-result passed \
  --test-result focused=passed
```

Use `--client-cloud-account <already-configured-reader-email>` only when the
default `gcloud` account cannot read the reviewed project. Publication reads
the Cloud Run service and bucket directly, checks the serving revision/digest,
tenant, routes, worker-token Secret Manager reference, CORS, and 28-day object
policy plus seven-day recovery, and stores only a redacted verdict and configuration hashes. Strict
verification re-reads both resources and fails if their relevant configuration
has drifted. This is a configuration receipt, not proof of source-image commit,
object-byte deletion, backup cleanup, or the signed-in customer journey.

The buyer-simulation result requires the retained run's private
`buyer_review.json`. Publishing replays the offline MiroFish auditor, hashes its
inputs before and after the replay, and records only allowlisted counts, pass
checks, and SHA-256 digests in the ledger. A completed run without a positive
review for every dynamic post fails `buyer_pilot_evidence`. The ledger does not
contain generated post text; retain the private run artifacts separately for
review. This is synthetic pilot evidence, not market validation.

Then validate the current commit against whatever was published:

```bash
npm run verify:production-readiness -- --ledger-bucket <reviewed-ledger-bucket>            # non-strict: reports gaps, exits 0
npm run verify:production-readiness -- --strict --ledger-bucket <reviewed-ledger-bucket> # strict: fails on any gap
```

If no ledger record exists yet for the current commit, both modes report
`release_ledger_record_missing` (as a warning in non-strict mode, as a hard
failure under `--strict`) rather than silently trusting anything.
The output also lists ledger-backed checks under `notEvaluated`; they are
unknown, not passed, even if local source checks ran. In the ordinary
no-bucket check, `ledger_bucket_not_configured` is the blocking failure and
the ledger-backed checks remain unevaluated. Only a published record bound to
the current commit can clear that uncertainty.
