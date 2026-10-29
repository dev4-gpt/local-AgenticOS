# ADR-024: Knowledge adapter: the promote step

Status: built locally on `feat/knowledge-adapter` (2026-10-28). Closes the "nothing in the host calls `isPromotable`" gap in tracker Phase 3 and adds the round-trip test. Builds on ADR-005, ADR-013 (how an adapter's proposals reach the host) and ADR-020 to ADR-023. Nothing here touches the hosted client edition, and nothing is pushed (X-18).

## Decisions

1. **The Knowledge side only proposes.** `scripts/knowledge-unify/promote.mjs` turns pages into `memory.propose` events in an append-only outbox (`events.json`, mode 0600, outside every store). The host's puller (ADR-013) reads them, recomputes the hash, runs its own scan and queues a quarantined promotion for two-person review. Nothing here writes to a vault or calls the host, so the adapter holds no host credential.
2. **What becomes an event.** A page must be `shared-ok` (`isPromotable`; legacy notes without a `type` and invalid pages never are), fit the host's 2,000-character limit, have an http(s) source address (`canonical_url`, else the first http(s) entry in `sources`), pass the host scanner as `clean` (a `flagged` page is skipped, not queued, because the owner should look at it first), and not already be in the outbox at this content. Every skip is listed with its reason; the report never holds page text.
3. **Same page, same content, one event.** The citation id is a hash of the store label, the path and the page's own `sha256`. A second run proposes nothing new; an edited page is proposed again. Applying one plan twice cannot double an event.
4. **The outbox fails closed.** Numbers must continue from 1 with no gaps, and a malformed file stops the run. It is written through a temporary file and renamed. The adapter id comes from the command line or configuration, never from a page.
5. **Deletion round trip.** A page promoted to the host keeps its own copy there. When the source is deleted and the cascade removes the page, `promote.mjs orphans` lists the proposals whose page is gone or changed so the host copy can be withdrawn. Pages that cite both a web address and a local file are only listed for review by the default cascade (the web address remains a source); the owner can choose `partial: delete` for them.

## Not covered

- The host's puller handles `memory.propose` only; it counts any other kind as unknown. A `memory.tombstone` event for withdrawn proposals is the contract (ADR-005) but is not pulled yet, so orphans are reported, not withdrawn automatically.
- Serving the outbox as `GET /h1/events` with the host's token check needs an adapter service; none exists for Knowledge yet. The outbox format is the feed body, so a small service can serve it unchanged.
- Pages whose only sources are local files have no public address and are skipped (`no-public-source`). Whether to allow a stand-in address for them is the owner's decision.
- No run on the real vault; synthetic notes only (access to the real vaults is limited to the duplicate scan).

## Files

`scripts/knowledge-unify/promote.mjs`, `tests/knowledge-promote.spec.ts` (8 tests, in `test:focused`; 11 of 11 deliberate breakages each fail a test, after two gaps found on the first pass got tests).
