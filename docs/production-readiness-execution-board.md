# AgentOS Production-Readiness Execution Board

This board tracks the complete production-readiness goal. A green local test is
not treated as hosted, customer, or release evidence. Tracks can move in
parallel; hosted mutations remain behind explicit environment and approval
checks.

## Goal

Bring AgentOS toward evidence-backed production readiness by completing the
customer journey, authorized Skool-to-graph import, local/cloud parity, AI
evaluation and observability, a cost-controlled MiroFish buyer pilot, and
release verification without deploying or spending beyond approved limits.

## Tracks

| Track | Status | Exit evidence | Next action |
| --- | --- | --- | --- |
| Local product and customer journey | In progress; unauthenticated checks pass; private config scaffold prepared | Current-source build; automated journey tests; signed-in same-user journey through intake/login, workspace, source selection, draft, provenance, review, and export | Add the Supabase anon key and the intended signed-in email to `.private-client-kits/internal-beta-parity.env` locally. Its URL and `internal-beta` tenant slug come from the checked-in runtime manifest. Use only read-only, tenant-scoped parity against production-backed project `ppmoqjtmjtfxadsnejqc`; do not run writes or migrations. Provider calls stay disabled |
| Authorized Skool archive and graph import | In progress; 60/107 register IDs captured locally; local graph export built, not hosted-imported | Canonical lesson/date inventory; all authorized page text, links, and available video references/media accounted for; validated private source pack; scoped import receipt; graph counts and link checks | Collect/reconcile the 47 register IDs absent from local v7, resolve the 107-versus-109 lesson count and one uncollected page flagged by both Drive packs, and account for videos/resources; then run a scoped graph import only against the confirmed internal-beta target |
| Local/cloud parity and hosted security | Hosted changes held; local checks continue | Same build/artifact identity; same-user feature/data comparison; route allowlist, tenant isolation, storage proxy and retention verified from live beta configuration | Resolve the exact beta Supabase project/ref and approved Cloud Run service before any hosted write. Do not mutate the visible production Supabase project or deploy while target is ambiguous |
| AI quality, evaluation, and observability | Local gate passed; hosted/model quality unverified | Supported-runtime deterministic suite; reviewed model samples with quality and cost telemetry; end-to-end trace redaction and completeness evidence | Keep offline gate on Node 24; inspect the private MiroFish review file with the owner, then run only a bounded provider pilot after live Free-plan/spend-cap confirmation |
| MiroFish buyer pilot | Offline persona-frame audit passes; private review aid prepared; human review and cost receipt pending | Reviewed generated posts bound to run inputs; audited completed run; documented limitations; real buyer interviews recorded separately from synthetic results | Owner independently reviews `backend/uploads/simulations/sim_f91504972e42/offline-review-assistance.md` and records official verdicts; correct the under-$50 persona/offer mismatch before any rerun; synthetic results remain hypotheses, not market validation |
| Release evidence and decision | Not ready | Clean commit; all required evidence attached to release ledger; hosted deployment/revision/image verified; customer, security, operations, legal, and rollback gates approved | Keep the release verifier as the authoritative gate; configure a ledger bucket only after target project and cost implications are confirmed |

## Verified Snapshot (2026-10-14)

- Branch `wip/backup-2026-10-03` is pushed through `88f57bd` (local private
  source-pack graph exporter plus three passing focused tests). The ignored,
  owner-only export contains 460 nodes and 7,740 edges from the 175 prepared
  segments and 7,565 links. It marks `complete: false` and
  `videoAssetsIncluded: false`; it is not a hosted import receipt. Five existing documentation or
  evidence paths are uncommitted and must be reviewed, not silently discarded.
- Node 24 local AI evaluation on the current commit: 14/14 deterministic cases
  passed, `localGatePassed: true`, zero model samples and no provider requests.
  Production readiness is still false.
- Current-source standalone client production build completed on Node 24. Fresh
  loopback checks on 2026-10-14 returned `/login` 200, `/memory` 307 to login,
  and protected build identity 401 without a session. This confirms the
  unauthenticated boundary, not signed-in parity. Provider calls remain
  disabled. A separate dev-server attempt hit the machine's watcher limit and
  was stopped; the production-mode runtime is already listening on port 3954.
- Focused local suite: 356 passed, 1 skipped. Security verification passed.
- Current-head `npm run test:focused`: 356 passed, 1 skipped under Node 24.
  Current-head `npm run verify:production-readiness`: `releaseReady: false`;
  the working tree is dirty, no ledger bucket is configured, and hosted/release
  evidence remains unevaluated.
- Private Skool v7 source-pack parser: 1/1 passed. A file-level audit found 64
  PDFs (32 May-labeled, 22 June-labeled, 5 July-labeled, 4 ambiguous, and the
  Oct 10 AgentOS System PDF), six top-level HTML pages, and no local video
  files. Those PDFs resolve to 60 unique lesson IDs; all 60 are in the 107-entry
  Drive register, leaving 47 register entries without a local v7 capture. No
  filename-labeled August/September or Oct 1-9 lessons are present. Pack is
  partial and not imported; parser success does not establish archive
  completeness. See `docs/skool-archive-local-inventory-2026-10-14.md`.
