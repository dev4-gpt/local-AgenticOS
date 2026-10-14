# Skool Archive Local Inventory - 2026-10-14

Scope requested: the authorized AI Profit Boardroom classroom, May 1 through
October 10, plus the AgentOS System lesson. This began as a local-file
inventory; a read-only audit of the owner's Drive archive and manifest is now
included below. Counts do not replace lesson-by-lesson reconciliation.

## Files Found

| Local item | Count | Evidence / limits |
| --- | ---: | --- |
| PDFs in the prepared v7 manifest | 64 | All 64 parsed; 175 source segments and 7,565 link references; zero parser skips or unresolved PDFs |
| May-labeled PDFs | 32 | 23 ordinal-name files plus 9 ISO-date files |
| June-labeled PDFs | 22 | Day labels present in filenames |
| July-labeled PDFs | 5 | Day labels present in filenames, from July 3 through July 11 |
| Ambiguous date-label PDFs | 4 | Day is present but month is absent or unclear; do not infer a month from filename alone |
| AgentOS System PDF | 1 | `agent-os-system-2026-10-10.pdf` |
| Top-level saved HTML pages | 6 | May 22, 25, 26, 27, 29, and 30 captures; the May 30 page also has a PDF |
| Local video files | 0 | No MP4, WebM, MOV, or M4V found in the archive input directory |

The v7 manifest has 64 PDF records but only 60 unique Skool lesson IDs: four
source IDs have two preserved captures each. A read-only join against the
current Drive Markdown register found all 60 unique local IDs in its 107 lesson
entries, with no local-only IDs; 47 register IDs have no local v7 capture.
That is 60/107 (56.1%) of the register's listed lessons, not proof that every
capture contains all page media or that the register is complete.

The four ambiguous PDF labels are:

- `12th_ Hermes Agent Computer Use ...pdf`
- `14th Page_ GLM 5.2 ...pdf`
- `17th_ Grok + Hermes Agent ...pdf`
- `9th_ Hermes Desktop App ...pdf`

The pack has no filename-labeled lessons for August or September, or for
October 1-9. This is a local-archive gap, not evidence those lessons are absent
from Skool. The May/June/July filename distributions are not a canonical lesson
inventory, and the prepared records intentionally leave `publishedDate` unset.

## Video And Link Coverage

The six private v7 batch files contain the extracted lesson text and link
references for all 64 PDFs. A simple host/label heuristic found three
media-like external links (one Loom and two Google Drive references); it is not
a complete video audit. The PDFs contain no video bytes or transcripts. Skool
embedded video metadata, links in the six standalone HTML captures, and any
separate course resources still need direct inventory against the authorized
classroom and AgentOS System tab.

The private source pack remains at:

`tmp/authorized-skool-import/pdf-batch-2026-10-13-v7.manifest.json`

It is ignored by Git and has not been imported. The parser check passes, but
there is no owner-declared lesson inventory, verified full date coverage, video
asset inventory, or hosted import receipt yet. Keep it private; do not upload
or publish the source content as part of a code commit.

## Google Drive Reconciliation Snapshot

Read-only review on 2026-10-14 found 107 direct items in the School Tabs Agent
OS Drive folder: 98 PDFs, 3 HTML files, 2 JSON source packs, one Markdown
lesson-link register, one spreadsheet manifest, one Python file, and one ZIP.
The 98 PDFs include bonus resources and should not be counted as classroom
lesson-page coverage.

The spreadsheet's archive-summary row reports 109 in-scope entries (108 dated
lessons plus the standalone AgentOS System lesson), only 9 dated lessons
archived, and complete dates May 11, 12, 13, 14, and 19. A fresh read of the
sheet shows 108 rows total including its header and 107 asset rows; most rows
are bonus resources, not a lesson roster. Its item-level rows identify 9 dated
lesson PDFs plus the separate System PDF. The spreadsheet also marks classroom
video downloads incomplete. Its two JSON source-pack rows describe 9 pages/132
links/1 pending page for May 11-19 and 10 pages/259 links/3 media references/1
pending page for May 11-30; both are explicitly incomplete. Of its two HTML
captures, the May 19 page duplicates an indexed PDF while the May 30 page is a
distinct lesson source saved as HTML. That May 30 source ID is also in the local
v7 pack. All 11 unique Skool IDs indexed in these Drive rows are already among
the local 60; Drive adds no unique lesson ID beyond the local v7 set.

Local v7 coverage by the Drive register's created month is:

| Created month | Captured | Listed | Missing |
| --- | ---: | ---: | ---: |
| May 2026 | 35 | 40 | 5 |
| June 2026 | 20 | 20 | 0 |
| July 2026 | 5 | 13 | 8 |
| August 2026 | 0 | 9 | 9 |
| September 2026 | 0 | 15 | 15 |
| October 2026 | 0 | 10 | 10 |

