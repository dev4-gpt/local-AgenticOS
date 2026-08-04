# Cloud Memory And Inference Options

**Status:** tenant Markdown import/export and deterministic, interactive visual
tag graph deployed and smoke-proven

**Last reviewed:** 2026-08-01

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
