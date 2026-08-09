# V90 infrastructure additions — STAR plan

Date: 2026-08-10
Branch: `codex/reviewed-additions-2026-08-10`

This is the handoff plan for the parallel v90 implementation session. It is
structured as Situation → Task → Action → Result so every candidate has a
clear reason to exist, a bounded implementation, and a measurable exit gate.

This document is the single source of truth for all reviewed additions. It
replaces the former standalone reviewed-additions note.

## Implementation checkpoint (2026-08-10)

The first contract slice is now present on this branch: `src/lib/v90Contracts.ts`
defines the research-record, visual-QA, future-video-provider, and resumable
worktree envelopes; `src/lib/v90SkillPack.ts` contains seven curated Agency
Agents role manifests pinned to upstream revision `ebe9c99`; and
`tests/v90-contracts.spec.ts` locks the URL, tenant, citation, budget, and
tool-boundary invariants. The role pack is visible as a read-only catalog in
Integrations. No ScrapeGraphAI, Supervision, SkyReels, Prime Agent, or other
heavy runtime has been installed or exposed to the client cloud.

## Situation

Veloce AgenticOS already has the product surfaces that these repositories could
strengthen: agent routing and skills, Agent Room, Agent Kanban, Flow Lab, Radar,
SEO, Leads, Video, OpenMontage, Memory, and governed tenant-cloud adapters.

The risk is infrastructure sprawl. Several candidates are complete runtimes or
GPU-heavy research projects. The v90 objective is therefore not to embed every
repository. It is to turn the useful parts into versioned, reviewable contracts
that can later be implemented by local workers or approved cloud adapters.

## Reviewed candidate portfolio

| Candidate | Product fit | Decision |
| --- | --- | --- |
| SonarQube CLI | Quality Review, coding lanes, secret leakage prevention | Recommended optional operator preflight; detect only, no auto-fix. |
| Agent Orchestrator | Agent Kanban and isolated parallel coding | Recommended operator pilot for worktree status and launch awareness. |
| Shepherd | Reversible traces and review-before-apply execution | Review next; borrow the retained-output model before adopting its alpha runtime. |
| QM | Multiplayer scopes, memory, permissions, and background work | Deferred; overlaps the hosted runtime and Paperclip. |
| Hugging Face Speech-to-Speech | Jarvis, Studio, and local/private voice | Review next after storage, latency, and consent testing. |
| Explee / AutoGTM | Leads and Outreach enrichment | Provider candidate only; human approval, cost, and opt-out controls required. |
| Infobip | SMS, WhatsApp, voice, and omnichannel delivery | Catalog now; adapter only after compliance and consent review. |
| Agency Agents | Reusable specialist roles across existing agents | Recommended curated skill-pack import; no new execution rights. |
| Roboflow Supervision | Visual QA for media and artifact review | Review as a bounded Python worker. |
| SkyReels V2 | Future long-form and image-to-video generation | Deferred to a separate GPU worker; do not install locally. |
| ScrapeGraphAI | Structured extraction for research, SEO, Radar, and Memory | Recommended allowlisted research adapter beside Firecrawl. |
| Prime Agent | Long-running resumable coding and research | Review as an operator-only disposable-worktree lane. |

## Existing reviewed candidates — implementation actions

These candidates were reviewed before the v90 additions and remain part of the
same plan. They are intentionally represented as bounded adapters rather than
new top-level consoles.

### SonarQube CLI

Use as a read-only operator preflight for secrets and code-quality findings on
selected local changes. Connect the result to Quality Review and release
evidence. Exit gate: a scan can identify introduced findings without sending
source anywhere unless the operator explicitly configured that destination.

### Agent Orchestrator

Use isolated Git worktrees, task/branch status, CI state, and review follow-up
as a future Agent Kanban adapter. Exit gate: one small repository pilot can
spawn, observe, review, and clean up a worker without bypassing existing branch
controls.

### Shepherd