The checklist of the 47 register IDs missing from local v7 is stored privately at
`tmp/authorized-skool-import/archive-gap-checklist-2026-10-14.json`; it
contains the page URL, title/date, video reference, and outbound links for each
gap and is ignored by Git. It records 47 video references (32 external URLs
and 15 Skool-hosted IDs) plus 80 outbound links across 30 pages; these are
references, not downloaded media.

The Drive Markdown link register contains 107 lesson IDs, including the
standalone System page. The direct classroom-index comparison below finds 109
lesson links in total, of which two are dated after the requested October 10
cutoff; the remaining 107 in-scope links match the register by title. The
spreadsheet's 109-in-scope summary therefore conflicts with the current live
index and register, and remains unresolved as a stale or overinclusive count.
The Drive folder count is an asset count, not a lesson count. This snapshot
does not infer that files absent from the local v7 directory are absent from
Drive.

## Next Archive Actions

1. Reconcile the spreadsheet's unresolved 109-in-scope summary with the live
   107-link in-scope title match and register using an authoritative roster or
   course-owner confirmation. The current combined manifest still has 29
   register IDs without lesson text.
2. Resolve the four ambiguous filename dates using the visible classroom
   metadata, not title guesses.
3. For every lesson, record whether HTML/PDF, outbound links, and video
   reference/transcript/media are present; do not treat a video URL as a copy
   of the video.
4. Only after the archive inventory is complete, run the in-product consent,
   preview, and scoped tenant import flow against the confirmed internal-beta
   target. The currently observed production Supabase project and disabled
   hosted import routes are not an import target.

## Live Register Recheck

A fresh read-only Google Drive connector check confirmed that the Markdown
register currently contains 107 distinct Skool lesson IDs. Comparing those IDs
against the private v7 manifest again yielded 60 shared IDs, 47 register IDs
missing from the local pack, and zero local IDs absent from the register. The
register lists one video reference for each lesson: 92 public YouTube URLs and
15 Skool-hosted video IDs. These are references only; they do not establish
that video files, transcripts, or attached resources were saved.

The Drive folder's asset count is separate from classroom coverage. The
spreadsheet still reports only 9 dated lesson PDFs archived, with the System
PDF separate; the local 60-page prepared pack is not 60 lesson PDFs in Drive.
Its summary count of 108 dated lessons plus System conflicts with the direct
live-index/title comparison recorded below; do not treat that summary cell as
the canonical lesson roster.

## Local Register Graph Index

The current Markdown register was parsed into a private JSON-LD graph and
merged with the existing v7 content graph at
`tmp/authorized-skool-import/agentos-local-graph-with-register-2026-10-13.jsonld`.
The merged export has 736 nodes and 8,101 edges. The register portion adds 107
canonical lesson records, 107 video-reference edges (92 public YouTube
references and 15 Skool-hosted IDs), and 254 outbound-link edges across 178
unique URLs. The v7 page captures remain the only source of page text.

The importer rejects invalid or secret-bearing URLs and duplicate lesson IDs;
its focused tests, lint, and repository typecheck pass. The output is mode
`0600`, ignored by Git, and has `complete: false`, `pageTextIncluded: false`,
and `videoAssetsIncluded: false`. It is a local graph export, not a hosted graph
database import receipt or a complete course archive.

## Latest Read-Only Refresh

The current Google Drive folder listing still contains 107 direct items:
98 PDFs, 3 HTML files, 2 JSON source packs, 1 Markdown register, 1 spreadsheet,
1 Python file, and 1 ZIP. This is an asset count, not course-page coverage.
The folder also contains `skool_video_links.py` and a dated Markdown lesson
link register; neither is evidence that video bytes or transcripts were saved.

## Drive Recheck After Partial Graph Export (2026-10-14)

A subsequent read-only listing found **108** direct Drive items, one more than
the 107-item snapshot above. The added item is
`AgentOS-Knowledge-Graph-Partial-2026-10-14.jsonld` (5,682,448 bytes). It is a
partial graph export, not an additional lesson capture. The latest listing
therefore does not change the verified coverage figures: the Markdown register
still has 107 lesson IDs, the prepared combined local archive has text for 78,
25 discovered pages remain uncollected, four entries have references but no
lesson text, and video assets/transcripts remain unverified.

The Drive spreadsheet still says 9 of 108 dated lessons are archived and
records the standalone AgentOS System PDF separately. The live classroom
sidebar previously showed 110 items, with only 100 rendered in that view. These
are three different inventories (Drive register, spreadsheet scope, and live
sidebar), not counts that can be reconciled by adding files; a canonical
lesson-URL/`md`-ID roster is still required before declaring coverage complete.

The newest private PDF preparation manifest is
`tmp/authorized-skool-import/pdf-batch-2026-10-13-v10.manifest.json`. It
processes 64 PDFs into 175 source segments and 7,537 link references across
six hash-verified batches. It preserves all eight captures across four
conflicting lesson URLs, reports zero ambiguous or unresolved PDFs, and
omits 28 unsafe references. AgentOS' production source-pack parser passed for
this manifest. The corresponding local graph at
`tmp/authorized-skool-import/agentos-local-graph-v10.jsonld` contains 442
graph nodes and 7,712 edges.

