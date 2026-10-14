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
| Local product and customer journey | In progress; unauthenticated checks pass; private config scaffold prepared | Current-source build; automated journey tests; signed-in same-user journey through intake/login, workspace, source selection, draft, provenance, review, and export | Fill `.private-client-kits/internal-beta-parity.env` locally for read-only, tenant-scoped parity. The Internal Beta runtime uses production-backed Supabase project `ppmoqjtmjtfxadsnejqc`; do not run tenant writes or migrations there. Provider calls are explicitly disabled; never share env values |
| Authorized Skool archive and graph import | In progress; 60/107 register IDs captured locally; Drive packs add no new IDs | Canonical lesson/date inventory; all authorized page text, links, and available video references/media accounted for; validated private source pack; scoped import receipt; graph counts and link checks | Collect/reconcile the 47 register IDs absent from local v7, resolve the 107-versus-109 lesson count and one uncollected page flagged by both Drive packs, and account for videos/resources; then run a scoped graph import only against the confirmed internal-beta target |
| Local/cloud parity and hosted security | Hosted changes held; local checks continue | Same build/artifact identity; same-user feature/data comparison; route allowlist, tenant isolation, storage proxy and retention verified from live beta configuration | Resolve the exact beta Supabase project/ref and approved Cloud Run service before any hosted write. Do not mutate the visible production Supabase project or deploy while target is ambiguous |
| AI quality, evaluation, and observability | Local gate passed; hosted/model quality unverified | Supported-runtime deterministic suite; reviewed model samples with quality and cost telemetry; end-to-end trace redaction and completeness evidence | Keep offline gate on Node 24; inspect the private MiroFish review file with the owner, then run only a bounded provider pilot after live Free-plan/spend-cap confirmation |
| MiroFish buyer pilot | Offline persona-frame audit passes; live-smoke content review and cost receipt pending | Reviewed generated posts bound to run inputs; audited completed run; documented limitations; real buyer interviews recorded separately from synthetic results | Inspect and disposition the two rejected generated posts, capture reviewer identity and provider usage receipt if available; do not rerun until the seeded price/brief is corrected and the $0 provider cap is verifiable |
| Release evidence and decision | Not ready | Clean commit; all required evidence attached to release ledger; hosted deployment/revision/image verified; customer, security, operations, legal, and rollback gates approved | Keep the release verifier as the authoritative gate; configure a ledger bucket only after target project and cost implications are confirmed |

## Verified Snapshot (2026-10-14)

- Branch `wip/backup-2026-10-03` is pushed. Five existing documentation or
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
  `.private-client-kits/internal-beta-parity.env` with required fields blank
  and `CLIENT_PROVIDER_CALLS_ENABLED=0`. `--check-config` correctly reports
  the four missing auth/project fields without printing values. The scaffold
  does not choose a Supabase project or establish signed-in parity.

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
