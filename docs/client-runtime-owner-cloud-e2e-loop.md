# Owner Cloud End-to-End Loop

Last updated: 2026-08-03

This checklist is the acceptance loop for the `veloce-cloud-test` owner-cloud runtime. It exists so the client portal can be tested as a product, not as a pile of individual tabs.

## Current Live Contract

The owner-cloud edition uses the same hosted client runtime boundary as client deployments:

- no operator laptop filesystem;
- no local CLI or local subscription credentials;
- server-side provider keys only through Secret Manager;
- tenant-scoped Supabase records, workflows, artifacts, audit events, and memory graph state;
- Cloud Tasks-backed long work;
- explicit manifest allowlists for providers, models, capabilities, budgets, and outbound hosts.

The current owner-cloud manifest has `text-agents`, `tenant-data`, `artifacts`, `orchestration`, `delivery`, and `quality` enabled. It allows Anthropic, OpenRouter, and Gemini keys. It does not currently allow OpenAI/Codex API calls because the OpenAI API billing/key step was intentionally skipped. Gemini/Antigravity is pinned to `gemini-3.1-flash-lite`; older `gemini-2.5-flash-lite` access can return HTTP 404 for newer accounts.

## Route Matrix

| Lens | Routes | Expected current outcome |
| --- | --- | --- |
| Command | `/claude` | Live provider smoke should pass with the approved Anthropic key. |
| Command | `/antigravity`, `/local`, `/engine` | Gemini/OpenRouter deployment is live; run one signed-in smoke per provider to close acceptance. |
| Command | `/openclaw`, `/hermes`, `/freeclaude`, `/fusion` | Visible OpenRouter-backed workspace. Smoke passes only when the provider-model pair is explicitly allowlisted for that adapter. |
| Command | `/codex` | Intentionally gated until OpenAI API billing/key is added. This is not covered by the ChatGPT subscription. |
| Command | `/kimi`, `/glm`, `/glm-code`, `/grok`, `/sakana` | Intentionally gated until their provider keys and model pricing are added. |
| Context | `/memory`, `/journal`, `/goals`, `/notebook`, `/context` | Tenant record storage, Markdown import/export, and memory map should work inside Supabase RLS. No local Obsidian vault is read in the hosted edition. |
| Orchestrate | `/orchestrate`, `/paperclip`, `/room`, `/pipeline`, `/agent-kanban`, `/kanban`, `/loop`, `/ruflo` | Workflow creation, deterministic execution, status updates, retry visibility, and archived/done states should work. Provider dispatch only runs through the approved queued provider path. |
| Create | `/create`, `/opendesign`, `/web-studio`, `/flow-lab`, `/studio`, `/openmontage`, `/games`, `/thumbnails` | Brief/request workspaces should store tenant-owned planning records. Media generation is gated unless the specific provider capability and key are enabled. |
| Govern | `/capabilities`, `/credentials`, `/integrations`, `/seo`, `/seo-guide`, `/guide` | Capability catalog, credential status, hosted guide surfaces, and SEO adapter shell should be visible. Live SEO calls require the SEO capability and approved host allowlist. |
| Deliver | `/deliver`, `/leads`, `/radar` | Delivery/request records should be stored in the tenant namespace. External delivery actions require approval and allowlisted HTTPS destinations. Public lead forms store into Supabase `signups` and send notification email through Resend. |

## Smoke Prompts

Use these exact prompts for provider tabs:

- Claude: `Reply exactly: Claude owner-cloud smoke passed.`
- Antigravity: `Reply exactly: Gemini owner-cloud smoke passed.`
- Local/Engine/OpenRouter: `Reply exactly: OpenRouter owner-cloud smoke passed.`
- OpenRouter adapters when allowlisted: `Reply exactly: Veloce adapter smoke passed.`

Expected response text must match the requested phrase or return a clear, readable `ClientRuntimeNotice` with a trace code and next action.

## Product-Markets-Itself Loop

The owner-cloud portal should be able to produce its own launch assets using the same runtime boundaries:

1. `Context`: store positioning, ICP, proof points, objections, and customer language as tenant memory records.
2. `Orchestrate`: create a weekly launch workflow with research, copy, creative, review, publish, and follow-up steps.
3. `Create`: draft LinkedIn posts, reels scripts, product walkthrough outlines, lead magnets, and landing-page improvement briefs as tenant records.
4. `Govern`: check capability status, key readiness, budget, SEO angle, and approval boundaries before sending anything external.
5. `Deliver`: capture leads from public forms, prepare approved outbound handoffs, and keep radar/follow-up records.

No marketing workflow should depend on local files, personal CLI sessions, or unreviewed provider access.

## Acceptance Definition

A route is accepted only when one of these is true:

- it produces the expected tenant-scoped result;
- it blocks with an intentional, readable capability/key/budget notice;
- it is documented as intentionally gated for the current manifest.

A route is not accepted when it returns a raw code with no explanation, silently fails, stores data outside the tenant namespace, calls an unapproved provider, or requires the user to inspect Cloud logs to understand normal runtime state.

## Repeatable Harness

Use the authenticated surface-map verifier when a protected runtime cookie file is available:

```bash
npm run verify:client-surface-map -- \
  --url https://veloce-cloud-test-mquo4bf7aq-el.a.run.app \
  --cookie-file /path/to/veloce-runtime-cookie.txt
```

Add `--provider-smoke` only when live provider spend is intentionally approved:

```bash
npm run verify:client-surface-map -- \
  --url https://veloce-cloud-test-mquo4bf7aq-el.a.run.app \
  --cookie-file /path/to/veloce-runtime-cookie.txt \
  --provider-smoke
```

The cookie file must be mode `0600` and contain only the two runtime session cookies. The verifier updates rotated cookies in place without printing them.
