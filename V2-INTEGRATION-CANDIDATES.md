# Veloce AgenticOS Candidate Integrations

Last reviewed: 2026-07-20

## Decision Summary

These are five distinct candidates. Perplexica now redirects to Vane, so it is
not a separate sixth tool. Veloce AgenticOS should integrate only clear product
capabilities, not embed or duplicate every open-source interface.

Current Mac baseline: Apple M3 Pro, 18 GB RAM, roughly 31 GiB free disk, and one
local Ollama model (`qwen3.5:4b`, 3.4 GB). This is not enough headroom to install
multiple model-heavy services safely.

| Tool | Decision | Veloce role | Why |
| --- | --- | --- | --- |
| Open WebUI | Reuse existing VPS service; do not install locally | Optional private model workspace | It is already part of the VPS stack. Link and status-check it from Veloce rather than create a second identity and database. |
| Vane | Evaluate later on the VPS | Private cited research workspace | Strong fit for research, but it introduces Docker, SearxNG, persisted uploads/history, and a model-provider configuration surface. |
| Cline | Integrate as an optional local coding backend | Editor/terminal coding lane | Cline is already installed. It can use Ollama or existing cloud providers, but overlaps with Claude Code, Codex, and Kimi. |
| OpenHands | Do not add in v2 | None yet | It is a second full agent-control plane, overlaps with existing coding agents and Paperclip/Ruflo, and can access the filesystem or Docker project mounts. |
| Chatterbox | Prototype only after a storage gate | Local, consent-based TTS fallback | Useful as a privacy-preserving ElevenLabs alternative; it supports Apple MPS, but model files and runtime dependencies need dedicated capacity. |

## 1. Open WebUI: Reuse, Do Not Embed

Open WebUI is a self-hosted conversational interface that can connect to Ollama
and OpenAI-compatible endpoints. It is useful as a separate private workspace,
not as a replacement for the Veloce dashboard. Its current licensing includes
branding-preservation obligations, so Veloce must not white-label or present it
as its own product.

**Integration shape:** one authenticated external link plus a health/status
adapter. Do not iframe it into Veloce, share its database, or expose it through
the public Veloce site.

**Gate:** confirm the existing VPS instance is patched, authenticated, backed up,
and reachable only through the intended private access boundary.

## 2. Vane: Best Future Research Addition

Vane is the continuation of Perplexica and provides cited answer generation,
SearxNG-backed web search, file upload, history, and local/Ollama or cloud model
routing. It has an MIT license and recommends Docker with its bundled SearxNG.

**Integration shape:** run it as a separate, private Docker service on the VPS;
connect it to Veloce through a narrow research adapter that returns a query,
answer, citations, and timestamp. Never expose its setup screen or provider keys
to a public route.

**Gate:** defer until there is at least 50 GiB free disk where it will run, a
private hostname/authentication decision, a retention policy for search history
and uploads, and a SearxNG rate-limit/terms review.

## 3. Cline: Existing Optional Coding Lane

Cline is installed on this Mac. Its CLI, IDE tools, and SDK can operate with
Ollama, OpenRouter, and other model providers; it supports explicit Plan/Act
approval. That makes it a valid alternate coding lane, but not a new operating
system.

**Integration shape:** detect the installed CLI, show its status and project
link, and launch it only inside an explicitly chosen workspace. Keep Codex and
Claude Code as the main coding paths until a specific Cline workflow proves
better.

**Gate:** no global auto-approve, no shared personal provider credentials, and no
unbounded background task execution.

## 4. OpenHands: Explicit v2 Deferral

OpenHands is a self-hosted developer control center for coding agents and
automations. Its own documentation warns that its direct local mode has full
filesystem access; its Docker mode requires explicit project-directory mounts.

That is powerful, but it duplicates the Veloce private dashboard, existing coding
agents, Paperclip, and Ruflo. Adding it now would add a second automation plane
and another credential/data boundary without solving a demonstrated gap.

**Revisit only when:** a team needs isolated worktrees, scheduled engineering
automations, and a dedicated sandbox host. Use a separate machine or VPS, never
the public Veloce service site.

## 5. Chatterbox: Local Voice Fallback, Not a Default Runtime

Chatterbox is an MIT-licensed open-source TTS family. It supports CPU, CUDA, and
Apple MPS, and supports voice conditioning only where the speaker has provided
clear consent.

**Integration shape:** a local-only voice adapter that accepts text and returns
audio; the Veloce UI labels it as experimental and requires a human review before
use in a client deliverable.

**Gate:** reserve at least 50 GiB free disk before downloading models and Python
dependencies. Start with a short English TTS proof, benchmark quality/latency on
the M3 Pro, then decide whether it earns a permanent place beside ElevenLabs.

## Recommended Order

1. Add a read-only Cline status/launch card because the CLI is already installed.
2. Reuse the existing private Open WebUI VPS instance through a link and health
   status, not another installation.
3. Evaluate Vane on the VPS only after storage, authentication, and data-retention
   gates are approved.
4. Prototype Chatterbox only after reclaiming disk space.
5. Keep OpenHands deferred until there is a real sandboxed engineering-team need.

## Sources

- [Open WebUI repository](https://github.com/open-webui/open-webui)
- [Vane repository](https://github.com/ItzCrazyKns/Vane)
- [Cline repository](https://github.com/cline/cline)
- [OpenHands repository](https://github.com/OpenHands/OpenHands)
- [Chatterbox repository](https://github.com/resemble-ai/chatterbox)
