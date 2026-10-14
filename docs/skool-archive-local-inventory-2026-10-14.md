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

The Drive spreadsheet says the classroom inventory has 108 dated lessons plus
the standalone AgentOS System lesson, and reports only 9 of 108 dated lessons
archived. Its listed complete dates are May 11, 12, 13, 14, and 19. The
standalone AgentOS System PDF is separately saved as a four-page PDF, but its
video URLs and attached resources are not saved as media. The spreadsheet also
marks classroom video downloads incomplete. Its two JSON source-pack rows
describe 9 pages/132 links/1 pending page for May 11-19 and 10 pages/259 links/
3 media references/1 pending page for May 11-30; both are explicitly
incomplete. The spreadsheet's item-level rows identify 9 dated lesson PDFs
plus the separate System PDF. Of its two HTML captures, the May 19 page
duplicates an indexed PDF while the May 30 page is a distinct lesson source
saved as HTML. That May 30 source ID is also in the local v7 pack. All 11
unique Skool IDs indexed in these Drive rows are already present among the
local 60; Drive adds no unique lesson ID beyond the local v7 set.

Local v7 coverage by the Drive register's created month is:

| Created month | Captured | Listed | Missing |
| --- | ---: | ---: | ---: |
| May 2026 | 35 | 40 | 5 |
| June 2026 | 20 | 20 | 0 |
| July 2026 | 5 | 13 | 8 |
| August 2026 | 0 | 9 | 9 |
| September 2026 | 0 | 15 | 15 |
| October 2026 | 0 | 10 | 10 |

The 107-entry Drive register and the spreadsheet's 109-entry classroom count
remain inconsistent. The checklist of the 47 register IDs missing from local
v7 is stored privately at
`tmp/authorized-skool-import/archive-gap-checklist-2026-10-14.json`; it
contains the page URL, title/date, video reference, and outbound links for each
gap and is ignored by Git. It records 47 video references (32 external URLs
and 15 Skool-hosted IDs) plus 80 outbound links across 30 pages; these are
references, not downloaded media.

The Drive Markdown link register says it contains 107 lessons and was collected
October 11, while the spreadsheet says 109 entries total (108 dated plus the
standalone system lesson). These counts disagree and must be reconciled by
lesson URL and md identifier against the authorized classroom before coverage
is called complete. The Drive folder count is an asset count, not a lesson
count. This snapshot does not infer that files absent from the local v7
directory are absent from Drive.

## Next Archive Actions

1. Reconcile all lesson URLs and md identifiers in the Drive Markdown register,
   spreadsheet, and local v7 manifest; resolve the 107-versus-109 inventory
   discrepancy and establish the canonical May 1-October 10 lesson list plus
   the separate AgentOS System lesson.
2. Resolve the four ambiguous filename dates using the visible classroom
   metadata, not title guesses.
3. For every lesson, record whether HTML/PDF, outbound links, and video
   reference/transcript/media are present; do not treat a video URL as a copy
   of the video.
4. Only after the archive inventory is complete, run the in-product consent,
   preview, and scoped tenant import flow against the confirmed internal-beta
   target. The currently observed production Supabase project and disabled
   hosted import routes are not an import target.
