# ADR-023: Knowledge adapter: quarantine review and release

Status: built locally on `feat/knowledge-adapter` (2026-10-27). Finishes the human step of tracker Phase 3 item "injection samples land in quarantine" (S-3). Builds on ADR-021. Nothing here touches the hosted client edition.

## Decisions

1. **Ingest keeps a manifest.** When `ingest.mjs --apply` quarantines a file it also records `manifest.json` in the quarantine folder: per file id (the first 16 hex characters of the original's SHA-256, which is also the `<id>.txt` name) the original relative name, the verdict (`blocked` or `flagged`), the rule names and counts, the time, and a status. No file text goes in it, and it is written with mode 0600. A second run adds to it. A file that is still waiting keeps its first record; one that was released or discarded earlier and is quarantined again goes back to `quarantined`, because the file is back.
2. **`quarantine.mjs list`** shows each entry, its rules, and whether the file still matches its id (`changed` or `missing` are shown loudly). It never prints file text.
3. **`release` is for flagged files you have read.** It copies the file to a separate staging folder under its original name; you then run `ingest.mjs --from <staging> --allow-flagged`, so the page still gets the full lint, duplicate check and writer-claim gates. It never writes to a vault itself.
4. **Blocked files are never released.** A blocked file is edited at its source and ingested again; there is no switch that lets a blocked file through, because a flag a person can set under pressure defeats the scanner.
5. **A changed file is refused.** If the quarantined file no longer matches its id (someone edited it), release refuses.
6. **`discard` deletes the file and keeps the record** (status `discarded`), so the history of what was stopped is not lost. Both commands are dry runs unless `--apply` is given, accept only the 16-character id form (no paths), never overwrite an existing staged file, and cannot be repeated on the same entry.

## Not covered

- The scanner is still a tripwire (ADR-009); this only handles what it stops.
- Review is a person reading the original file. The tool does not show text, by design, so the person opens the file in the quarantine folder.
- Quarantine folders from before this change have no manifest; `list` says so, and those files stay by hand.

## Files

`scripts/knowledge-unify/quarantine.mjs`, `recordQuarantine` in `ingest.mjs`, `tests/knowledge-quarantine.spec.ts` (11 tests, in `test:focused`).