Use retained outputs, inspectable traces, and select/apply/discard semantics as
the design reference for future build previews. Exit gate: a candidate output
can be reviewed and discarded without touching the protected workspace.

### QM

Use its scoped-memory, permissions, and shared-workspace ideas as architecture
references only. Do not deploy it alongside the hosted runtime until a real
multi-user collaboration gap is demonstrated. Exit gate: any borrowed pattern
must preserve tenant isolation, approval gates, and auditable background work.

### Hugging Face Speech-to-Speech

Prototype a local/private voice fallback for Jarvis and Studio after a storage
and latency gate. Require consented voices and human review for deliverables.
Exit gate: measured turn latency and quality are good enough for a named local
workflow without making it the production voice default.

### Explee / AutoGTM

Evaluate only as a Leads/Outreach enrichment provider. Keep research and draft
generation separate from sending, and require human approval for audience,
spend, copy, recipients, and destination. Exit gate: a test campaign proves
incremental lead quality at an acceptable cost with opt-out handling.

### Infobip

Catalog as a possible approved SMS/WhatsApp/voice delivery adapter. Do not
enable sending until regional compliance, consent, rate limits, pricing,
recipient records, and approval evidence are implemented. Exit gate: one
consented test route can be replayed idempotently and audited end to end.

## Task

Create a v90 infrastructure layer that:

1. makes specialist roles reusable across existing agents;
2. adds machine-checkable visual QA to generated media;
3. leaves a clean interface for future GPU video generation;
4. produces citation-bearing structured research records; and
5. makes long-running agent work resumable without weakening the approval and
   tenant-isolation model.

## Action

### 1. Agency Agents — curated specialist skill packs

Use the repository as a source library, not as a second agent runtime. Select a
small initial pack: architecture, code review, accessibility, research,
technical writing, video, and minimal-change roles. Normalize each role into a
Veloce skill manifest with:

- role id, source commit, license/provenance, and supported surfaces;
- allowed context and tools;
- preferred model lane and budget class;
- expected deliverable schema;
- human approval requirements.

First implementation: a local/operator skill-pack importer or checked-in
curated manifests. Client cloud receives only Veloce-authored reviewed skill
contracts, never arbitrary third-party prompt files.

Exit gate: a selected role improves a fixed benchmark task without increasing
tool permissions or changing the cloud manifest unexpectedly.

### 2. Roboflow Supervision — visual QA worker

Use Supervision as a Python-side worker library for detections, tracking, zones,
and annotations. Keep it outside the Next.js process and behind the existing
artifact/job boundary.

First proof:

1. accept one tenant-owned generated video or frame sequence;
2. run a bounded detector/track/zone check;
3. return a structured report with frames, confidence, timing, and warnings;
4. store the report beside the artifact for human review.

Exit gate: the report catches a known visual defect on a fixed fixture set, has
bounded runtime/memory, and never accepts arbitrary URLs or camera inputs.

### 3. SkyReels V2 — future GPU video backend

Do not install model weights on the current Mac. The repository's inference
stack includes PyTorch, Diffusers, `flash_attn`, `xfuser`, and CUDA-oriented
examples, while the product currently runs primarily on an Apple Silicon
operator machine.

First implementation: define a provider-neutral `video-generation` worker
contract with prompt, seed, source frames, duration, resolution, budget, and
artifact output. Treat SkyReels as one future worker behind that contract.

Pilot only on a separate GPU host using the smallest viable model. Record model
license/weight terms, VRAM, wall time, cost per finished second, continuity
quality, and failure rate before enabling it for production.

Exit gate: it beats the current video path on a named use case, with a proven
artifact retention and rollback path.

### 4. ScrapeGraphAI — structured research adapter

Use it beside Firecrawl and AgentReach, not as an unrestricted replacement.
Create an adapter that accepts an allowlisted public URL set and returns:

- extracted fields;
- source URL and retrieval time;
- page-level evidence/citations;
- extraction confidence and failure reason;
- a tenant-scoped research record.

