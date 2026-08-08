# Cloud Memory And Inference Options

**Status:** tenant Markdown import/export and deterministic, interactive visual
tag graph deployed and smoke-proven

**Last reviewed:** 2026-08-08

**Decision:** Obsidian-compatible durable memory and Graphify-style knowledge
graphs remain part of Veloce's identity. The hosted client runtime will not
mount a laptop vault or call a laptop Ollama process. Build a tenant-scoped
cloud memory adapter first, use allowlisted low-cost provider APIs for hosted
inference initially, and evaluate a dedicated Ollama-compatible inference
plane only after measured client demand justifies its cost and operations.

## What Exists Today

The private operator runtime uses a local Obsidian vault as durable Markdown
memory. Its Graphify integration stages approved vault files, runs the local
Graphify executable against a local Ollama backend, then writes graph data and
an Obsidian export back to the operator machine.

The local model lane uses Ollama at `127.0.0.1:11434` or an optional local
OpenAI-compatible MLX server. This is private, inexpensive after the hardware
is owned, and useful for local drafting, classification, extraction, review,
and offline work.

The hosted runtime is intentionally different. It already provides tenant
records, artifacts, queues, audit state, budgets, and hosted provider-adapter
boundaries. Level 1 now adds an authenticated Markdown/text import path: the
source is stored and verified in the tenant artifact namespace, then linked to
a tenant memory record. The same tenant can export its memory records as
Markdown. The graph foundation builds tenant-isolated document and tag nodes
from explicit Markdown `#tags`, with source-linked edges and lifecycle export.
It does not yet provide document sync, AI relation extraction, a hosted
Graphify worker, a vector retrieval layer, or a self-hosted model server.

## Product Principle

Veloce should preserve these user outcomes, not copy laptop implementation
details into Cloud Run:

- readable, portable Markdown knowledge;
- durable client-owned decisions, notes, research, goals, and outputs;
- relationship discovery and knowledge-graph exploration;
- grounded retrieval for approved client material;
- a low-cost model lane for routine work;
- visible budgets, approval, retention, export, and deletion.

## Cloud Memory Options

### Option A: Cloud memory with Obsidian-compatible import/export

**Recommended first hosted implementation.**

```text
Client-approved Markdown, documents, and attachments
  -> authenticated import or reviewed sync
  -> tenant-prefixed Cloud Storage objects
  -> tenant-scoped document and record metadata in Supabase
  -> private indexing worker
  -> chunks, embeddings, graph nodes, and graph edges
  -> Veloce Memory and Graph views
  -> Markdown and attachment export on request
```

Clients can continue to use Obsidian as their editor. Veloce keeps an approved,
tenant-owned cloud copy of selected knowledge, rather than reading the whole
local vault or relying on a laptop being online.

**Benefits:** works from the hosted portal, supports least privilege and
offboarding, preserves Markdown portability, and provides an auditable
foundation for retrieval and graph exploration.

**Level 2 implementation:** Markdown/text source import, verified tenant
artifact linkage, memory record creation, Markdown export, deterministic
tenant-only Markdown-tag graph refresh, RLS, object ownership, retention
through the existing storage lifecycle, lifecycle export/restore coverage, and
static boundary coverage. The Supabase graph migration was applied on
2026-08-01. Cloud Run revision `veloce-cloud-test-00076-hxw` serves the visual
document-to-tag map at 100% traffic with provider calls disabled; the signed-in
import created one tenant record and two tenant graph edges. The interactive
smoke confirmed that selecting a tag reveals the related tenant record in the
map. This is available as a bounded, explicit-tag memory feature, not as a
claim of semantic Graphify parity.

**Owner-cloud inference checkpoint:** the owner-operated `veloce-cloud-test`
manifest now enables `text-agents` with approved Secret Manager slots for
Anthropic, OpenRouter, and Gemini. Revision `veloce-cloud-test-00081-b5c`
serves 100% of Cloud Run traffic with OpenRouter pinned to
`google/gemini-3.1-flash-lite` and Gemini/Antigravity pinned to
`gemini-3.1-flash-lite`, both under the recorded $1 monthly test cap.
Codex/OpenAI remains deliberately excluded from this checkpoint because API
billing has not been approved. This activates a low-cost hosted API lane; it
does not activate local Ollama, local CLI subscriptions, or arbitrary local
tool execution in Cloud Run.

