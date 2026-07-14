# AgentOS V1 Status And Gaps

Last updated: 2026-07-12

This file is the post-V1 source of truth for what AgentOS already has, what is working locally, and what is still waiting on an account, key, service URL, or a deliberate product decision.

## V1 Definition

AgentOS V1 is a local-first AI mission-control dashboard running on this Mac at:

```bash
http://127.0.0.1:3737
```

The local memory root is:

```bash
/Users/aryamandev/Documents/llm-wiki
```

Secrets must stay outside the repository in user-level files such as:

```bash
~/.agentic-os/config.json
~/.agentic-os/integrations.json
~/.hermes/profiles/<active>/.env
~/.hermes/auth.json
~/.fcc/.env
```

## Built And Working

| Area | Status | Notes |
| --- | --- | --- |
| Dashboard | Working | Local app runs at `127.0.0.1:3737`. |
| Immersive homepage | Working | 3D mission-control surface is part of the app. |
| Sidebar/workspaces | Working | Agent, studio, memory, and business pages are navigable. |
| Obsidian vault | Working | Configured for `/Users/aryamandev/Documents/llm-wiki`. |
| Memory, Goals, Journal | Working | Local markdown-backed knowledge capture is in place. |
| Graphify | Working | Installed as `graphify 0.9.13`; graph exported to `Agentic OS/Graphify` inside the vault. |
| Claude Code | Working | `claude` is installed and logged in locally. |
| Codex | Working | OpenAI Codex auth exists through Hermes credential pool. |
| Hermes | Working | Hermes status is healthy through OpenAI Codex provider. |
| OpenClaw | Working | Gateway is live with local agent status. |
| Antigravity | Working | CLI detected and healthy. |
| Kimi Code | Working locally when logged in | Credential exists in Hermes auth pool; usage depends on selected Kimi plan/model. |
| Gemini free auth | Working | Google Gemini CLI OAuth credential exists in Hermes auth pool. |
| OpenRouter | Working for app routes that read the Hermes credential pool | Fusion/Loop-style routes can use the shared OpenRouter credential through app helpers. |
| Free Claude Code | Working locally | Local/Ollama-backed coding flow is present. |
| Web Studio | Working | Prompt/workflow library for agency, SaaS, personal, and conversion-driven websites. |
| Open Design | Working locally | Local design system tool is available; it may show its own onboarding if its local state is reset. |
| Integrations hub | Working | Tracks local tools and external business adapters without storing repo secrets. |
| HyperFrames | Working | Local HTML-to-video rendering tool detected. |
| Crawl4AI | Working | Local crawling/extraction tool detected. |
| Browser Use | Working | Local browser automation tool detected. |
| Claude Ads skills | Working | Ads skill pack and isolated runtime detected. |
| ElevenLabs voice | Configured locally | Key is stored outside the repo through helper script. |
| Eleven Music option | Supported | Separate music key script exists; actual use depends on ElevenLabs plan/API eligibility. |

## Live Local Verification Snapshot

The latest local checks showed:

| Check | Result |
| --- | --- |
| `/api/vitals` | Claude, OpenClaw, Hermes, and Antigravity healthy. |
| `/api/memory/graphify` | Installed, configured, ready, exported to Obsidian. |
| `/api/integrations` local tools | HyperFrames, Crawl4AI, Browser Use, Claude Ads, Graphify working. |

Graphify snapshot:

| Metric | Value |
| --- | --- |
| Version | `graphify 0.9.13` |
| Graph path | `~/.agentic-os/graphify/graphify-out/graph.json` |
| Obsidian export | `/Users/aryamandev/Documents/llm-wiki/Agentic OS/Graphify` |
| Nodes | `16` |
| Edges | `10` |

The graph is small because the vault currently has a small amount of markdown content. This should grow naturally as business notes, website prompts, scripts, client briefs, research, and product docs are added.

## Waiting After V1

These are not broken; they are intentionally waiting for real business accounts, URLs, keys, or decisions.

