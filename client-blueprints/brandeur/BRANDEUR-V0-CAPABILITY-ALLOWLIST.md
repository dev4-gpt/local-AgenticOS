# Brandeur Cloud OS v0: Capability Translation Matrix

This matrix translates the current private Veloce Operator Edition into the
first Brandeur cloud edition. It is a product-scope decision, not an assertion
that every local route is cloud-ready today.

| Current Veloce area | Brandeur v0 treatment | Cloud-safe replacement or requirement | Visibility |
| --- | --- | --- | --- |
| Mission Control | Include as Transformation Command | Brandeur portfolio, project health, next decision, and review cadence backed by tenant data | Brandeur team |
| Memory + Graphify | Include as Brand Context Vault | Tenant-scoped documents, metadata, retrieval, source links, and audited access | Brandeur team |
| Goals + Journal | Adapt | Project decisions, action items, workshop notes, and weekly review record; not personal journaling | Brandeur team |
| Paperclip + Pipeline + Agent Kanban | Adapt | Managed workflow stages, owners, approval gates, and queue-backed jobs; no raw task execution controls | Brandeur team |
| Flow Lab | Include with guardrails | Permission declaration, reference metadata, original brief generation, source attribution, and no cloning | Brandeur team |
| Web Studio + Open Design | Adapt | Website/conversion brief, page structure, creative direction, and approved handoff; no arbitrary code runner | Brandeur team |
| Video, music, thumbnails | Defer by default | Enable only against an approved client-owned provider account and a clear deliverable | Brandeur team |
| Integrations + Capabilities | Operator administration | Read-only connection/budget state to owner; secret values and provider admin stay server-side | Brandeur owner / Veloce support |
| Leads + Radar | Exclude from pilot | Consider after separate consent, messaging, CRM, and outbound approval design | Not in v0 |
| Claude, Codex, Hermes, Kimi, GLM, Grok, Free Claude Code | Do not expose as raw tabs | Replace with bounded Brandeur workflows using client-owned provider APIs, allowlisted models, budgets, and audit events | Indirect only |
| OpenClaw, local engine, shell, workspaces, file previews | Exclude | No Mac access, arbitrary command execution, path browsing, or personal subscription use in cloud | Never client-facing |
| Notebook | Defer | Add later only if Brandeur selects a reviewed cloud knowledge connector and rights model | Not in v0 |

## Client Approver Surface

The first client-facing surface contains only:

- Their project timeline and currently requested decision
- Approved strategy, creative, website, and delivery artefacts
- A versioned approval/reject/request-changes action with a comment
- Weekly report and selected spend summary

It does not contain agent chat, provider setup, internal research, internal
notes, raw knowledge search, source-system administration, or another client
project.

## Promotion Rule

Move a deferred or excluded capability into the product only after all of the
following are written and tested:

1. Brandeur business owner and signed use case
2. User roles and data boundary
3. Client-owned credential or reviewed OAuth model
4. Model/provider allowlist and monthly budget
5. Human approval rule for external effects
6. Functional, authorization, and rollback test evidence