Enforce SSRF protection, robots/terms review, page and depth budgets, rate
limits, no cookie forwarding, no private-network access, and no publishing.

Exit gate: it improves extraction quality or cost on a fixed research fixture
set without weakening citation coverage or source-policy enforcement.

### 5. Prime Agent — resumable operator worktree lane

Prime Agent's durable harness, recursive subagents, background sessions,
persistent goals, and bounded autonomous mode are valuable patterns for long
tasks. Its own documentation warns that it executes model-generated Python and
project commands with user permissions and is not a security sandbox.

First implementation: pilot it only in a disposable clone or clean worktree,
with an explicit goal, time/token budget, quality gate, and review-before-apply
step. Surface status and retained outputs through the existing Agent Kanban or
orchestration record rather than adding a new client runtime.

Exit gate: a long task can detach, resume, produce auditable outputs, and be
discarded without mutating the protected workspace or bypassing approval.

## Result

The v90 outcome should be composable infrastructure contracts, not twelve new
consoles:

| Contract | Product surface | v90 status |
| --- | --- | --- |
| Curated role/skill manifest | Capabilities, Agent Room, provider routing | Add catalog + first curated pack |
| Visual QA report | Video, OpenMontage, artifact review | Add worker contract + fixture test |
| GPU video provider | Video, media queue, artifact storage | Define contract; defer worker |
| Structured research record | Flow Lab, SEO, Radar, Memory | Add allowlisted adapter contract |
| Resumable worktree execution | Agent Kanban, Loop, local orchestration | Pilot operator-only |
| Quality preflight | Quality Review, release evidence | Operator-only detection and read-only scan |
| Isolated parallel workers | Agent Kanban, pipeline | Pilot after repository/worktree gate |
| Reversible execution trace | Build preview and approval | Design pattern first; runtime deferred |
| Scoped multiplayer workspace | Hosted collaboration | Deferred until a demonstrated gap |
| Local voice fallback | Jarvis, Studio | Prototype after storage/latency gate |
| Approved communications adapter | Leads, Outreach, Phone | Catalog; compliance gate required |

The cloud edition may expose the reviewed capability contracts and result
schemas. It must not run local CLIs, access operator worktrees, receive private
cookies, or execute GPU/agent workers until each has a tenant-scoped adapter,
secret policy, budget, queue, audit record, and emergency disable path.

## Merge order for the parallel session

1. Keep this document and the reviewed-additions registry as the stable integration point.
2. Add typed result schemas and fixture tests before adding heavy dependencies.
3. Implement the curated Agency skill pack and research adapter first.
4. Add the visual-QA worker behind a feature flag.
5. Pilot Prime Agent in a disposable worktree.
6. Leave SkyReels as a provider contract until a GPU host and license review are
   approved.
7. Run the normal build, security, client-isolation, and surface-map gates.

## Sources

- [SonarQube CLI](https://github.com/SonarSource/sonarqube-cli)
- [SonarQube CLI quickstart](https://docs.sonarsource.com/sonarqube-cli/quickstart-guide)
- [Agent Orchestrator](https://aoagents.dev/)
- [Agent Orchestrator quickstart](https://aoagents.dev/docs/quickstart/)
- [Shepherd](https://github.com/shepherd-agents/shepherd)
- [QM](https://github.com/yc-software/qm)
- [Hugging Face Speech-to-Speech](https://github.com/huggingface/speech-to-speech)
- [Explee pricing](https://explee.com/pricing)
- [Infobip pricing](https://www.infobip.com/pricing)
- [Agency Agents](https://github.com/msitarzewski/agency-agents)
- [Roboflow Supervision](https://github.com/roboflow/supervision)
- [SkyReels V2](https://github.com/skyworkai/skyreels-v2)
- [ScrapeGraphAI](https://github.com/ScrapeGraphAI/Scrapegraph-ai)
- [Prime Agent](https://github.com/PrimeIntellect-ai/prime-agent)
