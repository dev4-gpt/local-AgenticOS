# Verification Refresh: `dc91aec`

Date: 2026-10-10  
Source tested: `dc91aec70b6903818088f19747470a851b1006ef`  
Branch: `wip/backup-2026-10-03`, clean and pushed at verification time.

## Local Checks

- `npm run test:focused`: 343 passed, 1 optional private-input test skipped, 0 failed (344 total).
- `npm run verify:security`: passed. Its lifecycle and retention suite passed 22/22; notebook execution provenance passed 19/19; runtime/storage config fixtures passed 10/10; static provider, security, and integration-governance checks passed.
- Observability and trace accuracy specs: 13/13 passed. Desktop/mobile observability UI specs: 6/6 passed using isolated Chrome, not the user's signed-in profile.
- `npm run verify:ai-evaluation` under Node `v24.19.0`: 14/14 deterministic cases passed, zero model samples, `productionReady: false`.
- `VELOCE_DIST_DIR=.next-candidate npm run build` under Node `v24.19.0`: production build passed and generated 66 static pages. Route output included `/api/client-runtime/source-import` and `/api/client-runtime/build-identity`. Existing warnings: two Edge-runtime `process.cwd()` warnings from Next internals and middleware-convention deprecation. The candidate build directory and the two generated `tsconfig.json` entries were removed afterward; `.next-client` remained untouched. This was not an OCI image build.
- `python3 scripts/audit-mirofish-buyer-run.py` against saved run `sim_4d52cec6d408`: all 12 technical/content checks passed; 10 profiles and 10 rounds, 2 active synthetic buyers, 8 action rows, 2 reviewed dynamic posts. `marketValidation` remains false. No provider call or billing reconciliation occurred.

## Release Status

`node scripts/verify-production-readiness.mjs` returned `releaseReady: false`, with `ledger_bucket_not_configured` and 36 release evidence fields unevaluated. Missing evidence includes hosted customer-journey receipts, migration receipts, deployment identity, tenant isolation, source import, cloud/UI parity, buyer simulation approval, operational/legal approvals, and rollback target. This is not production acceptance.

No full classroom export was found in the checked Downloads/repository paths; the known bonus-link index is not the course export. No Skool collection or source import was performed. The local service at port 3941 was listening, but the verifier cookie file was absent, so this run did not repeat an authenticated local/cloud comparison. No hosted migration, tenant write, IAM/bucket change, deployment, model call, or provider spend occurred.

The next verification step is a signed-in, same-identity Cloud Test comparison with authenticated build/deployment identity and a reviewed migration receipt. For course ingestion, obtain a platform-permitted export or owner-supplied source files first; then run the reviewed source-pack flow and verify exact coverage before claiming completion.

## Addendum: Private Pack Verification

On pushed source `cba8ca76e90ae181791ed8def95e9e9abe30a501`, `AGENTOS_SOURCE_PACK_FILE=.private-client-kits/bonus-index-source-pack.json` was supplied to the focused test suite. `npm run test:focused` completed with **344 passed, 0 skipped, 0 failed**. The optional private-pack parser test passed. A separate run of `tests/markdown-source-pack.spec.ts` passed 8/8 with the same input. This validates local JSON/parser compatibility only: it does not upload or import the bonus index, prove full course coverage, fetch linked pages or videos, or certify a hosted graph. The private file remains ignored and mode `0600`; its contents were not emitted in test output. No network or provider request occurred.

## Addendum: Current-Head AI and Observability Evidence

On clean pushed source `5a0e4c37736ba650749b0a16a0e08e8ff2b2a049`, the deterministic `npm run verify:ai-evaluation` run under Node `v24.19.0` passed 14/14 cases, recorded zero model samples, and returned `productionReady: false`. It made no LLM or Zep request. Observability accuracy and job-trace specs passed 13/13. The six desktop/mobile observability status UI cases passed 6/6 using system Chrome through Playwright's isolated profile; API responses were mocked. An initial attempt using Playwright's missing bundled Chromium could not launch those six cases; the system-Chrome rerun completed them. No tenant write, external provider request, deployment, or production approval resulted. These are local code and UI regressions, not hosted observability, model-quality, or release-acceptance evidence. The generated AI report must be refreshed after any later source commit to bind it to the new SHA.

## Addendum: Source-Import Local Acceptance

On the same source code as pushed commit `514a555d9b936afedd9a30c98e58a3b8a1f4a1fe`, `npm run verify:source-import-postgres` passed the disposable PostgreSQL 17 migration smoke with container networking disabled and read-only repository mounts; both source-guard schema-evidence tests passed. `npm run verify:source-import-browser` passed 5/5 in an isolated system-Chrome profile at local port 3941 with API and storage responses intercepted. Coverage includes permission before upload, fresh permission for each batch, rejection of an invalid later part before upload, safe link/media rendering, and explicit deletion confirmation. This validates local SQL and UI contracts only. It does not upload the community pack, apply a hosted migration, or establish hosted graph completeness. No hosted tenant write, provider call, or deployment occurred.

## Addendum: Cloud Test Login URL Reachability

On 2026-10-10, unauthenticated read-only HTTP checks returned 200 for both
`https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/login?next=%2F` and
`https://veloce-cloud-test-1075094991117.asia-south1.run.app/login?next=%2F`.
Both responses served the page title `Veloce AgenticOS — Mission Control`.
This proves both URLs currently serve a login page, but does not prove they
resolve to the same Cloud Run service, revision, tenant, or authenticated data.
No credentials, cookies, writes, deployment, or provider calls were used.

## Addendum: Current-Head Local Acceptance

On source `a488d80cefd751929816ae80df67bf8bff6f8e04`, `npm run test:focused`
passed 343 tests with one optional private-input test skipped. `npm run
verify:security` passed, including 22 lifecycle/retention tests, 19 notebook
provenance tests, and 10 runtime/storage configuration tests. The isolated
source-import checks passed: disposable PostgreSQL migration smoke with
container networking disabled, 2 source-guard evidence tests, and 5 browser
tests with API/storage calls intercepted. These checks made no hosted writes,
provider calls, or deployments. The production-readiness verifier still
returns `releaseReady: false`; at this head it reports the release ledger
unconfigured and 38 evidence fields not evaluated. Local tests do not replace
hosted journey, tenant-isolation, migration, import, or parity receipts.

On the same source code (`e2a0bbff66578fa3a6edf54bd5343f22eac53361`), the
observability status browser suite passed 6/6 in isolated system Chrome with
synthetic auth and mocked telemetry. The saved MiroFish run
`sim_4d52cec6d408` was re-audited: all 12 technical/content checks passed for
10 synthetic profiles and 2 active buyers; `marketValidation` remains false.
The audit made no provider calls. A read-only local session check returned
`authenticated: false` with no configuration error; `/login` returned 200 and
`/memory` redirected to login. Thus the signed-in local customer journey is
still unverified. Unauthenticated checks of both Cloud Test API paths returned
403, which does not identify their service/revision or prove route parity.