- Source-import SQL smoke passed in a disposable PostgreSQL container with
  networking disabled and read-only migration/fixture mounts; both source-guard
  evidence tests passed. This is local schema evidence only, not a hosted
  migration or customer-content import.
- MiroFish artifact tests: 23 passed. Human content review is incomplete;
  synthetic simulation is not market validation.
- Fresh MiroFish buyer smoke suite: 16/16 passed. The artifact audit confirms
  technical evidence (10/10 rounds, 2 active buyers, 2/2 distinct posts,
  cross-buyer quotes, and no attribution or workflow coverage errors), while
  `pilotEvidencePassed` remains false because zero of the two dynamic posts are
  human-reviewed. Both private review files are mode `0600` with blank
  reviewer/time fields. No provider request was made in this check.
- Offline audit of `sim_f91504972e42`: completed 10/10 rounds with two synthetic
  buyers and zero provider calls recorded. Both response annotations remain
  rejected/unqualified with no reviewer identity or timestamp, although their
  content hashes bind to the run artifacts. A private, explicitly
  non-authoritative review aid is at
  `/Users/aryamandev/Documents/Codex/Projects/MiroFish-Buyer-Pilot/backend/uploads/simulations/sim_f91504972e42/offline-review-assistance.md`;
  it notes that the under-$50 persona did not clearly reject/defer at the
  seeded $2,500 setup plus $1,250/month offer. No official review fields were
  changed and no new provider request was made.
- Cloud Test and Internal Beta do not expose build identity. Existing local
  runtimes report different older commits. Signed-in local parity is not
  configured in the current source env file.
- The checked-in Internal Beta runtime manifest maps `internal-beta` to
  Supabase project `ppmoqjtmjtfxadsnejqc`; topology evidence identifies that as
  the production-backed database, with `internal-beta` only a tenant. Local
  parity must remain read-only and tenant-scoped. No migration or tenant write
  is authorized by the beta-only approval.
- Visible Supabase project is production. Internal-beta migration approval does
  not authorize applying tenant-scoped intent as a production-wide function
  migration. No hosted migration or deployment has been performed.
- Internal Beta retains a seven-day object recovery window by owner choice;
  deployment remains held pending a verified retention design and live policy.
- `verify:production-readiness` reports `releaseReady: false`, with a dirty
  working tree, no release-ledger bucket, and hosted/customer approvals and
  receipts not evaluated.
- Re-inventoried the connected `School Tabs Agent OS` Drive folder: 107 items
  (98 PDFs, 3 HTML, 2 JSON, 1 ZIP, 1 Markdown, 1 Python, and 1 spreadsheet).
  The May 11-19 pack has 17 source rows/9 unique lesson IDs; the May 11-30 v2
  pack has 19 rows/10 unique IDs. Both packs' lesson IDs are already present
  in local v7, both report one discovered page uncollected, and neither closes
  the 47-ID local coverage gap. This check did not download or import their
  content.
- Created ignored owner-only local config scaffold
  `.private-client-kits/internal-beta-parity.env` with the verified Supabase
  URL and `internal-beta` tenant slug, blank anon key and allowed login email,
  and `CLIENT_PROVIDER_CALLS_ENABLED=0`. `--check-config` correctly reports
  the remaining anon-key/email requirements without printing values. No
  Supabase request or signed-in parity test has been made.
- Rechecked all three current repo `.env.local` candidates using presence-only
  diagnostics; none contains the required Supabase URL/key and allowed email
  together. Local AgentOS login ports 3939, 3941, 3942, 3943, and 3954 were not
  listening during this check. No browser sign-in or authenticated parity
  evidence was available in the currently open Chrome window, which is on a
  separate research/GitHub page.
- The 45-day application contract is already implemented as an item-creation
  clock for expiring objects and a tenant-scoped `created_at` purge for runtime
  records; live Internal Beta still reports one-day retention and the bucket's
  seven-day recovery policy remains intentionally unchanged. This local code
  evidence does not resolve physical-deletion timing or authorize deployment.

## Track Execution Rules

- Run local engineering, deterministic tests, source inventory, and evidence
  cleanup in parallel. A hosted blocker does not pause those tracks.
- Stop a track only at its own gate: hosted writes require an identified,
  approved beta target; signed-in parity requires private runtime config;
  Skool import requires reconciled source coverage and a reviewed import target;
  buyer-pilot provider calls require a current account/cost check and explicit
  run approval.
- Close each track only when its exit evidence is recorded. A test pass, an
  archived file, or a simulation is not interchangeable with hosted parity,
  complete course coverage, or real buyer validation.
- At each continuation, update the status, exact blocker/evidence owner, and
  next action here before starting additional optional integrations.

## Operating Rules

1. Keep the whole goal open until every track has its stated evidence; do not
   substitute local tests for hosted or buyer evidence.
2. Do independent local engineering, test, and archive-inventory work while
   hosted decisions are pending.
