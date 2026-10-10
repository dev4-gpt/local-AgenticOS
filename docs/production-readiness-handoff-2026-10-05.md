# Production readiness handoff

This is a checkpoint, not release acceptance. Source under test:
`c60ecd641e017d0d18076f5091c056a5d40a4a8a` (test-registration and documentation
changes following authentication repair `2c5f347`). No push, deployment,
permission grant, source upload, or paid provider call occurred in this check.

## Verified progress

- Standard local regression suite: 297 passed, one optional private-source-pack
  check skipped without its input. The new login-membership and development
  Google-identity tests are now included in this suite.
- Supplying the private bonus-index pack separately: all 12 Markdown/parser/
  embedded-Postgres import checks passed. The database checks verify exact
  normalized text/link preservation, idempotency, tenant denial, graph URLs,
  transactional failures, and graph cleanup. This is not a hosted import.
- Private pack: `.private-client-kits/bonus-index-source-pack.json`, mode 0600,
  SHA-256 `1898663eda7549bf1bae50c02c3c602ef9ce828280782a3d527e115efe857303`.
  Two sections, 111 outbound links, one skipped empty URL. It is a bonus index,
  not the complete May-September classroom text/video export. No linked content
  was fetched. Private contents are ignored by Git.
- Login repair: 19 focused authentication checks and six browser checks passed;
  mobile/desktop screenshots inspected; type check and targeted lint passed.
  The real session authenticated but returned `tenant_membership_required` for
  internal-beta. No tenant membership was silently granted.
- Deterministic AI evaluation: 9/9 at clean source `2c5f347`; receipt in
  `tmp/ai-release-2c5f347.json`. No model samples or hosted reliability claim.
- Release verifier: `releaseReady: false`, ledger bucket not configured, other
  hosted release gates not evaluated. Historical ledger records do not qualify
  the current candidate.

## Remaining requirements

| Workstream | Missing authoritative evidence / next dependency |
| --- | --- |
| Customer journey | Current deployment J01-J15 receipts remain unaccepted. Local internal-beta account needs approved membership before its data journey can continue. |
| Source-to-graph | Hosted artifact upload and applied graph migration unverified. Local signer lacks `iam.serviceAccounts.signBlob`; bucket CORS does not include localhost. Full lesson/video source inventory remains unavailable. |
| Local/cloud parity | Internal-beta and old cloud-test are different tenants. No same-release, all-promised-actions parity receipt exists; current code is not deployed. |
| AI engineering | Local policy tests pass, but hosted job/ledger/trace reconciliation, model-backed reliability, alert delivery and operational acceptance remain open. |
| MiroFish | Reviewed repeat `sim_3b7bfff26e22` has matching hashes but no execution artifacts. Durable pilot env has LLM settings and no Zep key. Existing completed run fails current workflow-fidelity audit. Paid-spend approval remains $0. |
| Release | Need approved target deployment, migrations, ledger destination, rollback reference, and operational/legal signoffs. Source is committed locally, not pushed or promoted. |

## Resume order

1. Resolve the pending approval to add the known account as a regular member of
   internal-beta, or sign in as its existing approved member. Confirm the
   session reports workspace authorization before claiming any data access.
2. Resolve narrowly scoped upload access and local origin policy through an
   approved change, or verify the import on the approved hosted origin. Do not
   disable tenant authentication or broaden project-level IAM as a shortcut.
3. Restore Zep configuration in the private MiroFish research environment; run
   only the already-reviewed bounded repeat, audit its output, and retain the
   distinction between synthetic hypotheses and real buyer evidence.
4. Continue the complete journey/parity and hosted engineering acceptance on an
   explicitly approved immutable deployment. Do not convert local green tests
   into a production-readiness percentage.

## Internal-beta continuation, October 5

This section records work after the original checkpoint above. The older
"Remaining requirements" table is historical, not the current state.

- In Supabase project `ppmoqjtmjtfxadsnejqc`, the verified auth user
  `a2c2812c-1473-4ea3-92ba-1c106643869d` (`aryamandev777@gmail.com`) now
  has an active `member` membership in the newly created active `internal-beta`
  tenant. The real local `/api/client-auth/session` response changed from
  `tenant_membership_required` to `workspaceAuthorized: true`. Memory loaded
  with an empty tenant graph before import.
