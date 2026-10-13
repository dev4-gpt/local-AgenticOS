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
- On supported Node `v24.19.0`, `npm run verify:ai-evaluation` passed 14/14
  deterministic cases with `localGatePassed: true`, `productionReady: false`,
  and zero model samples. The ignored report is
  `tmp/ai-release-local-f28cd22-node24.json`; no LLM or Zep request was made.
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
  `/classroom-research` route resolves to `client-unavailable`. At that time,
  the Cloud Run service hostname and revision had not been mapped; a direct
  Cloud Console configuration read on October 11 below resolves that mapping.
- No local browser re-login, database comparison, import, provider request,
  hosted write, migration, deployment, or paid call was performed in this
  refresh. The prior local-vs-`mquo4bf7aq` comparison remains the evidence for
  local source-import controls; build identity and same-tenant identity are
  still unresolved.

## Exact-HEAD Browser Recheck, October 11

Source checked: `f2c5989` on `wip/backup-2026-10-03`.

- Read-only Chrome inspection at `127.0.0.1:3941/memory` again showed the
  `Community sources` upload and `Review JSON source packs` controls, with 2
  tenant memories, 114 nodes, and 113 edges. Its build-identity endpoint still
  returns `ok: true` with `sourceCommit: null` and `cloudRunRevision: null`;
  local source identity is therefore unverified.
- `veloce-cloud-test-mquo4bf7aq-el.a.run.app/memory` again showed 24 tenant
  memories, 33 nodes, and 57 edges, without the community-source controls.
  Its build-identity endpoint returns `client_route_not_enabled`, so the
  serving revision remains unverified.
- The distinct `veloce-cloud-test-1075094991117.asia-south1.run.app/notebook`
  surface showed 9 notebook records and 9 active sources. It is a separate
  deployment and is not evidence about `mquo4bf7aq` or Internal Beta.
- `agentos-internal-beta-vbimnfseva-ew.a.run.app/memory` showed the previously
  observed 2 memories, 114 nodes, and 113 edges. Its Classroom Research route
  remained unavailable. At this point in the browser recheck, the alias had
  not yet been mapped; a separate read-only Cloud Console inspection below
  resolves it to the Internal Beta service and active revision.
- These are separate signed-in workspaces with differing record counts; no
  common tenant identity was established. The counts alone do not prove data
  loss or tenant isolation. No tenant data was changed, and no provider call,
  migration, or deployment was made.

Parity remains unproven. The Internal Beta URL is now mapped to its active
image/revision, but the `mquo4bf7aq` Cloud Test URL remains unmapped. A
same-tenant comparison of the rendered feature manifest and source-import
surface is still outstanding. Do not publish or call the surfaces equivalent
until that is done.

## Cloud Run Configuration Mapping, October 11

Read-only Cloud Console inspection of project `agentos-mvp` confirms that
`agentos-internal-beta-vbimnfseva-ew.a.run.app` is the configured runtime base
URL for Cloud Run service `agentos-internal-beta`, region `europe-west1`.
Revision `agentos-internal-beta-00034-v69` receives 100% of service traffic;
it was deployed September 26, 2026. Its immutable container image is pinned to
`sha256:70d24863d095aa9753cf02629a30458f7fdd8ef81bfc5ed2ce35e2c0ed16da57`.
Cloud Run has no build/source metadata for this revision, so its Git commit is
still unknown.

The read-only Cloud Run service list in `agentos-mvp` showed only `agentos` and
`agentos-internal-beta`. The `agentos` service URL is
`agentos-1028728465669.europe-west1.run.app`; neither listed service matches
the `mquo4bf7aq` Cloud Test hostname. Its owning service/project is still
unknown from this account view.

The redacted runtime configuration shows provider calls disabled and
`CLIENT_RETENTION_DAYS=1`, which conflicts with the approved 45-day per-item
retention policy. The service is therefore not ready for customer data under
the approved retention setting. Do not deploy or change retention based on
this observation alone; the reviewed candidate manifest, bucket/RPC retention
semantics, and rollback evidence must be checked before an approved rollout.

The local and Internal Beta memory screens currently show the same totals
(2 memories, 114 nodes, 113 edges), while `mquo4bf7aq` and the Asia test host
show different counts and features. Matching totals are consistent with the
same dataset but do not prove the signed-in user resolves to the same tenant.
The `mquo4bf7aq` host remains unmapped to a service/revision; its disabled
build-identity endpoint remains a parity blocker. No settings, tenant data,
provider calls, or deployments were changed in this inspection.

## Internal Beta Candidate Manifest Dry Run, October 11

