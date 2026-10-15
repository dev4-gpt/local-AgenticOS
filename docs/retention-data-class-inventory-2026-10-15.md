# AgentOS Retention Data-Class Inventory

**Status:** Working inventory; not a legal schedule or release approval  
**Decision:** 28 active days from each in-scope content item's creation, plus seven days of object recovery (up to 35 days recoverable).  
**Last reviewed:** October 15, 2026

This inventory turns the owner's retention decision into verifiable work. The
28-day content policy is not considered implemented until every persisted
tenant data class has a documented disposition and a tested deletion or
preservation path. Financial/credit records and minimized security/audit
evidence require separately approved schedules; a billing reviewer is not yet
named. Historical reports describing 45 days remain historical and are
superseded by this decision.

The exhaustive schema-level classification is maintained in
[`retention-table-map-2026-10-15.json`](./retention-table-map-2026-10-15.json).
Its verifier scans the checked-in Supabase SQL migrations and currently
reconciles all **62** declared `public.client_*` tables across 67 migration
files. The check detects missing, duplicate, or stale classifications; it does
not prove that any class is purged or that hosted configuration matches.

| Data class | Representative tables or storage | Intended disposition | Local implementation/evidence | Remaining gate |
|---|---|---|---|---|
| User-authored records and graph | `client_runtime_records`, graph nodes/edges | Active up to 28 days; derived graph rows removed with eligible source records | Bounded tenant-scoped purge, graph orphan cleanup, audit counts; local SQL tests pass | Apply approved migration only to a named target; prove scheduled/operated cleanup and post-delete reads |
| Notebook sources and extracted text | `client_notebook_sources`, `client_notebook_chunks` | Source active up to 28 days; chunks cascade with source | Bounded source purge; refuses to erase chunks newer than the source window; member writes cannot extend expiry | Hosted migration/grants, worker/read behavior, scheduler, and object/source reconciliation unverified |
| Generated files and source-pack objects | `client_runtime_artifacts`, private Cloud Storage tenant prefix | Active up to 28 days; soft-delete recovery for 7 more days | Expiry metadata is capped/backfilled locally; storage preflight expects exact 28-day lifecycle plus seven-day recovery; uploads use server proxy | Confirm the exact bucket/revision, lifecycle execution, recovery behavior and cost; current hosted configs are not aligned with this policy |
| Learning and approved revisions | `client_learning_items`, `client_ecc_skill_revisions` | Learning content up to 28 days; revisions no later than parent expiry | New policy migration caps/backfills expiry; V48 reference guard prevents young learning rows being cascade-deleted with old source records | Apply and verify migrations; validate runtime reads and bounded cleanup |
| Jobs, conversations, agent and workflow records | `client_runtime_jobs`, room messages/rounds, Paperclip, pipeline/board/loop, Hermes, Ruflo, research and Visual QA records | Tenant content/output up to 28 days unless a row is needed as minimal security/audit evidence | Lifecycle export/offboarding knows many tables; there is no universal scheduled 28-day purge covering these classes | Inventory each table's content and foreign-key dependencies; classify payload vs minimal evidence; design/test tenant-scoped cleanup and redaction |
| Requests, memberships and tenant administration | Support requests, runtime requests, provider connections, manifest proposals, onboarding/provisioning records | Operational content should expire under 28 days where feasible; identity/consent/contract records may need a separate minimal schedule | Export and offboarding paths cover a subset; no complete per-table TTL is proven | Identify purpose, legal/contractual need, owner and deletion procedure; do not erase authorization or consent evidence blindly |
| Financial and credit records | `client_runtime_budget_ledger`, managed-credit accounts/transactions, Stripe dispositions | Excluded from the 28-day content purge pending an approved financial schedule | Financial-offboard guards intentionally prevent unsafe deletion; reconciliation/history protections exist | Name billing reviewer and approve schedule, access controls, export and reconciliation procedure |
| Security and audit evidence | `client_runtime_audit_events`, worker failures, security/operational findings | Retain only minimized evidence under a separate approved schedule; do not retain customer payloads merely for audit | Some paths store aggregate/redacted metadata; no single schedule or complete minimization audit exists | Define fields, access, expiry, incident/legal hold exceptions and reviewer; test payload minimization |
| Exports, backups and vendor copies | Private lifecycle exports/object backups; Supabase/GCP backups; model/search/other subprocessors | Customer content should not remain beyond 28 active + approved recovery unless a documented exception applies | Export/offboarding creates local backup material; no automatic expiry or vendor-wide deletion proof | Establish encrypted storage, expiry job, restore test, backup/vendor terms, deletion attestations and legal holds |

## Exact Table Coverage

The machine-checked map classifies every tenant-prefixed table found in the
current product migration set. The 28-day class is only partially implemented:
runtime records and graph cleanup, Notebook sources/chunks, learning items and
revisions, artifact expiry metadata, and object lifecycle have local paths.
Notebook parent rows and the other workflow/content tables still need explicit
expiry, read rejection, and bounded deletion behavior. Tenant identity/control,
one-time tokens/rate limits, audit evidence, and financial/credit records have
separate dispositions in the map rather than being treated as ordinary content.
New `client_*` table declarations must be classified before the lifecycle gate
passes.

## Environment Evidence

- Local policy work is in the working tree and has not been applied to hosted
  Supabase or Cloud Storage.
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
