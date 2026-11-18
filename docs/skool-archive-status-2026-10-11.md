# Skool Archive Status (2026-10-11)

This is an inventory of archive metadata, not a copy of Skool lesson content.

## Scope and evidence

- Chrome profile `Aryaman (Work)` has a tab group named `Skool tabs - AgentOS`.
- The group contains 50 tabs. The classroom index currently exposes 109 entries;
  the requested date window is May 1 through June 1, 2026.
- Google Drive folder `School Tabs Agent OS` contains an archive manifest and
  dated lesson PDFs. The manifest is the source of truth for previously saved
  lesson copies; the Drive inventory was checked on 2026-10-11.
- The user reports having the course owner's permission. This inventory does
  not independently validate that grant or expand it to platform authorization.

## Saved lesson pages

The manifest records 9 of 108 dated lessons as saved:

| Date | Lessons saved |
| --- | --- |
| May 11 | `237+ Hermes Agent Use Cases`; `The Infinite Context Engine` |
| May 12 | `Hermes Agent Computer Use` |
| May 13 | `Hermes + Claude MCP`; `Paperclip + Hermes`; `Hermes Desktop App vs Hermes Open WebUI` |
| May 14 | `Hermes Agent OS System`; `How To Use Hermes Agent With Codex` |
| May 19 | `NotebookLM Agent OS` |

The separate `AGENT OS System!` lesson updated October 10 is saved as a
four-page PDF. Its manifest notes that video URLs appear in the page text, but
the actual videos and attached resources have not been verified as saved.

## Open lesson tabs not represented in the saved dated-PDF set

The Chrome group includes lesson tabs for May 1, 2, 4, 5, 6, 8, 9, 10, 17,
18, 20, 21, 22, 23, 25, 26, 27, 29, 30, and 31, plus June 1. The May 1-14
and May 17-19 entries include multiple distinct lessons; use the manifest and
lesson titles, not date alone, to reconcile each page. No dated classroom PDFs
for May 1-10, May 17-18, or May 20-June 1 were present in the folder inventory.
There were no video files in the inventory. A source-link register PDF exists,
but a complete per-lesson video-link index has not been verified.

## Authorization and collection method

The owner authorization reported by the user covers the user's relationship
with the course owner; it is not evidence of an exception to Skool's separate
platform rules. The current [Skool Platform Policy](https://help.skool.com/article/179-platform-policy)
prohibits scraping and automation requests. The [Skool Terms](https://www.skool.com/legal?t=terms)
also prohibit automated extraction/copying from the service. Do not use
Firecrawl, session cookies, scripts, or browser automation to bulk capture
authenticated lesson pages unless Skool separately authorizes that method.

Continue using an official platform export or owner-provided lesson package.
Once supplied, inventory it by lesson ID/title, capture available video URLs
as links (without downloading video unless the authorized package provides
the files), preserve source attribution, and prepare the permitted material
for AgentOS graph import. Do not import directly into a hosted tenant until
the target, license scope, and import receipt are reviewed.

## User Update and Drive Recheck (2026-10-10)

The user reports that lessons through July 3 are now downloaded. This is a
user-reported completion boundary, not an independently verified lesson
inventory. A read-only recheck of the `School Tabs Agent OS` Drive folder found
105 items. Of these, 9 are date-prefixed lesson PDFs (through May 19), 2 are
date-prefixed sanitized HTML copies (May 19 and May 30), and 2 are dated
source-pack JSON parts (May 11-19 and May 11-30). The remaining items include
standalone resource PDFs and the `AGENT OS System!` PDF; they are not evidence
of dated lesson-page coverage. The folder's `School Tabs Agent OS - Archive
Manifest` spreadsheet is a resource-copy/link register and contains no
date-prefixed lesson rows. The Drive-only snapshot did not include the user's
reported May 20-July 3 batch. The later local inventory below found many dated
PDFs in the ignored `source/tmp/` folder, but does not prove complete coverage
or that all user-reported items are present. No files were moved, uploaded, or
imported during the Drive-only recheck.

## Local-versus-Drive Recheck (2026-10-10)

A read-only filename inventory of `/Users/aryamandev/Documents/Codex/Projects/AgentOS/source/tmp`
found 64 PDFs total, including 59 files with a date-prefixed or ordinal-date
filename. This count includes the October AgentOS System PDF and is not a count
of distinct lesson days. Classroom lesson filenames span May 1 through July 11,
2026; this is a file-presence result, not proof that every available lesson in
that date range is represented. The local
set includes the May 11-14 and May 19 PDFs also listed in Drive, and includes
additional May, June, and July PDFs not present in the Drive folder inventory.
The local May 19 HTML capture is under
`.private-client-kits/skool-course-capture/2026-05-11-to-19/`.

The `tmp/` directory is ignored by Git (`.gitignore`), so these PDFs are not
included in project commits or pushes. Keep the local files intact until each
intended archive file has been uploaded to Drive and verified there. The Drive
folder currently has 105 items; its date-prefixed classroom set remains the
9 PDFs through May 19, 2 sanitized HTML files for May 19 and May 30, and 2 JSON
source-pack parts. The separate `agent-os-system-2026-10-10.pdf` is present in
Drive. No local-to-Drive completeness or byte-for-byte verification has been
performed for the extra May-July PDFs, and no files were moved, uploaded, or
deleted during this check.
