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
| Local product and customer journey | In progress; unauthenticated checks pass | Current-source build; automated journey tests; signed-in same-user journey through intake/login, workspace, source selection, draft, provenance, review, and export | Continue local tests and customer-journey fixes. Signed-in parity needs a private env file containing Supabase URL/anon key, client slug, and allowed email; provide its path only, never the values |
| Authorized Skool archive and graph import | In progress; archive incomplete | Canonical lesson/date inventory; all authorized page text, links, and available video references/media accounted for; validated private source pack; scoped import receipt; graph counts and link checks | Reconcile the Drive lesson register against its spreadsheet manifest and local v7 pack. The manifest reports 9/108 dated lesson pages archived; preserve conflicting captures and identify missing pages/videos before import |
| Local/cloud parity and hosted security | Hosted changes held; local checks continue | Same build/artifact identity; same-user feature/data comparison; route allowlist, tenant isolation, storage proxy and retention verified from live beta configuration | Resolve the exact beta Supabase project/ref and approved Cloud Run service before any hosted write. Do not mutate the visible production Supabase project or deploy while target is ambiguous |
| AI quality, evaluation, and observability | Local gate passed; hosted/model quality unverified | Supported-runtime deterministic suite; reviewed model samples with quality and cost telemetry; end-to-end trace redaction and completeness evidence | Keep offline gate on Node 24; inspect the private MiroFish review file with the owner, then run only a bounded provider pilot after live Free-plan/spend-cap confirmation |
| MiroFish buyer pilot | Technical artifacts pass; content review and market evidence pending | Reviewed generated posts bound to run inputs; audited completed run; documented limitations; real buyer interviews recorded separately from synthetic results | Human-review the two generated posts in `MiroFish-Buyer-Pilot`; do not count simulation outputs as customer demand |
| Release evidence and decision | Not ready | Clean commit; all required evidence attached to release ledger; hosted deployment/revision/image verified; customer, security, operations, legal, and rollback gates approved | Keep the release verifier as the authoritative gate; configure a ledger bucket only after target project and cost implications are confirmed |

## Verified Snapshot (2026-10-14)

- Current source commit: `42a4d141bee9aa650419d8858a605783147753c3` on
  `wip/backup-2026-10-03`; branch is pushed. Five existing documentation or
  evidence paths are uncommitted and must be reviewed, not silently discarded.
- Node 24 local AI evaluation: 14/14 deterministic cases passed; zero model
  samples and no provider requests. Production readiness is still false.
- Current-source standalone client production build completed on Node 24. Fresh
  loopback checks on 2026-10-14 returned `/login` 200, `/memory` 307 to login,
  and protected build identity 401 without a session. This confirms the
  unauthenticated boundary, not signed-in parity. Provider calls remain
  disabled. A separate dev-server attempt hit the machine's watcher limit and
  was stopped; the production-mode runtime is already listening on port 3954.
- Focused local suite: 356 passed, 1 skipped. Security verification passed.
- Private Skool v7 source-pack parser: 1/1 passed. A file-level audit found 64
  PDFs (32 May-labeled, 22 June-labeled, 5 July-labeled, 4 ambiguous, and the
  Oct 10 AgentOS System PDF), six top-level HTML pages, and no local video
  files. No filename-labeled August/September or Oct 1-9 lessons are present.
  Pack is partial and not imported; parser success does not establish archive
  completeness. See `docs/skool-archive-local-inventory-2026-10-14.md`.
- MiroFish artifact tests: 23 passed. Human content review is incomplete;
  synthetic simulation is not market validation.
- Cloud Test and Internal Beta do not expose build identity. Existing local
  runtimes report different older commits. Signed-in local parity is not
  configured in the current source env file.
- Visible Supabase project is production. Internal-beta migration approval does
  not authorize applying tenant-scoped intent as a production-wide function
  migration. No hosted migration or deployment has been performed.
- Internal Beta retains a seven-day object recovery window by owner choice;
  deployment remains held pending a verified retention design and live policy.
- `verify:production-readiness` reports `releaseReady: false`, with a dirty
  working tree, no release-ledger bucket, and hosted/customer approvals and
  receipts not evaluated.

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
