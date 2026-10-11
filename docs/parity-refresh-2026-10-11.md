# Local and Cloud Test parity refresh

Date: 2026-10-11 America/New_York  
Source reviewed: `9d9ea14da58e248b0e6555bef55a5a57028947d7`  
Local surface: `http://127.0.0.1:3941`  
Cloud Test surface: `https://veloce-cloud-test-mquo4bf7aq-el.a.run.app`

## Read-only browser observations

- Both tabs authenticated the same account. The local session endpoint also
  reported `workspaceAuthorized: true`; the Cloud Test response omitted that
  field, so cloud workspace membership was not independently established.
- Local `/memory` showed 2 tenant memories, 114 graph nodes, 113 edges, and the
  `Community sources` source-pack controls. Its visible imported records were
  `OTHER BONUSES` (27 links) and `LAUNCH KITS:` (84 links). This is not the
  complete Skool classroom export.
- Cloud Test `/memory` showed 24 tenant memories, 33 graph nodes, and 57 edges,
  with no `Community sources` source-pack controls.
- Local `/api/client-runtime/build-identity` returned null source commit and
  Cloud Run revision. The current clean-launch script stamps a commit, but this
  already-running process does not attest its source.
- Cloud Test `/api/client-runtime/build-identity` returned
  `client_route_not_enabled`; its serving revision and source commit remain
  unverified.

The same authenticated account does not prove the two applications resolve to
the same tenant or data source. The counts and feature surfaces visibly differ,
so local/cloud parity remains **unproven**. No records, settings, credentials,
or hosted resources were changed; no import or provider call was made. Both
browser tabs were restored to their Memory pages after the checks.

## Source-import verification

- `npm run verify:source-import-postgres`: passed against a disposable local
  PostgreSQL 17 container with networking disabled and repository fixtures
  mounted read-only.
- The source-guard schema evidence tests passed **2/2**.
- `npm run verify:source-import-browser` did not reach its test assertions:
  Playwright's pinned Chromium executable is absent. Retrying with installed
  Chrome also failed during browser launch (`SIGABRT`) before test execution.
  This was an environment limitation, not an application assertion result.
- Follow-up: after installing Playwright's official Chromium and granting the
  test process local browser-launch permission, all **5/5** synthetic browser
  tests passed against the local `3941` UI. Every API request was intercepted
  by fixtures. The running UI still reports no build identity, so this does not
  attest the runtime's exact source commit.
- No Skool material was read or imported. The user is preparing that local/Drive
  archive and asked that it remain paused until they request a check.

## Next parity evidence

1. Start the current local client with an owner-approved private env file. The
   current shell lacks `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CLIENT_SLUG`, and
   `CLIENT_ALLOWED_USER_EMAILS`; do not infer or print secret values.
2. Map the `mquo4bf7aq` host to its Cloud Run service, revision, and immutable
   image digest, or select the actual current Cloud Test host.
3. Compare both signed-in workspaces against the same tenant, source revision,
   feature manifest, and read-only data scope before calling them equivalent.

## Follow-up Observation: 2026-10-11

- The browser opened
  `https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/login?next=%2Fmemory`
  and ended at `/memory`. The checked-in login component only redirects this
  way after the session endpoint reports both authentication and workspace
  authorization; no user ID or email was inspected.
- That current Memory view showed **0 tenant memories, 0 graph nodes, and 0
  edges**, with “No tenant records yet.” This conflicts with the earlier
  same-day observation of 24 memories, 33 nodes, and 57 edges. It does not prove
  deletion; the session/tenant or backend query may differ and needs
  investigation.
- `GET /api/client-runtime/build-identity` returned
  `{"ok":false,"error":"client_route_not_enabled"}` on both the
  `mquo4bf7aq` login alias and the documented primary Cloud Test host
  `veloce-cloud-test-1075094991117.asia-south1.run.app`.
- Local `http://127.0.0.1:3941/api/client-runtime/build-identity` refused the
  connection. The local server is not currently available, so no
  contemporaneous same-account local/cloud comparison could be made.
- The separate `agentos-internal-beta` service in `agentos-mvp` is not the
  Cloud Test target: its canonical URL is in `europe-west1`, while the Cloud
  Test manifest points to the `veloce-agenticos-2026` project in
  `asia-south1`. Its revision metadata is not evidence for the Cloud Test
  service.
- These were read-only observations. No tenant data, settings, Cloud Run
  resources, or provider state was changed.
