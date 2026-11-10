# Hosted Parity Observation - 2026-10-13

Source checkout: `29d9051270c622f8f84c4f8b601b9cc674711fb3`.
All requests below were unauthenticated, read-only GETs. No cookie, tenant
mutation, provider call, or deployment was used.

| Runtime | `/login` | `/memory` | `/api/client-runtime/build-identity` |
| --- | --- | --- | --- |
| Local `127.0.0.1:3941` | 200 | 307 to `/login` | 401 `not_authenticated` |
| Cloud Test `veloce-cloud-test-mquo4bf7aq-el.a.run.app` | 200 | 307 to `/login` | 403 `client_route_not_enabled` |
| Internal Beta `agentos-internal-beta-vbimnfseva-ew.a.run.app` | 200 | 307 to `/login` | 403 `client_route_not_enabled` |

This confirms the login and unauthenticated memory-route behavior is aligned,
but does not prove the signed-in customer journey, same-user data parity, or
feature parity. The local identity route exists but requires authentication;
both hosted identity routes are disabled, so the deployed source revision and
image digest cannot be attested through this API. Cloud Test and Internal Beta
remain separate runtimes and must not be conflated.

The checked-in Internal Beta candidate manifest keeps provider calls disabled
and sets application retention to 45 days. The last recorded live service
inventory (2026-10-10) showed one-day retention and no source-import route. The
current GET confirms build identity is still disabled, but this check did not
read the live retention setting or bucket lifecycle. Cloud Storage metadata
access was denied to the active account during the separate cost check, so the
45-day plus seven-day soft-delete cost/deletion behavior remains unverified.

Do not treat these route checks as release acceptance. Keep deployment on hold
until live retention and bucket policy are read back, costs are estimated from
actual usage, and the owner approves a controlled candidate rollout. Then
repeat signed-in parity and verify the new revision/image identity before
recording hosted acceptance evidence.

## Follow-up - Signed-in Memory Surface in Existing Chrome Tabs

Observed read-only on the AgentOS checkout at `f901b8bd9d94f07be2deff25014114b2048c6e57`.
The existing Chrome Work profile had an open Cloud Test `/memory` tab that
rendered tenant records. The local `127.0.0.1:3941/memory` tab also rendered
tenant records. No user email, auth token, account ID, or tenant ID was inspected;
this does not establish that the two tabs resolve to the same member or tenant.

Both screens had the same overall Memory-page layout and navigation. The data
and available controls differed:

| Runtime | Tenant memories | Graph nodes | Graph edges | Community source-pack controls |
| --- | ---: | ---: | ---: | --- |
| Local `127.0.0.1:3941` | 2 | 114 | 113 | Present (`Review JSON source packs`) |
| Cloud Test `veloce-cloud-test-mquo4bf7aq-el.a.run.app` | 24 | 33 | 57 | Not present |

Thus the shared visual structure is not full functional or data parity. The
local graph counts also differ substantially despite fewer visible tenant
memories; that may reflect graph scope or stale data, and was not investigated
with tenant writes.

The Cloud Test build-identity endpoint returned `client_route_not_enabled`.
Local `3941` reported source commit `8b2b3ee7bbfa994564f6a7f802c1d965bc2e1500`;
a second existing local runtime on `3942` reported
`16c25a2eaeaba59c8e9bf455784ec89c161ef3b6`. Both responses explicitly label
their identity as runtime-reported, not an independent attestation; both SHAs
are ancestors of the current `f901b8b` checkout. Neither local response
reported a Cloud Run revision. These signals cannot establish which exact
source or image is serving Cloud Test. Both local processes' working directories
were the current AgentOS checkout. Comparing the reported SHAs with current
`src/` shows later changes to the source-import route, its upload route, the
source-import component, and client storage; the `3942` stamp predates the
storage-proxy commit. Because these local servers may hot-reload files from the
shared checkout, the old stamp alone does not prove their active UI bundle is
stale. The source-import upload path itself was not invoked in this browser
check, so its active runtime behavior remains unverified here.

No records, settings, credentials, or cloud resources were changed. No import,
provider call, or deployment was performed. Reconcile tenant identity and
runtime provenance, then deploy only through an approved controlled rollout;
parity and the customer journey remain unaccepted.

## Follow-up - Designated Chrome Window, 2026-10-13

