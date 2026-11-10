# Verification Refresh: 2026-10-14

Candidate source: `cb9ae00ee18aab34d73c2126c8aca097468b0663` on
`wip/backup-2026-10-03`, clean before this note was added.

## Local Configuration and Browser Observation

- The private parity file `.private-client-kits/internal-beta-parity.env` is
  mode `0600`. Its required key names are present and non-empty:
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CLIENT_SLUG`, and
  `CLIENT_ALLOWED_USER_EMAILS`. Values were not printed or recorded. Presence
  does not prove that the configured Supabase project is a separate beta
  project or that hosted behavior matches this source.
- In the existing signed-in Chrome profile, `http://127.0.0.1:3941/memory`
  rendered 2 tenant memories and a graph with 114 nodes / 113 edges.
- A different existing local runtime, `http://127.0.0.1:3976/notebook`,
  rendered 0 notebook records and 0 active sources. These observations show
  that local runtimes/data differ; they do not identify their source commits or
  establish parity with Cloud Test.
- During a browser navigation attempt Chrome changed under user control. No
  Cloud Test page was inspected in this refresh, and no further tab changes
  were made.

## Tests

- Under supported Node `v24.18.0`, 41 focused unit/contract checks passed across
  customer-journey evidence, login/membership, source packs, observability,
  tenant isolation, build identity, and 45-day record retention.
- A separate 26-case browser-suite attempt produced 3 passes and 23 launch
  failures. Playwright's headless Chromium exited before loading the pages with
  macOS `MachPortRendezvous` permission denied. Those failures are environment
  launch failures, not verified application regressions; the browser suite is
  not counted as passed here.
- The shell default Node `v26.4.0` is outside the repository's supported
  `>=22 <26` range; the tests above were explicitly run with Node `v24.18.0`.

## Release Status

`npm run verify:production-readiness` remains `releaseReady: false` on this
source. The release ledger bucket is not configured, so the verifier reports
37 release evidence fields as not evaluated. Cloud deployment identity,
applied migrations, customer-journey receipts, hosted source import, cloud/UI
parity, approvals, and rollback evidence remain unverified.

No deployment, migration, hosted tenant write, source import, provider request,
or external buyer contact was performed. Local config presence and browser
observations do not close the hosted acceptance gates.

## Cloud Test Follow-Up

In the same existing signed-in Chrome profile, the Cloud Test Notebook first
rendered 9 tenant records and 9 active sources. A read-only GET to
`/api/client-runtime/build-identity` returned
`{"ok":false,"error":"client_route_not_enabled"}`. After restoring the
original Notebook URL, the page rendered 0 records and 0 active sources. The
count change is unexplained; it may reflect stale or failed data retrieval and
is not evidence of a hosted write or a stable tenant state. Chrome changed
under user control during a subsequent reload attempt, so the observation was
not repeated. This confirms that Cloud Test cannot currently provide source
identity through this route and that its customer data view needs a stable,
same-session recheck before parity can be assessed.

The checked-in local runtime defaults and GCP provisioner include
`/api/client-runtime/build-identity`; the observed Cloud Test response shows
that the active hosted configuration does not expose it. A reviewed Cloud Test
configuration/deployment and authenticated retest are required to close this
gap. No deployment or configuration change was made.

## Browser Acceptance Follow-Up

The product-experience Playwright server previously used the development
launcher, which exhausted the machine's file watchers (`EMFILE`). The config
now builds the isolated client edition in production mode and starts that
artifact for browser checks. It defaults to one Chrome worker because a
four-worker run caused the macOS Chrome subprocesses to abort before loading
pages; `PLAYWRIGHT_WORKERS` remains an explicit override.

Using supported Node `v24.18.0`, installed Chrome, a separate loopback port,
provider calls disabled, and synthetic API fixtures, the production browser
suite passed **23/23** cases: login/membership, Notebook Studio source
provenance, source-import consent/safety, and observability across desktop and
mobile widths. A separate focused customer-journey/auth/source/retention/
observability unit run passed **41/41**. `npm run typecheck` passed after the
configuration change. The browser server was stopped and its generated build
output removed.

This closes a local browser-test runner gap only. It does not prove hosted
customer acceptance or Cloud Test parity, and it does not change the release
gate's `ledger_bucket_not_configured` failure or unevaluated hosted evidence.

## Current-Commit Offline Evaluation

After the browser acceptance work was pushed, the deterministic AI release
evaluation was rerun on source commit
`754e6a870c883f1fc107de74a4ada9288eea2675` with Node `v24.18.0`. All 16/16
cases passed, the local evaluation gate passed, and the report records zero
model samples. Its `productionReady` field remains false by design; this
offline evaluation does not establish model quality or hosted readiness. The
ignored local receipt is `tmp/ai-release-local-754e6a8-node24.json`.

## Pushed-Source Regression Refresh

On commit `5fc6e92` (`docs: record current offline AI evaluation`), supported
Node `v24.18.0` completed the focused Playwright unit/contract suite with
365/366 passing and one skipped; `npm run typecheck` passed. The dedicated
MiroFish checks passed 12/12, and the offline Python MiroFish audit suite
passed 24/24. These are local synthetic/contract checks only. They do not
replace the missing same-user hosted journey, production migration receipts,
or market validation.
