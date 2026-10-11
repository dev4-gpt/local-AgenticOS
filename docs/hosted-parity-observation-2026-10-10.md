# Manual Local and Cloud Test Observation

Date: 2026-10-10 America/New_York  
Local surface: `http://127.0.0.1:3941`  
Cloud Test surface: `https://veloce-cloud-test-mquo4bf7aq-el.a.run.app`

## Observed

- Both signed-in browser tabs rendered the client workspace landing page and
  the broad six-lens navigation. Both showed no completed agent runs and no
  provider token usage.
- Local `/memory` exposed a `Community sources` section and `Review JSON source
  packs` action. Cloud Test `/memory` did not expose either control in the
  rendered page.
- Local `/memory` reported 2 tenant memories, 114 graph nodes, and 113 edges;
  Cloud Test reported 24 tenant memories, 33 graph nodes, and 57 edges.
- The local landing page reported telemetry available, `$0.00` budget usage,
  and one older `Provider Workspace Opened` activity. Cloud Test reported
  `$0.00` usage, zero provider-reported tokens, tenant-scoped controls active,
  and no hosted activity.
- Cloud Test described source links as staying local on its landing page;
  local described tenant records and source links as inspectable in the
  workspace.

## Interpretation and Limits

The missing local-only source controls are a concrete UI/feature-parity lead.
The data counts differ, but the browser view alone does not prove both tabs
were bound to the same tenant or backing database, so the count mismatch is
not yet evidence of data loss or a tenant-isolation failure. No records were
created or modified, and no provider calls were made. The automated read-only
surface-map verifier remains blocked because its session-cookie file is absent.

Next verification should establish both runtimes' tenant/build identities,
then compare the same source-import and memory surfaces without creating
records. No deployment or hosted changes are authorized by this observation.

## Follow-up Verification

- On source `36275a78d476266d9df2ffdb18f662f2a01efc99`, the local authenticated
  `/api/client-runtime/build-identity` endpoint returned `ok: true` but null
  source commit and Cloud Run revision. This local process was not stamped with
  build identity.
- The same read-only endpoint on the `mquo4bf7aq` Cloud Test host returned
  `{"ok":false,"error":"client_route_not_enabled"}`. The host therefore
  cannot attest its serving source or revision through this endpoint.
- `npm run verify:source-import-postgres` passed using a temporary,
  network-isolated PostgreSQL container with repository migrations and fixtures
  mounted read-only; the 2 source-guard schema tests also passed.
- `verify:source-import-browser` passed 5/5 on the already-running local app
  with synthetic browser auth and every API call intercepted by test fixtures.
  These tests cover import consent, per-batch renewed consent, malformed later
  batches, safe text/link rendering, and explicit deletion confirmation. They
  do not import any Skool content or establish hosted behavior.

The deployment target for the `mquo4bf7aq` host remains unknown. A read-only
Cloud Run inventory in project `agentos-mvp` lists `agentos` and
`agentos-internal-beta`, not a service whose URL matches that host. Do not
conflate it with the separately named Cloud Test host or Internal Beta; no
serving revision can be safely attributed yet.

## Exact-HEAD Refresh, October 10

Source checked: `4082811e8470d8fbfac24a082fee17580ee21ca4` on
`wip/backup-2026-10-03`, tracking `origin/wip/backup-2026-10-03`.

- `npm run test:focused`: 345 passed, 1 skipped (346 total).
- `npm run typecheck`: passed.
- `npm run verify:production-readiness`: `releaseReady: false`,
  `ledger_bucket_not_configured`, and 37 unevaluated release-evidence fields.
- Read-only Chrome inspection reconfirmed that the signed-in
  `veloce-cloud-test-mquo4bf7aq-el.a.run.app/memory` page reports 24 tenant
  memories, 33 nodes, and 57 edges, and does not render the community-source
  import controls seen in the prior local observation. The open
  `veloce-cloud-test-1075094991117.asia-south1.run.app` tab is a separate
  Cloud Test deployment and showed a notebook with 9 records; it is not the
  `mquo4bf7aq` host.
- A different signed-in host, `agentos-internal-beta-vbimnfseva-ew.a.run.app`,
  showed 2 memories / 114 nodes / 113 edges and a zero-record notebook. Its
  `/classroom-research` route resolves to `client-unavailable`. The Cloud Run
  console service `agentos-internal-beta-1028728465669.europe-west1.run.app`
  is another hostname; the `vbimnfseva-ew` alias has not been tied to that
  service or revision, so these observations must not be attributed to the
  console-listed service.
- No local browser re-login, database comparison, import, provider request,
  hosted write, migration, deployment, or paid call was performed in this
  refresh. The prior local-vs-`mquo4bf7aq` comparison remains the evidence for
  local source-import controls; build identity and same-tenant identity are
  still unresolved.