- The reviewed `product-experience/supabase-client-runtime-source-pack-graph.sql`
  migration was applied to the project's main database in one transaction after
  explicit user approval. The import and search functions are present. The
  pre-existing graph stayed at 33 nodes and 57 edges immediately after the
  migration; no other tenant graph was refreshed by this test.
- The approved bonus index was uploaded and imported through the signed-in
  local UI into `internal-beta`. The preview reported two sources, 111 link
  entries and one skipped entry. The import reported two added, zero updated,
  zero unchanged. Database readback found two active memory records with the
  expected pack SHA-256, 111 stored links, one import audit, 111 URL nodes and
  110 `links_to` edges. The graph view reported 114 nodes and 113 total edges;
  repeated targets within a source collapse to one graph edge. A search for an
  imported link title returned its source record. This verifies the bonus
  *index* only, not the linked documents, Skool lessons or videos.
- Google Cloud project `agentos-mvp`: a temporary `signBlob`-only grant on the
  beta runtime service account and a temporary `storage.objects.get`-only
  bucket grant scoped to `internal-beta/` objects were added for
  `aryamandev777@gmail.com`. Both conditions expire at
  `2026-10-06T18:23:41Z`. The bucket CORS policy also allows the exact local
  origin `http://127.0.0.1:3939`; this CORS rule does not expire automatically
  and should be removed when local upload acceptance is finished. Neither
  binding grants object listing or deletion. The CLI credential initially
  resolved to a different signed-in email; reauthentication restored the
  intended identity, and a direct `signBlob` probe returned HTTP 200.
- No app push, Cloud Run revision, Vercel deployment, paid model call or release
  ledger acceptance occurred in this continuation. The customer journey,
  same-release cloud parity, complete authorized source inventory, MiroFish
  repeat and hosted release gates remain open.
- Chrome comparison on the same signed-in account: local and hosted-beta home
  pages have the same main layout and copy. Both `/memory` pages read the two
  imported records and report 114 nodes / 113 edges from the same tenant data.
  The local Memory page has a `Community sources` JSON-pack review/import
  control; hosted beta does not. Its existing Markdown import is a different
  control. Therefore the migration made the data visible in cloud, but the new
  source-pack workflow is not deployed. The hosted revision observed was
  `agentos-internal-beta-00034-v69`, image digest
  `sha256:70d24863d095aa9753cf02629a30458f7fdd8ef81bfc5ed2ce35e2c0ed16da57`;
  image provenance did not establish a matching source commit.
- The isolated MiroFish pilot environment still has no `ZEP_API_KEY`. The
  prepared bounded repeat `sim_3b7bfff26e22` remains unexecuted. The approved
  paid-spend limit is $0; do not substitute a paid fallback.
- Current focused verification at `0fe2e36`: 33 source-pack/auth/identity unit
  checks passed, one optional private-input check skipped; TypeScript typecheck
  passed. The release verifier returned `releaseReady: false`: the local dev
  server added generated `.next-client` includes to `tsconfig.json`, so the
  worktree is dirty, and the ledger bucket is not configured. Later hosted
  gates were not evaluated. Leave that generated change untouched while the
  local server is running; do not mistake a unit-test pass for release approval.

## Memory presentation and export follow-up

- Local source `6afeeac` renders imported source-pack Markdown as readable text
  and links, collapses long source bodies, and blocks embedded images from
  auto-loading. Synthetic Chrome browser checks passed 3/3, TypeScript passed,
  and the live local Memory page showed two compact source records. File-wide
  lint still reports pre-existing hook warnings in `ClientDataWorkspace.tsx`;
  the new browser test file lints cleanly. This source is not deployed.
- On hosted beta revision `agentos-internal-beta-00034-v69`, the signed-in
  `internal-beta` user exported the two Memory records through the UI. Chrome
  reported `internal-beta-memory.md` downloaded successfully (15,090 bytes).
  Local readback found both expected section headings and 112 parsed Markdown
  links. This is a narrow hosted Memory-export observation on the older
  revision, not a full tenant export, current-source acceptance, or a J12
  release receipt.

## October 6 candidate and cleanup

