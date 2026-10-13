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
