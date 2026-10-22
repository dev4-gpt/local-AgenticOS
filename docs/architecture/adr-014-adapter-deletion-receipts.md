# ADR 014: Deletion receipts for adapter memory

**Status:** decided 2026-10-21 with the owner (D1 to D6); built in Phase 2 slice 2c, local commits only. Proven on staging 2026-10-22.
**Builds on:** ADR-005 (the adapter host contract), ADR-012 (adapter token keys), ADR-013 (adapter memory proposals).
**Closes:** tracker X-2 for Creator OS (deletion receipts) and the Creator OS part of "deletion tombstones acknowledged".

## The problem

The host can erase a note it holds. A note an adapter proposed, though, also lives inside the adapter: in its event log,
its run state and its research and drafts. Until the adapter erases those copies and says so, "deleted" is only a
claim about the host, so Creator OS was labelled `deletionGuarantee: "none"` and kept out of the client edition.

## Decision

1. **The unit is the fact's exact text**, compared ignoring case, spacing and a final full stop. The adapter erases that
   text from its event log, run state and vault notes. A fact shorter than 12 characters is matched only as a whole
   value, never inside other text. The event log is erased last, and the same event id always returns the same receipt.
2. **The host tells, the adapter answers.** New contract operation `memory.tombstone` (`POST /h1/memory.tombstone`, one
   single-use token per request with scope `memory.tombstone`). The body names the host event id and the adapter's own
   event id and content hash for each target. The answer is a receipt: tenant, adapter, event id, a receipt hash and the
   number of copies erased. A manifest may declare `deletionGuarantee: "receipt"` only together with the operation.
3. **The host keeps the books** in `client_adapter_tombstone_receipts` (one row per erased note that has an adapter copy:
   attempts, receipt hash, count). Only adapters registered with the `receipt` guarantee are told. An attempt is counted
   only when the adapter answered, there are at most ten, and a note given up on shows in the summary and makes the
   dispatcher command exit 1. A repeated identical receipt is accepted; a different one for the same event is refused.
4. **A receipt is accepted only if it is the answer to that request** (same tenant, adapter and event id, well-formed hash
   and count). Anything else is a failed attempt and nothing is recorded.
5. **Where it went before.** At withdrawal, before the text is erased, the host searches its own publish approvals
   (approved or executed) for the same text and records each destination in `client_adapter_tombstone_exposures`
   (admin-readable; counts and destinations only, never text). The people who must take a published copy down by hand
   can then be told where.
6. **Honest limits, stated in the manifest (`deletionScope`).** The receipt covers the adapter's own folders only. It does
   not cover copies published elsewhere, paraphrases, or a short fact inside other text. The host searches exposures only
   at withdrawal, not at retention expiry (every host copy expires on the same clock). A receipt row is deleted with its
   note by the retention purge, so a note purged before acknowledgement loses its receipt row.

## What was built

- Content OS (ContractorOS): `MemoryStore.findContaining/erase`, the event log's `tombstone`, `tombstone.ts`, the route and
  the manifest.
- Host: `supabase-client-adapter-tombstones.sql`, `src/lib/adapterTombstoneDispatcher.ts`, `scripts/run-adapter-tombstones.mjs`.
- Tests: SQL, dispatcher, CLI, the contract test against the real Content OS service, a mutation sweep (all caught or
  recorded as equivalent), and a staging proof.

## Still open

- The dispatcher is run by hand; a scheduled cloud job comes with slice 2d, together with the events puller.
- After withdrawal the private note on the host that the shared note came from still holds the text until it expires on
  the retention clock. Erasing it at withdrawal is a separate decision.
- Only Creator OS has a receipt route. Every other adapter stays "outside the guarantee" until it has one.
