# Release-evidence ledger deployment runbook

**Historical configuration only.** This runbook names `veloce-agenticos-2026`,
which is not a currently verified release target. Do not run its bucket or IAM
commands until project ownership, billing, writer identity, and the intended
ledger bucket have been freshly reviewed. The current verifier has no default
bucket; pass `--ledger-bucket <reviewed-ledger-bucket>` explicitly for both
publication and strict validation.

This runbook creates the one-time, org-wide infrastructure for the release
evidence ledger. It is a singleton, like the provisioner service accounts and
the `veloceTenantProvisioner` role in
[`docs/control-plane-provisioner-runbook.md`](control-plane-provisioner-runbook.md)
— set up once by hand, not by an idempotent per-tenant script.

## Preconditions

- Project: `veloce-agenticos-2026`
- Region: `asia-south1`
- Run all commands with a human Google account that can manage IAM and
  Cloud Storage (`aryamandev777@gmail.com` holds Owner on this project).

## 1. Create the bucket: private and versioned

```bash
gcloud storage buckets create gs://veloce-agenticos-2026-veloce-release-ledger \
  --project veloce-agenticos-2026 --location asia-south1 --uniform-bucket-level-access

gcloud storage buckets update gs://veloce-agenticos-2026-veloce-release-ledger --versioning
gcloud storage buckets update gs://veloce-agenticos-2026-veloce-release-ledger --public-access-prevention
```

Object versioning is genuinely new to this project — no other bucket in this
repo enables it. It exists here because a release-evidence record must never
be silently overwritten; the upload path also enforces this at write time
(see step 3).

## 2. Create the writer identity and its custom role

The reviewable role source is
[`iam/veloce-release-ledger-writer-role.yaml`](../iam/veloce-release-ledger-writer-role.yaml).
It deliberately excludes `storage.objects.delete` — this is what makes the
ledger append-only, not just convention.

```bash
gcloud iam service-accounts create veloce-release-ledger-writer \
  --project veloce-agenticos-2026 --display-name="Veloce release ledger writer"

gcloud iam roles create veloceReleaseLedgerWriter \
  --project veloce-agenticos-2026 --file iam/veloce-release-ledger-writer-role.yaml

gcloud storage buckets add-iam-policy-binding gs://veloce-agenticos-2026-veloce-release-ledger \
  --member=serviceAccount:veloce-release-ledger-writer@veloce-agenticos-2026.iam.gserviceaccount.com \
  --role=projects/veloce-agenticos-2026/roles/veloceReleaseLedgerWriter
```

Approved human operators impersonate the writer service account rather than
holding a static key for it:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  veloce-release-ledger-writer@veloce-agenticos-2026.iam.gserviceaccount.com \
  --project veloce-agenticos-2026 \
  --member=user:aryamandev777@gmail.com --role=roles/iam.serviceAccountTokenCreator
```

A CI service account can be granted the same `iam.serviceAccountTokenCreator`
binding once deploys are automated (Phase 2) — out of scope for now, since
this repo has no deploy automation yet.

## 3. Grant read access to operators running the verifier

No custom role is needed for reading; the predefined
`roles/storage.objectViewer` is already minimal (get/list, no write/delete):

```bash
gcloud storage buckets add-iam-policy-binding gs://veloce-agenticos-2026-veloce-release-ledger \
  --member=user:aryamandev777@gmail.com --role=roles/storage.objectViewer
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
tenant, routes, worker-token Secret Manager reference, CORS, and 45-day object
policy, and stores only a redacted verdict and configuration hashes. Strict
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
