# Local AgenticOS

Local AgenticOS is a private AI mission-control dashboard for running business, content, research, engineering, and media workflows from one local command center.

It brings together local agents, paid-provider agents, Obsidian memory, voice workflows, model fallback, creative studios, and operational dashboards without forcing every task into a separate SaaS tab.

![runs local](https://img.shields.io/badge/runs-localhost-22d3ee?style=flat-square)
![private memory](https://img.shields.io/badge/memory-obsidian_local-a855f7?style=flat-square)
![agent hub](https://img.shields.io/badge/agent_hub-claude_codex_hermes_openclaw-34d399?style=flat-square)

## What This Is

AgenticOS is a local-first operating layer for AI work:

- A dashboard for Claude Code, Codex, Hermes, OpenClaw, Kimi, Antigravity, and local Ollama-backed agents.
- A persistent memory layer that writes goals, journal entries, and notes into an Obsidian vault.
- A provider-aware studio system for voice, video, thumbnails, music, outreach, research, and agent loops.
- A model-routing setup that lets you use local models first and paid providers only when they are worth it.
- A business workflow hub for founders, operators, agencies, consultants, creators, and technical teams.

The goal is simple: make AI feel like an operating system for the company, not a collection of disconnected chats.

## Business Value

AgenticOS can help a business:

- Capture strategic decisions, daily goals, journals, and AI outputs as durable company memory.
- Draft LinkedIn, Medium, Substack, blog, newsletter, and sales content from real company context.
- Build local prototypes and product ideas through Claude Code, Codex, Antigravity, Hermes, and Ollama.
- Run research, lead-generation, and outbound workflows when Hunter, Apollo, Firecrawl, or similar keys are configured.
- Create voiceovers and narration through ElevenLabs when connected.
- Keep optional expensive services gated so API spend is intentional rather than accidental.
- Give teams a repeatable interface for prompts, projects, media, goals, and agent execution.

See [BUSINESS-USE-CASES.md](./BUSINESS-USE-CASES.md) for a deeper breakdown.

## Current Local Stack

This repo is configured for a Mac-local AgentOS setup:

- Dashboard: `http://127.0.0.1:3737`
- Obsidian vault: `/Users/aryamandev/Documents/llm-wiki`
- Free Claude Code proxy: `http://127.0.0.1:8082`
- Free/local model: `ollama/qwen3.5:4b`
- Paperclip local service: `http://127.0.0.1:3100`

Your exact local config should live outside the repo in:

```bash
~/.agentic-os/config.json
~/.hermes/profiles/<active>/.env
~/.fcc/.env
~/.agentic-os/*.env
```

## Features

### Core Dashboard

- Immersive 3D home dashboard
- Agent health/status checks
- Sidebar navigation for all local modules
- Memory, Goals, Journal, Guide, and workspace pages
- Desktop and mobile responsive layouts

### Local Memory

- Obsidian-backed memory at a user-controlled vault path
- Daily journal files
- Goal/task persistence
- Memory notes and smoke-testable vault writes
- Private markdown files instead of opaque hosted chat history

### Agent Workflows

- Claude Code panel
- Codex panel
- Hermes control surfaces
- OpenClaw workspace
- Free Claude Code through Ollama
- Agent Kanban and local build pipeline
- Optional Kimi, Antigravity, Grok, GLM, NotebookLM, and other providers depending on local login/key status

### Studios And Business Modules

- Fusion and Loop for model-council / iterative workflows
- OpenMontage and video scripting workspaces
- ElevenLabs voice support
- Thumbnail, music, lead, radar, and outreach modules behind explicit provider gates
- Paperclip integration surface for project/company/workspace workflows

## Provider Philosophy

AgenticOS is not designed to burn credits by default.

Recommended order:

1. Use local Ollama-backed workflows for drafts, scaffolds, and low-risk iteration.
2. Use Claude/Codex/Antigravity subscriptions for serious coding work where you already pay for access.
3. Use OpenRouter as the shared text-model key for Fusion, Loop, and provider-backed rooms.
4. Add special-purpose API keys only when a workflow needs them:
   - ElevenLabs for voice
   - Firecrawl for web/RAG ingestion
   - Hunter or Apollo for sales enrichment
   - HeyGen for avatars
   - Suno for music
   - OpenAI API for image, realtime, or TTS modules

No credentials should ever be committed to this repository.

## Requirements

- macOS or Linux
- Node.js 22+
- npm
- Ollama for local model workflows
- Optional: Claude Code, Codex CLI, Hermes, OpenClaw, Paperclip, NotebookLM MCP, Kimi, Antigravity
- Optional: Obsidian for local knowledge-base memory

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

For the local production-style setup used on this Mac, the dashboard runs at:

```bash
http://127.0.0.1:3737
```

## Configuration

Create a private config file:

```bash
mkdir -p ~/.agentic-os
cp agentic-os.config.example.json ~/.agentic-os/config.json
```

Example:

```json
{
  "vaultRoot": "/Users/you/Documents/ObsidianVault",
  "claude": "/opt/homebrew/bin/claude",
  "codex": "/opt/homebrew/bin/codex",
  "hermes": "/Users/you/.local/bin/hermes",
  "openclaw": "/opt/homebrew/bin/openclaw"
}
```

Environment variables can also be set through `.env.local`, but real keys should usually live in private user-level files rather than inside the project folder.

## Adding ElevenLabs Locally

Use the helper script so the key is written to your active Hermes profile and never committed:

```bash
chmod +x scripts/setup-elevenlabs-local.sh
bash scripts/setup-elevenlabs-local.sh
```

Then restart AgentOS and test:

```bash
curl http://127.0.0.1:3737/api/video/voices
```

## Free Credits And API Keys

Free tiers change, so always check the provider dashboard before running a batch job.

As of July 2026:

- ElevenLabs offers API access on plans including free usage, with requests deducting account credits.
- Firecrawl advertises a free monthly credit/page allowance.
- Hunter has a free plan/API access with limited credits/requests depending on endpoint.
- Apollo API access and credit usage depend on the Apollo plan and endpoint.
- HeyGen API credits are separate from the normal app subscription and may not include free API credits.
- Suno app credits and third-party/API credit systems are separate; verify the API provider before relying on free usage.

The app keeps these modules behind explicit keys so you can decide when to spend.

## Security

Read [SECURITY.md](./SECURITY.md) before pushing or sharing.

Never commit:

- `.env`, `.env.local`, `.env.*`
- API keys or OAuth tokens
- Obsidian vault contents
- `.next`, `node_modules`, build caches, logs, or screenshots containing credentials

Run a secret scan before pushing:

```bash
rg -n --hidden --glob '!node_modules/**' --glob '!.next/**' --glob '!package-lock.json' \
  '(sk-[A-Za-z0-9_-]{20,}|OPENAI_API_KEY=|OPENROUTER_API_KEY=|ELEVENLABS_API_KEY=|HEYGEN_API_KEY=|SUNO_API_KEY=|FIRECRAWL_API_KEY=|HUNTER_API_KEY=|APOLLO_API_KEY=)' .
```

## Verification

```bash
npm run build
curl http://127.0.0.1:3737/api/vitals
curl http://127.0.0.1:3737/api/memory/vault
curl http://127.0.0.1:3737/api/fcc
```

Expected local status:

- Dashboard: working
- Obsidian vault: configured
- Free Claude Code: reachable through local Ollama
- Paperclip: service reachable, workspace content still business-specific
- Paid studios: waiting for explicit provider keys

## Repository

Primary GitHub remote:

```bash
git@github.com:dev4-gpt/local-AgenticOS.git
```

This repository should remain the source of truth for the local AgenticOS app going forward.
