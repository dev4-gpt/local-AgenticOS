# Hosted Capability Adapter Roadmap

Updated 2026-08-01.

The current reference portfolio and the next native capability sequence are
preserved in [`V96-NATIVE-CAPABILITY-PLANE-BRIEF.md`](./future-integrations/V96-NATIVE-CAPABILITY-PLANE-BRIEF.md).
The reference-register integrity layer is implemented. Headroom-inspired
compression is the current measured routing pilot and runs as a native,
dependency-free trait in the shared provider adapter; the upstream runtime is
not installed. The adjacent Wave 5B standing-instruction measurement records
redacted line/character cost at that same boundary without editing mandatory
guardrails.

This is the implementation order for turning the private `3939` operator
edition into a safe client edition. A provider key alone does not make a tab
cloud-safe. Each capability needs a server contract, tenant-scoped data,
secret references, budgets, approvals, and tests before it is enabled.

For repeatable per-client scoping, credential handling, and evidence capture,
use `skills/veloce-client-capability-onboarding/SKILL.md` and its client
capability matrix template before activating any provider.

## Release rule

The Cloud Run client image may expose the shared Veloce shell, but a capability
must remain gated until its row below has a passing evidence bundle. The
operator edition at `127.0.0.1:3939` is the presentation reference and remains
private.

## Capability work queue

| Group | Surfaces | Replacement | Gate evidence |
|---|---|---|---|
| Text agents | Claude, Codex, OpenClaw, Hermes, Kimi, GLM, Grok | Tenant-safe queued API workspace routes these surfaces away from local CLI; Anthropic, OpenRouter, and Gemini/Antigravity are configured in the owner-cloud test manifest, while Codex/OpenAI and the remaining providers stay gated until their keys, billing, model allowlists, and smoke evidence exist | Authenticated request, correct client key, capped spend, redacted logs, retry/idempotency test |
| Local execution | Local, Local Engine, Free Claude Code | Client edition routes Local/Engine to the queued API model workspace and Free Claude Code to its OpenRouter adapter; all three passed the scoped Gate 12 `openrouter/free` smoke, while the 3939 local model/CLI remains operator-only | No shell or localhost dependency in the client image; scoped provider key, reviewed model, budget, and isolation smoke passed; the owner-cloud runtime now has OpenRouter/Gemini provider calls enabled under a $1 test cap |
| Orchestration | Paperclip, Pipeline, Agent Kanban, Loop, Ruflo | Tenant workflow board now persists scoped work items and step state in Supabase; provider-backed agent execution remains a separate opt-in adapter | Create, update, archive, delete, ownership/audit, tenant A/B test, then queue-backed provider execution where enabled |
| Memory and context | Memory, Notebook, Journal, Goals, Context intake | Tenant-scoped Supabase records adapter is implemented for text records; Cloud Storage attachments and retention policy remain | Apply hosted-capabilities migration, then prove RLS, signed download, export, delete, retention, and private-cache behavior |
| Creative workspaces | Open Design, Web Studio, Flow Lab, Video, Music, Agent Studio, OpenMontage, Game Studio, Thumbnails | Tenant brief/request workspaces are available for design surfaces; ElevenLabs speech, Suno music polling, HeyGen polling, and the tenant artifact pipeline are implemented; image/video/workspace parity remains | Provider allowlist, output object ownership, signed access, budget, approval |
| Speech input | Shared microphone buttons across chat, Notebook, Goals, Local, Video, and agent surfaces | Recorded audio posts to the server-only Groq `whisper-large-v3-turbo` adapter; browser Web Speech remains only for continuous wake-word/realtime loops | `GROQ_API_KEY`, 25 MB bound, authenticated client route, rate/budget policy, no browser key exposure |
| Research and SEO | SEO, integrations, build guide | Firecrawl read-only scrape adapter with tenant allowlist; publishing and source/licensing work remain | Secret reference, outbound-domain allowlist, attribution/legal review, rate limit |
| Additive research providers | Research, Knowledge | Server-selected Brave search adapter beside Firecrawl; Crawl4AI, Crawlee, and Jina Reader are pinned external references only | Selected-provider secret, max-three HTTPS results, no scraping for Brave, citation/budget/idempotency evidence; each crawler needs its own isolated worker or hosted-boundary bundle |
| Delivery | Delivery actions and external publishing | Approval-only, idempotent tenant delivery action record plus tenant-token worker and allowlisted HTTPS webhook adapter | Preview, approve, execute once, audit, rollback/undo where possible; live worker evidence is still required |
| Visual QA | Quality, Media, artifact review | Authenticated artifact-bound queue route, bounded frame adapter, worker-only report/findings RPC, and a distinct `visual-qa` Cloud Run Job dispatcher; enabled only for the `dofgfood` owner-cloud test | Auth, artifact ownership, frame bounds, idempotency, report persistence, tenant isolation, deletion lineage, budget/audit evidence |
| Routing compression | Text agents, Research, Notebook, Workflow, Room | Native `context-compression` trait at the shared provider adapter; compressed payload counts are used before budget estimation and evidence is hash/count-only; enabled locally and deployed on owner-cloud revision `00155-mhd` | Deterministic preservation of requests, code, URLs, citations, policy text, quality parity, budget trace, fallback, local smoke passed; fresh authenticated smoke for the current image pending |