**Remaining build work:** selected-folder sync, broader document extraction,
document metadata schema, indexing queue, retrieval, model-assisted graph
extraction, graph clustering, deletion coordination between records and source
objects, and end-to-end test coverage. The current map represents explicit
Markdown tags only; it is not semantic Graphify extraction or source-grounded
question answering.

### Option B: Veloce local connector

A client runs an authenticated connector beside their Obsidian vault and local
Ollama installation. The connector sends only approved notes, metadata,
embeddings, summaries, or graph updates to the hosted tenant.

**Benefits:** strongest local-data control; can use the client's existing
Obsidian and Ollama setup; can work with restricted networks.

**Costs and limits:** requires a separately installed and maintained desktop
or local service; the client device must be online for live sync or inference;
requires careful device authentication, revocation, and update controls.

### Option C: Direct remote vault mount

**Reject.** Cloud Run must not mount a client's laptop filesystem, iCloud
folder, personal Obsidian Sync storage, or arbitrary network share. This would
weaken isolation, make availability depend on a personal device, and create an
unclear ownership and revocation boundary.

## Graphify-Style Cloud Knowledge Graph

Graphify is a strong product reference, but it must move out of the web
process for hosted use.

```text
Tenant document set
  -> private graph extraction job
  -> approved extraction/embedding model
  -> graph nodes, edges, clusters, and source references
  -> tenant-scoped Graph view and question-answering
```

The worker may use Graphify in an isolated container if its license, runtime,
model backend, and operational behavior are reviewed. A Veloce-owned graph
worker is also valid if it preserves the same useful outcomes: source-linked
relationships, clustering, graph exploration, and Markdown export.

Every graph result must record source document references, tenant ownership,
build time, model/backend, and deletion behavior. It must never mix nodes,
embeddings, caches, or source material between tenants.

## Lower-Cost Hosted Inference Options

### Option A: Allowlisted provider API models

**Recommended first hosted model lane.** Use a lower-cost approved model from
OpenRouter, Gemini, OpenAI, Anthropic, or another provider through the existing
server-side adapter boundary.

Use it for routine summarization, classification, structured extraction,
planning, drafting, review, and graph extraction. Keep premium models for
workflows where their quality is demonstrably needed.

**Required controls:** per-client API key or managed allowance, exact model
allowlist, pricing, budget cap, warning threshold, private queue for long
work, redacted audit logs, and a harmless end-to-end smoke.

### Option B: Dedicated Ollama-compatible inference service

Run an isolated inference service such as Ollama, vLLM, SGLang, or another
reviewed OpenAI-compatible backend on persistent compute. Veloce connects to
it through a narrow authenticated inference adapter; it does not run the model
inside the Next.js web process.

**Best for:** sustained volume, predictable model choice, data-residency
requirements, long-running jobs, or clients who value a dedicated lower-cost
model lane enough to pay for persistent compute.

**Not the first default:** model downloads, disk, RAM/GPU allocation, cold
starts, patching, observability, capacity, and uptime all become Veloce
operational responsibilities. Standard Cloud Run is not the right place to
depend on a large, warm, client model process.

### Option C: Client-owned hybrid inference

The local connector in Option B can also expose an approved local Ollama model
to the client's own hosted Veloce tenant. This retains the client-owned-machine
model lane, while hosted Veloce continues to own identity, workflow state,
approvals, and durable cloud records.

**Best for:** privacy-sensitive clients who already operate compatible local
hardware and accept that the connector must remain online.

## Recommended Delivery Order

1. Define tenant document, attachment, graph, and export data contracts.
2. Build authenticated Markdown/document import into tenant Cloud Storage and
   Supabase metadata with retention and deletion behavior.
3. Build a private indexing worker that creates tenant-scoped chunks and source
   references.
4. Add a Graphify-style extraction worker and graph view, then prove tenant
   isolation, rebuild, export, deletion, and recovery.
5. Enable one low-cost hosted text model through the existing provider adapter,
   with a small client budget and acceptance evidence.
6. Measure actual volume, cost, latency, and retrieval quality before choosing
   a dedicated Ollama-compatible inference service or local connector.
7. Only then evaluate persistent inference infrastructure, including LMCache
   where a Veloce-controlled vLLM/SGLang workload has measurable repeated
   context.

## Required Evidence Before Client Release

- tenant A cannot read, infer, or retrieve tenant B documents, graph data,
  embeddings, artifacts, or inference cache entries;
- imported source documents and generated graph data have explicit retention,
  export, and deletion behavior;
- graph answers link back to approved tenant sources;
- model requests use the intended tenant credential, model allowlist, and
  budget policy;
