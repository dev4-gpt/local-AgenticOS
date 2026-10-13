# Skool Drive Archive Audit - 2026-10-13

## Read-Only Inventory

The live `School Tabs Agent OS` Drive folder contains 107 items: 98 PDFs, 3
HTML files, 2 JSON source packs, 1 ZIP, 1 Python script, 1 Markdown link
register, and 1 archive-manifest spreadsheet. The current manifest has 107
rows, including 89 copied bonus resources and archive tracking rows.

The manifest still records only 9 of 108 dated classroom lessons as archived,
across May 11, 12, 13, 14, and 19. The standalone `AGENT OS System!` lesson has
a separate PDF, but linked Resources files are not fully verified. No classroom
video downloads are verified. The folder count is not a lesson-coverage count.

## Source-Pack Quality

The current `2026-05-11-to-30-agentos-source-pack-v2-part-001.json` is a partial
pack, not a complete course archive. It contains 19 source segments for 10
unique classroom URLs, 259 links, and 408,435 characters of page text. Nine
lesson URLs are represented by two segments each to stay within the source
pack's per-item text limit. All 19 segments lack `publishedAt` dates.

The pack itself records four caveats: four credential-like text matches were
redacted; one invalid or sensitive-query URL was omitted; 11 local/private,
ephemeral, placeholder, invalid, or sensitive-query URL occurrences were
omitted; and one discovered page remains uncollected. It also notes that PDF
text extraction misses embedded annotation links. This is useful partial
material for review, but not sufficient evidence for a complete May-October
graph import.

## Video Collector Boundary

The uploaded `skool_video_links.py` was inspected but not executed. It launches
a persistent Playwright browser profile, reads Skool page data and lesson DOM,
and can dump raw page JSON in debug mode. Its output files have no explicit
private-file permission handling. Do not use it with a signed-in profile or
run it across the course until an approved collection method and output
handling are established. No browser session or course content was sent to an
external scraping service during this audit.

## Import Status

No graph import was performed. The current hosted Internal Beta does not expose
the source-import route, and the internal-beta storage/runtime retention
configuration remains out of alignment with the selected 45-day item policy.
The local source-pack parser, consent flow, proxy upload, graph isolation, and
cleanup tests pass, but they do not establish a completed hosted import.

Next evidence needed: a complete, owner-authorized and platform-permitted
export for the remaining lesson pages and video/resource links; a verified
retention/storage policy; then a signed-in preview and explicit import on the
intended tenant after the source-import route is deployed and independently
verified. No Drive files were modified by this audit.
