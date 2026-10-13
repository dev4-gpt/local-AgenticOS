# Live Workspace Check, October 13, 2026

This is a signed-in, read-only browser check of four AgentOS runtimes. It does
not establish that they share a tenant, database, source revision, or release
configuration.

| Runtime | Observed surface | Result |
| --- | --- | --- |
| Local client | `http://127.0.0.1:3941/memory` | Loaded 2 tenant memories and a graph with 114 nodes / 113 edges. `Community sources` and `Review JSON source packs` are present. |
| Cloud Test (mquo4bf7aq) | `https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/memory` | Loaded 24 tenant memories and a graph with 33 nodes / 57 edges. Community source-pack controls are absent. |
| Cloud Test (1075094991117) | `https://veloce-cloud-test-1075094991117.asia-south1.run.app/notebook` | Loaded 9 notebook records and 9 active sources. This is a separate Cloud Run deployment. |
| Internal Beta | `https://agentos-internal-beta-vbimnfseva-ew.a.run.app/memory` | Loaded 2 tenant memories and a graph with 114 nodes / 113 edges. It is distinct from both Cloud Test deployments. |

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
