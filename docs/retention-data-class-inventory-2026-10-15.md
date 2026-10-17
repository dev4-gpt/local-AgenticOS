# AgentOS Retention Data-Class Inventory

**Status:** Working inventory; not a legal schedule or release approval  
**Decision:** All tenant data and files have per-item active retention of up to 28 days, followed by seven recovery-only days; purge at each item's active expiry plus seven days (up to 35 days from creation).
**Last reviewed:** October 17, 2026

This inventory turns the owner's all-tenant-data retention decision into
verifiable work. The policy is not implemented until every persisted tenant
data class, file, export, backup, and vendor copy has a tested active-expiry
barrier and seven-day recovery/purge path. Financial/credit and security/audit
records are not silently exempted: determine whether statutory, contractual,
or incident-hold requirements conflict with this maximum and document any
approved exception before launch. Historical reports describing 45 days are
superseded by this decision.

The exhaustive schema-level classification is maintained in
[`retention-table-map-2026-10-15.json`](./retention-table-map-2026-10-15.json).

Room's local contract now uses a fixed conversation deadline, not last activity.
Messages, rounds, copied job payloads and approved directives cannot obtain a
later source window. Reads/admission stop at effective expiry; cleanup waits
seven recovery days and cannot cascade across tenants. Ordinary restore carries
the same clocks and validates source relationships after all parents exist.
This is synthetic SQL/handler evidence, not operated hosted deletion, recovery,
vendor-copy expiry or an exception for long-running conversations.
Its verifier scans the checked-in Supabase SQL migrations and currently
reconciles all **62** declared `public.client_*` tables across the 82 current
product migration files.
The check detects missing, duplicate, or stale classifications; it does
not prove that any class is purged or that hosted configuration matches.

