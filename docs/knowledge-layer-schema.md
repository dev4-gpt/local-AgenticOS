# Knowledge layer: shared page format and duplicate handling

Status: proposal plus read-only tooling (2026-10-19). Nothing here changes the hosted client edition.

## Goal
One logical knowledge layer across the products Veloce hosts (Veloce notes, Creator OS, the Knowledge wiki, later Forge and SymVibe if they keep notes). Each product keeps its own private working notes. Only reviewed, deduplicated pages enter the shared layer.

## Page format
Markdown with frontmatter. Required for shared pages:

| Field | Meaning |
|---|---|
| `title` | Page title |
| `type` | `entity`, `concept`, `topic`, `source` or `synthesis` |
| `tags` | List |
| `sources` | List of source URLs or file references |
| `created`, `updated` | ISO dates |
| `sha256` | Hash of the canonical body (set by the tools, not by hand) |
| `canonical_url` | For `type: source`, the cleaned primary URL |
| `licence` | `third-party / unknown` unless stated |
| `store_origin` | `operator`, `creator-os`, `knowledge`, or another store label |
| `tenant` | Hosted/client data only |
| `duplicate_of` | Added by `apply.mjs` on an approved duplicate |
| `supersedes` | Added by `apply.mjs` on the kept page |

Unknown extra fields are allowed and left alone.

## What counts as a duplicate
- **Exact:** the same canonical body hash (newlines normalised, trailing spaces trimmed), or the same canonical primary URL on notes of `type: source`. A concept note that only cites a URL is not a duplicate of that source.
- **Near (flag only):** the same text ignoring case and punctuation, or the same title. Never merged automatically.
- Empty and very short bodies (under 20 characters) are never compared.

Canonical URL: `http(s)` only, `www.` removed, fragment removed, tracking parameters (`utm_*`, `fbclid`, `igshid`, `gclid`, `mc_cid`, `mc_eid`) removed, query sorted, trailing slash removed when there is no query.

## Workflow
```bash
# 1. Read-only inventory. Report goes outside every store.
node scripts/knowledge-unify/scan.mjs --store operator=/path/to/vault --out /path/to/reports

# 2. Duplicate report and a decisions file where every group is "pending".
node scripts/knowledge-unify/dedupe-report.mjs --scan /path/to/reports/scan.json

# 3. You review dedupe-report.json and set approved groups to "mark-duplicates" in decisions.json.

# 4. Dry run (default), then apply. Apply backs up every file first.
node scripts/knowledge-unify/apply.mjs --report .../dedupe-report.json --decisions .../decisions.json
node scripts/knowledge-unify/apply.mjs --report .../dedupe-report.json --decisions .../decisions.json --apply
```
`--store` can be repeated, one label per product. A store under `operator` with notes in `Agentic OS/Content OS/` or `Agentic OS/Knowledge/` is labelled `creator-os` or `knowledge` automatically.

## Rules the tools follow
- `scan` and `dedupe-report` never write inside a store. `--out` and `--backup-dir` must be outside every store.
- Reports hold titles, paths, hashes and counts, not note text.
- `apply` adds `duplicate_of` and `supersedes` lines only. It never deletes, moves or renames notes and never rewrites links.
- A note changed since the scan is skipped. A path that tries to leave its store is refused.
- Moving or removing marked duplicates, and rewriting links to the kept page, are separate steps that need their own approval.

## Not covered
- The hosted Supabase memory is not scanned. Its equivalent is the unique index on `(tenant_slug, source_import_key)` in `product-experience/supabase-client-runtime-source-pack-graph.sql`. Any hosted merge needs its own plan, a migration, and the 28 + 7 day retention check.
- Embedding-based near-duplicate detection is not built.
- Existing JSON-LD graph exports (`scripts/portable-knowledge-graph.mjs`) are a different format and are untouched.