- failures, retries, rebuilds, and partial index loss are visible and safe;
- no raw provider keys, local paths, private prompts, or documents appear in
  browser bundles or operational logs;
- a rollback exists for the indexer and inference adapter independently of the
  portal web revision.

## Decision Triggers

Start cloud memory work when a signed pilot needs shared, hosted knowledge from
approved documents. Consider dedicated inference only after a pilot shows that
provider API spend, latency, volume, privacy, or offline needs materially
justify operating model infrastructure.

Do not claim that this note enables cloud Obsidian, Graphify, or Ollama today.
It records the product direction and the conditions for building them safely.

## Hosted Execution Checkpoint (2026-08-08)

The initial remote-execution foundation is deployed for the dogfood tenant. A
hosted Paperclip, Web Studio, Loop, Ruflo, or other Section III-VI action now
creates a tenant-scoped `workspace-execution` job, enqueues Cloud Tasks, and
starts the dedicated `veloce-cloud-test-workspace` Cloud Run Job. The request
is constrained by authenticated tenant membership, capability enablement,
provider/model allowlists, a budget reservation, an idempotency key, audit
state, and a signed Cloud Storage artifact boundary. The workspace surface
shows the durable queued/running/terminal state, the redacted terminal trail,
and a sandboxed preview or signed artifact download only after an artifact is
committed.

The current job is deliberately a bounded provider-artifact runner, not an
interactive desktop or a claim of full local-terminal parity. It gets only the
job ID, tenant slug, callback URL, and service identity; provider credentials
remain in the protected runtime secret boundary and no local disk, localhost
service, Obsidian vault, or laptop API is mounted into Cloud Run.

### Evidence still required

1. Run the signed-in dogfood proof from Web Studio or Paperclip and retain the
   job, Cloud Run execution, Cloud Tasks dispatch, artifact, and PostHog event
   IDs together. Confirm `queued -> running -> succeeded` and a downloaded
   tenant artifact; retain a controlled failed run as well.
2. Add an E2B project and `E2B_API_KEY` only when the interactive terminal,
   file editing, and live-preview session lane is ready. E2B must be invoked
   by a separate approved adapter, with session TTL, per-tenant workspace
   hydration, cancellation, deletion, signed preview access, and cleanup
   evidence. It must not be presented as enabled before this proof exists.
3. Port each local workflow by observable behavior: Paperclip issue/build
   lifecycle, Ruflo role/dependency/result lifecycle, Loop builder/judge
   iteration, and Local Engine/Free Claude capabilities. A generic build brief
   is not a replacement for one of these workflows.
4. Enable media, SEO, publishing, and workplace adapters one provider at a
   time, after its credential, model/price allowlist, budget, approval,
   idempotency, retry, rollback, and tenant-isolation evidence exists.
5. Re-run export, explicit deletion, offboarding/restore, and two-tenant
   isolation drills after every new persistent table, object prefix, provider
   adapter, connector, or execution backend is introduced.

### Deliberate non-decisions

- Do not introduce Oracle/Coolify/Redis as a parallel execution plane. Cloud
  Run Jobs, Cloud Tasks, Supabase, and Cloud Storage remain the production
  execution/data foundation.
- Do not enable GPU infrastructure, Modal, or RunPod under the current $1
  dogfood provider cap. Those become candidates only for measured GPU-heavy
  media or self-hosted inference demand.
- Cloudflare remains optional for a custom domain, WAF, edge caching, or
  reverse-proxy telemetry. It does not replace the hosted adapter work above.

## Hosted Orchestration UI Checkpoint (2026-08-08)

The Section III cloud routes now use dedicated, durable orchestration surfaces
instead of the shared `Run in hosted workspace` screen. Paperclip has hosted
build-issue, active, done, organization, and cost views; the room has an
in-room provider roster and a reviewed dispatch action; Pipeline and Kanban
use tenant workflow boards; Loop records target/change/check/decision runs;
and Ruflo shows tenant workstreams and their dependency state. Every create,
status, step, archive, refresh, and approved dispatch control calls the
tenant-scoped workflow API and stores a record before it queues work.

This corrects the structural mismatch without misrepresenting a laptop-only
service as cloud capability. It is not yet a literal Paperclip `:3100` iframe,
Hermes SQLite board, Ruflo CLI graph, or local multi-model loop. Those exact
local implementations need their own hosted service/image or a behaviorally
equivalent, provider-specific adapter before their corresponding controls can
claim the same execution semantics.