| Data class | Representative tables or storage | Intended disposition | Local implementation/evidence | Remaining gate |
|---|---|---|---|---|
| User-authored records and graph | `client_runtime_records`, graph nodes/edges | Active up to configured item expiry (maximum 28 days), recovery-only for 7 more days, then purge | Local record RLS and privileged search/export functions enforce active expiry; graph-node/edge RLS hides expired-derived documents, tags, URLs, and edges immediately; refresh indexes only active records; bounded tenant-scoped purge at active expiry + 7 days with graph orphan cleanup and audit counts; synthetic SQL/route tests | Apply approved migration only to a named target; prove scheduled/operated cleanup, recovery, and post-delete reads; user-downloaded export files are outside service control |
| Notebook containers, sources and extracted text | `client_notebooks`, `client_notebook_sources`, `client_notebook_chunks` | Each item's own active expiry, then 7-day recovery; chunks must also finish recovery before parent cascade | Notebook parent metadata has an RLS age boundary and bounded purge; source purge now uses stored expiry + 7 days and defers while chunks remain recoverable | Hosted migration/grants, worker/read behavior, scheduler, object/source reconciliation, and expired-container reference behavior unverified |
| Generated files and source-pack objects | `client_runtime_artifacts`, private Cloud Storage tenant prefix | Active per item up to 28 days, recovery-only for 7 more days, then permanent deletion | Local uploads/restores carry an expiry-derived Custom-Time anchor; proposed rules include age fallback and original-deadline eligibility. Restore binds a reviewed destination policy/hash. Schema-4 object/cloud receipts reject absent/inconsistent clocks, blocking minimum retention and deadlines beyond the original expiry plus seven days and require a stable project/tenant-bound artifact/object metadata crosswalk; uploads remain server-proxied | Hosted application, operated artifact/object crosswalk, permitted recovery references, legacy metadata, actual deletion/recovery timing, cleanup and cost remain unverified; asynchronous lifecycle eligibility is not 28+7 enforcement proof |
| Learning and approved revisions | `client_learning_items`, `client_ecc_skill_revisions` | Active per-item expiry, recovery-only for 7 days, then purge | Policy migration caps/backfills expiry; CLI learning cleanup now selects only records whose active expiry was at least 7 days ago; V48 reference guard protects newer dependents | Verify complete runtime read barriers and deployed bounded cleanup; local recovery coverage is not hosted evidence |
| Jobs, conversations, agent and workflow records | `client_runtime_jobs`, room messages/rounds, Paperclip, pipeline/board/loop, Hermes, Ruflo, research and Visual QA records | Each tenant-content item active to its expiry, recovery-only for 7 days, then purged | Runtime-job, Agent Room, Visual QA, Pipeline, Board, Loop, Paperclip, Hermes Content Factory, and Ruflo content have local age barriers and bounded service-role purge RPCs; child cleanup runs before parents, while younger Ruflo agent rows keep their own expiry and defer swarm deletion. Structured research, runtime request/action, and support rows also have local age boundaries and bounded purge RPCs. | Verify hosted grants, recovery, retries, deletion reads, exports, and scheduler |
| Requests, memberships and tenant administration | Support requests, runtime requests/actions, provider connections, manifest proposals, onboarding/provisioning records | Operational content should expire under 28 days where feasible; identity/consent/contract records may need a separate minimal schedule | Tenant-linked runtime requests/actions and support requests now have immutable creation timestamps and bounded purge RPCs wired into the lifecycle CLI with explicit apply confirmation; support access is already denied to tenant members. Onboarding token and runtime rate-limit hashes have bounded service-role purges after a seven-day recovery window. Public inquiries without a tenant link and the remaining administrative records are not covered | Verify the onboarding-token and rate-limit purges are deployed and operated; identify purpose, legal/contractual need, owner and deletion procedure for the remaining records; do not erase authorization or consent evidence blindly |
| Financial and credit records | `client_runtime_budget_ledger`, managed-credit accounts/transactions/plans/reservations, Stripe dispositions and webhook metadata | Managed-credit detail is active for 28 days, recovery-only for seven more days, then linkage is purged at day 35. Preserve nonzero current wallet/provider balances until spent or refunded. Late Stripe refunds/disputes go to manual review; only opaque global replay digests survive detail deletion. | V49 adds tenant-scoped bounded day-35 deletion of managed-credit transactions, plans/allocations, reservation events/reservations and claims; replay digests contain neither raw idempotency keys nor tenant slugs. Current nonzero wallet/provider balances remain; zero provider counters are scrubbed after day 35. Expired provider snapshots retain available/reserved values while masking historical totals. Signed late refund/dispute events queue a minimal review disposition; operator review is audit-only and does not change balances. PGlite tests execute the migration and test deletion, balance, replay, privilege and timestamp behavior. | **Fail pending hosted evidence.** V49 has not been applied to a hosted project and no purge schedule has been operated. Billing/legal retention obligations remain unverified. Stripe event IDs/hashes and append-only dispositions remain platform-level replay/review controls and need an approved retention schedule. Verify hosted grants, actual review queue operation, recovery, and read-after-purge behavior before release. |
| Security and audit evidence | `client_runtime_audit_events`, worker failures, security/operational findings | Tenant audit content expires at configured active expiry and is purge-due after 7 recovery days | New local migration adds active read expiry, immutable server timestamps, and bounded tenant-scoped service-role purge with aggregate purge receipts | Audit metadata minimization, worker-failure/security findings coverage, legal-hold behavior, hosted migration and scheduled cleanup remain unverified |
| Exports, backups and vendor copies | Private lifecycle exports/object backups; Supabase/GCP backups; model/search/other subprocessors | Tenant data and files remain subject to active expiry + 7-day recovery across copies | Memory export now excludes data outside the tenant's active window and aborts if an included row expires mid-export; export/offboarding still creates local backup material with no automatic expiry or vendor-wide deletion proof; downloaded Markdown cannot be revoked by the service | Establish encrypted storage, expiry job, restore test, backup/vendor terms, deletion attestations and legal holds |

The local Cloud Storage object-inventory verifier requires each soft-deleted
generation's hard-delete deadline to equal its soft-delete time plus the full
seven-day recovery interval, and separately caps total age at 35 days from
creation. This validates supplied inventory metadata only; it does not inspect
or prove the hosted bucket lifecycle.

## Exact Table Coverage

The machine-checked map classifies every tenant-prefixed table found in the
current product migration set: 62 declared tables across 82 SQL migration
files. Local age barriers and bounded, service-role purge paths now cover
runtime records and graph cleanup, Notebook containers/sources/chunks,
structured research, tenant-linked runtime requests/actions and support,
learning items and revisions, runtime jobs, Agent Room, Visual QA, Pipeline,
Board/Loop, Paperclip, Hermes Content Factory, and Ruflo. The local tests check
tenant scope, item expiry, recovery boundaries, child-first cleanup, bounded
batches, and audit rollback for those implemented classes. Artifact metadata
and object lifecycle have separate local controls.

This is not complete implementation of the selected all-data policy. Runtime
budget details and tenant audit rows now have local read-expiry and bounded
purge logic. Managed-credit detail also has a local day-35 purge path and late
refund/dispute review handling, but hosted migration/scheduling, accounting
requirements, global webhook-control retention, security payload minimization,
tenant identity/control and administrative records, exports, backups, vendor
copies, hosted grants, and hosted recovery/read-after-delete evidence remain
open. New `client_*` table declarations must be classified before the lifecycle
gate passes.

