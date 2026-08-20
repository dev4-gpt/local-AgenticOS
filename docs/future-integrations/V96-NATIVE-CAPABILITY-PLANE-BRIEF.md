# V96 Native Capability Plane — Planning Brief

**Captured:** 2026-08-12
**Purpose:** Preserve the in-depth architecture prompt and the reviewed
reference portfolio for future implementation work.

## Core direction

Repository-derived behavior is architectural input, not a user-installed skill,
plugin, button, or permission grant. Veloce should express the behavior as
native capability traits inside existing surfaces and governed job envelopes.
Heavy runtimes stay outside the main Next.js image unless an isolated adapter,
worker, license review, budget, rollback plan, and evidence bundle justify
their use.

Every governed job receives the mandatory baseline traits: tenant isolation,
provenance, budget, idempotency, audit, resumability, approval, and output
quality. Capability-specific traits are resolved automatically by the shared
trait kernel.

## Implementation loop

For each next capability:

1. Confirm the workflow gap and target native surface.
2. Record the clean source URL, pinned revision or dated reference, license,
   extracted behavior, runtime class, permissions, and evidence gate.
3. Implement the smallest Veloce-owned contract or bounded adapter.
4. Keep secrets server-side and enforce tenant, budget, approval, provenance,
   retention, deletion, and idempotency boundaries.
5. Run focused tests, typecheck, lint, production build, and authenticated
   local/cloud smoke tests.
6. Record image/revision, evidence, and rollback state before promotion.

The requested quality loop is:

```text
npm run test:focused
npm run typecheck
npm run lint
npm run build
```

Failures become the next repair instruction. The loop stops only when all
checkers are green.

## Reference portfolio

All URLs below are stored in
[`v96-capability-reference-register.md`](./v96-capability-reference-register.md)
and in `src/lib/v96RepositoryCatalog.ts`. Query-string MCP tokens and private
credentials were intentionally removed.

