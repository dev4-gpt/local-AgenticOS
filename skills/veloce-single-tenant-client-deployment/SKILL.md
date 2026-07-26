---
name: veloce-single-tenant-client-deployment
description: Design, provision, review, and update isolated cloud deployments of Veloce AgenticOS for individual clients. Use when turning the private local operator OS into a client-facing cloud portal, planning client-owned keys and budgets, choosing storage/auth/worker boundaries, or preventing per-client deployments from becoming divergent code forks.
---

# Veloce Single-Tenant Client Deployment

Build an isolated client product from one maintained codebase. Reuse the
Veloce experience, interaction model, and approved UI components; do not lift
and shift the private local OS.

## Product-parity rule

Treat the local Veloce Operator Edition as the presentation reference. Carry
its six lenses (Command, Context, Orchestrate, Create, Govern, Deliver),
approved UI components, motion rules, and accessibility fallbacks into a
client-branded edition. Never copy local data, operator history, Mac paths,
provider credentials, internal-only tools, or raw agent execution surfaces.

Before implementation, create a Client Edition Manifest covering client
branding, enabled capabilities, roles, approvals, data retention, provider
credential model, budgets, and explicit exclusions.

## Non-negotiable architecture

1. Keep one source repository and one versioned container image.
2. Give each early client an isolated project or equivalently strong tenant boundary.
3. Store client credentials only in a managed secret store. Never ship them to the browser, repository, logs, screenshots, or build artifacts.
4. Replace local filesystem persistence with managed database/object storage.
5. Replace unrestricted shell and local CLI execution with allowlisted API and worker operations.
6. Keep external publishing, outreach, spending, and destructive actions behind human approval.
7. Preserve the private operator OS as a separate control plane.

## Default deployment model

Use single-tenant deployments for the first three to five clients:

```text
one repository -> tested image -> client project
                                |- authenticated portal
                                |- backend-for-frontend/API
                                |- private task worker
                                |- database and object storage
                                |- client secret namespace
                                |- per-client budget and audit logs
```

Do not clone the repository for each client. Parameterize branding, enabled capabilities, storage identifiers, domains, budgets, and provider configuration.

## Build a client edition, not a local replica

| Local concern | Client-edition treatment |
| --- | --- |
| Edition UI, six-lens navigation, motion, accessibility | Reuse or parameterize after visual review. |
| Obsidian/local vault files | Replace with tenant-scoped database, object storage, and retrieval service. |
| CLI, shell, local app, Mac paths | Exclude or replace with a narrow queued worker action. |
| Personal subscription login | Exclude from hosted production. |
| Agent/provider feature | Include only after client scope, key model, budget, and approval rule are set. |
| Local operator views | Keep operator-only or create a separate audited administrator view. |

Do not promise every current local tab to every client. A smaller, client-safe
edition that performs the signed workflows well is product parity.

## Classify every local capability

Before cloud work, classify each route or module:

| Class | Cloud treatment |
| --- | --- |
| Public content | Static public service only; no private APIs. |
| Client portal | Authenticated and tenant-scoped. |
| Read-only client data | Tenant-scoped query with audit logging. |
| Mutating workflow | Explicit authorization and human approval. |
| Background work | Queue-backed private worker with bounded retries. |
| Secret/provider administration | Operator-only; never client browser code. |
| Local shell/filesystem/CLI | Exclude or replace with an allowlisted cloud adapter. |

Reject a deployment plan that exposes raw shell commands, arbitrary paths, another tenant's identifiers, provider admin screens, or personal subscription credentials.

## Eliminate operator dependencies deliberately

The client runtime must not become a local replica merely because its UI looks
like the operator edition. A route is not client-safe when it reaches a Mac
path, local vault, personal CLI login, loopback service, unrestricted shell, or
operator-only workspace data. Adding an API key to that route is insufficient.

Use this migration loop for every gated tab or capability:

1. Inventory reads, writes, subprocesses, local services, provider calls,
   credentials, outbound actions, and long-running work.
2. Classify the capability as `client-safe`, `api-adapter-required`, or
   `operator-only`.
3. Define a narrow client contract for inputs, outputs, models, budgets,
   approvals, errors, retention, and ownership.
4. Move state to tenant-scoped Supabase tables or Cloud Storage with RLS,
   signed access, export, and deletion behavior.
5. Replace local CLI/helper execution with a provider API or private
   Cloud Tasks/Pub/Sub worker. Never call `localhost` from the browser and
   never put personal subscription sessions in hosted capacity.
6. Add Secret Manager references, least-privilege IAM, validation, rate
   limits, audit events, redaction, idempotency, and bounded retries.
7. Add acceptance tests for behavior, authorization, tenant isolation, secret
   handling, budget enforcement, accessibility, failures, and recovery.
8. Enable the route in one dry-run Client Edition Manifest, deploy the same
   tested image, inspect logs and browser output, then promote it to clients.

