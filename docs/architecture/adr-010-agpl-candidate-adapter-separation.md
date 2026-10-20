# ADR 010: Separation contract for AGPL-licensed adapter candidates

**Status:** blocked pending legal review (X-10). This ADR documents a pattern to apply once your lawyer clears it;
nothing here authorises calling any of the named projects, and no code in this repo does.
**Date:** 2026-10-20
**Scope:** AGPL-licensed candidate adapters under review: ContractorOS, `seo-os`, Narcooo/inkos, trypostit/trypost,
brightbeanxyz/brightbean-studio, useplunk/plunk, calesthio/OpenMontage, 666ghj/MiroFish, FreshRSS/FreshRSS,
stackrender/stackrender, PurpleDoubleD/locally-uncensored, firecrawl/firecrawl (self-hosted).
**Builds on:** ADR-005 (adapter host contract), which already states the general rule this ADR narrows for AGPL.

## The problem

AGPL differs from MIT/Apache/BSD in one load-bearing way: it attaches obligations to running the code as a network
service, not only to distributing it. If any of the above were imported into Veloce and run as part of it, offering
that to a client over the network could require publishing the combined source. ADR-005 already keeps every
adapter, AGPL or not, as a separate process reached over HTTP. This ADR exists because "AGPL" raises the stakes of
that boundary holding in fact, not only in intent, and names what a lawyer needs to see before sign-off.

## Decision

Until legal sign-off, every AGPL candidate adapter stays in the state `blocked-legal-review`, distinct from the
ordinary `disabled` state other adapters start in (ADR-005 item 7). A row in `client_adapter_registry` for one of
these ids may exist for planning, but the row's `state` check would need an explicit allowance for
`blocked-legal-review`, and the application must refuse to route a task to it regardless of the database state.
That column change, and the route-level refusal, are not made by this ADR; they are the first PR after sign-off.

The separation pattern each candidate must satisfy, once approved:

1. **Its own process, its own deploy.** The AGPL project runs unmodified or minimally patched, in its own
   container/VM/service, with its own repository. No file from it is copied, vendored, or built into this repo.
2. **Reached only over a documented network contract.** The same `h1` operations as any other adapter
   (`manifest`, `health`, `task.run/get/cancel`, `events`, `memory.propose`, `memory.tombstone`). No shared process,
   no shared database, no shared session cookie, no in-process function call across the boundary.
3. **No combined distribution.** Veloce's own deploy artifact never includes the AGPL project's code. A client
   receives Veloce's output (a task result, a rendered asset, a reply) over the existing contract, never the AGPL
   service's source or binary bundled with Veloce's.
4. **A visible seam for the lawyer to inspect**, not just an internal convention: the adapter's manifest states its
   licence and upstream repository; `docs/guide/02-code-tour.md` and the adapter registry both show which ids are
   AGPL-sourced; nothing elides that fact in logs, billing, or the client-facing changelog.
5. **No joint marketing or joint sale that implies one program.** How the capability is priced, named, and described
   to clients is a legal question, not an engineering one, and is explicitly out of scope for this ADR — recorded
   here only so the lawyer reviews pricing/marketing copy alongside the technical separation, since the "is this one
   combined work" question looks at both.

## What this does not do

- **It does not clear any of the ten projects for use.** "Separate process" is the shape of a mitigation, not proof
  it holds for Veloce's specific deployment, customer contracts, and marketing. Only the lawyer's review (Phase 0,
  X-10) changes that.
- **It does not cover ContractorOS's existing repo-visibility item** (make the repo private) — that is tracked
  separately and is more urgent regardless of this ADR.
- **It does not pick a sandbox or infra provider.** If a candidate is approved, Phase-2-equivalent work (manifest,
  contract tests, budget feed, deletion receipts, per ADR-005) still has to be built fresh for it; nothing here
  shortcuts that.
- **It does not change licence obligations that exist regardless of network separation**, such as the AGPL
  requirement to offer *that service's own* source to anyone who can network-interact with it directly. If a client
  could reach the AGPL service directly (not only through Veloce), the service's own operator obligations apply to
  whoever runs it, separation or not.

## Rollback

This is a documentation-only ADR. There is no migration, flag, or code to roll back. Superseding it only requires
updating the status line once the lawyer's review lands, and recording the outcome in
`reports/Veloce master plan and error register.md` (X-10) and `docs/guide/04-open-items-tracker.md`.
