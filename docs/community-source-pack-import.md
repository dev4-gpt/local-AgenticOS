# Community source-pack import

This is an authenticated tenant-memory import for a **user-provided, authorized JSON export**. It is not a Skool crawler and does not bypass a platform login, access control, or collection policy. Obtain the material by a method the community and platform permit before using it here. Do not include member profiles, private messages, credentials, or content outside the approved scope.

## Format

The file uses the `ClassroomRun` shape already written by AgentOS local research, or a compatible JSON object:

For an authorized, user-supplied Markdown document, use `node scripts/prepare-markdown-source-pack.mjs input.md https://original.example/doc /private/tmp/source-pack.json`. It preserves supplied Markdown text, code blocks, tables, and quoted material by section; resolves ordinary and reference links, image URLs, and linked video URLs; reports malformed targets and unsupported raw HTML in `skipped`; and writes the review pack with private file permissions. It does not fetch linked content or media bytes, or establish reuse rights. Review the JSON and skipped entries before uploading. A large export produces numbered `source-pack.part-001.json` files plus `source-pack.manifest.json` with batch counts and SHA-256 hashes. Select the manifest and all numbered parts together; the manifest is an inventory, not an upload batch. The product checks part order, hashes, and totals before uploading. An individual section over 30,000 characters fails visibly and must be split in the authorized source export before conversion. Repeated headings are assigned distinct stable import tabs so they cannot overwrite each other.

For a local `ClassroomRun` JSON from a site that permits automated collection, or an equivalent owner-provided JSON export, use `node scripts/prepare-classroom-source-pack.mjs input-run.json /private/tmp/source-pack.json`. This splits long text, large link lists, and more than 100 source views into tenant-import-compatible parts. Its mode-600 manifest records the input hash, part hashes, source/link/media-reference counts, skipped pages, pending pages, and whether the **discovered queue** was exhausted. It does not assert that every community page was visible, download video bytes, transcribe videos, or upload anything. A Skool-hosted page is not an allowed collector target under current platform rules; use a platform-approved or owner-hosted export instead.

```json
{
  "startUrl": "https://www.skool.com/example/about",
  "skipped": [],
  "sources": [
    {
      "title": "Example lesson",
      "url": "https://www.skool.com/example/classroom/lesson-1",
      "tab": "Lesson 1",
      "text": "Lesson text obtained with permission.",
      "collectedAt": "2026-09-26T00:00:00Z",
      "links": [
        { "url": "https://example.org/resource", "text": "Reference" }
      ]
    }
  ]
}
```

`startUrl`, each source title, HTTPS/HTTP URL, nonempty text, and a `links` array are required. `tab`, `collectedAt`, and `skipped` are optional. The server rejects the whole pack if any page or link is malformed; it never silently drops a source. Keep `startUrl` identical across batches from the same community so repeat imports have stable IDs. A batch is limited to 1 MB, 100 sources, 30,000 characters per source, and 100 links per source. Split larger exports into batches; the product does not yet enumerate or verify that all community content was included.

Remove signed URLs and credential-bearing query parameters before packaging the export. Source and outbound URLs with common token, code, signature, session, password, or API-key query keys are rejected rather than persisted to records or graph nodes.

## Tenant workflow

1. In Tenant Memory, choose **Review JSON source packs**. Select one ordinary JSON pack, or the manifest and every numbered part of a large export together. AgentOS checks the file set, totals, hashes, and cross-part source identities locally. Selection alone does not upload a batch. Missing, altered, or identity-colliding parts stop the review before any import.
2. Confirm permission to upload and use the current batch in this tenant, then choose **Review batch**. That action uploads the part as a tenant artifact for server-side parsing. Review page/link counts and expand each source to inspect its normalized text, original URL, tab/time metadata, and every outbound link. Review the expanded skipped-entry list too. A pack with skipped entries is incomplete until those omissions are understood. Import requires the SHA-256 returned by preview; if the artifact bytes change between review and import, the request fails and must be previewed again. Selecting a different file set clears permission confirmation and progress.
3. After a successful import, the next part remains selected but is not uploaded automatically. Confirm permission and choose **Review batch** again. The progress display counts committed batches; if a review fails, retry that batch. Earlier imports remain saved. Source import allows 10 requests per 15 minutes (preview and import each count), so a large export may pause after five batches; wait for the window to clear, then retry the current batch. Do not reselect the export unless you intend to restart the review sequence. Reimports are idempotent, but a new selection does not resume the old display.
4. Import creates one tenant memory per source, retaining its original URL, tab, collection time, outbound links, artifact ID, and content hash. Reimporting the same `startUrl` + page URL + tab updates changed text, title, links, or collection time in place; unchanged sources are reported separately. It does not create duplicate memories.
5. Each changed batch rebuilds the tenant knowledge map and records a content-free import audit event in the same database transaction as its memory writes. A graph or audit failure rolls back the batch; a successful import does not depend on a second, rate-limited browser refresh. Document, URL, and tag nodes plus `source_at` and `links_to` edges preserve provenance. Tenant Memory search queries the full tenant archive, including source URLs and outbound-link references, rather than only the loaded record page or graph preview. The original artifact has the configured tenant artifact retention period. Imported memories persist under the tenant's record lifecycle and must be deleted separately when requested. Deleting or archiving a memory from Tenant Memory refreshes the map so its document and unreferenced links disappear; this does not delete the uploaded artifact.

