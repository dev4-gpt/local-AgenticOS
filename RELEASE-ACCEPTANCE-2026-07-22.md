# Veloce AgenticOS Release Acceptance

Verified: 2026-07-22
Release scope: private local operating system at `http://127.0.0.1:3737`

## Decision

Veloce AgenticOS is accepted for local, managed use on this Mac. The production build passes, the persistent LaunchAgent serves the app on port `3737`, all sidebar routes render, the immersive shell works on desktop and mobile, and representative model, memory, orchestration, and creation workflows return real results.

This acceptance does **not** authorize exposing the full private OS to the public internet. The public marketing experience must remain a separate artifact with no shell, filesystem, vault, credential, or agent-execution access.

## Verified Evidence

| Gate | Result |
| --- | --- |
| Production build | Passed; 49 pages generated, TypeScript clean. |
| Local and public browser suite | 54/54 Playwright tests passed. |
| Visual shell | Desktop and mobile scenes are nonblank, framed, and free of horizontal overflow. |
| Live health verifier | Passed; validates internal status values, not only HTTP responses. |
| Flow Lab safety | Passed; permission declaration and original-design constraints enforced. |
| Public/private security boundary | Passed across 16 public-site files. |
| Patch integrity | Passed with Git LFS filters disabled for the read-only diff check. |
| Persistent runtime | LaunchAgent `com.aryamandev.agentos.dashboard` listening on `127.0.0.1:3737`. |

The Turbopack build still emits one non-blocking broad-file-trace warning from the Codex route. It does not fail compilation or runtime, but should be narrowed in a future maintenance pass.

## Real Response Checks

| Capability | Status | Acceptance evidence |
| --- | --- | --- |
| Claude | Working | Chat route returned `VELOCE_OK`. |
| Codex | Working | Chat route returned `VELOCE_OK`; stdin handling fixed for current CLI. |
| Kimi | Working | Chat route returned `VELOCE_OK`. |
| Free Claude Code | Working locally | Ollama-backed route returned `VELOCE_OK` with `qwen3.5:4b`. |
| OpenClaw | Working locally | Gateway uses local `ollama/qwen3.5:4b`; chat returned `VELOCE_OK`. |
| Hermes | Working with fallback | Selected Codex credential refresh is unavailable; bounded fallback used Kimi and returned `VELOCE_OK`. UI shows amber `Fallback`, not false green. |
| Fusion | Working | OpenRouter Fusion streamed `VELOCE_OK`; output is capped at 1,600 tokens to prevent a 65k reservation. |
| Agent Kanban | Working locally | Planner returned three cards; builder produced and verified a 2.6 KB standalone HTML artifact. Temporary artifact deleted. |
| Pipeline | Working locally | Obsidian-backed capture/delete smoke test passed. |
| OpenMontage | Working locally | Two-shot procedural pipeline completed and produced an MP4 with ffmpeg. |
| Paperclip | Working locally | Company and acceptance project exist; overview and builds APIs report configured. |
| NotebookLM | Working locally | Authenticated health check sees one notebook. |
| ElevenLabs | Working when used | Voice-list API returned available voices; usage remains plan-limited. |
| Open Design | Working locally | Local service healthy at `127.0.0.1:7456`. |

## Product Surface Matrix

| Status | Tabs and capabilities |
| --- | --- |
| Working | Mission Control, Claude, Codex, Kimi, Fusion, Hermes fallback, Memory, Goals, Journal, Guide, Flow Lab, Capabilities, Web Studio, Open Design, Paperclip, Pipeline, Notebook, Integrations, Video workspace, SEO, SEO Guide, Kanban, Agent Kanban, Room, Studio. |
| Working locally | OpenClaw, Free Claude Code, Local, OpenMontage, Graphify, Ruflo surfaces, Games workspace, Loop workspace, Radar workspace, Music workspace, HyperFrames, Crawl4AI, Browser Use, Claude Ads. |
| Waiting for key/account | Sakana, HeyGen generation, OpenAI image/thumbnails, Hunter, Apollo, Firecrawl, Plausible, Supabase, Cal.com, Listmonk, Ghost, Stirling PDF, Penpot. |
| Skipped by decision | Grok and GLM generation. Their pages render, but they are not release dependencies and were not charged/tested. |

Browser rendering is proven for every sidebar route. “Working” above means a representative end-to-end action or a verified local service was also tested. It does not mean every optional paid action was invoked.

## Memory And Knowledge

- Vault: configured locally through `~/.agentic-os/config.json`
- Notes detected: 37
- Graphify: `graphify 0.9.13`
- Graph: 16 nodes and 10 edges
- Obsidian export: ready
- Flow Lab briefs save into the same governed knowledge system.

## Reusable Experience System

The OS now includes an owned-asset scroll-sequencing capability:

- Project skill: `skills/veloce-asset-sequencing/SKILL.md`
- Reusable component: `skills/veloce-asset-sequencing/assets/ScrollFrameSequence.tsx`
- Global Codex skill: `~/.codex/skills/veloce-asset-sequencing`
- Global Claude skill: `~/.claude/skills/veloce-asset-sequencing`

It supports preloaded image sequences, scroll-to-frame mapping, canvas rendering, responsive containment, loading fallback, and reduced-motion behavior. Flow Lab creates the production contract; Web Studio turns the approved contract and owned frames into an implementation.

## Release Commands

```bash
npm run build
npx playwright test tests/sidebar-smoke.spec.ts tests/visual-shell.spec.ts --reporter=line
npx playwright test tests/public-edition.spec.ts --reporter=line
npm run verify:health
npm run verify:flow-lab
npm run verify:security
npm run verify:secrets
```

## Remaining Before A Public Launch

1. Deploy only the separate public marketing site, never this private execution runtime.
2. Connect a real discovery form/CRM and publish privacy, terms, and consent language.
3. Run the isolated PentAGI/HexStrike manual review against the staging URL with written authorization.
4. Add monitoring, CSP/security headers, rate limits, cost alerts, and a domain on staging.
5. Record a launch walkthrough using the approved script at `launch-system/VELOCE-AGENTICOS-HEYGEN-EXPLAINER.md`.