- Candidate `23a3344` is clean and committed locally, not pushed or deployed.
  The canonical root `npm run build` now uses Next's supported Webpack path,
  matching the local client launcher and public-site build. With the client
  container flags, it produced a standalone artifact; pruning removed 235
  disallowed route entries and retained 117, and the trace/route verifier
  passed. A locally started copy of that packaged server passed the
  unauthenticated access-control smoke test: login reachable, private pages
  redirected, and private APIs denied. The temporary smoke server was stopped.
  This is packaged-local evidence, not a Cloud Run revision receipt.
- The source-matched deterministic AI report at
  `tmp/ai-release-local-v1-report.json` records 9/9 cases passed for
  `23a3344`, with no model or Zep calls and `productionReady: false`.
  Focused local tests passed 297/298 with one optional private-input skip.
- The temporary `signBlob` and bucket object-read grants expired at
  `2026-10-06T18:23:41Z`. At 21:25 UTC, readback still showed the exact
  localhost CORS origin. It was removed; subsequent bucket readback contained
  only the pre-existing hosted Cloud Run origin with its original GET, PUT,
  OPTIONS methods, headers, and 900-second cache age. Local browser uploads
  on port 3939 will therefore require a new, approved temporary CORS change.
- The release verifier still returns `releaseReady: false` without a release
  ledger destination. A read-only inventory of `agentos-mvp` buckets found
  the beta object bucket and Cloud Build bucket, not a release-ledger bucket.
  Hosted J01-J15 receipts, current-source deployment identity, complete
  classroom export/import, MiroFish Zep configuration and buyer run, and
  operations/legal approval remain outstanding.

## Post-readiness Firecrawl follow-up

- The user requested a Firecrawl collection of the Skool classroom after the
  current production-readiness goal, and a one-page opt-in Python collector is
  prepared at `scripts/fetch-skool-classroom-firecrawl.py`. It has not been run
  against Firecrawl or Skool. Offline request-shape and private-output tests
  passed; the default invocation makes no network request.
- Passing a Skool session cookie in Firecrawl's request body gives Firecrawl
  signed-in access to that page. The collector requires an explicit flag and a
  privately supplied cookie; it never reads browser cookies or logs the token.
  `storeInCache: false` is not zero data retention. Before any run, verify
  platform permission, Firecrawl's data handling and credit balance, and the
  user's specific consent to share that session. Test one page and inspect
  results before considering a bounded crawl or graph import. The current
  course-owner grant alone does not establish a Skool platform-policy waiver.