Do not solve a gate by deleting the gate. The gate is a security boundary until
the underlying dependency has a reviewed replacement. Maintain the full route
inventory and current status in
`docs/client-runtime-13-layer-readiness.md`.

### Capability migration classifications

Use these initial classifications for Veloce:

| Classification | Examples | Required next step |
|---|---|---|
| `client-safe` | Public pages, client login, context/request intake, capability and credential status | Keep tenant-scoped and add the acceptance evidence required for the client manifest. |
| `api-adapter-required` | Claude, Codex, OpenClaw, Hermes, Antigravity, Kimi, GLM, Grok, media workspaces, SEO, delivery actions | Build the provider/storage/worker contract, then enable only with client secrets, budgets, and approvals. |
| `operator-only` | Local, Local Engine, Free Claude Code proxy, personal CLI sessions, local vault/files, local Paperclip, unreplaced orchestration and private source material | Keep out of Cloud Run or replace it with a separately reviewed hosted service. |

The canonical tab-by-tab inventory and the 13-layer readiness table are part of
the release evidence, not optional project notes.

## GCP reference mapping

Use equivalent managed services when another cloud is selected.

- Portal and API: Cloud Run with authenticated application sessions.
- Identity: Identity Platform or another reviewed OIDC provider.
- Secrets: Secret Manager, one client namespace and least-privilege service account.
- Structured state: Firestore or Cloud SQL, selected from the data model rather than convenience.
- Files and deliverables: Cloud Storage with tenant-prefixed paths and signed access where needed.
- Jobs: Cloud Tasks or Pub/Sub to a private worker; never hold a browser request open for long agent work.
- Logs: structured audit events without prompts, keys, private documents, or full provider responses by default.
- Spend: client-specific provider project/key, model allowlist, monthly cap, warning threshold, and approval for overage.

Personal Claude, Codex, Gemini, or other UI subscriptions are internal operator tools, not hosted client inference capacity. Use provider APIs or client-authorized enterprise integrations for production workloads.

## Client credential models

Choose and document one model per provider:

1. **Client-owned key:** preferred for transparency. The client creates it, scopes it, and can revoke it.
2. **Managed key with allowance:** Veloce owns the provider account, meters usage, and includes a written cap.
3. **OAuth connection:** use only when the provider supports the intended hosted use and token storage is reviewed.

Never ask users to paste keys into chat. Use a secure onboarding form that sends directly to the authenticated backend and stores the value in Secret Manager.

For every enabled provider, record the secret reference rather than the secret
value, the model allowlist, the budget cap, the warning threshold, the data
sharing terms, and the named business owner. Render only connection state and
budget status in the browser.

## Delivery workflow

1. **Inventory:** enumerate local routes, tools, data, credentials, writes, and outbound actions.
2. **Scope:** select only client-facing workflows required by the signed engagement.
3. **Threat model:** identify tenant crossing, injection, secret leakage, unsafe actions, cost abuse, and dependency risks.
4. **Design:** define identity, storage, secrets, jobs, approval gates, audit events, backups, and deletion/export.
5. **Provision:** create infrastructure from reviewed configuration or infrastructure as code. Avoid console-only drift.
6. **Deploy:** promote the same tested image with client-specific configuration.
7. **Verify:** run functional, tenant-isolation, authorization, secret, budget, accessibility, and recovery tests.
8. **Operate:** monitor failures and spend; patch all deployments from the central release pipeline.
9. **Offboard:** export approved client data, revoke secrets, enforce retention, and destroy isolated resources when authorized.

## Required acceptance evidence

Do not call a client deployment complete without evidence for:

- Authentication and logout/session expiry.
- Tenant A cannot enumerate, read, mutate, or infer Tenant B data.
- Browser bundles and logs contain no credentials or local paths.
- Provider calls use the intended client key and budget.
- Long jobs survive request termination and have bounded retry/idempotency behavior.
- External actions require the documented approval.
- Data export, backup, and deletion behavior.
- Mobile, keyboard, reduced-motion, and error-state behavior.
- Dependency, secret, and container scans.
- Rollback to the previous tested image.

## Thirteen-layer release gate

Before calling the business production-ready, review the companion matrix for
all thirteen layers: frontend, APIs, data, auth, hosting, compute, CI/CD,
security/RLS, rate limiting, caching/CDN, scaling, error tracking/logs, and
availability/recovery. `Ready for the test track` is not the same as `ready to
share as a full client product`. Missing rate limits, tenant RLS, recovery
drills, or provider adapters block external capability enablement.

## Expected output

For each client, produce:

- Deployment boundary and data-flow diagram.
- Capability allowlist and explicit exclusions.
- Identity, storage, secret, worker, and budget configuration.
- Threat model and acceptance matrix.
- Release/rollback plan.
- Operator runbook and client onboarding/offboarding checklist.

Also produce the Client Edition Manifest and a client-specific cloud intake
strategy. Keep these in a client blueprint area, not in application
configuration or source code containing runtime secrets.

State assumptions and unresolved credential or legal gates. Never label optional, untested provider features as working.
