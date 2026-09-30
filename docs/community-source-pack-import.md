# Community source-pack import

This is an authenticated tenant-memory import for a **user-provided, authorized JSON export**. It is not a Skool crawler and does not bypass a platform login, access control, or collection policy. Obtain the material by a method the community and platform permit before using it here. Do not include member profiles, private messages, credentials, or content outside the approved scope.

## Format

The file uses the `ClassroomRun` shape already written by AgentOS local research, or a compatible JSON object:

For an authorized, user-supplied Markdown document, use `node scripts/prepare-markdown-source-pack.mjs input.md https://original.example/doc /private/tmp/source-pack.json`. It preserves supplied Markdown text, code blocks, tables, and quoted material by section; resolves ordinary and reference links, image URLs, and linked video URLs; reports malformed targets and unsupported raw HTML in `skipped`; and writes the review pack with private file permissions. It does not fetch linked content or media bytes, or establish reuse rights. Review the JSON and skipped entries before uploading. A large export produces numbered `source-pack.part-001.json` files plus `source-pack.manifest.json` with batch counts and SHA-256 hashes. Select the manifest and all numbered parts together; the manifest is an inventory, not an upload batch. The product checks part order, hashes, and totals before uploading. An individual section over 30,000 characters fails visibly and must be split in the authorized source export before conversion. Repeated headings are assigned distinct stable import tabs so they cannot overwrite each other.

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

1. In Tenant Memory, choose **Review JSON source packs**. Select one ordinary JSON pack, or the manifest and every numbered part of a large export together. AgentOS verifies the complete file set, totals, hashes, and cross-part source identities before uploading the first part as a tenant artifact for server-side parsing. Missing, altered, or identity-colliding parts stop the review before any import.
2. Review page/link counts and expand each source to inspect its normalized text, original URL, tab/time metadata, and every outbound link. Review the expanded skipped-entry list too. A pack with skipped entries is incomplete until those omissions are understood. Confirm permission for each batch before importing. Import requires the SHA-256 returned by preview; if the artifact bytes change between review and import, the request fails and must be previewed again. Selecting a different file set clears the permission confirmation and progress display.
3. The next part is uploaded and presented only after the current part imports. The progress display counts committed batches; if a later upload or review fails, use **Retry review** to continue from that part. Earlier imports remain saved. Source import allows 10 requests per 15 minutes (preview and import each count), so a large export may pause after five batches; wait for the window to clear, then retry the current batch. Do not reselect the export unless you intend to restart the review sequence. Reimports are idempotent, but a new selection does not resume the old display.
4. Import creates one tenant memory per source, retaining its original URL, tab, collection time, outbound links, artifact ID, and content hash. Reimporting the same `startUrl` + page URL + tab updates changed text, title, links, or collection time in place; unchanged sources are reported separately. It does not create duplicate memories.
5. Each changed batch rebuilds the tenant knowledge map in the same database transaction as its memory writes. A graph failure rolls back the batch; a successful import does not depend on a second, rate-limited browser refresh. Document, URL, and tag nodes plus `source_at` and `links_to` edges preserve provenance. Tenant Memory search queries the full tenant archive, including source URLs and outbound-link references, rather than only the loaded record page or graph preview. The original artifact has the configured tenant artifact retention period. Imported memories persist under the tenant's record lifecycle and must be deleted separately when requested. Deleting or archiving a memory from Tenant Memory refreshes the map so its document and unreferenced links disappear; this does not delete the uploaded artifact.

The migration is `product-experience/supabase-client-runtime-source-pack-graph.sql`, applied **after** the existing memory-graph and artifact migrations, with the app release that adds `/api/client-runtime/source-import`. Test on a disposable tenant before promotion. If the app is rolled back, disable the new API route and restore the original graph refresh function from `supabase-client-runtime-memory-graph.sql`; keep imported memory records and the unique index intact until the owner chooses a data-retention action. Do not drop content as a rollback shortcut.

## Current limitations

- No direct Skool automation is enabled without platform-level permission. Community/member access is a separate question.
- The supplied builder-grant extension itself says it is not a Skool API exemption or platform-policy waiver. It supports reuse of granted content; it does not authorize the product to collect it through Skool automation.
- A later community-owner letter names module `9daf24e1` for automated collection, but it is not a Skool-issued exception and its textual signature claim is not cryptographically verifiable from the PDF. The crawler remains off until the platform access method is cleared.
- The import includes text, source URLs, and link references, not attachment bytes, comments, member identities, or a completeness proof. A pack with `skipped` entries is visibly incomplete.
- Tenant memories and archive-wide search results are paged in the UI. The 3D map is explicitly a bounded preview (500 nodes and 2,000 edges); large communities still require graph exploration/pagination and an import inventory before "all content" can be certified.
- Graph imports are validated locally in PostgreSQL tests, but this migration has not yet been applied to a tenant database or proven in the authenticated cloud UI. A 2026-09-29 disposable-database run of the privately supplied bonus pack imported 2 sources with 111 outbound links, produced the expected 111 distinct source/link URL nodes, preserved every normalized text/link value, rejected another tenant, re-imported idempotently, and removed all nodes after record deletion. The pack still reports one skipped entry, and no linked resource content was fetched.
- The single-pack review control passed a mocked-upload browser check at desktop and mobile widths on 2026-09-29. The later manifest-and-parts flow passed local manifest/hash/order tests and a webpack production build, but has not yet passed a signed-in browser import. Neither check proves a real tenant import.
