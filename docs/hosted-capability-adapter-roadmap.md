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
| Text agents | Claude, Codex, OpenClaw, Hermes, Kimi, GLM, Grok | Shared API-only adapter foundation exists; add provider manifest entries, model pricing, queued job, budget ledger, approval policy | Authenticated request, correct client key, capped spend, redacted logs, retry/idempotency test |
| Local execution | Local, Local Engine, Free Claude Code | Explicitly operator-only, or a separately reviewed sandbox/model service | No shell or localhost dependency in the client image; isolation and resource-limit test |
| Orchestration | Paperclip, Pipeline, Agent Kanban, Loop, Ruflo | Tenant-scoped workflow state plus Cloud Tasks/Pub/Sub worker | Job survives request end, bounded retry, ownership/audit, tenant A/B test |
| Memory and context | Memory, Notebook, Journal, Goals, Context intake | Supabase rows plus Cloud Storage attachments and retention policy | RLS, signed download, export, delete, retention, private-cache test |
| Creative workspaces | Open Design, Web Studio, Flow Lab, Video, Music, Agent Studio, OpenMontage, Game Studio, Thumbnails | Provider-specific API adapter and artifact pipeline | Provider allowlist, output object ownership, signed access, budget, approval |
| Research and SEO | SEO, integrations, build guide | Server-side connectors and licensed/original content | Secret reference, outbound-domain allowlist, attribution/legal review, rate limit |
| Delivery | Delivery actions and external publishing | Destination adapter with idempotency and human approval | Preview, approve, execute once, audit, rollback/undo where possible |

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