## Hosted Paperclip Adapter Checkpoint (2026-08-08)

**Status:** deployed and proven end to end on `veloce-cloud-test`.

Revision `veloce-cloud-test-00104-2gt` (image `v73-hosted-paperclip`, release
`hosted-paperclip-20260808`) serves 100% of traffic. Signed-in evidence:

| Check | Evidence |
| --- | --- |
| Issue created | `VEL-9`, assigned to Bo Rivera on project Launch Site |
| Dispatch | `202 queued`, job `f1853207-c2d1-4dbd-ba3b-4ef6f4b46dc1`, run `0c9245a9-5539-4b1c-b524-421171d6d5ba` |
| Cloud Run Job | execution `veloce-cloud-test-workspace-qrg2n`, 15:39:12→15:39:27Z, succeeded=1 |
| Run settled | `succeeded`, openrouter / `google/gemini-3.1-flash-lite`, 15:39:19→15:39:23Z, inside the job window |
| Artifact | `fa2a0b55-745e-42f3-8bdc-e9235b123ee0`, 1286 bytes `text/html`, signed GCS download returns 200, contains no `<script>` |
| Issue lifecycle | `done` / `executionState: succeeded` / `hasBuild: true` |
| Agent heartbeat | Bo Rivera `lastHeartbeatAt` 15:39:23Z, status back to `idle` |
| Budget | 243 micros settled against the $1 cap; UI shows `$0.0002 of $0.60` |
| Gallery | one card, SHIPPED badge, live sandboxed preview of the generated artifact |

The run completed in about four seconds, faster than the first UI poll, so the
intermediate `queued`/`running` states were not directly observed in the browser;
the Cloud Run execution window and the run's own start/finish timestamps are the
evidence that the job lane actually did the work. A controlled failure was
separately proven locally (`task_runtime_not_configured` settling the run to
`failed` without stranding the issue).

### Controlled cloud failure (passed)

`VEL-10` was shipped with a description instructing the model to emit plain
prose. The provider complied, artifact validation rejected the output, and the
lane settled correctly:

| Check | Result |
| --- | --- |
| Run | `failed`, `workspace_artifact_invalid`, 18:41:01→18:41:03Z |
| Did not strand | never left `queued`/`running` |
| Issue | `blocked`, `executionState: failed`, `hasBuild: false`, no artifact |
| Budget | 0 micros charged; tenant spend unchanged at 243 |
| Stats | 3 runs / 1 succeeded / 2 failed / 33% |

That run exposed one defect, now fixed: the worker passed no summary on
failure, and the reconciliation function keeps the previous value when it
receives null, so a failed run still displayed "Queued for the approved hosted
runner". `settlePaperclipRun` now always derives a terminal summary through
`paperclipRunSummary`.

### Deletion drill (passed)

Run through the tenant API as a signed-in member:

| Check | Result |
| --- | --- |
| Issue delete | `200`; subsequent read `404 paperclip_issue_not_found` |
| Comment cascade | the issue's one comment went with it |
| Project delete | `200`; a referencing issue survived with `projectId` nulled |
| Agent delete | `200`; a referencing issue survived with `assigneeAgentId` nulled |
| Unauthenticated access | all six GET routes plus issue/run POST return `401` |

### Export and offboarding wiring (fixed)

Adding six tables without registering them left a real data-ownership hole:
`scripts/client-lifecycle.mjs` would have exported and offboarded a tenant while
silently dropping every Paperclip company, project, agent, issue, comment, and
run. All six are now in the lifecycle `tables` list, the explicit
`exportColumns` map, and the restore order.
`scripts/verify-client-runtime-isolation.mjs` now probes all six as well, and
its select column moved from `id` to `tenant_slug` because
`client_paperclip_companies` is keyed by slug and has no `id`.

`client_paperclip_issues.build_preview_html` is deliberately excluded from the
export: it duplicates an artifact already held in Cloud Storage, and
`build_artifact_id` is the durable reference.

### Still owed on Paperclip

- A real two-tenant isolation run and a service-role export/restore. Both
  scripts are wired and syntax-checked, but executing them needs a second
  tenant access token and `SUPABASE_SERVICE_ROLE_KEY`, which the porting work
  does not hold:
  `node scripts/verify-client-runtime-isolation.mjs --url <supabase-url> --tenant-a veloce-cloud-test --tenant-b <slug-b> --access-token-file-a <a> --access-token-file-b <b>`
  and `npm run client:lifecycle -- --slug veloce-cloud-test --mode export`.
