# Community source-pack import

This is an authenticated tenant-memory import for a **user-provided, authorized JSON export**. It is not a Skool crawler and does not bypass a platform login, access control, or collection policy. Obtain the material by a method the community and platform permit before using it here. Do not include member profiles, private messages, credentials, or content outside the approved scope.

## Format

The file uses the `ClassroomRun` shape already written by AgentOS local research, or a compatible JSON object:

For an authorized, user-supplied Markdown document, use `node scripts/prepare-markdown-source-pack.mjs input.md https://original.example/doc /private/tmp/source-pack.json`. It preserves supplied Markdown text, code blocks, tables, and quoted material by section; resolves ordinary and reference links, image URLs, and linked video URLs; reports malformed targets and unsupported raw HTML in `skipped`; and writes the review pack with private file permissions. It does not fetch linked content or media bytes, or establish reuse rights. Review the JSON and skipped entries before uploading. A large export produces numbered `source-pack.part-001.json` files plus `source-pack.manifest.json` with batch counts and SHA-256 hashes. Select the manifest and all numbered parts together; the manifest is an inventory, not an upload batch. The product checks part order, hashes, totals, and each part's content before uploading. An individual section over 30,000 characters fails visibly and must be split in the authorized source export before conversion. Repeated headings are assigned distinct stable import tabs so they cannot overwrite each other.

For a local `ClassroomRun` JSON from a site that permits automated collection, or an equivalent owner-provided JSON export, use `node scripts/prepare-classroom-source-pack.mjs input-run.json /private/tmp/source-pack.json`. This splits long text, large link lists, and more than 100 source views into tenant-import-compatible parts. Its mode-600 manifest records the input hash, part hashes, source/link/media-reference counts, skipped pages, pending pages, and whether the **discovered queue** was exhausted. An optional owner-declared `expected` inventory checks page/tab identities and publication-date bounds, recording missing, undeclared, undated, or out-of-window pages in that private manifest. This only checks the supplied export against the supplied inventory; neither is an independent census of the community. The terminal prints counts, not the missing-page URLs. It does not download video bytes, transcribe videos, or upload anything. A Skool-hosted page is not an allowed collector target under current platform rules; use a platform-approved or owner-hosted export instead.

```json
{
  "startUrl": "https://www.skool.com/example/about",
  "skipped": [],
  "pending": [],
  "expected": {
    "pages": [{ "url": "https://www.skool.com/example/classroom/lesson-1", "tab": "Lesson 1" }],
    "firstPublishedDate": "2026-05-01",
    "lastPublishedDate": "2026-05-01"
  },
  "sources": [
    {
      "title": "Example lesson",
      "url": "https://www.skool.com/example/classroom/lesson-1",
      "tab": "Lesson 1",
      "text": "Lesson text obtained with permission.",
      "publishedAt": "2026-05-01",
      "collectedAt": "2026-09-26T00:00:00Z",
      "links": [
        { "url": "https://example.org/resource", "text": "Reference" }
      ],
      "media": [
        { "kind": "video", "title": "Lesson playback", "url": "https://video.example.org/watch/lesson-1" }
      ]
    }
  ]
}
```

`startUrl`, each source title, and an HTTPS/HTTP source URL are required. Each source needs nonempty lesson `text` or at least one structured `media` / `video_page_links` reference; ordinary `links` are optional. `video_page_links` is an array of stable watch-page URL strings. The converter folds media into reviewed outbound links. Structured `media` entries require `kind` (`video`, `audio`, `image`, `embed`, or `file`), `title`, and `url`. Media-only lessons receive one visible incomplete-content warning; the private manifest's `coverage.mediaOnlySourceIds` identifies every such lesson even in a large export. A link is not a video download or transcript. `id`, `tab`, `collectedAt`, `publishedAt`, `expected`, `pending`, and `skipped` are optional. `publishedAt` and the `expected` bounds must be real `YYYY-MM-DD` calendar dates. `expected.pages` must list the URL and optional tab for each owner-declared page (at most 10,000), including both date endpoints. A true `declaredDateWindowMatched` means all declared pages are present, no extra pages appear, each has a date within the bounds, and the observed minimum and maximum dates match the bounds. It does **not** prove that the owner's list covers the platform, that lesson text is complete, or that media was downloaded. Publication dates are checked in the private conversion manifest only; the current tenant-import schema does **not** persist `publishedAt`. If `id` is absent, the converter derives a stable ID from the canonical source URL and tab; explicit IDs must be unique. The server rejects the whole pack if any page or link is malformed; it never silently drops a source. Keep `startUrl` identical across batches from the same community so repeat imports have stable IDs. A batch is limited to 1 MB, 100 sources, 30,000 characters per source, and 100 links per source. Split larger exports into batches; the product does not yet enumerate or verify that all community content was included.

Local database regression on 2026-10-07 imported 205 synthetic lessons in three batches, then verified all 205 records, 410 distinct source/resource URL nodes, search of the last lesson, and graph cleanup after deletion. This checks multi-batch graph behavior in embedded PostgreSQL only; it does not certify a real classroom export, hosted import, or full community coverage.

Remove signed URLs and credential-bearing query parameters before packaging the export. Source and outbound URLs with common token, code, signature, session, password, API-key, AWS presign, or Google Cloud Storage signing query keys are rejected rather than persisted to records or graph nodes. Replace temporary media download links with stable lesson or watch-page URLs; the import stores references, not video bytes.

