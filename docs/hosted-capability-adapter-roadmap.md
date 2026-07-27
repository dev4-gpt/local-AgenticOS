# Hosted Capability Adapter Roadmap

Updated 2026-07-27.

This is the implementation order for turning the private `3939` operator
edition into a safe client edition. A provider key alone does not make a tab
cloud-safe. Each capability needs a server contract, tenant-scoped data,
secret references, budgets, approvals, and tests before it is enabled.

## Release rule

The Cloud Run client image may expose the shared Veloce shell, but a capability
must remain gated until its row below has a passing evidence bundle. The
operator edition at `127.0.0.1:3939` is the presentation reference and remains
private.

## Capability work queue

| Group | Surfaces | Replacement | Gate evidence |
|---|---|---|---|
| Text agents | Claude, Codex, OpenClaw, Hermes, Kimi, GLM, Grok | Tenant-safe queued API workspace now routes these surfaces away from local CLI; provider-specific protocol and bounded reviewed-plan tool contracts are implemented, while manifest activation remains gated | Authenticated request, correct client key, capped spend, redacted logs, retry/idempotency test |
| Local execution | Local, Local Engine, Free Claude Code | Client edition now routes Local/Engine to the queued API model workspace and Free Claude Code to its OpenRouter adapter; the 3939 local model/CLI remains operator-only | No shell or localhost dependency in the client image; provider key, model, budget, and isolation test |
| Orchestration | Paperclip, Pipeline, Agent Kanban, Loop, Ruflo | Tenant workflow board now persists scoped work items and step state in Supabase; provider-backed agent execution remains a separate opt-in adapter | Create, update, archive, delete, ownership/audit, tenant A/B test, then queue-backed provider execution where enabled |
| Memory and context | Memory, Notebook, Journal, Goals, Context intake | Tenant-scoped Supabase records adapter is implemented for text records; Cloud Storage attachments and retention policy remain | Apply hosted-capabilities migration, then prove RLS, signed download, export, delete, retention, and private-cache behavior |
| Creative workspaces | Open Design, Web Studio, Flow Lab, Video, Music, Agent Studio, OpenMontage, Game Studio, Thumbnails | Tenant brief/request workspaces are available for design surfaces; ElevenLabs speech, Suno music polling, HeyGen polling, and the tenant artifact pipeline are implemented; image/video/workspace parity remains | Provider allowlist, output object ownership, signed access, budget, approval |
| Research and SEO | SEO, integrations, build guide | Firecrawl read-only scrape adapter with tenant allowlist; publishing and source/licensing work remain | Secret reference, outbound-domain allowlist, attribution/legal review, rate limit |
| Delivery | Delivery actions and external publishing | Approval-only, idempotent tenant delivery action record plus tenant-token worker and allowlisted HTTPS webhook adapter | Preview, approve, execute once, audit, rollback/undo where possible; live worker evidence is still required |

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
