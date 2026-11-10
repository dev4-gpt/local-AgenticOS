# ADR-020: Knowledge adapter, slice 1: the shared page check and the source index

Status: built locally on `feat/knowledge-adapter` (2026-10-27). Covers tracker Phase 3 items "shared page schema" (X-13) and "reverse index and source deletion cascade" (X-16). Nothing here touches the hosted client edition.

## Decisions

1. **A note with no `type` is a legacy note and stays private.** It is not an error and is never promotable. Today that is 1,357 of 1,441 notes. A note that has a `type` must pass every rule in `docs/knowledge-layer-schema.md` (title, tags as a list, a non-empty list of usable sources, ISO `created`/`updated` with `updated` not before `created`, a `sha256` that equals the hash of the canonical body, `licence`, `store_origin`, a valid `tenant` when present, and for `type: source` a clean `canonical_url`) or it is `invalid` and also not promotable. Only `shared-ok` may be promoted (`isPromotable`). The check is a read-only report of paths and rule names.
2. **A reverse index keys every source reference to the notes that cite it.** URLs are cleaned the way the duplicate tools do. A plain relative path means the same store as the citing note; `label:path` names another store; an absolute path is outside every store. Files compare case-insensitively and without `.md`. A reference with `..`, unmatched brackets or an unsupported scheme is unusable and ignored.
3. **Deleting a source removes what was built from it, to a fixed point.** A note whose sources are all gone is derived and goes; a deleted note counts as a gone source for the notes that cite it. Legacy notes are included, because erasure must not depend on whether a note was ever shared.
4. **A note that still has another source is kept and listed for review** (default). We cannot tell which text came from which source, so `--partial delete` exists for when the owner wants the strict reading. This is reversible by flag; the default errs toward not destroying work.
5. **The cascade never deletes the source itself** (that is the owner's act) and is **blocked when any note could not be read** (iCloud placeholder, unreadable folder or file), because an unseen note might be derived from the source. This is the same rule `apply.mjs` uses.
6. **Dry run first.** Applying needs either `--backup-dir` (outside every store; originals copied and verified before deletion, plus `cascade-log.json`) or `--erase-no-backup`. Each file is re-hashed immediately before deletion and skipped if it changed after the index was built.

## Not covered (still open, tracker Phase 3)

- Ingest from your own files and the Instagram export, with lint; nothing yet writes `sha256` into a page (`bodyHash` is exported for that).
- Single writer per folder and the iCloud conflict-copy check (X-12); injection samples into quarantine (S-3); the remaining duplicate groups; the promote step of the round trip.
- **Client data:** a backup defeats erasure, so a client-tenant store must use `--erase-no-backup` and be tied to a deletion receipt under the 28 + 7 rule. Not wired to the host tombstone flow (ADR-014) yet.
- The index is rebuilt on each run; there is no persisted incremental index and no scheduled run.

## Files

`scripts/knowledge-unify/schema-check.mjs`, `scripts/knowledge-unify/source-index.mjs`, `safeAbs` exported from `apply.mjs`, `tests/knowledge-schema-index.spec.ts` (22 tests, in `test:focused`).
