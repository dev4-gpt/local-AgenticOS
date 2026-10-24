# ADR 016: Reconciling an adapter's reported spend with the host's budget ledger

**Status:** decided 2026-10-23 with the owner (D1 to D6); built in Phase 2 slice 3b. Applied to the staging database and checked in a browser 2026-10-24.
**Builds on:** ADR-005 (the adapter host contract), ADR-013 (the events puller), ADR-015 (the scheduled sync job), tracker item 6 (budget).
**Closes:** the host half of the tracker item "Budget feed reconciles with the host ledger".

## The problem

The host has a budget ledger with per-adapter caps: reserve before a task, settle after, release on cancel. But the amount
the host settles is whatever its caller says, and an adapter's own per-task limit is only the factory's hard cap inside the
adapter. Nothing compared what the adapter says a task cost with what the host recorded, so spend the host never
authorised, or spend above a reservation, would have been invisible.

## Decision

1. **The adapter reports.** Content OS adds `spentMicros` (whole micros of a dollar, rounded to the nearest micro, summed over
   every step of the task) to the final `task.state` event. It is optional, it is left out when the cost log cannot be read or
   holds a number that is not a usable amount, and a failed task reports what it spent before failing. Nothing else about the
   task goes with it.
2. **The host records it once per task.** The puller validates the number (a whole number from 0 to one trillion) and calls
   `client_adapter_budget_record_report`. It is stored as an outbox event `budget.reported` holding the task id and the number,
   with an event id derived from tenant, adapter and task, so reading the feed again records nothing twice and the first
   report stands. A database that does not answer, or an adapter that is not active, stops the run with the cursor kept just
   before that task; a malformed number is counted as `bad_spend` and skipped.
3. **No new table.** Deviation from the first plan, which had a small separate table: the outbox already has the 28 + 7 day
   purge and feeds the activity counts, so reports need no new retention, restore, export or inventory wiring. The money
   tables are never written; the migration only reads `client_adapter_budget_events`.
4. **Five statuses, computed when read**, with a tolerance of 1,000 micros ($0.001) on both comparisons because the adapter
   works in floating-point dollars: `unreserved` (the host reserved nothing for the task), `over_reserved` (reported more than
   reserved plus the tolerance), `matched` (settled, or released with at most the tolerance reported, and the amounts agree),
   `settled_differs` (settled or released and they disagree), `open` (reserved, not yet closed). Rows from another tenant or
   another adapter with the same task id never count.
5. **It only flags.** Members see counts per adapter on the Adapters page ("Spend check"); admins can read the tasks behind
   them (ids and amounts, at most 200, matched ones left out). Nothing settles, releases or blocks.
6. **The activity panel** also gets a line "Spend reported by the adapter" for the new event type; without it the panel's
   strict parser would reject the whole panel.

## What this does and does not show today

No host code starts an adapter task with a reservation yet, so for now almost every reported task will read `unreserved`. That
is the honest result: the adapter spent money the host did not authorise. The comparison becomes a real reserved-versus-actual
check once the host starts adapter tasks through its own path (reserve, run, settle). That feature is separate, is not part of
this slice, and is queued after Phase 2.

## What was built (all local)

Content OS: `spentMicros` in the final `task.state` event, with tests and a breakage check. Host:
`supabase-client-adapter-budget-reconcile.sql` (record, counts and tasks functions; the outbox event list widened in six
files that a test keeps identical), the puller change and its report field `spendReported`, `src/lib/adapterSpendReconcile.ts`,
`/api/client-runtime/adapter-spend`, the Spend check panel, the contract test against the real Content OS service, and sweep
targets. Existing databases need the migration applied before the next puller run (the runbook lists the order); until then the
record function does not exist and the puller stops with "database unavailable".

## Still open

- Looked at in a browser on 2026-10-24 against staging (marked seed data, removed afterwards): all five statuses and their counts matched the seeded rows, the activity lines showed, no horizontal overflow at 375 px.
- Starting adapter tasks from the host with a reservation first, so the comparison has something to compare against.
- Deciding whether a large `unreserved` or `over_reserved` count should ever pause an adapter. D3 was flag only.