- Splitting `ClientPaperclipWorkspace.tsx` (568 lines, over the 500-line rule).
- Agent-authored comments, label management, project lead assignment, run
  cancellation, and a screenshot-grade gallery thumbnail.

## Hosted Room Checkpoint (2026-08-09)

**Status:** deployed and proven end to end on `veloce-cloud-test`.

`/room` is the real Agent Room, not the shared workflow surface: a toggleable
roster, agents replying in turn, `@mention` narrowing, memory-context notices,
conversation history, and `NOTE::` / `PIPELINE::` side effects.

| Local room | Hosted equivalent |
| --- | --- |
| NDJSON stream, agent by agent | one queued round job; the worker appends each reply as it lands and advances `speaking_agent_id`, and the client polls |
| history as vault JSON + localStorage | `client_room_conversations` / `client_room_messages` under tenant RLS |
| seven personas on seven models | personas resolved against the tenant provider/model allowlist; an unapproved one stays visible but disabled with the real reason |
| Obsidian vault context | tenant `client_runtime_records` memory, shown in the same context pill |
| `NOTE::` writes a vault note, `PIPELINE::` writes a pipeline item | both create real tenant records through `create_client_runtime_record_worker`, visible on Memory and Pipeline |

**Signed-in evidence** on revision `veloce-cloud-test-00106-xvr`:

| Check | Evidence |
| --- | --- |
| Send | `202 queued`, round `00010c52…`, job `6585450a…` |
| Concurrent send | refused `409 room_round_already_active` |
| Turn-taking | Claude then Gemini; Gemini's reply opened "I agree with Claude, but…", so it genuinely read the prior turn |
| Memory context | pill listed real records; round 2 retrieved the memory round 1 had just created |
| `NOTE::` | created memory record `f95fcdea…`; the action pill's `linkedRecordId` matches that row |
| `@mention` | `@claude …` narrowed the round to Claude alone |
| Budget | 2864 micros for the two-agent round, 4912 total, well under the $1 cap |

The round finished inside the first 2.5s poll, so the intermediate
`speaking_agent_id` transitions were not observed in the browser; the durable
round row and per-message costs are the evidence that each turn ran separately.

**No Stop control.** A queued round cannot be cancelled mid-flight, so the
composer reports round progress rather than offering a control that would not
work. Adding one requires a real cancellation path in the job lane.

### Model diversity (2026-08-09)

The first smoke showed four of six personas resolving to the same
`google/gemini-3.1-flash-lite`, because the roster requested the provider
default — `providerModels[0]` — and the tenant allowlisted exactly one
OpenRouter model. Personas now carry a preferred model and fall back when it is
not allowlisted, and the tenant allowlist was widened to the models the local
room actually uses. One OpenRouter key reaches all of them; no new credential
was added.

| Persona | Model | in/out micros per 1k |
| --- | --- | --- |
| Claude | `claude-sonnet-5` (anthropic) | 2000 / 10000 |
| Hermes | `nousresearch/hermes-4-70b` | 13 / 40 |
| Gemini | `gemini-3.1-flash-lite` (direct) | 100 / 400 |
| Codex | `openai/gpt-4o-mini` | 15 / 60 |
| OpenClaw | `meta-llama/llama-3.3-70b-instruct` | 10 / 32 |
| GLM | `z-ai/glm-5.2` | 18 / 57 |

Pricing was taken from OpenRouter's live model list rather than estimated. That
check also found the manifest pricing `google/gemini-3.1-flash-lite` at 100/400
when the live rate is 25/150; the ledger was over-counting spend, so the $1 cap
tripped earlier than real usage warranted. Corrected to 25/150. The non-prefixed
`gemini-3.1-flash-lite` is the direct Google API — a different route with its
own pricing — and was left alone.

A model with no `modelPricing` entry is unusable: the estimate returns null and
the round fails `budget_exceeded`. Any future model must be added to
`modelAllowlist`, `providerModelAllowlist`, and `modelPricing` together.

### Still owed on Room

- A controlled cloud failure for a room round (provider error mid-round; the
  worker is written to continue the round and post an error pill, untested).
- Round cancellation, if a cancellation path is added to the job lane.
- Agent-to-agent addressing beyond `@mention`, and the local room's
  per-agent config overrides.

**Next surface: Pipeline.** Agent Kanban, Kanban, Loop, and Ruflo follow.

