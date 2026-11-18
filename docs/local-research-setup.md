# Local Research Setup

Classroom Research and Social Research are operator-only AgentOS features. They
store source packs and, for Classroom Research, browser session state on the
local machine. They are intentionally rejected by the routes unless the caller
uses `localhost`, `127.0.0.1`, or `::1`.

Do not use Classroom Research against Skool. Its current
[terms](https://www.skool.com/legal?t=terms) and
[platform policy](https://help.skool.com/article/179-platform-policy) prohibit
scraping/automation requests. A community owner's content grant does not waive
those platform rules. Use a platform-approved export or a copy supplied by the
owner outside Skool; the source-pack preparation and tenant import steps below
can process that supplied material without collecting from Skool.

## Requirements

- Run the operator dashboard on loopback: `npm run dev:workspace` or
  `npm run start:workspace`.
- Install the Playwright browser once for Classroom Research:
  `npx playwright install chromium`.
- Use a local Ollama model for evidence-only questions. A run can still be
  collected without Ollama; only the answer step needs it.

## Classroom Research

1. Open **Classroom Research** in the local dashboard.
2. Enter the specific public HTTPS classroom origin and an appropriately narrow
   scope path.
3. Choose **Open sign-in browser**, complete any sign-in yourself, then choose
   **Save local session**.
4. Collect a bounded batch, inspect the source links, and use **Continue
   collection** while discovered pages remain. Skipped pages and interrupted
   challenge pages require review; an empty discovered queue does not prove
   that every page in the community was visible or discovered.

AgentOS stores only Playwright storage state under
`~/.agentic-os/classroom-research/sessions`, with owner-only file permissions.
It never receives a password. Challenge pages, private-network targets,
non-HTTPS URLs, and pages outside the approved same-origin scope are rejected.

## Social Research

- **Bluesky:** works with public AT Protocol search or a profile feed. No login
  is required.
- **Threads:** set `AGENTIC_OS_THREADS_ACCESS_TOKEN` in the local server
  environment after completing Meta's official OAuth flow. The browser never
  receives the token.
- **snscrape:** optional and user-installed. AgentOS invokes only fixed,
  bounded modes or accepts a user-provided JSONL export. It does not bundle
  snscrape or add login automation, proxy rotation, CAPTCHA solving, or bot
  detection bypasses.

Source packs are saved under `~/.agentic-os/classroom-research/runs` and each
answer line must cite a collected source ID. These capabilities are not part of
the hosted client runtime or public SaaS offering.

The run JSON retains visible anchors and video/audio/embed URLs as link
references; it does not download media or transcribe recordings. To prepare a
reviewed run for the tenant source-graph importer, run
`node scripts/prepare-classroom-source-pack.mjs <run.json> <output.json>`.
This creates mode-600 batches of at most 100 source items and 1 MB each, plus
a manifest with hashes, link and media-reference counts, skipped-page count,
pending-page count, and discovered-queue status. Review the files and any
skipped/pending pages before using the
permission-confirmed tenant import control. The converter does not upload or
import anything by itself. The tenant API validates each batch again and may
reject content containing secrets or unsafe URLs.