- The user also nominated
  [social-media-scraping-apis](https://github.com/cporter202/social-media-scraping-apis).
  Its repository is a catalog of third-party Apify actors, not an importable
  Skool scraping library. The relevant
  [classroom/posts actor](https://apify.com/memo23/skool-posts-with-comments-scraper)
  advertises classroom modules, text, media URLs and comments, but requires
  exported Skool cookies and pay-per-result billing (listed from $4.50 per
  1,000 results). Its member-profile actors are outside the requested
  classroom-content scope. No actor, cookie transfer or paid run was started.
  Reassess only after platform permission, third-party session disclosure,
  a provider-side $0 hard cap or separately approved spend, and a one-page
  output sample that can be mapped into the existing tenant source-pack format.

## October 9 branch-promotion boundary

- At preflight, GitHub `main` was `f8f03e6` and the clean backup branch was
  `40e8609`, 98 commits and 176 changed paths ahead with no commits behind.
  The remote SHAs were checked directly. This branch is a recoverable work
  backup, not a reviewed production release or a small single-purpose migration
  PR. Do not merge it wholesale merely because it is pushed.
- The current branch passes 318 focused tests with one optional private-input
  skip, the repository security suite, the production Webpack build, and an
  11/11 deterministic offline AI evaluation bound to `40e8609`. The AI report
  includes no model or Zep calls and says `productionReady: false`. Local
  browser checks use intercepted APIs and do not prove hosted behavior.
- Internal beta is a tenant in Supabase project `ppmoqjtmjtfxadsnejqc`, which
  also serves the recorded production rollout. Its `public` RPC migrations
  affect every tenant. The owner's beta-only approval does not authorize the
  source-pack guard on that shared database; no hosted migration was applied.
  A disposable database check or explicit project-wide approval is required.
- Stage promotion by dependency and evidence: review the backup-branch diff and
  migration order; validate database changes against an isolated target;
  build a source-stamped client image and verify its runtime allowlists;
  exercise signed-in beta journeys and two-tenant denial; then capture the
  exact-deployment J01-J15, buyer, AI, rollback, and operator/legal receipts.
  Only after those gates pass should `main` or production traffic be changed.
- The release verifier still reports `releaseReady: false` without a release
  ledger destination and current-candidate acceptance receipts. Local tests
  and backup commits do not close that gate.

## October 9 internal-beta observation

- In the open Chrome window, the internal-beta Cloud Run origin initially
  showed zero tenant memories during page loading; a later loaded view showed
  two tenant memories and a 114-node/113-edge graph. The zero count was not
  evidence of an empty tenant. `/classroom-research` displayed the
  client-edition boundary instead of an operator workflow. These are narrow
  UI observations, not a completed customer journey or source-import receipt.
- The owner approved the source-import RPC guard for internal beta only. The
  beta runtime uses the production Supabase project, so applying this `public`
  function migration would affect all tenants. The hosted migration remains
  unapplied pending an isolated database test or explicit project-wide scope.
- A disposable local PostgreSQL test was attempted, but the Docker daemon was
  not running. `npm run verify:production-readiness` at `d8f4cc6` still
  reported `releaseReady: false`, with the release ledger unset and required
  receipts not evaluated.

**Later local SQL check, October 9:** Docker Desktop was started and
`npm run verify:source-import-postgres` passed against a disposable PostgreSQL
17 container. It applied the memory-graph and source-pack migrations twice,
then the guard twice, and checked role grants, one allowed import, URL graph
nodes, cross-member overwrite denial, cross-tenant denial, expired-artifact
denial, and unchanged data after rejected imports. The container had no
network connection, published port, or persistent volume and was removed.
This fixture does not replicate the complete hosted Supabase schema or prove
that the shared production project is safe to migrate; no hosted SQL changed.

**Read-only parity inventory, October 9:** The existing surface-map command
creates tenant records, workflow jobs, and briefs by default, so it must not
be mistaken for a passive check. New `--read-only` commands inspect expected
routes, capabilities, credentials, provider history, and record lists using
GET only; they reject provider smoke and do not persist rotated cookies.
The localhost fixture passed with only GET requests and an unchanged cookie
file. Neither real target was exercised: the local server was stopped, and
the required protected runtime cookie file was absent. A future inventory
pass still needs an authorized signed-in session and exact deployment identity;
GET-only success would not close the customer-action or two-tenant gates.

**Signed-in local/cloud read check, October 9:** The process already serving
3939 had been launched without the private client env and returned
`auth_not_configured` at login. An independently configured local client was
started on 3940 with provider calls disabled and a separate Next.js build
directory. The existing Chrome session reached its signed-in `/memory` page:
two records, 114 graph nodes, 113 edges, and the `Community sources` control.
The loaded internal-beta `/memory` page showed the same counts but not that
control. Local `/api/client-runtime/build-identity` returned `ok: true` with
null source commit/revision, expected for development; internal beta returned
`client_route_not_enabled`. This confirms a deployed route/config difference,
not the exact source commit of the hosted image. No tenant mutation or provider
call was made during this check. The two-member isolation and full journey
receipts remain missing.

**Current-source offline checkpoint, October 9:** On clean commit
`602ae3a8831bb65ca1323925f8e248d72a63767f`, the focused suite passed
318 tests with one optional private-input skip; `verify:security` passed,
including 15 lifecycle and three runtime-config fixture tests; and the
offline AI evaluation passed 11/11 with `modelSamples: 0`,
`workingTreeClean: true`, and `productionReady: false`. Nineteen MiroFish
artifact-auditor unit tests passed without starting another simulation or
calling Groq/Zep. The AI report is private at
`tmp/ai-release-local-v1-report.json` and bound to that source commit. The
production verifier still reported `releaseReady: false` because no release
ledger destination/current-candidate acceptance bundle was configured. The
Supabase SQL Editor tab was identified as project `ppmoqjtmjtfxadsnejqc`,
marked `main PRODUCTION`, but Chrome switched windows before a safe catalog
query could be run. No hosted SQL was executed or migration applied.

**Local login and image provenance follow-up, October 9:** The configured
local client on port 3940 was independently reachable and the owner signed
in through Chrome. The `/memory` view again showed two records, 114 nodes,
113 edges, and `Community sources`; the stale 3939 link had caused the
`auth_not_configured` message. The client Dockerfile now rejects an absent or
malformed 40-character source commit before installing dependencies, so a
direct Cloud Build invocation with its default `unverified` substitution
cannot silently produce an unstamped image. The two runbook build commands
now pass the full commit. The focused build-identity tests, typecheck, and
security gate passed. This is a local safeguard only: no image was built,
deployed, or independently attested, and the hosted beta still lacks a
verifiable source identity.

**Source-import verifier hardening, October 9:** The still-unapplied RPC guard
now revokes member access to the old four-argument source import and requires
the tenant's server-held worker token for the five-argument import. The
authenticated HTTP route checks the reviewed artifact bytes before sending
that token; without a configured token it fails before object download. The
candidate Cloud Run preflight requires a Secret Manager-backed token when
source import is exposed. Embedded PostgreSQL covers an upgrade from the old
guard, direct-RPC denial, wrong token, tenant/member ownership, idempotency,
and graph results. A disposable PostgreSQL 17 smoke, 318 focused tests (one
optional skip), typecheck, lint, and the security gate passed. This remains
source-only work: no hosted migration, deployment, or tenant write occurred.
The production Supabase project still needs explicit project-wide approval,
the exact revision/configuration receipt, and two-member hosted verification.

**Tenant-token isolation follow-up, October 9:** The source-pack fixture now
uses a distinct worker token for each tenant. Embedded PostgreSQL verifies
that tenant A's token is rejected for an authorized tenant B member, then
accepts tenant B's token. The disposable PostgreSQL 17 smoke also rejects
tenant A's token for tenant B without changing data; both checks passed.
The signed-in Chrome internal-beta Memory page still showed two records and
a 114-node/113-edge graph. The configured local client was restarted on
port 3940 with provider calls disabled, and the owner signed in there. Its
Memory page showed the same counts plus the `Community sources` control;
the deployed internal beta lacked that control. This is a fresh read-only
parity observation, not a complete customer journey or source-import receipt.
Read-only `gcloud run services list --project agentos-mvp` returned
`run.services.list` permission denied for the active Google account; the
hosted revision and its configuration remain unverified. The release verifier
still reports `releaseReady: false` with no release ledger destination or
current-candidate acceptance bundle. No hosted migration or deployment was
performed.

**Read-only storage preflight, October 9:** The current beta revision is still
`agentos-internal-beta-00034-v69` at 100% traffic on the September 26 image.
The live service preflight still fails on one-day retention and absent
source-import/build-identity API routes. A separate bucket preflight now
checks the active Cloud Run origin against CORS, an exact tenant-prefixed
45-day Delete rule, overlapping earlier rules, versioning, and soft delete.
The live bucket fails because CORS lacks the active `vbimnfseva-ew.a.run.app`
origin, the only overlapping Delete rule is one day, and soft delete retains
objects for another seven days. The checker reads configuration only; it
does not prove object-by-object deletion or cover backups/vendor copies. No
Cloud Run or bucket setting was changed.

**Release-ledger cloud binding, October 9:** The verifier now requires a
live Cloud Run plus bucket configuration receipt at publication and re-reads
both resources during strict validation. The receipt binds the serving
revision/image, tenant, bucket, active origin, runtime allowlists and
Secret Manager worker-token reference to CORS and the 45-day storage policy;
only verdict codes and configuration hashes enter the ledger. A no-ledger
publication-mode dry check against the current beta failed the new gate on
the known runtime and bucket configuration mismatches. No ledger write,
deployment, provider call, or hosted setting change occurred. This check
does not attest the image source commit or prove deletion of bytes/backups.

**Hosted source-import catalog preflight, October 9:** Read-only queries in
the signed-in Supabase SQL Editor confirmed project `ppmoqjtmjtfxadsnejqc`
is marked `main PRODUCTION`. The four-argument
`import_client_runtime_source_pack` exists, is a `plpgsql` security-definer
returning `jsonb`, and is executable by `authenticated` but not `anon`.
Neither the renamed legacy function nor the five-argument guarded function
exists yet. The required tenant/artifact/record columns, `client_member`,
`extensions.digest`, and source-import-key index are present. Its owner is
`postgres`, its configured search path is `public, extensions`, and its body
includes artifact, ownership, and graph-refresh checks. The base function's
explicit execute grants are `postgres`, `authenticated`, and `service_role`;
six tenants are active. No tenant records or credential values were read.
The pending guard now revokes the old function from `service_role` too, and
the disposable PostgreSQL 17 upgrade smoke passes with that preexisting
grant. All four focused source-pack tests and `verify:security` also pass.
This catalog check is a compatibility preflight, not a proof that the
hosted function body matches source or that all clients tolerate the change.
Because the guard would alter a shared function used by those tenants, the
internal-beta-only approval does not authorize applying it to this database.
No hosted SQL mutation or deployment was performed.

**Hosted source-guard release binding, October 9:** The release ledger no longer
treats an attached source-import SQL file as sufficient hosted proof. In
publication mode it queries the exact Supabase project through the scoped
read-only Management API, checks the tested five-argument function-body MD5,
security-definer/search-path/owner shape, and role grants on both the guarded
and old import functions. Strict validation re-queries the project and fails
if that state drifts or read access is unavailable. The Cloud Run configuration
receipt separately requires `SUPABASE_URL` to identify the same project ref;
only the ref, digest, check results, and timestamps enter the ledger, never
the access token. This is catalog evidence, not a two-member import test or
proof that every other attached migration was applied. The read-only endpoint
is beta, so an unsupported response fails closed. The disposable PostgreSQL
upgrade smoke, two hosted-query fixture tests, 18 focused release/source
tests, typecheck, security suite, and lint passed. A no-ledger publication
dry run returned `releaseReady: false` with the new schema gate failed because
no scoped read-only token was configured; it did not write a ledger record.
No hosted SQL, runtime deployment, or paid provider call was made.

**Current-candidate source-pack recheck, October 10:** On source commit
`094347b00fb85bb433a5e8a2feddf3bcfe37a115`, the classroom, client, and
Markdown source-pack unit suites passed 23 tests with the optional private
pack test skipped when no pack path was supplied. With the private bonus-index
pack supplied to that test, all eight Markdown tests passed. The private pack
currently declares two sources and 111 links; its content remains outside Git.
The disposable PostgreSQL 17 source-import upgrade smoke and the two
source-guard schema-evidence tests also passed on this candidate. This verifies
local parsing and migration compatibility, not a complete Skool course export,
a hosted guarded RPC, a two-member import, or graph deletion. The shared
production Supabase project remains unchanged pending approval that covers all
affected tenants.

**Source-removal disposable check, October 10:** The source-import PostgreSQL
smoke now uses the records migration's authenticated owner-delete RLS policy
and security-definer membership shape. After importing one source with a source
URL and outbound link, a different member's owner-scoped delete matched zero
rows. The owner's delete matched one; graph refresh removed all document, URL,
and edge rows for that tenant while another tenant's record and graph remained.
The PostgreSQL smoke and two source-guard evidence tests pass. This models the
existing per-record Memory delete and refresh path, not an atomic batch removal,
a hosted two-member deletion, or deletion of the separately uploaded JSON object
and its backups. Those still need hosted evidence before the source-to-graph
removal gate can be accepted.

**Current release and buyer-pilot checkpoint, October 10:** At verification,
AgentOS branch `wip/backup-2026-10-03` contained feature commit
`aa01d4bab24d1eaa75902b47b68e1378e15ab955`, which includes the Notebook Studio
source-grounded draft workflow. The current `npm run verify:production-readiness`
result is `releaseReady: false`; it fails because no release-ledger bucket is
configured and leaves customer-journey, buyer-pilot, local evaluation, hosted
migration receipts, Cloud Run/Vercel/Supabase identities, UI parity, operational
and legal approvals, rollback, and multiple other gates unevaluated. Local code
and test success must not be represented as production approval. No cloud
migration, hosted setting change, or deployment was performed for this
checkpoint.

On the bundled Node `v24.19.0` runtime, the local AI release evaluation passed
14/14 deterministic cases. It records zero model samples and zero provider cost,
and correctly keeps `productionReady: false`. Running the same evaluation under
the shell's Node `v26.4.0` also passed all 14 test cases but failed its runtime
eligibility check, so Node 24 is the supported evidence runtime here. The
focused client observability and job-trace suite passed 13/13, including ledger
completeness, cross-tenant rejection, and trace redaction. These are local
automated checks, not hosted or stochastic model-quality evidence.

The separate MiroFish buyer-pilot checkout is clean on local branch
`buyer-pilot-telemetry`. The fresh reviewed candidate
`sim_b0958acead3f` is present with its pinned configuration, profile, and
preparation files. Their verified SHA-256 values are `2b2207bcf0f8929610441c335224475d2c4706dbde334dcd1696d71eb1cf7618`
(configuration), `83a0d906dbcf522e00dcb5082cdd6c97340f829dafd63b332c14adf4de7b2911`
(profiles), and `1aa577d397432cd75e4ecc5dbc1de1b84745fd319fb5c86fe7a95c1755f3fe26`
(preparation). The provider-free runner test suite passes 8/8. This is a
prepared candidate, not a completed simulation or buyer validation. The earlier
tokenizer-bootstrap failure remains archived and was not overwritten. Do not
start a new provider-backed run until the pilot's current $0 spend constraint
and run approval are explicitly confirmed; no provider request was made at this
checkpoint. The candidate's exact-hash dry-run preflight also passed with ten
agents, two selected buyers, ten rounds, Twitter only, graph updates disabled,
and `applied: false`.

The Skool scope remains limited to content supplied through a platform-permitted
export and rights sufficient for the intended product use. Prior owner/member
authorization documents do not by themselves establish a platform scraping
exception or commercial redistribution rights. No authenticated cookie-based
scrape or full-course import was performed. Resume with a permitted export,
then verify source coverage and tenant-scoped import/deletion in the hosted
environment before claiming completion.

**MiroFish artifact reconciliation, October 10:** A read-only inspection of the
current buyer-pilot checkout found completed run `sim_4d52cec6d408`: its
run-state reports 10/10 rounds and 8 Twitter actions; its config selects the
two synthetic buyer personas P00603 and P04949, uses Groq's
`openai/gpt-oss-120b`, disables Reddit and command waiting, and the bounded
runner disables graph updates. Its review JSON contains two AI-assisted posts,
both marked actionable, role-faithful, scenario-relevant, and scope-safe. This
is a bounded synthetic simulation, not real buyer validation; no independent
provider billing reconciliation is attached. A separate completed run,
`sim_49b3a7426c50`, has one of two posts marked not role-faithful, demonstrating
that review must gate the evidence. The newer hash-pinned candidate
`sim_b0958acead3f` remains a dry-run-only preparation. No new provider request
was issued during this reconciliation.

**Read-only Cloud Test hostname comparison and current-source local checks, October 10:** In the signed-in Chrome Work profile, `https://veloce-cloud-test-1075094991117.asia-south1.run.app/memory` rendered 0 tenant memories, 0 graph nodes, and 0 edges. The separately opened `https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/memory` rendered 24 tenant memories, 33 graph nodes, and 57 edges. Treat these as distinct data/runtime observations; they are not interchangeable links, and no common deployment identity or tenant configuration was established. On the `mquo` host, a read-only GET to `/api/client-runtime/build-identity` returned `client_route_not_enabled`, so that runtime cannot currently prove its source SHA or image digest through the authenticated identity endpoint. No tenant data was changed.

The local internal-beta runtime is reachable at `http://127.0.0.1:3941/login?next=%2Fmemory` in the same Chrome profile. Its isolated local client build is configured for `internal-beta`, the owner allowlist, and provider calls disabled. The sign-in page is open; a local authenticated comparison has not yet been performed. The first port check was blocked by sandboxed loopback access; after granting turn-scoped loopback access, the existing server returned HTTP 200 for `/login` (a second launch correctly refused the occupied port). No credentials were entered.

On the clean current source commit `8fdf1b5d42afb0b4a9a7fda1fbc71505d8ce009d`, the bundled Node `v24.19.0` offline AI evaluation was regenerated and passed 14/14 deterministic cases. The report is in ignored `tmp/ai-release-local-v1-report.json`, records zero model samples, and keeps `productionReady: false`. Focused client observability and job-trace tests passed 13/13 on the same source. These local checks add no hosted or model-quality evidence. A fresh `npm run verify:production-readiness` still reports `releaseReady: false`, with no ledger bucket and hosted gates unevaluated.
