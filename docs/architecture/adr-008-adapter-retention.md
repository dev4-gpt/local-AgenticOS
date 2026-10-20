# ADR 008: Adapter data retention (28 days active, 7 days recovery)

**Status:** accepted for local use; not applied to any hosted database
**Date:** 2026-10-19
**Builds on:** ADR 005 (adapter host contract), ADR 006 (approval gateway), ADR 007 (adapter budget)

## Decision

Adapter data follows the same rule as every other client table: active for the tenant's configured days (at most
28), then recovery-only for 7 days, then purged. The wiring copies the pattern the other table families already use.

1. **A per-row expiry.** `client_adapter_memory_items`, `_promotions`, `_provenance`, `_approvals` and
   `_budget_events` get `retention_expires_at`. A trigger sets it at insert to now plus the tenant's
   `retention_days`, whatever the caller sent, and refuses any later change. Existing rows are backfilled from their
   creation time.
2. **A read barrier.** Member read policies add `retention_expires_at > now()`, so expired rows disappear
   immediately. Expired promotions and approvals can no longer be decided.
3. **A purge.** `purge_expired_client_adapter_records(tenant, apply, batch)` is service-role only, tenant-scoped,
   batched, and a dry run unless `apply` is true. It acts on rows whose expiry is more than 7 days old:
   - It erases the text of due notes first (the existing tombstone form), announces erased shared notes to adapters
     through the outbox (`memory.tombstoned`, reason `retention_expired`), and clears the free-text note and scan
     result of due promotions. So no text outlives the window, even when a row has to stay a little longer.
   - It then removes rows child-first: provenance, budget events, approvals, shared notes, promotions that nothing
     points at, and private notes that nothing points at. A newer note that superseded a removed one keeps existing
     and loses only the link.
   - It purges outbox rows 7 days after acknowledgement (or the tenant's days plus 7 if never delivered) and token-use
     rows one day after expiry.
   - It writes an audit event with counts only.
4. **Append-only stays append-only.** The purge sets the transaction-local flag `veloce.adapter_purge`, which the
   append-only triggers already honour, and switches it off again. The promotion guard honours the flag only for
   clearing the note and scan result, not for changing a decision.
5. **Opt-in in the lifecycle command.** `scripts/client-lifecycle.mjs retention` runs the adapter purge only with
   `--include-adapter-host`, and applies it only with `--confirm-retention-adapter`. This keeps installations without
   the adapter host (every hosted one today) working. Make it default once the adapter host is installed.

## Known limits

- **Skeleton rows can outlive 35 days briefly.** A shared note points at its promotion and a promotion at its source
  note, and the shared note is created last, so it expires last. The earlier rows stay as empty shells (text erased,
  hidden from members) until the shared note is purged. The erased note still carries its content hash.
- **Recovery blocks re-sharing the same fact.** An expired but unpurged shared note keeps its hash slot, so the same
  fact cannot be shared again until it is purged.
- **Approvals and budget events** use the same schedule provisionally. Their retention classes still need owner
  confirmation (tracker item 11).
- **Nothing runs the purge on a schedule.** It runs when an operator runs the lifecycle command.
- **Not verified in a hosted environment.** The tests run in an in-memory Postgres.
- **Outside the guarantee.** Adapters' own stores are not reached by any of this (X-2).

## Offboarding export and restore

The adapter tables are part of the tenant backup (`scripts/client-lifecycle.mjs export`) and the protected restore
(`restore_client_lifecycle_metadata`).

- **Exported:** the registry, memory items, promotions, provenance, approvals and budget events, each with its original
  dates and expiry. **Not exported:** the outbox and token-use rows (short-lived operational state).
- **Restored with the original dates.** The restore checks the active window as it does for every other table: expired
  rows, or rows with an expiry longer than the tenant's days, are refused and nothing is restored.
- **Adapters come back disabled,** with their caps. Someone turns them on again on purpose.
- **Approvals that could still be used never come back.** A pending or approved approval is restored as expired (the
  command line converts it; the database refuses it if it arrives anyway). Finished ones return as evidence. An approval's
  own `expires_at` is a short request expiry, so the restore does not treat it as a retention date.
- **A protected restore only.** The guards that normally force new promotions to start quarantined and new approvals to
  start pending, and that require a shared note to point at an approved promotion, step aside only when the service role
  is running the restore for that same table and tenant (`client_adapter_restoring`). The foreign key from notes to
  promotions is deferrable, because the two point at each other. After all rows are in, the restore checks the whole
  picture (`validate_client_adapter_restore_graph`): every shared note has an approved promotion of the same adapter and
  content hash, and every promotion has its private source note. If not, the whole restore is rolled back.
- **Trust boundary, stated plainly.** Whoever can run SQL as the service role could set the restore context themselves,
  as with the other tables' restore clock guard. This protects against mistakes and ordinary callers, not against a
  service-role holder.
- **Checked against the real migration chain.** `tests/client-schema-upgrade.spec.ts` now applies the adapter migrations
  after the earlier migrations and before the restore migration, and checks all 55 restore projections.

## Testing

`tests/adapter-restore-sql.spec.ts` covers the round trip, disabled adapters, expired and half-restored data, usable approvals, broken graphs, tables that cannot come back, and the shortcuts being closed outside a restore (three deliberate breakages each fail tests). `tests/adapter-retention-sql.spec.ts` covers expiry stamping and immutability, the read barrier, the recovery window,
dry run versus apply, the linked-row ordering, supersede links, tenant isolation, batch limits, the outbox and token
clocks, grants and bad input, and the backfill. Three deliberate breakages (no read barrier, no recovery window, no
erase step) each make tests fail.

## Rollback

Leave `--include-adapter-host` off and the purge never runs. The new column is additive; to remove the feature, drop
the five stamp triggers, the purge function and the `retention_expires_at` columns, and restore the earlier select
policies from `supabase-client-adapter-host.sql`.
