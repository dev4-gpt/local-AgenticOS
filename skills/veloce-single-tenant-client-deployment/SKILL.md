---
name: veloce-single-tenant-client-deployment
description: Design, provision, review, and update isolated cloud deployments of Veloce AgenticOS for individual clients. Use when turning the private local operator OS into a client-facing cloud portal, planning client-owned keys and budgets, choosing storage/auth/worker boundaries, or preventing per-client deployments from becoming divergent code forks.
---

# Veloce Single-Tenant Client Deployment

Build an isolated client product from one maintained codebase. Do not lift and shift the private local OS.

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

## Expected output

For each client, produce:

- Deployment boundary and data-flow diagram.
- Capability allowlist and explicit exclusions.
- Identity, storage, secret, worker, and budget configuration.
- Threat model and acceptance matrix.
- Release/rollback plan.
- Operator runbook and client onboarding/offboarding checklist.

State assumptions and unresolved credential or legal gates. Never label optional, untested provider features as working.
