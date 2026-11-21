# ADR-022: Knowledge adapter, slice 3: single writer per folder and sync conflict copies

Status: built locally on `feat/knowledge-adapter` (2026-10-27). Covers tracker Phase 3 item "single-writer rule per folder; conflict-copy check for iCloud" (X-12). Builds on ADR-020 and ADR-021. Nothing here touches the hosted client edition.

## Problem

A vault that syncs through iCloud (or Dropbox, Syncthing) can be written from two devices at once. The sync service then keeps both versions as "conflict copies" next to the original, and the tools that write (ingest) or delete (cascade) would act on a folder the other device is also changing.

## Decisions

1. **One marker, one device.** A folder can carry `.ku-writer.json` (`{device, by, claimedAt}`) naming the single device allowed to write to it. The nearest marker at or above a folder governs it, so claiming `Area/` covers `Area/Deep/`. The marker syncs with the vault, so the other device sees it. The writer name is `KU_DEVICE`, else the name saved by `writer-claim.mjs whoami --init`, else the host name; `--device` overrides all. Save a name once: a host name can change (macOS adds `-2` on a clash), which would turn your own claims into someone else's.
2. **Fail closed.** A marker that cannot be read, or has no device name, counts as owned by someone else (`claim-unreadable`). Only an explicit `--take-over` replaces it.
3. **Take-over is explicit.** `--take-over` is for when the other device has stopped. Without it, a claim by another device is a refusal (`folder-owned-by-other-device`) in the plan, in apply and on the command line.
4. **Ingest.** The destination folder is checked at plan time and again at apply time. A foreign claim, or conflict copies already in the destination, block the run (`refusal` in the plan and report; exit 2 on `--apply`). A run that writes at least one page claims the folder; a run that writes nothing (everything quarantined, duplicate or existing) leaves no marker. The claim is created with a hard link, so a marker that appeared meanwhile is not overwritten; on volumes without hard links it falls back to an exclusive create. `--into` must name a folder inside the store, never the store itself (that would claim the whole vault).
5. **Cascade.** Planned deletions in a folder claimed by another device are skipped, never deleted, and listed in the log with the reason. A note that stays (skipped for any reason) is still a source for the notes built from it, so those are kept too (`built-from-a-kept-note`), to a fixed point. The dry run warns about them. `--take-over` lets the cascade delete there.
6. **Conflict copies are flagged, never touched.** `findConflictCopies` recognises explicit sync names (`Note (conflicted copy ...)`, `Note (Alice's conflicted copy ...)` — only that wording, so `Policy (conflict of interest)` is a normal note — `Note.sync-conflict-YYYYMMDD-HHMMSS-ID`) and the numbered or `copy` forms (`Note 2`, `Note (1)`, `Note copy`). The last group counts only when the note it would be a copy of sits in the same folder, and numbers are one or two digits, so `Chapter 2` alone, or `Notes 2024` beside `Notes`, is never flagged. Each hit says whether its text is identical to the original. They are reported, never merged, moved or deleted; a person resolves them.
7. **`writer-claim.mjs check`** is read-only: it lists conflict copies and claims held by other devices, warns about folders it could not read (a claim inside would not show), and writes `writer-check.json` (paths, kinds and devices, never note text) to a folder outside every store. `claim` and `release` manage one folder by name; unsafe names (`..`, absolute, the store root) are refused.
8. **Markers are not notes.** They are not markdown, so the schema check, source index and duplicate scan ignore them.

## Not covered

- This is a convention that both devices' tools respect, not a lock. A person editing in an editor, or a tool that does not call `folderGate`, is not stopped. iCloud can deliver the marker late; the check is a tripwire, not a guarantee.
- Hosted client memory is not covered (it is Postgres, which has its own writer rules).
- Resolving conflict copies (merge, choose, delete) stays manual by design.
- Whether client notes may live in an iCloud-synced vault at all is still the owner's decision (S-5, X-12).

## Files

`scripts/knowledge-unify/writer-claim.mjs`, wiring in `ingest.mjs` and `source-index.mjs`, `tests/knowledge-writer.spec.ts` (26 tests, in `test:focused`). The existing ingest tests now expect `.ku-writer.json` in the destination folder.
