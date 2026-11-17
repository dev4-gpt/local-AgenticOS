# ADR-021: Knowledge adapter, slice 2: ingest, lint and quarantine

Status: built locally on `feat/knowledge-adapter` (2026-10-27). Covers tracker Phase 3 items "ingest from your own files, lint" and "injection samples land in quarantine" (S-3). Builds on ADR-020. Nothing here touches the hosted client edition.

## Decisions

1. **One command, four gates, one outcome per file.** `scripts/knowledge-unify/ingest.mjs --from DIR --store L=PATH` reads `.md`, `.markdown` and `.txt` files and ends each in exactly one outcome: `quarantined`, `duplicate`, `lint-failed`, `exists` or `written` (`would-write` on a dry run). Other file types are listed as skipped, not ignored. A dry run is the default and writes nothing.
2. **Quarantine uses the host's own scanner.** The text goes through `scanMemoryContent` from `src/lib/adapterMemoryGuard.ts` (ADR-009). `blocked` files are quarantined; `flagged` files are quarantined too unless `--allow-flagged` is given, because ingest is the only moment nobody has yet looked at the text. A quarantined original is copied (mode 0600) to a folder outside the store and the `--from` folder, and nothing is written to the vault. The report names the rules and counts, never the text.
3. **No scanner, no ingest.** `planIngest` has no default scanner, and the command stops if it cannot load one. The scanner is a TypeScript file loaded at run time, so the command needs Node 22.18 or newer (the repo allows `>=22 <26`); on an older Node it fails closed with a message instead of ingesting unscanned text. This is a known cost of not duplicating the scanner in plain JavaScript.
4. **Pages are built to pass the slice 1 check.** Each page gets `title` (existing, first heading, or file name), `type` (existing if valid, else `--type`, default `topic`; never `source`, which would need a URL), `tags`, `sources`, `created` (existing if valid, else today), `updated` (today), `sha256` (of the canonical body), `licence` (default `third-party / unknown`), `store_origin`, and optional `tenant`. The generated page must pass `checkPage` as `shared-ok`, otherwise it is `lint-failed` with the rule names. Frontmatter fields the tool does not manage are kept exactly as written.
5. **`sources` always names the original file by absolute path.** Deleting that file and running `source-index.mjs cascade --source <path>` removes the page, which is the ingest half of the round trip (proven in `tests/knowledge-ingest.spec.ts`). The path includes the home folder name; pages stay private until promoted, and promotion review already shows the source.
6. **Never overwrite, never duplicate.** An existing destination is `exists`. A canonical body already in the vault, or earlier in the same run, is `duplicate`. A destination outside the store (including through a symlinked folder) is refused. A failed write removes every page written in that run.
7. **Blocked on the same terms as the cascade.** An iCloud placeholder or unreadable folder in `--from` blocks applying, because an unseen file may be one that should have been ingested or quarantined.

## Not covered (still open, tracker Phase 3)

- The Instagram export (official data download only): needs its own parser, and the export has to exist first.
- PDF, HTML, docx and other formats. Plain text and markdown only.
- The type is one default for a whole run; per-file typing is manual (edit the frontmatter first).
- Single writer per folder and the iCloud conflict-copy check (X-12), the remaining duplicate groups, and the promote step of the round trip.
- Quarantined files have no review command yet; release is by hand.
- The scanner is a tripwire, not a guarantee (ADR-009): paraphrased or foreign-language orders and well-phrased false facts pass.

## Files

`scripts/knowledge-unify/ingest.mjs`, `validDate` exported from `schema-check.mjs`, `tests/knowledge-ingest.spec.ts` (16 tests, in `test:focused`).
