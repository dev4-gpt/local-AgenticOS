# ADR-025: Knowledge adapter: deletion receipts

Status: **built locally 2026-11-02** with the owner's go-ahead and D1 to D3 as recommended (D1 vault page untouched, D2 no adapter-initiated withdrawal, D3 503 when busy). One design change from the proposal: there is **no ledger file**. Each stub records the host event it was erased for (`erasedFor`), and a receipt is worked out from the stubs, so a replay gives the same receipt even after a crash between the write and the answer, and there is one file to keep consistent instead of two. The receipt hash covers tenant, adapter, host event id, the sorted target ids and the count. Not deployed, not registered in any tenant, outbox still empty. Builds on ADR-014 (deletion receipts), ADR-013 and ADR-024 (promote, events service). Local only (X-18).

## 1. Correction to the earlier plan

Earlier notes called this "`memory.tombstone` support in the puller". That was wrong. In ADR-014 the direction is **host to adapter**: when the host erases a shared note, its dispatcher (`src/lib/adapterTombstoneDispatcher.ts`, `scripts/run-adapter-tombstones.mjs`) calls `POST /h1/memory.tombstone` on the adapter, and the adapter answers with a receipt. The puller never sees a tombstone. The host side is already built and tested (SQL, dispatcher, CLI, staging proof), so **no migration and no host change is needed**. What is missing is the Knowledge adapter's side of the contract.

## 2. Goal

When the owner withdraws a promoted Knowledge note in the host, the Knowledge adapter erases its own copy of that proposal and returns a receipt, so the manifest can honestly say `deletionGuarantee: "receipt"`.

## 3. What the adapter holds that must be erased

Only the outbox (`events.json`): each `memory.propose` event carries the page text. The vault page is the owner's own source and is not part of the host's erase (see D1).

## 4. Contract to implement (from ADR-014)

- `POST /h1/memory.tombstone`, one single-use token per request, scope `memory.tombstone`, same verifier and replay guard as the feed.
- Request: `{ tenantSlug, adapterId, eventId, targets: [{ adapterEventId, contentSha256 }] }`. `adapterEventId` is our event `id`; `contentSha256` is the hash of the event's `content`.
- Answer: `{ ok: true, receipt: { tenantSlug, adapterId, eventId, receiptSha256, deletedCount } }`. The host records it only if tenant, adapter and `eventId` match this request. A repeated identical receipt is accepted; a different one for the same event is refused.
- Failure answers carry `{ ok: false, error: "<snake_case>" }` with a non-2xx status.

## 5. Design

1. **Erase in place, keep the numbering.** The outbox must stay gapless (it fails closed otherwise), so an erased event is replaced by a stub: same `seq`, `id`, `at`, `taskId`; `kind: "memory.erased"`; no `data`; plus `erasedCitationId`. The puller already counts unknown kinds as rejected, so a re-read of an old feed is harmless.
2. **Never re-propose an erased page.** `planPromote` treats `erasedCitationId` as known, so the next promote run does not send the page back. The owner can deliberately re-propose by editing the page (its `sha256`, and so its citation id, changes). `orphans` ignores stubs.
3. **Idempotent receipts.** The receipt is derived from the stubs whose `erasedFor` is the host event id (see the status note: no separate ledger). `receiptSha256 = sha256("tenant:adapter:eventId:sortedTargetIds:deletedCount")`.
4. **Check before erasing.** If the target event exists but its content hash differs from `contentSha256`, answer 409 `hash_mismatch` and erase nothing. A target that does not exist and has no ledger entry gets a `deletedCount: 0` receipt (there is no copy, which is true).
5. **One writer at a time.** `applyPromote` and the erase both rewrite `events.json` (temp file and rename). Both go through one lock (a lock directory created with `mkdir`, removed in `finally`) so neither can overwrite the other. A held lock makes the erase answer 503 and the host retries (the attempt is not counted unless we answered).
6. **Manifest.** The service also serves `GET /h1/manifest` and `GET /h1/health` (required by the contract): operations `manifest, health, events, memory.propose, memory.tombstone`, no tasks, `sideEffectCeiling` the lowest class, `deletionGuarantee: "receipt"`, plus a `deletionScope` text stating the limits in section 7.
7. **Service stays small.** The tombstone route is the only one that writes; the feed route stays read-only. Failure answers never include page text or paths.

## 6. Build order

| Step | Work | Proof |
|---|---|---|
| 1 | Outbox lock + `eraseEvents` in `promote.mjs` (stub, ledger, known/orphans changes) | unit tests: stub keeps numbering, replay same receipt, hash mismatch erases nothing, erased page not re-proposed, two writers cannot clobber |
| 2 | `POST /h1/memory.tombstone` in `serve-events.mjs` with the same token and replay checks | auth tests as for the feed, plus body validation and size cap |
| 3 | `GET /h1/manifest`, `GET /h1/health` | host's `validateAdapterManifest` accepts the manifest |
| 4 | Round trip with the host's real `dispatchTombstones` against the service (fake rpc) | receipt recorded; second dispatch is a no-op; the erased text is gone from `events.json` and from the feed |
| 5 | Mutation sweep, ADR-024 and tracker updated, `test:focused` | each deliberate breakage fails a test |

No database change. Registering the adapter with the `receipt` guarantee in the host registry is an owner step done at deploy time, not part of this build.

## 7. Honest limits (to go in `deletionScope`)

The receipt covers the Knowledge outbox only. It does not cover the owner's vault page, copies already pulled into the host's own backups before withdrawal, or anything published elsewhere (the host already records publish exposures at withdrawal, ADR-014).

## 8. Decisions for the owner

- **D1. Vault page on withdrawal.** Recommended: leave the vault page untouched. It is the owner's own note, and a host-side withdrawal should never delete files in a personal vault. The page will simply not be proposed again unless edited.
- **D2. Adapter-initiated withdrawal.** When a source is deleted and the cascade removes a page, `promote.mjs orphans` lists the host copies to withdraw. There is no contract operation for an adapter to withdraw by itself, and adding one needs a new host operation and a migration. Recommended: do not build it; the owner withdraws those notes in the host screen (`/adapter-memory/[id]/revoke`) using the orphan list.
- **D3. Lock failure behaviour.** Recommended: 503 and let the host retry (safe, no attempt used up).
- **D4. Go-ahead.** Build steps 1 to 5 locally and commit per step when asked.

## 9. Not covered here

Deploying the service, TLS in front of it, registering the adapter in a real tenant, and filling the outbox from a real vault stay with the owner.

## 10. What was built (2026-11-02)

- `promote.mjs`: `withOutboxLock` (mkdir lock, stale after 60 s, `OutboxBusyError`), `eraseEvents`, `applyPromote` under the lock, erased pages counted as already proposed, `orphans` ignoring stubs.
- `serve-events.mjs`: `POST /h1/memory.tombstone` (64 KiB body cap, at most 20 targets, tenant and adapter must match, 400/409/503 with a fixed error code), `GET /h1/manifest` (accepted by the host's `validateAdapterManifest`), `GET /h1/health`; every route checks its own token scope.
- Tests: `tests/knowledge-promote.spec.ts` (14 tests) and `tests/knowledge-events-service.spec.ts` (9 tests, including the host's real `dispatchTombstones` against the service). 15 of 15 deliberate breakages each fail a test, after four gaps found on the first pass got tests.
- Still the owner's: deploying the service with TLS, registering the adapter with the `receipt` guarantee, and filling the outbox from a real vault.