Onboarding and rate-limit hashes have narrower local paths: verification/setup
rejects expired tokens, and service-role lifecycle RPCs preview or purge token
hashes after `expires_at` plus seven recovery days. The rate-limit migration
preserves each bounded active window and purges after that window plus seven
recovery days. These paths are locally tested but hosted migration and scheduled
operation remain unverified. Public inquiries without a tenant link and the
remaining administrative records are not covered by these token/hash results.

### Per-Item Expiry and Foreign-Key Safety

The selected clock is per item, not per tenant and not inherited automatically
from a parent. This matters because many workflow tables use `ON DELETE CASCADE`:
deleting an old run, conversation, task, report, or source can delete a newer
child before its own 28-day deadline. A generic parent-table purge would
therefore violate the policy even if it were tenant-scoped and batch-limited.
The V48 learning-reference migration already demonstrates one mitigation by
nulling old source references instead of deleting a newer learning item.

Before a table family receives a purge path, its design must identify the
retention owner row, every referencing row, each row's own creation/expiry
clock, and whether the relationship can be nulled without breaking the product.
Eligible children should be expired first; a parent must not be removed while
it would cascade-delete a younger row. Where a reference is required, preserve
the child and defer parent deletion only if that exception is explicitly
accepted, or redesign the reference with a tested tombstone/minimized snapshot.
The implementation must also make expired content unreadable at day 28 even
when physical deletion is delayed for dependency safety. Never solve the
conflict by extending the child's expiry or by silently shortening it.

All tenant data becomes unavailable for ordinary use at its per-item active
expiry. Retain it only in a recovery-only state for seven additional days,
then permanently purge it. Database rows, object bytes, exports, backups and
vendor copies each need explicit controls; one subsystem's purge must not be
reported as proof for another. Hosted configuration remains unchanged until
the exact target, lifecycle, and recovery behavior are verified.

## Environment Evidence

- Local policy work is in the working tree and has not been applied to hosted
  Supabase or Cloud Storage.
- Ruflo swarm and agent rows now have local per-item age barriers and a bounded
  child-first purge. Synthetic coverage is tracked separately; hosted migration
  and scheduled-operation evidence are still required.
- Earlier October 16, 2026 verification passed **385/386** focused tests (one
  intentional skip) and **84/84** lifecycle tests. Those counts are historical
  and superseded by the current-candidate refresh below. All local suites
  exercise fixtures and source contracts; they do not apply migrations or
  verify hosted cleanup.
- Earlier current-candidate refresh on October 16, 2026: `npm run verify:security`
  passed, including **85/85** lifecycle tests, classification of **62/62**
  tenant tables across **81** migrations, **29/29** Notebook provenance tests,
  and **26/26** runtime/storage configuration fixtures. `npm run test:focused`
  passed **423** with **1** optional private-source-pack skip; `npm run
  typecheck` and `npm run build` passed. The candidate-bound offline AI
  evaluation passed **16/16** with zero model samples, and the isolated
  synthetic Notebook browser journey passed **4/4**. The strict readiness report remains
  `releaseReady: false`: the worktree is dirty, the ledger bucket and release
  environment are not configured, and **54** evidence categories remain
  unevaluated. Hosted deployment, migration, scheduler, journey, buyer,
  financial/legal, backup, and vendor-copy receipts remain absent. Its counts
  were superseded by the retention-specific candidate refresh below.
- Retention candidate refresh on October 16, 2026 (the exact candidate
  fingerprint is recorded in the local release evidence file):
  `npm run verify:client-lifecycle` passed **88/88** tests and reconciled
  **62/62** tenant tables across **82** SQL migrations. The new audit/budget
  retention tests cover active-read expiry, seven-day audit recovery, the
  fixed 28+7 runtime-budget schedule, tenant-scoped bounded deletion, privileged
  purge access, and timestamp immutability. Fresh lifecycle exports now omit
  audit and budget detail outside the active window. The candidate-bound AI
  evaluation passed **16/16** under Node 24 with zero model calls and zero
  provider cost; the isolated synthetic Notebook handler journey passed
  **4/4** scenarios (plus **3/3** receipt-contract checks). The strict report
  remains `releaseReady: false` with gates `working_tree_clean`,
  `ledger_bucket_not_configured`, and `release_environment`; **54** categories
  remain unevaluated. These are local fixture results only: no hosted migration,
  cleanup, data deletion, or deployment was performed. Managed-credit/Stripe
  retention, audit-payload minimization, exports/backups/vendor-copy expiry,
  and hosted deletion/recovery proof remain open.
