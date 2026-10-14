# Local Skool PDF Import Preparation - 2026-10-13

## Result

The local-only PDF batch preparer processed 64 PDFs from `tmp/` and wrote a private partial source pack under `tmp/authorized-skool-import/`:

- The latest v10 manifest includes all 64 PDFs with resolved classroom page URLs, 175 source segments, and 7,537 accepted outbound link references in six batches.
- Four classroom URLs have two non-identical PDF captures each. All eight captures are preserved as separate sources with a PDF SHA-256 prefix in the source tab label; byte-identical duplicates remain deduplicated.
- Two earlier ambiguous results are now resolved only when the last in-scope classroom URL on page one is immediately followed by the PDF page counter. This handles a wrapped lesson link plus the printed page footer without title-based guessing. The test suite covers this exact rule.
- Credential-like values found in previously prepared content were replaced with `***`; original PDFs were not changed. The shared content validator was not weakened. V10 reports zero ambiguous or unresolved PDFs and omits 28 unsafe link references.
- No publication dates were inferred from filenames. The pack has no owner-declared page inventory and does not claim the discovered page queue is exhausted.
- All six v10 batch hashes, source identity uniqueness, URL-prefix scope, per-batch size limits, and mode-600 file permissions verified.

The current local manifest is `tmp/authorized-skool-import/pdf-batch-2026-10-13-v10.manifest.json`. All six batches passed AgentOS' production selector and content parser via `AGENTOS_PRIVATE_SOURCE_PACK_MANIFEST=<manifest> npm run verify:private-source-pack`. The v7 manifest remains available as a prior checkpoint. These files contain lesson content and are ignored by Git; they were not committed or uploaded.

## Limits

This is not a complete May-October archive. The local file inventory does not prove that every classroom lesson or video is represented, and video URLs are references only; video bytes and transcripts were not acquired. No course-wide inventory was supplied. Publication dates remain unset because filename labels alone were not treated as authoritative dates.

The batch has not been previewed or imported in a tenant. The hosted source-import route is not enabled in the observed Cloud Test/Internal Beta revision, so no hosted database write was attempted. Use the in-product permission and preview flow only after the target route, retention configuration, and tenant are verified. Conflicting captures are retained distinctly rather than choosing a canonical copy; confirm the intended handling in the tenant preview before import. The v10 provenance remains explicitly incomplete, with no video assets and no exhausted discovery queue.

Preparation used only local files and made no request to Skool, Firecrawl, Google Drive, a database, or an AI provider. The prior v5 manifest remains available as a private local checkpoint.