The migration is `product-experience/supabase-client-runtime-source-pack-graph.sql`, applied **after** the existing memory-graph, artifact, and control-plane audit-table migrations, with the app release that adds `/api/client-runtime/source-import`. Test on a disposable tenant before promotion. If the app is rolled back, disable the new API route and restore the original graph refresh function from `supabase-client-runtime-memory-graph.sql`; keep imported memory records and the unique index intact until the owner chooses a data-retention action. Do not drop content as a rollback shortcut.

The isolated browser regression `npm run verify:source-import-browser` covers permission-before-upload and renewed permission between parts with mocked API/storage responses. It requires a client production preview at `http://127.0.0.1:3939` and an installed Playwright browser. This local check does not prove the cloud migration or a hosted import.

## Current limitations

- No direct Skool automation is enabled without platform-level permission. Community/member access is a separate question.
- The local Classroom Research collector now rejects `skool.com` and its subdomains before sign-in or collection. This follows Skool's [terms](https://www.skool.com/legal?t=terms) and [platform policy](https://help.skool.com/article/179-platform-policy); a community-owner grant is not a platform waiver. The reviewed JSON/Markdown import path remains available for material supplied through a platform-approved export or directly by the owner outside Skool.
- The supplied builder-grant extension itself says it is not a Skool API exemption or platform-policy waiver. It supports reuse of granted content; it does not authorize the product to collect it through Skool automation.
- A later community-owner letter names module `9daf24e1` for automated collection, but it is not a Skool-issued exception and its textual signature claim is not cryptographically verifiable from the PDF. The crawler remains off until the platform access method is cleared.
- The import includes text, source URLs, and link references, not attachment bytes, comments, member identities, or a completeness proof. A pack with `skipped` entries is visibly incomplete.
- Tenant memories and archive-wide search results are paged in the UI. The 3D map is explicitly a bounded preview (500 nodes and 2,000 edges); large communities still require graph exploration/pagination and an import inventory before "all content" can be certified.
- Graph imports are validated locally in PostgreSQL tests, but this migration has not yet been applied to a tenant database or proven in the authenticated cloud UI. A 2026-09-29 disposable-database run of the privately supplied bonus pack imported 2 sources with 111 outbound links, produced the expected 111 distinct source/link URL nodes, preserved every normalized text/link value, rejected another tenant, re-imported idempotently, and removed all nodes after record deletion. The pack still reports one skipped entry, and no linked resource content was fetched.
- The single-pack review control passed a mocked-upload browser check at desktop and mobile widths on 2026-09-29. The later manifest-and-parts flow passed local manifest/hash/order tests and a webpack production build, but has not yet passed a signed-in browser import. Neither check proves a real tenant import.

**User-provided bonus-index dry run, 2026-10-05:** The local Markdown copy
`/Users/aryamandev/Downloads/AI Profit Boardroom Bonuses!.md` is a 117-line,
14,891-byte link index, not the requested May-September classroom export. Its
SHA-256 is `d3934f1cf50b41c5703568fc6458635d6a371acbb983eeaba12b4fd3ec245246`.
The reviewed pack was written outside the repository at
`/private/tmp/agentos-bonuses-prepared-2026-10-05.json` with mode `0600` and
SHA-256 `9bf6093de3446553a6858560d3f1454f1160fc508875e270a50d85bec9db6aa6`.
It contains 2 source sections, preserves 111 links, and reports 1 missing URL
for an annual-member-vault entry whose Markdown target was empty. No target was
guessed and no link was fetched. The exact pack passed the disposable PGlite
import/graph regression (4/4), including re-import, tenant-boundary, and record
deletion checks; the synthetic consent browser suite passed 2/2 with API and
storage intercepted. No Supabase write or real tenant import occurred, and
this does not capture the lesson pages or videos. Current [Skool Terms](https://www.skool.com/legal?t=terms)
and [Platform Policy](https://help.skool.com/article/179-platform-policy)
prohibit automated scraping; use a platform-approved export or directly
owner-supplied material and retain its scope/coverage inventory.
