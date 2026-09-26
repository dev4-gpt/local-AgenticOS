# Local Research Setup

Classroom Research and Social Research are operator-only AgentOS features. They
store source packs and, for Classroom Research, browser session state on the
local machine. They are intentionally rejected by the routes unless the caller
uses `localhost`, `127.0.0.1`, or `::1`.

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
4. Collect a bounded source pack and inspect the cited source links before
   relying on any answer.

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
