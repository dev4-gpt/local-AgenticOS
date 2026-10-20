# ADR 005: Adapter host contract and governed memory

**Status:** accepted  
**Date:** 2026-10-19  
**Scope:** The Veloce host and the adapter products it hosts (Creator OS, Knowledge, Forge, SymVibe + REA)

## Decision

Veloce is the host. Each product plugs in as an adapter behind one narrow, versioned contract. The host keeps
authority over identity, policy, approval, budget and the shared memory ledger. An adapter only ever proposes.

1. **Separate processes.** Adapters run as their own services and are reached over HTTP. Their code and licences
   (including AGPL) never enter the host. There is no embedding with shared cookies, no shared database and no
   plugin marketplace (consistent with ADR-001: a tool column must not create a second permission model).
2. **One contract, version `h1`.** Operations: `manifest`, `health`, `context.read`, `task.run` / `task.get` /
   `task.cancel`, `events`, `memory.propose`, `memory.tombstone`, `ui.launch`. The types and validators live in
   `src/lib/adapterContracts.ts`. The side-effect class (`read`, `draft`, `publish`) comes from the manifest, never
   from the caller.
3. **Memory has two layers.** Private memory lives in the namespace `adapter:<id>`. Shared memory lives in `shared`
   and exists only through a promotion: a request tied to one private item, approved by a signed-in owner or admin
   who is not the requester, who approves the exact content hash. The database refuses a shared item without such a
   promotion, and allows only one active shared fact per content hash (the door for duplicates).
4. **Approvals are durable and hash-bound.** A publish or promote action needs an approval that names the exact
   action hash and destination, expires, can be decided only by someone other than the requester, and can be
   executed once. Identity comes from the host's verified login, never from a request field.
5. **Deletion is a protocol.** Removing a source writes a tombstone event to the outbox. Tombstoning erases the
   content and keeps the hash for audit. An adapter with the `receipt` guarantee returns a receipt hash; an adapter
   with `none` is labelled outside the guarantee and stays out of the client edition.
6. **Money is integer micros end to end** (millionths of a US dollar, as the existing runtime budget ledger already
   uses). The per-adapter table logs events and points to the central ledger (`reserve_client_runtime_budget` and
   the settle function). It is not a second ledger.
7. **Naming and retention.** Tenant slugs and adapter ids follow the database rule `^[a-z][a-z0-9-]{2,40}$`.
   The new tables use the `client_` prefix and are classified in `docs/retention-table-map-2026-10-15.json`. They
   hold no client data until the 28-day active + 7-day recovery purge and restore wiring covers them, and every
   adapter starts `disabled`.

## Not in this change

- No API routes, no UI, no adapter tokens or scoped handles, no purge or restore wiring, no budget enforcement
  functions. These are the next items of Phase 1 in the master plan.
- The content hash is computed by the host application; the database enforces that the hash chain (item, promotion,
  shared item) is consistent. Provenance, budget and outbox rows are written by the host service role.
- Approvals follow the 28 + 7 day rule (confirmed 2026-10-20, tracker item 11). The retention class for budget events
  (financial-and-credit-records) is still provisional and needs an owner-approved schedule.

## Alternatives rejected

- Embedding adapters in iframes with the host session, or sharing one database between products.
- Importing adapter code into the host (AGPL contamination).
- A second budget ledger per adapter (double counting).
- Universal shared memory with guaranteed erasure from systems the host does not control. Research found no product
  that achieved it; the guarantee is therefore stated only for host-owned stores and receipt-bearing adapters.

## Evidence

`reports/Veloce master plan and error register.md` (findings X-1 to X-18, CR-1 to CR-13) and its research table.
