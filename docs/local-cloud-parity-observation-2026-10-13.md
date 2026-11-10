# Local And Hosted Parity Observation - 2026-10-13

## Scope

Read-only inspection of already-open, signed-in AgentOS tabs in Chrome. No
tenant writes, source imports, provider calls, configuration changes, or
deployments were performed.

The source checkout was at commit `37dd728f29a7d78683149c87cd3d5df3b46b8a9c`
on `wip/backup-2026-10-03`. Five pre-existing documentation/evidence paths
were left untouched.

## Observations

### Local `127.0.0.1:3941`

- `/memory` renders an authenticated tenant page with 2 tenant memories, 114
  graph nodes, and 113 relationships.
- The page includes `Community sources` and `Review JSON source packs`, as well
  as Markdown import/export and note controls.
- The authenticated read-only `/api/client-runtime/build-identity` endpoint
  reported source commit `8b2b3ee7bbfa994564f6a7f802c1d965bc2e1500`, no Cloud Run
  revision, and explicitly labels its provenance as runtime-reported rather
  than independently attested. That commit is an ancestor 77 commits behind the
  current checkout.
- The local listener's working directory is the AgentOS source checkout, but
  this does not prove the running process is serving the current checkout's
  build artifacts.
- The current-source launcher preflight reads only key names and reports the
  required Supabase URL/key pair and `CLIENT_ALLOWED_USER_EMAILS` as missing;
  provider calls remain disabled. A fresh authenticated run from the current
  checkout therefore cannot be verified until those values are privately
  configured.

### Internal Beta

- `/memory` also renders an authenticated page with 2 tenant memories, 114
  graph nodes, and 113 relationships. The visible records include the same
  `LAUNCH KITS` and `OTHER BONUSES` entries seen locally.
- Its Memory page has Markdown import/export and note controls, but no visible
  `Community sources` or `Review JSON source packs` section.
- The read-only `/api/client-runtime/build-identity` request returns
  `client_route_not_enabled`. In this checkout, that middleware response means
  the API path is not present in the deployed `CLIENT_ALLOWED_API_ROUTES`
  configuration. The current GCP provisioner includes the path, but the live
  service's exact source commit cannot be established from this endpoint.
- The open Cloud Run console tab identifies revision
  `agentos-internal-beta-00034-v69`; this is a revision label, not proof of its
  source commit.

### Cloud Test

- The open `veloce-cloud-test-mquo4bf7aq-el.a.run.app/memory` tab reports 24
  tenant memories, 33 graph nodes, and 57 relationships. This dataset differs
  from local/Internal Beta, so it is not a valid same-tenant data-parity
  comparison. Its build identity was not verified in this observation.

## Assessment

The local/hosted UI difference is real. The local runtime itself reports a
build 77 commits behind the checkout, while Internal Beta does not expose its
build identity and lacks the community-source import controls. The matching
record/graph counts and visible record names between local and Internal Beta
suggest the same tenant data is present, but do not prove full data parity or
that every route behaves the same. The exact hosted code/config cause remains
unverified because the live build-identity API is disabled.

## Remediation Gate

Do not patch or deploy the live service as part of this observation. Before a
future controlled beta rollout:

1. Rebuild the local runtime from the reviewed current commit and verify its
   reported identity matches that commit.
2. Prepare an Internal Beta candidate from that same commit, with an explicit
   `VELOCE_BUILD_SOURCE_COMMIT` and the build-identity endpoint in
   `CLIENT_ALLOWED_API_ROUTES`.
3. Verify the candidate's image digest and traffic allocation before routing
   beta traffic; then repeat same-user, same-tenant checks for Memory,
   Community sources, preview/import, Notebook, and the customer journey.
4. Keep the Cloud Test dataset separate; use an approved test tenant or seeded
   fixtures for comparisons rather than comparing unrelated tenant counts.

The existing production-readiness gate remains authoritative. Current
hosted/deployment approvals, migration evidence, complete Skool archive, and
customer-journey receipts are still outstanding.