- Local restore-preflight follow-up on October 16, 2026:
  `npm run verify:client-lifecycle` passed **90/90** tests plus the mocked
  restore verifier and **62/62** table classification. Full-snapshot row/tenant
  validation and requested backup-directory checks now precede any restore
  writes, including dry-run validation. This prevents the reproduced partial
  metadata write on a later cross-tenant row. It does not prove transaction
  rollback, object completeness/hashes, expiry/encryption, or hosted recovery;
  later database/cloud-copy failures can still leave a partial restore.
- Object-backup integrity follow-up on October 16, 2026: lifecycle verification
  passed **95/95** local tests plus the existing CLI verifier and table inventory.
  New object exports record snapshot-bound local SHA-256/MD5/size manifests;
  restore checks exact contents and ready-artifact coverage before any write,
  and performs create-only, checksum-constrained object transfers before
  metadata insertion. Offboarding rechecks local hashes before suspension
  and deletion. Tests cover same-size corruption, truncation, missing/extra
  files, snapshot mismatch, path/tenant escape, symlinks, copy failure, exact
  destination keys, and the actual CLI export path. This is not remote source
  checksum parity, a signed authenticity guarantee, backup expiry/encryption,
  an atomic restore, or hosted deletion/recovery evidence. The required
  lifecycle across all copies remains unverified.
- Ordinary artifact-restore expiry follow-up on October 17, 2026: the local
  CLI now rejects expired artifact metadata in both dry-run and apply preflight,
  including day-28-to-35 recovery-only content. It requires original creation
  and expiry clocks capped by the verified tenant window (at most 28 days),
  exact ready-artifact/file correspondence, and rechecks expiry before every
  metadata insert batch. Missing clocks, future creation, extended expiry,
  unregistered files and files attached only to pending artifacts fail closed.
  A deterministic transfer-time expiry test confirms that metadata insertion
  stops if a file expires while copying. Existing metadata clocks are not
  rewritten. This is an ordinary-restore barrier, not a seven-day recovery
  implementation: recovery-only content needs a separate controlled path.
  Cloud object creation clocks, partial-transfer cleanup, atomic metadata
  rollback, backup expiry/encryption, other table families and hosted recovery
  remain unverified. Current candidate results belong in
  `tmp/restore-expiry-release-evidence-2026-10-17.json`; do not infer a complete
  all-copy retention pass from these local tests.
- Atomic metadata restore follow-up on October 17, 2026: local SQL execution
  reproduced an ordinary insert renewing a 20-day-old record to the current
  timestamp. The CLI now uses a service-role-only, create-only metadata RPC
  with one transaction instead of sequential upserts. A protected final insert
  guard preserves original clocks; the RPC verifies those returned clocks and
  rolls back on later row/clock/constraint failure. Local tests exercise actual
  record, Pipeline and Notebook source guards, 501-row batching, forged member
  context, expired/future/missing clocks, tenant/column boundaries and existing
  target conflicts. Its 49 table projections match the CLI export allowlist.
  An added ECC regression rejected the first candidate's acceptance of an
  expired revision. The revised RPC validates both expiry column names and
  refuses previous learning approvals or unrevoked revision evidence.
  The migration is not applied to any hosted project. Other table-family
  constraints, recovery-only access, Cloud Storage clocks/cleanup, cross-resource
  rollback and backup/vendor expiry remain unverified. The final receipt is
  `tmp/restore-transaction-eligibility-release-evidence-2026-10-17.json`; earlier restore
  receipts do not accept this changed candidate.
- Read-only Cloud Test evidence dated October 15 showed `CLIENT_RETENTION_DAYS=14`.
  Earlier Internal Beta evidence showed a one-day runtime setting and one-day
  object lifecycle with seven-day recovery. These are different environments
  and neither is evidence of the selected policy.
- The selected 28+7 rule is not a reason to disable recovery. Do not change the
  existing recovery setting or deploy a new Cloud Run revision as part of this
  local implementation step.

## Acceptance Criteria

1. Every tenant table, object class, export, backup and vendor copy is mapped to
   a data class and has a named disposition.
2. Each in-scope content class becomes inaccessible by day 28 from item
   creation; only explicitly approved recovery copies remain recoverable for
   the following seven days.
3. Financial/credit and minimized security/audit evidence have named owners,
   approved schedules and verified access boundaries.
4. Automated, tenant-scoped expiry and deletion tests cover boundaries,
   retries, foreign-key dependencies, legal holds and failure rollback.
5. A hosted receipt identifies exact project, tenant, revision, bucket, schema
   and policy; read-after-expiry and post-deletion checks pass without exposing
   another tenant's data.
6. Backup and vendor retention/deletion evidence is attached. Otherwise the
   release claim must state the unverified limitation and remain blocked.