The AgentOS/Vercel Chrome window was selected explicitly from Chrome's Window
menu after the foreground window was found to be a separate GitHub/Gemini
window. Only existing tabs in the designated AgentOS window were inspected.

| Runtime/tab | Visible memory state | Source-pack UI | Identity signal |
| --- | --- | --- | --- |
| Local `127.0.0.1:3941/memory` | 2 memories, 114 nodes, 113 edges | `Review JSON source packs` is present; the two visible records show 84 and 27 source links | `/api/client-runtime/build-identity` reports source commit `8b2b3ee7bbfa994564f6a7f802c1d965bc2e1500`, explicitly not an independent attestation |
| Internal Beta `agentos-internal-beta-vbimnfseva-ew.a.run.app/memory` | 2 memories, 114 nodes, 113 edges | No JSON source-pack control; Markdown import/export only | `/api/client-runtime/build-identity` returns `client_route_not_enabled` |
| Cloud Test `veloce-cloud-test-mquo4bf7aq-el.a.run.app/memory` | 24 memories, 33 nodes, 57 edges | No JSON source-pack control; Markdown import/export only | `/api/client-runtime/build-identity` returns `client_route_not_enabled` |
| Legacy Cloud Test `veloce-cloud-test-1075094991117.asia-south1.run.app/notebook` | 9 notebook records, 9 active sources | Not evaluated for source-pack import | Separate legacy runtime; do not conflate with the current Cloud Test or Internal Beta |

The equal local/Internal Beta counts do not prove that they resolve to the same
tenant or that the imported records are identical. Account and tenant IDs were
not inspected. Cloud Test data differs materially. The local JSON review
control is still not present on either hosted runtime, and the authorized
56-PDF v6 classroom pack has not been imported through the hosted route.

All observations were read-only. No record, setting, credential, or cloud
resource was changed; no import, provider call, migration, deployment, or
release publication was performed.

## Follow-up - Source Import Candidate Versus Live Beta

The checked-in `client-blueprints/agentos-internal-beta.gcp.json` enables both
`tenant-data` and `artifacts`, and the GCP provisioner includes
`/api/client-runtime/source-import` in `CLIENT_ALLOWED_API_ROUTES`. The source
import handlers are gated by the `artifacts` capability. Thus, the checked-in
candidate configuration is sufficient to expose the route when provisioned
from a compatible image; adding a new capability name is not the missing
change.

The live Internal Beta and Cloud Test endpoints still return
`client_route_not_enabled` for build identity, and Internal Beta does not show
the JSON source-pack review control. This is evidence that the live runtime is
not yet verified against the checked-in candidate, but it does not identify
the exact deployed image or configuration. The candidate manifest pins image
digest `sha256:70d24863d095aa9753cf02629a30458f7fdd8ef81bfc5ed2ce35e2c0ed16da57`;
no live service readback was performed in this follow-up. Keep deployment on
hold until the candidate image is confirmed to contain the storage-proxy
implementation, the live service configuration and revision can be attested,
and the existing recovery-window policy is reconciled with the requested
45-day retention. Do not infer hosted import readiness from the manifest
alone.

This configuration review was local and read-only. No deployment, cloud
configuration change, import, provider call, or tenant write was performed.

## Follow-up - Internal Beta Revision Readback

Read the existing Cloud Run revision detail in the already-open Google Cloud
Console tab for project `agentos-mvp`. The revision shown is
`agentos-internal-beta-00034-v69`, created `2026-09-26T16:28:31.829772Z`. Its
image digest is the same digest pinned by the checked-in Internal Beta
manifest: `sha256:70d24863d095aa9753cf02629a30458f7fdd8ef81bfc5ed2ce35e2c0ed16da57`.
The revision configuration shows tenant slug `internal-beta`, provider calls
disabled, capabilities `tenant-data,artifacts,orchestration,quality`, and
`CLIENT_RETENTION_DAYS=1`; the manifest currently specifies 45 days. The
revision-detail page alone does not prove that this revision currently receives
100% of service traffic, so deployment identity and traffic allocation still
need a service-level readback.

This readback explains a concrete live/candidate discrepancy, but does not
justify deploying. Keep the existing hold: reconcile the 45-day application
retention with the bucket's seven-day recovery window and cost/deletion
semantics first, then verify the source-import image and service traffic under
an approved controlled rollout. No setting was changed.
