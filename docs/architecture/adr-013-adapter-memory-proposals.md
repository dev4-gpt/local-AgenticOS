# ADR 013: How an adapter's memory proposals reach the host

**Status:** decided 2026-10-21 with the owner (pull model, requester model and the other five points below); built in Phase 2 slice 2b, local commits only.
**Builds on:** ADR-005 (the adapter host contract), ADR-009 (memory promotion hardening), ADR-012 (adapter token keys).
**Closes:** tracker item 10j (nothing created promotions except a direct database insert).

## The problem

ADR-005 says an adapter only ever proposes: shared memory exists only through a promotion that two different identities
handle. Phase 1 built the review side (a scan tied to the content hash, provenance, a queue of 25, a reviewer who is not
the requester, a label). Nothing yet carried a proposal from an adapter into that queue, and two columns assumed a
person behind every proposal: `client_adapter_memory_promotions.requested_by` and a provenance `confidence`.

## Decision

1. **The host pulls; the adapter never calls the host.** The adapter exposes `GET /h1/events` (an append-only, numbered
   feed). The host reads it with a short-lived, single-use token whose scope is `events` only. The adapter therefore
   holds no host credential at all, only the public key it already holds to check the host's tokens (ADR-012).
2. **The host decides everything that is stored.** For each `memory.propose` event the host's puller
   (`src/lib/adapterEventsPuller.ts`) checks the payload field by field, recomputes the content hash, runs its own scan
   (`scanMemoryContent`) and takes the adapter id from its own configuration. Nothing the adapter sends is a label: it
   may not name another adapter, add a field, or offer a sensitivity, trust level or status.
3. **One atomic database step.** `client_adapter_ingest_memory_proposal` (service role only) writes the private note,
   its provenance and a quarantined promotion together, or nothing. It is idempotent by event id: a second attempt, or a
   second puller racing the first, stores nothing twice. A full review queue rolls the whole proposal back so a later
   attempt starts clean. A blocked or flagged scan is still queued, so a reviewer sees why and can reject it.
4. **A promotion can be asked for by an adapter.** `requested_by` is nullable and a new `requested_by_adapter` names the
   adapter; exactly one of the two is set, and an adapter can only ask for its own notes. Any owner or admin may review an
   adapter-requested promotion, because no person asked for it. The rule that a person cannot decide their own request
   still holds for person-requested ones. The review screen says "The creator-os adapter" instead of "You" or "Another
   member".
5. **Confidence is nullable.** The feed carries none, because an adapter cannot honestly claim one. It is stored as null
   and shown as "not reported", never as 0%.
6. **The cursor is a separate service-role-only table.** `client_adapter_event_cursors` holds only an adapter's last read
   number and a timestamp, moved by a compare-and-set function so two pullers cannot both advance it. It is deleted with
   its adapter. A restore does not bring it back, which is safe: ingest is idempotent, so the feed is simply read again.

## Safeguards in the puller

HTTPS only (plain http only to loopback and only when explicitly allowed); the address comes from deployment
configuration, never from the database or an event; no redirects; a ten-second timeout; a response size cap; at most 100
events per page and ten pages per run. A malformed or unknown event is counted and skipped so one bad event cannot stall
the feed; a feed whose numbers do not continue from the cursor is not trusted at all. A full queue, an inactive adapter
or an unreachable database stops the run without moving the cursor past what was handled. The report holds counts and
reasons, never the text of a note.

## Alternatives rejected

- **The adapter calls the host.** It would need a host credential, which is a second thing to protect and rotate, and a
  compromised adapter would hold it.
- **A system user as requester.** No schema change, but a made-up person in the audit trail, and the "requested by you"
  logic would have to treat one user specially.
- **The cursor as a registry column.** Lighter, but an admin could edit it and silently skip proposals.
- **Storing 0 as the confidence.** It would read as "the adapter is certain this is wrong".

## Consequences

- New migrations, in this order after `supabase-client-adapter-promotions.sql` and before
  `supabase-client-lifecycle-restore.sql`: `supabase-client-adapter-proposals.sql`, then
  `supabase-client-adapter-ingest.sql` (see the runbook). The restore column map gains `requested_by_adapter`.
- Private notes from rejected promotions stay until the 28-day purge. The queue cap bounds what waits for review; the
  feed's own size (100,000 events) and the per-run page limit bound what can arrive.
- The puller is a library plus a command (`scripts/run-adapter-events-puller.mjs`). Running it on a schedule in a cloud
  job, with the TypeScript libraries built into the image, is the next step (slice 2d); until then it runs where the
  repository is checked out.

## Not decided here

`memory.tombstone` (the host asking an adapter to erase its copy) and the deletion-receipt guarantee it would need
(slice 2c); activity-panel counts for ingested proposals: done 2026-10-23 as the outbox events `memory.proposed` (written by the
ingest function) and `memory.erased` (written when an erasure receipt is first recorded, ADR-014); the allowed event
list is now stated in five SQL files and one test keeps them identical.