| Item | Status | What is needed |
| --- | --- | --- |
| Paperclip workspace setup | Waiting | Add real company/workspace/project configuration and decide whether local AgentOS should sync with the VPS Paperclip stack. |
| Plausible | Waiting | Create a site or self-host Plausible, then add base URL/domain/API key in Integrations. |
| Supabase | Waiting | Create a project, then add project URL and anon key in Integrations. |
| Cal.com | Waiting | Add a booking URL or self-hosted Cal.com URL. |
| Listmonk | Waiting | Deploy or connect Listmonk, SMTP, and API credentials. |
| Ghost | Waiting | Deploy or subscribe to Ghost and add Admin API integration. |
| Stirling PDF | Waiting | Start the local/VPS service and save its URL. |
| Penpot | Waiting | Deploy or connect a Penpot workspace URL. |
| NotebookLM | Waiting on Google workflow | Requires the user-facing Google login/session flow when needed. |
| HeyGen | Skipped for now | Add only when avatar workflows are worth the API spend. |
| Suno | Skipped for now | Add only when music generation needs Suno specifically. |
| Hunter/Apollo/Firecrawl | Skipped for now | Add only when lead generation and enrichment workflows are being actively used. |
| OpenAI image/API | Skipped for now | Add only when thumbnails/images need OpenAI media models. |
| Grok | Skipped by choice | Do not prioritize unless X/Grok workflows become essential. |
| GLM | Skipped by choice | Do not prioritize unless a GLM-specific coding/model workflow becomes essential. |

## Known Nuances

- Hermes status may still list direct environment keys such as `OPENROUTER_API_KEY` or `ELEVENLABS_API_KEY` as missing even when AgentOS can use credentials from Hermes auth/profile files. Treat that as an optional direct-env warning, not a global app failure.
- OpenRouter is the closest thing to a shared text-model key. It does not replace specialized service keys for voice, avatars, music, leads, analytics, or publishing.
- The external business integrations are adapter slots. They become useful when a real business/project has chosen its stack.
- The local Graphify export is intentionally isolated in one Obsidian folder so it can be rebuilt or deleted safely.

## Recommended V1.1 Priorities

1. Paperclip business setup: define the actual company/project/workspace model and decide what should sync from the Hostinger VPS stack.
2. Launch content system: use Web Studio, Memory, Graphify, and Content/SEO surfaces to draft LinkedIn, Medium, Substack, and product-positioning content.
3. Vault expansion: add company positioning, offers, SOPs, website prompts, client briefs, and example outputs to `llm-wiki`, then rebuild Graphify.
4. Integrations activation: connect only the tools that will be used immediately, starting with Cal.com, Plausible, Ghost/Listmonk, or Supabase depending on the first business workflow.
5. Regression command: add one script that runs build, API health checks, sidebar smoke tests, and a secret scan before every push.
6. V2 local tool planning: keep Handy, OmniVoice, ComfyUI, Wan, and HeyGem documented as optional cost-saving tools, but do not install them until storage and hardware fit the workflow. See [V2-LOCAL-AI-TOOLS-ROADMAP.md](./V2-LOCAL-AI-TOOLS-ROADMAP.md).

## Do Not Add Yet

Avoid adding more provider CLIs or API-driven studios just because they exist. The current V1 already has enough model and workflow surface area. The next leverage comes from real business data, repeatable workflows, and polished output, not from another login.

## Quick Verification Commands

```bash
PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH npm run verify:v1
PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH npm run verify:health
```

Or run the checks individually:

```bash
npm run build
/usr/bin/curl -s http://127.0.0.1:3737/api/vitals
/usr/bin/curl -s http://127.0.0.1:3737/api/memory/vault
/usr/bin/curl -s http://127.0.0.1:3737/api/memory/graphify
/usr/bin/curl -s http://127.0.0.1:3737/api/integrations
npx playwright test tests/sidebar-smoke.spec.ts --reporter=line
```

Before pushing, run the secret scan from `README.md` and confirm no local keys, OAuth tokens, screenshots, vault contents, or generated private data are staged.