The checked-in `client-blueprints/agentos-internal-beta.gcp.json` now declares
the `worker-token` Secret Manager reference for `CLIENT_WORKER_TOKEN`, while
keeping provider calls and the background runtime worker disabled. Its
manifest validator passed. A deploy-phase provisioner dry run emitted the
source-import and build-identity API routes and 45-day retention, but still
pinned image digest
`sha256:70d24863d095aa9753cf02629a30458f7fdd8ef81bfc5ed2ce35e2c0ed16da57`.
That is the September 26 image with no resolved Git source commit. The dry run
does not prove the secret version exists, the matching tenant hash is set, or
the image contains the current source-import/build-identity implementation.
Do not apply this manifest until a clean current-source image is built and
verified, then update and review the pinned digest. No secret, tenant row,
Cloud Run resource, or traffic was changed by the dry run.

## Current Browser Recheck, October 10

Read-only Chrome observations from the current session:

- `http://127.0.0.1:3941/memory` settled at 2 tenant memories, 114 graph
  nodes, and 113 edges. It exposes `Community sources` and `Review JSON source
  packs`. Its build-identity endpoint reports `sourceCommit: null` and
  `cloudRunRevision: null`, so this runtime is not bound to a verified source
  revision.
- `http://127.0.0.1:3942/api/client-runtime/build-identity` displayed a claim
  for source commit `e622a517c8803e116a17cb5d496fab9e998bed10`, but opening
  `/memory` in that origin returned `ERR_CONNECTION_REFUSED`. The identity page
  was therefore stale/cached relative to the stopped server and is not runtime
  evidence.
- `https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/memory` rendered 0 tenant
  memories, 0 nodes, and 0 edges, with no Community sources section. Its
  build-identity route returns `client_route_not_enabled`.
- `https://veloce-cloud-test-1075094991117.asia-south1.run.app/memory` rendered
  24 tenant memories, 33 nodes, and 57 edges, without Community sources. Its
  build-identity route also returns `client_route_not_enabled`.
- `https://agentos-internal-beta-vbimnfseva-ew.a.run.app/memory` redirected to
  `/login?next=%2Fmemory` in this browser session. No credentials were entered;
  current authenticated Internal Beta parity could not be checked.

These are distinct origins and observed record counts; they do not establish a
shared user or tenant. The local page and two Cloud Test pages disagree on both
data counts and available features. Parity is not verified. No tenant writes,
imports, provider calls, database changes, migrations, or deployments were
performed.

## Local Test Runtime Recovery, October 13

- The current pushed source (`8b2b3ee7bbfa994564f6a7f802c1d965bc2e1500`) was
  built in the isolated client production output and started on
  `http://127.0.0.1:3941` using the private internal-beta local env file.
  Provider calls remain disabled.
- A fresh unauthenticated request returned HTTP 200 for `/login`, redirected
  `/memory` to `/login?next=%2Fmemory`, and returned HTTP 401 for
  `/api/client-runtime/build-identity`. The login page rendered in the
  in-app browser. The signed-in journey has not been rechecked in this fresh
  browser session.
- The dev-mode launcher hit a file-watcher `EMFILE` loop in this checkout and
  was stopped; the production-mode local runtime is the stable test surface.
- A read-only Google Drive inventory of `School Tabs Agent OS` found 107 items.
  Its 13 date-prefixed items comprise 9 lesson PDFs, 2 sanitized HTML pages,
  and 2 JSON source packs. The archive manifest still reports incomplete
  classroom coverage and unverified video files.
- The AgentOS markdown/source-pack suite passed 12/12 with
  `source-pack-final.part-001.json` as its optional private fixture. The two
  staged variants' manifests report 9 input sources, 17 output chunks, one
  pending page, no declared owner inventory, and 2–3 skipped pages; each
  recorded batch hash matches its staged file. This proves parser
  compatibility, not complete coverage or a graph import.
- No hosted data, local tenant data, or provider state was changed. No cloud
  deployment or migration was run.

## Local Runtime Start Check, October 10

The current-source client launcher reported missing `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`CLIENT_SLUG`, and `CLIENT_ALLOWED_USER_EMAILS`. The repository's `.env.local`
exists, but none of those four names is configured there. An attempt to start
the current clean source on port 3943 found an existing Next.js dev server for
the same `.next-client` directory on port 3939 and exited without starting a
second server or stopping the existing one. The 3939 build-identity endpoint
returns HTTP 401 without an authenticated browser session. Authenticated
current-source local parity therefore still requires an approved private
runtime env file and a signed-in local session. No env values were emitted,
and no providers, tenant data, or hosted systems were touched.
