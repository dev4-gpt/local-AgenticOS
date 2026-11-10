# Live Workspace Check, October 13, 2026

This is a signed-in, read-only browser check of four AgentOS runtimes. It does
not establish that they share a tenant, database, source revision, or release
configuration.

| Runtime | Observed surface | Result |
| --- | --- | --- |
| Older local client | `http://127.0.0.1:3941/memory` | Loaded 2 tenant memories and a graph with 114 nodes / 113 edges. `Community sources` and `Review JSON source packs` are present. The permission-controlled batch UI showed 0/1 imported (19 sources / 259 links) and a storage-access error. The authenticated build-identity route self-reported commit `8b2b3ee7bbfa994564f6a7f802c1d965bc2e1500`. |
| Current local checkout | `http://127.0.0.1:3952/memory` | Started from clean checkout `872bcc5d0defca907d78f22e8898e8d0f73fa352` with provider calls disabled. The existing Chrome session loaded 2 memories and 114 nodes / 113 edges, and the source-pack controls rendered. No batch was selected and no upload/import was attempted. The authenticated build-identity route self-reported the same commit; the endpoint explicitly does not independently attest the runtime image. |
| Cloud Test (mquo4bf7aq) | `https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/memory` | Loaded 24 tenant memories and a graph with 33 nodes / 57 edges. Community source-pack controls are absent. |
| Cloud Test (1075094991117) | `https://veloce-cloud-test-1075094991117.asia-south1.run.app/notebook` | Loaded 9 notebook records and 9 active sources. This is a separate Cloud Run deployment. |
| Internal Beta | `https://agentos-internal-beta-vbimnfseva-ew.a.run.app/memory` | Fresh signed-in view loaded 2 tenant memories and a graph with 114 nodes / 113 edges. Community source-pack controls are absent. It is distinct from both Cloud Test deployments. |

The Cloud Test `mquo4bf7aq` runtime returned `client_route_not_enabled` for
`/api/client-runtime/build-identity`, so its source commit and image digest
could not be verified from the signed-in application. UI differences and
record counts alone do not prove that deployments use different source code.
The two local build IDs above are runtime-reported metadata, not independent
image attestations.

The two local/Internal Beta records are the existing bonus-link index records,
with 27 and 84 outbound links. This is not a full classroom export. The
different record counts across runtimes do not prove data loss or shared-tenant
parity; tenant and build identities are still required.

## Source-Pack Review

The prepared May 11-30 pack at `/private/tmp/agentos-may11-30-source-pack.json`
contains 19 source sections across 10 unique pages and 259 links. It records
four review warnings: four credential-like matches redacted, one PDF URL
annotation unavailable in the text extraction, 11 local/private/invalid URL
occurrences omitted, and one discovered page still uncollected. The pack is
therefore partial and must not be described as the whole Skool archive.

In the local Memory UI, selecting the pack showed the expected manifest totals.
After confirming the per-batch permission checkbox, **Review batch** returned
the UI error that the workspace could not access file storage. The request did
not reach source preview/import; the UI remained at 0 of 1 batches imported.
No source memories or graph nodes were added. The UI currently maps both
`storage_identity_unavailable` and `signed_upload_unavailable` to that same
message, so the exact failure branch was not established by the browser view.

Existing local identity evidence in
`docs/community-source-pack-import.md` records that the local Google identity
could not call `iam.serviceAccounts.signBlob` for the runtime service account,
and the bucket CORS policy allows the hosted origin, not localhost. Do not
broaden IAM or bucket access as a workaround without a narrowly scoped,
approved change. The cloud import remains separately gated by hosted route,
worker-token, and migration evidence.

No deployment, migration, provider request, or successful source import was
performed during this check.

## Same-Profile Follow-Up

A later read-only check in the existing Chrome profile found:

| Runtime | Follow-up observation |
| --- | --- |
| Existing local preview (`127.0.0.1:3952`) | The signed-in memory page loaded 2 tenant memories and 114 nodes / 113 edges, with community-source controls. Its authenticated build-identity route reported `872bcc5d0defca907d78f22e8898e8d0f73fa352`, older than the current source checkout. This process was left untouched. |
| Current source preview (`127.0.0.1:3953`) | Started temporarily from the current checkout with provider calls disabled. The signed-in memory page loaded 2 tenant memories and 114 nodes / 113 edges, with community-source controls. Its authenticated route reported `c12a300cf0e72d315ec40ad2ded89db3d49419a9`; this is runtime-reported metadata, not independent image attestation. The temporary server was stopped after verification. |
| Cloud Test (`veloce-cloud-test-mquo4bf7aq`) | In the same Chrome profile, the memory page loaded 0 memories and 0 graph nodes / edges and did not show community-source controls. The build-identity route returned `client_route_not_enabled`. |
| Internal Beta (`agentos-internal-beta-vbimnfseva-ew`) | A fresh navigation redirected to `/login?next=%2Fmemory`. No credentials were entered and no current memory or UI comparison was made; the earlier October 13 observation is not a current-session result. |

The same browser profile does not prove the local and Cloud Test sessions refer to
the same member or tenant. Therefore the empty Cloud Test graph is an observed
configuration/data difference, not evidence of data loss. Cloud Test still has
no independently verified source revision or image digest, and source-import
parity remains unproven. No records were changed, no import was attempted, and
no provider, storage, database-write, or deployment action was performed.

## Internal Beta Runtime Follow-Up

The signed-in Internal Beta view was refreshed after the earlier reauthentication
gate. It still shows 2 memories and 114 graph nodes / 113 edges, but unlike the
current source preview it does not expose community source-pack controls. Its
authenticated `/api/client-runtime/build-identity` route returns
`client_route_not_enabled`; the application cannot attest its own source revision.

Read-only Cloud Run console inspection identified service `agentos-internal-beta`
in `agentos-mvp/europe-west1`, revision `agentos-internal-beta-00034-v69`,
image digest `sha256:70d24863d095aa9753cf02629a30458f7fdd8ef81bfc5ed2ce35e2c0ed16da57`.
The console had no build or source metadata. The selected revision is request-billed,
with 1 vCPU, 1 GiB memory, concurrency 1, a 900-second timeout, and a maximum of
one instance. Its environment reports `CLIENT_RUNTIME_WORKER_ENABLED=0`,
`CLIENT_PROVIDER_CALLS_ENABLED=0`, and `CLIENT_RETENTION_DAYS=1`. A console YAML
search found no `source-import` setting. Minimum-instance configuration, billing
actuals, and the bucket's effective lifecycle/recovery policy were not verified.

Matching the local/Internal Beta memory and graph counts does not prove they use
the same database, account, or source revision. The one-day runtime setting
contradicts the selected 45-day per-item retention policy. Treat this as a
release-blocking configuration mismatch; do not accept customer uploads or claim
hosted source-import parity until the policy, deployed route/worker, and storage
retention behavior are reconciled and verified. No deployment, migration,
database/storage write, import, or provider request was made during this follow-up.