This PDF-only v10 snapshot did not improve the v7 coverage boundary: its
provenance still set `completeCommunityExport`, `discoveredQueueExhausted`,
`complete`, and `videoAssetsIncluded` to false. It was a local prepared graph,
not an accepted tenant import. The later Drive-supplement reconciliation is
recorded below. No Drive files, tenant records, hosted database, or provider
settings were changed during this PDF-only refresh.

## Combined Local Archive Reconciliation (2026-10-14)

The private combined manifest at
`tmp/authorized-skool-import/combined-agentos-archive-2026-10-14.manifest.json`
joins the six hash-verified PDF v10 batches with the later Drive supplement.
Its 193 source segments consist of 175 segments from 64 PDFs plus 18
substantive Drive page captures; its graph records 7,577 link references. A
read-only join by the `md` query ID against the 107-entry Markdown register
confirms 78 distinct lesson IDs with text, up from 60 in the earlier v7-only
inventory.

The remaining 29 registered IDs are accounted for by the supplement metadata:
25 discovered classroom pages remain uncollected, and 4 Drive entries contain
only a title/video reference without lesson text. This accounts for the
previous 47-ID v7 gap: 18 of those IDs now have text in the supplement, leaving
29. This does not resolve the separate 107-register versus 109-spreadsheet
inventory discrepancy or prove complete date coverage.

The combined graph contains 492 nodes (193 `LearningResource` entries and 299
unique URL nodes). Its provenance remains `complete: false`,
`discoveredQueueExhausted: false`, and `videoAssetsIncluded: false`. The
supplement has 40 outbound links but no media references; the graph's link
references and the three media references noted in an earlier Drive pack are
not video bytes or transcripts. No hosted tenant import was made.

The repository does contain Firecrawl integrations for bounded web research,
SEO, and outreach. The separate `scripts/fetch-skool-classroom-firecrawl.py`
is intentionally fail-closed for authenticated Skool collection and advises
against forwarding Skool session cookies to Firecrawl. The remaining source
gap must be filled from independently supplied owner-authorized files or a
Skool-approved export/exception, not another Firecrawl key, a browser scrape,
or a new scraping framework. Never place session cookies or course credentials
in source packs, logs, or third-party scraping services.

## Live Classroom Recheck (2026-10-14)

The user's selected Chrome Work window was verified signed in to the AI Profit
Boardroom. The classroom sidebar reports **111 virtual-list items**; extracting
the link rows from overlapping top and bottom scroll windows yields **109
distinct lesson links**, with the oldest entries reaching May 1. The lessons
outside the requested range are the October 13 and October 14 entries. A
title-by-title set comparison against the 107-entry Drive Markdown register
shows **no register-only titles**; its two unmatched live titles are precisely
those October 13-14 lessons. Thus the 107 register entries (106 dated lessons
plus the separate `AGENT OS System!` page) cover the current visible index
through October 10. This conflicts with the spreadsheet summary cell claiming
108 dated lessons plus System; that overcount remains unresolved and should not
be used as the canonical roster.

The live `AGENT OS System!` page shows a 59:26 player, says `Last update: 12th
October 2026`, and exposes setup/update text, Descript references, related
Skool posts, a Worlds ZIP reference, and a Resources section. The previously
archived four-page System PDF is labeled as last updated September 11, so it is
not a current capture of the visible page. The lesson itself exposes video
references including `https://share.descript.com/view/UKsEclJ2b18` and
`https://share.descript.com/view/0xa40M51B07`; these are links, not downloaded
video bytes or transcripts. The Resources section still requires a separate
asset inventory.

This was a read-only inspection in the user's existing signed-in browser; no
cookies were exported or sent to a scraper, and no lesson progress, comments,
or account content were changed. The owner-authorization history is recorded in
this project conversation. Keep course captures private and out of Git. The
index/register title match resolves the missing-register-ID question, but does
not provide all lesson bodies or resolve the spreadsheet's two-entry count
discrepancy.

## Offline Verification Refresh (2026-10-14)

- The current combined private manifest passed the production source-pack
  parser: **1/1** when run with
  `AGENTOS_PRIVATE_SOURCE_PACK_MANIFEST=tmp/authorized-skool-import/combined-agentos-archive-2026-10-14.manifest.json`.
- Private source-pack sanitizer tests passed **2/2**; portable graph-integrity
  tests passed **4/4**.
- The deterministic AI release evaluation passed **16/16** on supported Node
  24 with zero model samples and zero provider requests. Its report correctly
  keeps `productionReady: false`.
- These checks validate local archive structure and deterministic contracts;
  they do not constitute a hosted graph import or complete the 29 missing
  lesson-text records / 25 uncollected pages / four metadata-only records.
