---
name: veloce-client-capability-onboarding
description: Create and execute a safe, evidence-backed onboarding plan for a Veloce cloud client. Use when deciding what a client can use, classifying local-versus-cloud features, collecting only approved provider API keys, activating a provider or capability, proving the complete request-to-result path, or producing a client capability matrix and operator handoff.
---

# Veloce Client Capability Onboarding

Use this skill to turn an approved client requirement into a clear answer:
what is usable now, what needs a hosted API adapter and client key, what must
remain operator-only, and what evidence is required before it is promised.

## Non-Negotiable Rules

1. Do not equate a visible tab, connected-looking status, or submitted key
   with a working cloud capability.
2. Never ask a client to paste every key. Start with the signed workflow and
   enable only the provider(s) it needs.
3. Accept API keys only through the authenticated credentials workflow. Never
   request keys, browser cookies, CLI sessions, passwords, or service-role
   credentials in chat, source, manifests, logs, or screenshots.
4. Personal Claude, Codex, Gemini, or other product subscriptions are not
   automatically reusable as hosted API capacity. Verify the provider's API
   account, permitted model, billing, and data terms before activation.
5. Keep provider calls disabled until the manifest has the secret reference,
   provider/model allowlist, pricing, budget cap, approved capability, and
   named approval owner.
6. Do not modify a proven test or another client's runtime to onboard a new
   client. Use a separate tenant, service, secret namespace, storage namespace,
   and client manifest.

## Required Inputs

Collect only these items before provisioning:

- client name, slug, owner email, and approved decision-maker;
- one to three business workflows to support first;
- the data types involved and retention expectation;
- selected provider API keys or an explicit `pending external input` status;
- monthly budget cap, warning threshold, and approval rule;
- whether each key is client-owned, Veloce-managed, or an approved OAuth
  connection.

If an input is missing, mark the affected row `pending external input` and
pause. Do not replace it with an assumption or a personal operator credential.

## Workflow

### 1. Read The Current Boundary

Read these before claiming readiness:

- `docs/client-runtime-13-layer-readiness.md`
- `docs/runtime-capability-matrix.md`
- `docs/hosted-capability-adapter-roadmap.md`
- `docs/gcp-client-runtime-runbook.md`
- `docs/future-integrations/cloud-memory-and-inference.md` when the client
  requests Obsidian-compatible memory, a knowledge graph, or a low-cost model
  lane
- `skills/veloce-single-tenant-client-deployment/SKILL.md`
- `skills/veloce-client-runtime-production-gates/SKILL.md`

Use the current deployed manifest and Cloud Run service as the source of truth
for a live client, not an old terminal log or a UI label.

### 2. Create The Client Capability Matrix

Copy `references/client-capability-matrix-template.md` into the client's
blueprint folder and complete it with the client, date, and chosen workflows.
Classify every requested surface as exactly one of:

- `proven`: client-safe and evidenced for this client configuration;
- `adapter required`: a hosted replacement exists or must be built, but is not
  yet proven for this client;
- `operator-only`: depends on local CLI, files, vault, loopback service, or
  personal subscription state;
- `pending external input`: needs a client decision, API key, billing approval,
  domain, data-sharing decision, or access grant;
- `blocked`: cannot proceed until a stated technical, legal, or provider
  condition changes.

Do not label an item `proven` until it has the evidence in step 6.

### 3. Scope A Small First Release

Choose one end-to-end workflow and at most three providers. Favor a text
workflow before media, research, publishing, or autonomous execution.

Use these mappings when the corresponding provider API and model are approved:

| Requested experience | Hosted replacement | Credential |
| --- | --- | --- |
| Claude | Anthropic text adapter | `ANTHROPIC_API_KEY` |
| Codex | OpenAI code-plan adapter | `OPENAI_API_KEY` |
| OpenClaw, Hermes, Free Claude, Fusion | Reviewed OpenRouter adapter, not the local CLI | `OPENROUTER_API_KEY` |
| Gemini, Antigravity | Gemini API adapter | `GEMINI_API_KEY` |
| Kimi | Moonshot API adapter | `MOONSHOT_API_KEY` |
| GLM / GLM Code | Z.ai API adapter | `GLM_API_KEY` |
| Grok | xAI API adapter | `XAI_API_KEY` |

Local Ollama, Mac files, Obsidian, local agent workspaces, and personal CLI
sessions stay out of the hosted edition unless a separate reviewed cloud
replacement is built.

### 4. Handle Credentials Safely

Tell the client to use the authenticated `/credentials` page to submit only an
approved provider API key. That route writes to the client credential inbox;
submission is not activation.

The operator must then:

1. inspect the credential envelope without printing the secret;
2. confirm the tenant slug and provider key match;
3. promote it to the tenant-scoped Secret Manager target using
   `npm run promote:client-credential`;
4. record only the secret reference and connection status in the matrix.

Do not promote an unsupported provider, a personal CLI token, a key from a
different tenant, or a key without an approved model and budget.

### 5. Activate One Capability

Update the client manifest, validate it, then deploy the same reviewed image.
Provider activation requires all of the following:

- `providerCallsEnabled: true`;
- `text-agents` among the enabled capabilities for text execution;
- the provider secret in `secretEnv` and `providerAllowlist`;
- a narrow `modelAllowlist` and matching `providerModelAllowlist`;
- model pricing, monthly cap, warning threshold, and approval owner;
- tenant-scoped worker, queue, storage, audit, and retention configuration.

Do not use a free-form environment override to force provider calls on. The
provisioner derives `CLIENT_PROVIDER_CALLS_ENABLED` from the reviewed manifest.

### 6. Prove The Complete Path

For each enabled provider/capability, run one harmless, bounded test and record
the result. It must demonstrate:

```text
authenticated client UI
  -> validated tenant request
  -> queue/worker where applicable
  -> allowlisted provider + model
  -> budget reservation and settlement
  -> redacted audit event
  -> tenant-scoped result or artifact
```

Also check a denied path: wrong tenant, unallowlisted provider/model, missing
secret, exhausted budget, or rejected external action. Do not print prompts,
raw outputs, tokens, keys, or private client data in evidence.

### 7. Publish The Honest Client Record

After each capability outcome:

1. update the client matrix and client blueprint;
2. update the relevant runtime/readiness/runbook Markdown documentation;
3. run focused validation appropriate to the change;
4. commit and push the scoped changes;
5. tell the client only what is `proven`, plus any pending or blocked items.

Never claim whole-product parity while a requested row is `adapter required`,
`pending external input`, or `blocked`.

## Completion Output

Deliver a client-ready package containing:

- completed capability matrix with evidence links;
- approved capability and provider/model allowlists;
- credential ownership and Secret Manager reference inventory, without values;
- budget and approval policy;
- acceptance evidence and failure behavior;
- remaining operator-only, pending, and blocked items;
- rollback, support, and offboarding owner.

## Stop Conditions

Stop and report the exact missing condition when a provider lacks a suitable
server API, the client only has a consumer subscription, billing is not
approved, a local dependency has no cloud replacement, or an end-to-end test
does not pass. Do not silently broaden scopes, reuse another tenant's secret,
or enable a provider to make a UI appear complete.