`/paperclip` no longer renders the shared orchestration workflow surface. It now
has a literal hosted Paperclip domain, built by reading the real local service's
contract rather than guessing at it:

| Local Paperclip (`:3100`) | Hosted equivalent |
| --- | --- |
| company: `issuePrefix`, `issueCounter`, budget/spend | `client_paperclip_companies`, one row per tenant, bootstrapped on first authenticated visit |
| projects | `client_paperclip_projects` |
| agents: role, icon, `reportsTo`, `adapterConfig`, budget, heartbeat | `client_paperclip_agents`, with the provider/model constrained to the tenant allowlist |
| issues: `identifier` (`VEL-1`), priority, status, assignee, project | `client_paperclip_issues`, identifiers allocated atomically by `allocate_client_paperclip_issue` |
| issue comments | `client_paperclip_comments` |
| heartbeat runs: status, timing, result, cost | `client_paperclip_runs`, one row per queued Cloud Run Job |
| `/builds/*.html` live page + image attachment | a committed tenant Cloud Storage artifact plus its sandboxed preview |

The seven local tabs — Builds, Issues, Active, Done, Org, Dashboard, Costs —
are reproduced, including the builds gallery's card composition, `SHIPPED`
badge, and hover-to-open behaviour. Every control performs a real hosted
operation: creating an issue writes a numbered tenant record, "Ship it" queues
a `workspace-execution` job through Cloud Tasks and the Cloud Run Job lane under
the provider allowlist and budget reservation, and the worker reconciles the run,
the issue lifecycle, the agent heartbeat, and the build artifact through the
token-verified `complete_client_paperclip_run_worker` function.

**Deliberate differences from local.** The gallery thumbnail is a sandboxed
render of the artifact rather than a screenshot attachment, because the hosted
lane has no headless browser; a build opens through a signed artifact download
rather than a public `/builds/` URL; and there is no "Open full" control, because
there is no laptop service to open. The build preview is rendered with scripts
stripped under a restrictive CSP, so provider-generated HTML can never reach the
tenant session.

**Deployment step that is easy to miss.** The `veloce-cloud-test` service's
`CLIENT_ALLOWED_API_ROUTES` does not yet list the Paperclip API prefix, and the
proxy blocks any API path outside that allowlist. The new surface will render
and then fail every call until the deploy adds:

```text
/api/client-runtime/paperclip
```

The in-repo defaults in `src/lib/clientRuntimePolicy.ts` and
`scripts/run-client-runtime-local.mjs` already include it; the deployed service
overrides both with its own explicit value, so it must be updated there too.

**Required before this can be called done:**

1. Apply `product-experience/supabase-client-paperclip.sql` to the tenant
   Supabase project. Until then the surface states plainly that the tables are
   missing instead of rendering an empty-but-healthy board. Verified against
   `veloce-cloud-test` on 2026-08-08: signed in, the surface renders all seven
   tabs and reports `paperclip_schema_missing` rather than an empty board.
2. Run the signed-in dogfood proof: create an issue, hire an agent, ship it, and
   retain the issue identifier, run row, Cloud Run execution, artifact, and
   PostHog event IDs together. Confirm `queued -> running -> succeeded` plus one
   controlled failure. This step must happen on Cloud Run. A local client-edition
   runtime cannot prove it: `enqueueClientRuntimeTask` rejects a loopback
   `CLIENT_RUNTIME_BASE_URL` with `task_base_url_not_public` and there is no GCP
   metadata identity off Cloud Run. Local runs prove the UI, the tenant data
   layer, the schema-missing state, and the controlled dispatch failure; the
   job/artifact lane is only provable in the deployed service.
3. Re-run the two-tenant isolation, export, deletion, and offboarding drills —
   six new persistent tables were introduced.
4. Confirm `CLIENT_ENABLED_CAPABILITIES` includes `orchestration` and that
   `CLIENT_PROVIDER_CALLS_ENABLED=1`, otherwise "Ship it" correctly refuses with
   `provider_calls_require_approval` instead of queueing.

**Left for later, deliberately:** agent-authored comments (the thread accepts
member notes today, and an agent-authored entry needs its own provenance and
audit rule); label management UI; project lead assignment; run cancellation,
which the current Cloud Run Job lane cannot honour mid-flight and so is not
offered as a control; and a screenshot-grade gallery thumbnail, which needs a
headless renderer in the worker image.

Room, Pipeline, Kanban, Agent Kanban, Loop, and Ruflo still use the shared
orchestration workflow surface and need the same treatment.