3. Before any hosted write, verify the exact project/service identity and the
   approved environment. Internal-beta approval is not production approval.
4. Do not enable provider calls, incur paid spend, alter recovery settings, or
   deploy without checking the approved cap and current provider/account state.
5. Record a blocker against one track, its owner, and the exact evidence needed
   to unblock it; do not pause other tracks because of it.

## Continuation Update - Product Build

- Commit `37dd603` removes the build-time dependency on downloading Google Fonts
  and gives the product experience local system-font fallbacks. It is pushed to
  `origin/wip/backup-2026-10-03`.
- Verification on the committed source: `npm run build` passed, `npm run lint`
  passed, and `tests/product-experience.spec.ts` passed 11/11 in Chromium,
  including the no-remote-font assertion. The unconfigured `/login` route
  returned HTTP 200 with the expected support/access state. This is an
  unauthenticated local check, not a completed customer journey or signed-in
  parity result.
- The other five modified/untracked archive, parity, and evidence paths remain
  outside this commit. Customer journey remains open until private config and
  signed-in evidence are available; hosted, Skool, MiroFish review, and release
  gates remain open as recorded above.

## Continuation Update - Skool Register Reconciliation

- A fresh read-only Drive check confirmed 107 distinct lesson IDs in the
  Markdown classroom register. The private local v7 pack has 60 matching IDs;
  47 register IDs are not captured locally, and there are no local-only IDs.
- The register lists 92 public YouTube references and 15 Skool-hosted video
  IDs. None of those references is evidence that the underlying video bytes or
  transcripts were archived.
- The Drive folder has 107 files, but its spreadsheet still records only 9 of
  108 dated lessons as archived, plus a separate System PDF. The folder also
  contains bonus files, so its 98-PDF count is not lesson coverage. The
  107-register versus 109-spreadsheet lesson total remains unresolved. Details
  are in `docs/skool-archive-local-inventory-2026-10-14.md`.
- Added `scripts/import-skool-register-graph.mjs` and focused tests to index
  register metadata into the private content graph. The merged local export
  has 736 nodes and 8,101 edges, including all 107 lesson records and their
  date/video/link references. The register contributes no page text or media
  bytes; `complete` remains false. Focused tests pass 4/4, ESLint and
  `npm run typecheck` pass. The export is mode `0600`, ignored by Git, and has
  not been imported to a hosted database.

## Continuation Update - Local Security Gate

- `npm run verify:security` passed on 2026-10-13 under the bundled Node
  24.19.0 runtime, which satisfies the repository's `>=22 <26` engine range.
  The security release gate and client-provider policy checks passed;
  lifecycle/retention tests passed 22/22; notebook execution/provenance checks
  passed 19/19; runtime and storage configuration fixtures passed 14/14. The
  remaining declared pilot and integration-manifest checks also returned
  `ok: true` with no failures.
- This run was local and made no hosted requests, deployments, database or
  storage changes, or AI-provider calls. It verifies code-level controls and
  test fixtures, not the live Cloud Run revision, live bucket policy, signed-in
  customer journey, or tenant-isolation behavior in a hosted environment.
- Hosted and release tracks remain open; this local gate is not evidence of
  live service configuration or a completed customer journey.

## Continuation Update - Private Skool Graph Content Audit

- Read-only inspection of the ignored, owner-only local graph confirmed 736
  nodes and 8,101 edges: 175 captured text segments totaling 3,739,506
  characters, plus all 107 lesson metadata records from the Drive register.
  The register contributes video and outbound-link references, not the missing
  lesson text or media. Graph provenance remains `complete: false` and
  `videoAssetsIncluded: false`.
- The private graph export and Skool-register graph tests passed 7/7 under Node
  24.19.0, including text/link preservation, incomplete provenance, duplicate
  and secret-bearing link rejection, and output-path restrictions. The local
  export remains mode `0600` and ignored by Git; no hosted import was attempted.
- Archive coverage is still partial: 47 of the 107 registered lesson IDs lack
  local page captures, the register and spreadsheet counts disagree, and video
  references do not establish archived video bytes or transcripts. A fresh
  read-only Drive listing found 107 files, but its filenames alone do not
  reconcile those 47 lesson IDs against the canonical classroom inventory.

## Continuation Update - AI Evaluation And Observability

- On Node 24.19.0, the current-source offline AI release suite passed 14/14
  deterministic cases. The owner-only receipt at
  `tmp/ai-release-local-current-2026-10-13.json` binds to source commit
  `6fb1625c7c49d25015598292f82b59b05afd4fbc`, records zero model samples and
  zero provider cost, and explicitly reports `productionReady: false`.
- Focused observability and job-trace tests passed 13/13, covering complete
  ledger reads, fail-closed pagination/data validation, trace isolation, and
  redaction of prompt, output, credential, and malformed historical metadata.
- The receipt records `workingTreeClean: false` because pre-existing archive
  and evidence changes remain uncommitted. These runs make no provider calls
  and do not establish live hosted telemetry, real model quality, buyer
  acceptance, or release readiness.