## Adapter contract

Every hosted adapter must implement these boundaries:

1. Accept an authenticated tenant member and a validated request.
2. Resolve provider and model from the approved client manifest, never from a
   browser-supplied unrestricted value.
3. Read only a Secret Manager reference for the current client.
4. Reserve and record budget before an expensive provider call.
5. Put work longer than a short request onto a private queue.
6. Store prompts, inputs, and outputs according to the client's retention and
   data-sharing policy; redact secrets from logs.
7. Require human approval for publishing, outreach, spending, deletion, or
   other external side effects.
8. Return a job or artifact identifier, not provider credentials or internal
   storage paths.

## Low-cost sequence

1. Complete the `veloce-cloud-test` tenant and membership migration.
2. Prove context intake, memory, and artifact metadata with Supabase RLS.
3. Add one text provider adapter with a dry-run model and budget ledger.
4. Add Cloud Storage objects and signed downloads for that adapter.
5. Add one queue-backed worker only when the first long-running capability
   needs it. Keep Cloud Run `min-instances=0` and cap test instances at one.
6. Repeat the same evidence bundle for creative, research, orchestration, and
   delivery groups.
7. Create a second tenant from the same image and rerun cross-tenant tests.

Do not deploy Redis, an always-on worker, media providers, or a second database
just to make the architecture look complete. Add each cost center when a
client capability needs it.

Visual QA follows the same rule: the current dependency-free worker is the
lowest-cost proof. Roboflow Supervision, GPU media, security execution,
communications sending, and worktree execution require separate isolated
workers and evidence bundles before promotion.

Headroom follows the same rule in reverse: only the behavior needed by Veloce
is implemented natively. The Headroom repository remains a pinned provenance
reference, while external proxy/MCP/model runtimes remain outside the Next.js
image.

## Evidence bundle

For each enabled capability, keep:

- manifest diff and image digest;
- provider and model allowlist;
- secret reference and IAM review;
- functional, auth, tenant-isolation, budget, rate-limit, and approval tests;
- redacted logs and failure/retry behavior;
- export, deletion, and recovery result;
- rollback decision.

The canonical status matrix is
[`docs/client-runtime-13-layer-readiness.md`](./client-runtime-13-layer-readiness.md).

## Intent routing boundary

Natural-language intake uses the existing queue and worker boundary with
`capability=intent-routing`; it does not create a second control-plane table.
The route validates tenant membership, surface, manifest, provider/model
allowlist, and secret safety before enqueueing. The worker resolves the
Veloce-owned playbook registry, optionally classifies through the approved
provider with no tools, and stores only a redacted plan snapshot. The same
image and `CLIENT_INTENT_ROUTING_ENABLED` manifest switch are used locally and
on owner-cloud. Disabling the switch removes automatic routing without
deleting catalog data or changing specialized capability routes.
