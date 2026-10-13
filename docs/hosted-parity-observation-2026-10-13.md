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
