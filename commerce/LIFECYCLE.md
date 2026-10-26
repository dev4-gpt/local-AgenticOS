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

SQLite secure deletion is enabled on the content-writing connection. `--compact` checkpoints/truncates the WAL and rebuilds the local database; the tests inspect a disposable database file for erased fixture text. This is evidence for that local file, not a guarantee about filesystem snapshots, flash wear-leveling, OS backups, exported files, model-provider retention, or any external copies. No export or restore command is implemented yet. Copying an old database over the live database can resurrect old state and must not be used as an application restore procedure; a protected restore with replay/authority safeguards remains required.

The machine-readable [table inventory](lifecycle-inventory.json) classifies every current Commerce table. A regression check fails if a new table lacks a classification. This is inventory coverage, not proof that every policy is implemented. Remaining work includes protected export/restore, row/skeleton cleanup, account offboarding, auth-row cleanup independent of login, a purge schedule, shared host lifecycle wiring, external deletion receipts and owner-approved financial retention.
