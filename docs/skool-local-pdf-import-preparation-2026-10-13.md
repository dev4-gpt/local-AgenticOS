# Local Skool PDF Import Preparation - 2026-10-13

## Result

The local-only PDF batch preparer processed 64 PDFs from `tmp/` and wrote a private partial source pack under `tmp/authorized-skool-import/`:

- 54 PDFs had one unambiguous classroom page URL and passed content validation after credential-like values were scrubbed from extracted lesson text.
- 8 PDFs conflicted with another non-identical PDF for the same page URL; all conflicting copies were excluded.
- 2 PDFs had multiple candidate classroom URLs on page one and were excluded.
- 9 credential-like values were replaced with `***`; original PDFs were not changed. The shared content validator was not weakened.
- The accepted files became 145 source segments with 6,372 outbound link references in five batches.
- No publication dates were inferred from filenames. The pack has no owner-declared page inventory and does not claim the discovered page queue is exhausted.
- All five batch hashes, source identity uniqueness, URL-prefix scope, per-batch size limits, and mode-600 file permissions verified.

The current local manifest is `tmp/authorized-skool-import/pdf-batch-2026-10-13-v5.manifest.json`. The batch files are referenced there. All five files passed AgentOS' production batch selector and content parser via `AGENTOS_PRIVATE_SOURCE_PACK_MANIFEST=<manifest> npm run verify:private-source-pack`; an independent local scan found no remaining matches for the validator's credential patterns. These files contain lesson content and are ignored by Git; they were not committed or uploaded.

## Limits

This is not a complete May-October archive. The local file inventory does not prove that every classroom lesson or video is represented, and video URLs are references only; video bytes and transcripts were not acquired. No course-wide inventory was supplied. Publication dates remain unset because filename labels alone were not treated as authoritative dates.

The batch has not been previewed or imported in a tenant. The hosted source-import route is not enabled in the observed Cloud Test/Internal Beta revision, so no hosted database write was attempted. Use the in-product permission and preview flow only after the target route, retention configuration, and tenant are verified. The eight conflicting PDFs need source-owner review to choose a canonical copy; neither copy was silently preferred.

Preparation used only local files and made no request to Skool, Firecrawl, Google Drive, a database, or an AI provider.