## Tenant workflow

1. In Tenant Memory, choose **Review JSON source packs**. Select one ordinary JSON pack, or the manifest and every numbered part of a large export together. AgentOS checks the file set, totals, hashes, content schema, and cross-part source identities locally. Selection alone does not upload a batch. Missing, altered, malformed, or identity-colliding parts stop the review before any import. The server validates each uploaded part again; this local preflight is not a whole-export transaction. Earlier batches remain committed if a later review or import fails.
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

**Signed-in local import attempt, 2026-10-05:** The updated client at
`http://127.0.0.1:3941/memory` used the existing Chrome tenant session and loaded
24 memories, 33 nodes, and 57 edges. Provider calls were disabled. The prepared
bonus-index pack (2 sections, 111 links, 1 skipped URL) was selected and its
previously authorized scope confirmed. Review reached the real artifact-create
API, which returned HTTP 503 `storage_not_configured`. The source pack was not
uploaded and no import was attempted. The local environment lacks the storage
bucket and namespace; the current storage identity helper also depends on
Cloud Run metadata, so copying bucket settings alone would not establish local
upload parity. The graph migration remains unverified against this tenant.

Memory now distinguishes pending, failed, and confirmed-empty reads. A completed
import also reports a failed records or graph refresh without offering to
submit that batch again. Storage setup failures show a readable explanation.
Six isolated browser checks passed with API/storage interception, and TypeScript
checking passed. These checks cover feedback and consent behavior, not a real
storage upload or successful hosted source import.

**Durable local configuration and identity check, 2026-10-05:** After the
temporary local configuration disappeared, restored the existing
`agentos-mvp` / `agentos-internal-beta` settings into ignored, mode-0600
`.private-client-kits/internal-beta.local.env`. This is a separate tenant from
`veloce-cloud-test`; it does not inherit that workspace's data or acceptance
evidence. No secret values are included in this document or committed.

Start this local client with:

```sh
node scripts/run-client-runtime-local.mjs --env-file .private-client-kits/internal-beta.local.env --port 3939 --gcp-auth
```

Provider calls remain disabled. Storage and background tasks now use the same
identity helper: Cloud Run metadata first, then local Google CLI credentials
only for client edition, `NODE_ENV=development`, and explicit `--gcp-auth`
opt-in. Production, test, unspecified environments, and non-client mode cannot
fall back to local credentials. Metadata requests time out after two seconds;
CLI execution is bounded and never prints the token.

The real identity probe succeeded, but IAM signing returned HTTP 403
`IAM_PERMISSION_DENIED`: the current user lacks
`iam.serviceAccounts.signBlob` on
`agentos-internal-beta-run@agentos-mvp.iam.gserviceaccount.com`. The existing
bucket CORS policy permits only
`https://agentos-internal-beta-1028728465669.europe-west1.run.app`, not the local
origin. Neither IAM nor CORS was modified. No source pack was uploaded and no
import occurred. A signed-in internal-beta journey and real import remain
unverified; granting signing permission alone would not resolve local CORS.

Verification: 22 focused identity/launcher/research tests passed, targeted
ESLint and TypeScript checks passed, and the worker static boundary verifier
passed. These are local regression checks, not production acceptance.

The restored Chrome session subsequently reached local `/memory`. The session
endpoint returned HTTP 200, but both records and memory-graph requests returned
HTTP 401. The UI correctly displayed unavailable states, not zero records.
Those routes require both an authenticated user and `client_member` approval;
the precise failed check still needs verification. Do not bypass membership or
assume the older cloud-test login grants internal-beta access. The signed-in
data journey therefore remains unaccepted.

**Membership diagnosis and login repair, 2026-10-05:** The live session now
explicitly reports `authenticated: true`, `workspaceAuthorized: false`, and
`accessError: tenant_membership_required`. The membership RPC returned a valid
negative response, not a network/configuration error. Password login now checks
the configured tenant before issuing cookies; the session endpoint separates
account authentication from workspace authorization. The login page redirects
only an authorized session and distinguishes denied access from a temporarily
unavailable membership check. No membership, IAM, or CORS settings were changed.

Nineteen focused authentication checks and six intercepted browser checks
passed, covering non-members, malformed/unavailable membership responses,
revocation between login and session verification, authorized redirects, and
390px/1440px login layouts. Type checking and targeted lint passed. The real
browser stayed on login with the membership-required message; full signed-in
acceptance is still blocked pending an approved test-tenant member account.

**Current read comparison, 2026-10-08:** The existing authorized Chrome session
now loads the local internal-beta `/memory` page and the hosted internal-beta
Cloud Run page with the same two bonus-index records and 114 nodes/113 edges.
Local search for `BONUSES` returns `OTHER BONUSES` with 27 source links. The
hosted UI still lacks the local `Community sources` import control and exposes
classroom/social links hidden by the local route policy. This is evidence that
the bonus-index records are readable in this tenant; it does not establish
which deployment imported them, a complete Skool classroom export, or release
parity. No upload was performed in this comparison.
The five-case local source-import browser suite also passed against this
server using installed Chrome, synthetic packs, and intercepted API writes.
