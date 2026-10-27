# Standalone content lifecycle

This documents what the local Commerce implementation enforces. It does **not** complete Veloce's shared 28 + 7 lifecycle or resolve financial record retention. Use public or synthetic source material until the full client-data gates in the Veloce guide pass.

Sources entered through the application expire 28 days after submission. The server refuses extending the stored expiry when importing or updating the same source, and refuses new sources with an active window beyond 28 days from admission. A different source ID is a new record: the trusted importer must preserve the original clock and not re-ingest expired copies as new material. Proposals last at most 28 days from creation and expire no later than their supporting sources; the UI currently issues a shorter three-day proposal. Project content inherits proposal expiry. Source and proposal reads stop at the original expiry; recovery days do not confer execution authority.

The privileged maintenance command redacts due content once the original expiry is seven days old. It is tenant-scoped, transactional, bounded per table, idempotent, and a **dry run by default**. No browser route exposes it. For example, from the `commerce` directory with Node 24 on PATH:

```sh
node src/cli.mjs retention --tenant owner-dev --data-dir /YOUR/PRIVATE/DIRECTORY
```

Review the counts, stop the server and other database readers, then apply the reviewed operation locally:

```sh
node src/cli.mjs retention --tenant owner-dev --data-dir /YOUR/PRIVATE/DIRECTORY --apply --batch 100 --compact
```

Repeat preview/apply until all counts are zero when there is a backlog. Each content table gets its own batch; a large source backlog cannot starve proposal cleanup. These are operator commands, not a scheduled job. A failed redaction rolls the complete transaction back. If compaction fails after that transaction commits, the logical redaction remains committed; stop other readers and run maintenance with `--apply --compact` again. No financial record is deleted by this command.

Applied cleanup removes source title/content and any imported extra fields; proposal title/body/commercial description; project title/tasks; free-text review rejection reasons; due draft model metadata; and due buyer checkout URLs. Source/proposal/project identifier and hash skeletons remain. The outbox is held for review. A late verified payment observation can still record the actual payment, but cannot resurrect source text or authorize kickoff. Replayed events retain their deduplication identity.

An expired checkout URL is hidden immediately in every returned intent, independently of the cleanup schedule. Provider IDs, amounts, proposal digest, original expiry, approval identities, claims and event hashes remain available for payment reconciliation. Their retention duration is unresolved; the interface must not claim that all tenant data disappears at 35 days.

SQLite secure deletion is enabled on the content-writing connection. `--compact` checkpoints/truncates the WAL and rebuilds the local database; the tests inspect a disposable database file for erased fixture text. This is evidence for that local file, not a guarantee about filesystem snapshots, flash wear-leveling, OS backups, exported files, model-provider retention, or any external copies. The protected snapshot workflow below is available. Copying an old database over the live database can resurrect old state and must not be used as an application restore procedure.

The machine-readable [table inventory](lifecycle-inventory.json) classifies every current Commerce table. A regression check fails if a new table lacks a classification. This is inventory coverage, not proof that every policy is implemented. Remaining work includes shared-host export/restore binding, row/skeleton cleanup, account offboarding, auth-row cleanup independent of login, a purge schedule, shared host lifecycle wiring, external deletion receipts and owner-approved financial retention.


## Protected operator export and restore

Stop the server and other database writers before either command. Backups contain source and proposal text, membership identifiers and financial references: keep them locally in a private directory (0700), outside the repository, and manage their own expiry/deletion. They are not encrypted by this application. Authentication users, password verifiers, sessions, login-limit buckets, and provider credentials are excluded.

```sh
node src/cli.mjs export --tenant owner-dev --data-dir /PRIVATE/SOURCE --output /PRIVATE/BACKUPS/workspace.json
```

The output file is created exclusively with mode 0600; an existing file is never overwritten. Export is one database transaction, includes all selected rows or refuses an oversized snapshot (5 MB / 5,000 rows per table), strips checkout URLs, and replaces expired or withdrawn content with identifier/hash skeletons. It does not export the seven-day recovery text. Active content with no trustworthy original creation/expiry fields is refused, including legacy privileged source imports without a creation date. No clock is invented to make such an export pass.

Restore targets a separately initialized **empty** workspace with the same tenant, policy and sandbox merchant. It never rolls an existing ledger back to an older backup. The operator initializes the target using `init` before restoring; no accounts or memberships should be provisioned in the target yet.

```sh
node src/cli.mjs init --tenant owner-dev --merchant SANDBOX_MERCHANT_ID --data-dir /PRIVATE/TARGET
node src/cli.mjs restore --tenant owner-dev --data-dir /PRIVATE/TARGET --input /PRIVATE/BACKUPS/workspace.json
node src/cli.mjs restore --tenant owner-dev --data-dir /PRIVATE/TARGET --input /PRIVATE/BACKUPS/workspace.json --apply --expected-digest DIGEST_FROM_PREVIEW
```

The first restore command validates and previews without applying. The apply command must repeat the exact SHA-256 digest from that preview. This digest binds the reviewed file; it is **not** a cryptographic signature authenticating whoever created a backup. The local operator is trusted and must choose the intended snapshot. The application validates table/column allowlists, tenant consistency, relationships, content hashes, proposal digests, original active windows and payment mappings. Failure rolls back the entire restore.

Every restored membership is inactive. Active source content keeps its original expiry, receives a new revision and returns to quarantine with unknown sensitivity. Every imported approval is permanently revoked in a separate denial table, even if someone later enables a member. Historical operation claims are replaced and marked for reconciliation, unfinished drafting is failed, payment intents are held, kickoff outbox rows are held, and projects return for review. Provider order/capture mappings and tenant-attributed event identity remain available to deduplicate/reconcile actual payment facts. No payment API is called by restore.

A restored workspace is therefore a recovery staging state, not a runnable continuation of the old commercial authority. Identity remapping/reactivation and approval of recovered sources need an explicit operator workflow, which is not yet provided by the CLI; the privileged store interface exists for a future Veloce host binding. New work needs a fresh proposal and review. The application has no command that un-revokes a restored approval.

New mapped webhook inbox rows carry tenant attribution. Older inbox tables are upgraded additively; processed legacy rows with no tenant cannot safely be guessed, so **export is refused** if any remain. Unmapped ignored events have no tenant and are excluded. No claim of complete legacy recovery is made. The snapshot omits prior restore-audit rows but retains approval-revocation evidence; the destination writes a new digest/time audit that also prevents applying a second restore into that workspace.


Snapshot schema 2 adds the immutable proposal parent-revision column. Restore also accepts schema 1 snapshots from before that column existed, importing those proposals as roots. Version 2 restore validates parent existence, acyclic ancestry, the original author's identity, the parent rejection decision, and unchanged evidence/terms/policy/creation/expiry across corrections. The database permits only one successor per parent revision. Superseded revisions retain their original content clock and are purged on the same schedule; correction cannot renew it.

The optional draft runtime uses a separate database and inventory described in [DRAFT-RUNTIME.md](DRAFT-RUNTIME.md). Its result expiry/purge and replay skeleton policy do not share the application backup/restore path. Its h1 deletion guarantee is `none`; no shared source-withdrawal receipt or client deployment guarantee is implied.
