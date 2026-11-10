# ADR 007: Adapter budget enforcement

**Status:** accepted
**Date:** 2026-10-19
**Builds on:** ADR 005 (adapter host contract), ADR 006 (approval gateway)

## Decision

Adapter spending is controlled by three database functions that sit on top of the existing central ledger
(`client_runtime_budget_ledger`). There is no second ledger and no new table.

1. **One ledger.** Each charge is one central ledger row. Adapter charges have `job_id = null` (that column points
   to a real runtime job) and are tagged with `adapter_id` and `task_id` in `usage_metadata`. The per-adapter log
   table `client_adapter_budget_events` records `reserve`, `settle` and `release` and points at the ledger row.
2. **One unit.** Whole-number micros (millionths of a US dollar). Negative, fractional and non-integer amounts are
   refused in the wrapper and the database.
3. **Reserve, settle, release.**
   - `client_adapter_budget_reserve` checks, in order: worker token and input, adapter registered and in `preview`
     or `enabled`, repeated idempotency key, one reservation per task, the adapter's own cap for its period (day,
     month or total), then the tenant's monthly cap. Only then does it write the ledger row and the event.
   - `client_adapter_budget_settle` records the real cost. It cannot exceed what was reserved.
   - `client_adapter_budget_release` zeroes a reservation when a task is cancelled.
   - A task closes once: after a settle or release, further settle or release calls return `already_closed`.
4. **Same lock as the existing budget code.** All three take the per-tenant advisory lock used by
   `reserve_client_runtime_budget_worker`, so adapter and non-adapter spending cannot overspend together.
5. **Idempotent.** A repeated call with the same key returns the first answer and charges nothing more. The same key
   with different details returns `key_conflict`.
6. **Fail closed.** Any problem returns a refusal: bad token, bad input, unknown or not-ready adapter, cap
   reached. The TypeScript wrapper treats anything that is not an exact known success answer, including network
   errors and unexpected values, as "not allowed".
7. **Worker only.** The functions are granted to the host worker path (publishable key plus tenant worker token),
   not to signed-in members. The token check helper is private.

## What this does not do yet

- No page shows the spend (the Budget tab is the next Phase 1 item).
- Nothing calls these functions from a real adapter yet.
- The adapter spend total is computed by scanning ledger rows for the tenant and period. That is fine at current
  volumes; an index on the adapter tag would be a follow-up if the ledger grows.
- The tenant monthly cap is passed in by the caller (as the existing worker functions do). Nothing yet reads it
  from one place.
- Unknown costs (a provider that does not report a cost) are not shown separately yet.
- Hosted verification of concurrency is not done; see below.

## Testing

- `tests/adapter-budget-sql.spec.ts`: caps, periods, idempotency, settle and release rules, fail-closed cases, grants.
  Runs in an in-memory Postgres with one connection, so it proves the rules one request after another.
- `tests/adapter-budget-concurrency.spec.ts`: real simultaneous requests through separate connections to a real
  Postgres. It is skipped unless `ADAPTER_BUDGET_TEST_DB_CONTAINER` names a running local Postgres container. It was
  run once against a throwaway local Postgres 17 container and passed; with the lock deliberately removed, two of
  its four tests failed, which shows it can catch a race. It has not been run against a hosted database.
- `tests/adapter-budget.spec.ts`: the wrapper's input checks and fail-closed behaviour.

## Rollback

Nothing calls the functions yet. To remove them, drop the four functions
(`client_adapter_worker_ok`, `client_adapter_budget_reserve`, `client_adapter_budget_settle`,
`client_adapter_budget_release`). Ledger rows already written stay in the ledger.