| Reference | Native placement | Current state |
| --- | --- | --- |
| [Agent Skills](https://github.com/addyosmani/agent-skills) | Build, quality, review | Cataloged |
| [FounderOS-DEMO](https://github.com/Bennettxai/FounderOS-DEMO) | Control Room | Contract-only |
| [Semantica](https://github.com/semantica-agi/semantica) | Knowledge, provenance | Contract-only |
| [Wan2GP](https://github.com/deepbeepmeep/Wan2GP) | Isolated GPU media worker | Gated |
| [AI Builder Club skills](https://github.com/AI-Builder-Club/skills) | Build and verification loop | Reference-only; no LICENSE at pinned source |
| [RAG-Anything](https://github.com/HKUDS/RAG-Anything) | Multimodal Knowledge/Notebook | Contract-only |
| [Awesome GPU Engineering](https://github.com/goabiaryan/awesome-gpu-engineering) | GPU infrastructure guidance | Reference-only; no LICENSE at pinned source |
| [Headroom](https://github.com/headroomlabs-ai/headroom) | Routing, compression, budget efficiency | Pilot |
| [RAGFlow](https://github.com/infiniflow/ragflow) | External Knowledge retrieval | Contract-only |
| [Google agents-cli](https://github.com/google/agents-cli) | Operator build/evaluation | Operator-only |
| [Cognee](https://github.com/topoteretes/cognee) | Long-term memory and graph | Contract-only |
| [AI Engineering from Scratch](https://github.com/rohitg00/ai-engineering-from-scratch) | Engineering reference | Cataloged |
| [Company Research Agent](https://github.com/guy-hartstein/company-research-agent) | Research workflow patterns | Contract-only |
| [gstack](https://github.com/garrytan/gstack) | Worktree, review, release workflows | Operator-only |
| [AGENTS.md](https://github.com/agentsmd/agents.md) | Workspace instruction/provenance | Cataloged |
| [500 AI Agents Projects](https://github.com/ashishpatel26/500-AI-Agents-Projects) | Use-case discovery | Cataloged |
| [Appsmith](https://github.com/appsmithorg/appsmith) | Optional operator/admin surface | Contract-only |
| [FounderOS Agent Stack](https://founderos-agent-stack.vercel.app/) | Operator workflow reference | Contract-only |
| [AI Loops guide](https://learnaiwithmariah.com/guides/ai-loops-worth-stealing/) | Orchestration patterns | Cataloged |
| [Roboflow Supervision](https://github.com/roboflow/supervision) | Visual QA worker enhancement | Gated |

Additional implemented service reference:

- [Groq Speech-to-Text](https://console.groq.com/docs/speech-to-text) —
  server-only `whisper-large-v3-turbo` adapter for recorded microphone input.

## What is built versus cataloged

### Built and evidenced

- Shared native capability-traits kernel and immutable trait snapshots.
- Research + Knowledge persistence contracts and authenticated cloud smoke.
- Dependency-free Visual QA vertical slice with artifact ownership, bounded
  frames, durable reports/findings, deletion lineage, and `dofgfood` gating.
- Shared recorded-microphone transcription through server-side Groq Whisper.
- Local/cloud route allowlists, Secret Manager binding, and microphone
  Permissions-Policy fix for `veloce-cloud-test`.
- Versioned repository/reference register with clean URLs, pins, licenses,
  runtime classes, permissions, and evidence gates.
- Deterministic native context compression contract with hash/count-only
  evidence, provider-bound trait resolution, pre-estimation budget sizing, and
  server-manifest activation. Local focused tests, typecheck, and lint pass;
  cloud activation remains pending until a new image is smoke-tested.

### Cataloged but not built as runtimes

Semantica, RAG-Anything, RAGFlow, Cognee, FounderOS, Appsmith, Company
Research Agent, Headroom's external runtime, and the operator/GPU projects
remain references or contract candidates. Cataloging them does not install
their dependencies or grant their permissions. The catalog now explicitly
distinguishes `native-enabled`, `contract-active`, `reference-only`, and
`externally-gated` behavior.

### Intentionally gated

Live GPU generation, Supervision enhancement, external security execution,
communications sending, autonomous worktrees, and continuous streaming speech
remain gated until their isolated-worker, consent, cost, license, scope,
rollback, and evidence requirements pass.

## Next implementation item

The reference-register integrity layer is implemented and machine-checked. It
rejects:

- unpinned repository references;
- missing, unknown, or unverified licenses;
- tokenized/private URLs;
- missing runtime class, evidence gate, or execution permissions;
- permissions that expand without a reviewed status/evidence change;
- catalog entries that imply runtime installation.

The current capability pilot is Headroom-inspired compression as a
Veloce-owned routing trait. It is measured for token savings, quality
preservation, budget traceability, and deterministic fallback. It does not
bundle Headroom or expose a user-facing skill selector.

## Activation semantics

The register is a governed architectural index, not an installer. A
`native-enabled` entry means Veloce-owned behavior is active through an existing
surface and has implementation/evidence/rollback metadata. `contract-active`
means the boundary is defined but the upstream runtime is not executed.
`reference-only` is guidance. `externally-gated` requires a separate worker,
license, scope, cost, rollback, and evidence bundle. Removing a trait or
capability from the server manifest is the rollback mechanism.

For local activation, `CLIENT_ENABLED_TRAITS=context-compression` is set by
the client runtime launcher. Owner-cloud activation is live on
`veloce-cloud-test-00148-xwg` with the same server-side value and the
`v109-native-headroom-compression-20260812` image. Rollback removes the trait
from the manifest; the catalog entry and historical evidence remain.

## Portability rule

The same trait resolver, evidence envelope, reference register, and adapter
contract must work in the local operator runtime, owner-cloud test runtime,
and future isolated Cloud Run/GPU workers. Deployment location may change;
tenant, approval, budget, provenance, and audit semantics may not.

## Intent routing addition

The native playbook plane is the client-facing expression of the catalog. A
native-enabled reference may inform a Veloce-owned trait or playbook, but it
does not make the upstream project executable. Intent classification is bounded
to the ready registry, has no tools, and cannot cross the manifest or any gated
capability boundary. This preserves portability while allowing non-technical
clients to benefit from the architecture automatically.
