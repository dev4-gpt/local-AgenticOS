# Verification Refresh: 2026-10-13

Source revision: `00fa2040a249b03508155de367051871075224cf` on
`wip/backup-2026-10-03`. The checkout was clean before verification.

## Local Evidence

- Deterministic AI release evaluation under Node.js `v24.18.0`: **14/14
  cases passed**, `localGatePassed: true`, `productionReady: false`, and zero
  model samples. No LLM or Zep request was made. The report is
  `tmp/ai-release-local-v1-report.json` (ignored local output).
- `npm run test:focused`: **349 passed, 1 skipped** (350 total).
- `npm run typecheck`: passed.
- `npm run verify:production-readiness`: `releaseReady: false`; failure
  `ledger_bucket_not_configured`, with 37 evidence fields not evaluated.
- `npm run verify:source-import-browser` was attempted against local Chrome.
  All six cases failed before assertions because Playwright's headless Chrome
  process aborted at launch (`SIGABRT` / macOS process-control error). This is
  an environment limitation, not a passing UI test or evidence of a product
  regression.
- A preliminary evaluation run under the shell-default Node.js `v26.4.0`
  passed its deterministic cases but failed the declared Node engine gate
  (`>=22 <26`). It is not release evidence; only the supported Node 24 run
  above counts.

## Still Unproven

- Signed-in customer journey and current-build UI behavior are not verified by
  this refresh. The local `3941` browser tab is an existing production-mode
  process; its displayed storage error may reflect the older running build.
- Local/cloud same-user parity, hosted build identity and release revision,
  migration receipts, and required release approvals remain unproven.
- The May 11-30 source pack is partial (19 sections, 10 unique pages, 259
  links, one uncollected page). The local review flow previously failed before
  preview/import because storage identity/signing was unavailable. No
  classroom graph import is proven complete.
- No accepted MiroFish buyer evidence is established. The previous authorized
  live run did not yield meaningful buyer engagement; a newer candidate has
  only a dry-run preflight and no provider requests.
- Release ledger publication is still blocked because no verified ledger
  bucket is configured. Do not invent a bucket or publish to an unverified
  cloud project.

No deployment, hosted migration, tenant write, source import, provider request,
or release-ledger publication occurred during this verification.

## Signed-In Chrome Parity Recheck

Read-only pages were opened in the existing Aryaman (Work) Chrome profile on
October 13. Counts below were recorded after allowing each page to finish
loading; the initial zero-count state was transient while client requests were
still in flight.

| Runtime | Memory / graph after load | JSON source-pack UI | Build identity API |
| --- | --- | --- | --- |
| Local `127.0.0.1:3941` | 2 memories / 114 nodes / 113 edges | Present | Not checked in this recheck |
| Internal Beta `agentos-internal-beta-vbimnfseva-ew.a.run.app` | 2 memories / 114 nodes / 113 edges | Absent | `client_route_not_enabled` |
| Cloud Test `veloce-cloud-test-mquo4bf7aq-el.a.run.app` | 24 memories / 33 nodes / 57 edges | Absent | `client_route_not_enabled` |

The read-only Cloud Test `/api/client-runtime/records?kind=memory` response
contained tenant-scoped records, and the UI rendered 24 after hydration. The
Internal Beta page rendered the two previously observed bonus-index records.
Matching counts between Local and Internal Beta do not establish matching
tenant identity or source revision. The `mquo4bf7aq` tenant has a different
record/graph shape. Both hosted APIs being route-disabled prevents browser
attestation of their current source revision. The hosted source-import feature
is therefore still not proven available, and none of these observations proves
same-tenant local/cloud parity.

No import controls were activated, no page data was changed, and no mutation
request or provider call was made during this recheck.

## Fresh Local Production Build Check

On October 13, the supported Node.js `v24.18.0` runtime built the current
`16c25a2eaeaba59c8e9bf455784ec89c161ef3b6` checkout successfully with
provider calls disabled. The production build included the source-import and
build-identity routes. It was started locally at `127.0.0.1:3942` only; no
Cloud Run service was changed.

In the signed-in Aryaman (Work) Chrome profile, `/memory` hydrated to 2 tenant
memories and a 114-node / 113-edge graph, and displayed the JSON source-pack
review controls. The authenticated build-identity endpoint returned the
current source commit and `cloudRunRevision: null`; its own response explicitly
labels the value as runtime-reported, not independently attested. An
unauthenticated request correctly returned `401 not_authenticated`.

This verifies that the fresh local production build renders the current
tenant-memory screen and exposes the import UI. It does not prove successful
source upload/signing, import completion, graph mutation, or hosted parity.
No import controls were activated, no tenant data was changed, and no model
provider request was made.
