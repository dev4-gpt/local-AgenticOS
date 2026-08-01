# LMCache: Future Inference Integration Option

**Status:** Research / deferred

**Last reviewed:** 2026-07-31

**Decision:** Do not add LMCache as a Veloce AgenticOS dependency or replace
Ollama with it on the current Mac. Preserve the option for a future,
self-hosted inference plane based on vLLM or SGLang if Veloce begins operating
long-context, high-concurrency, or multi-agent inference itself.

## Source links

### Original discovery

- [LinkedIn post by Avi Chawla](https://www.linkedin.com/posts/avi-chawla_cache-managementlayer-for-llm-apps-open-source-share-7487504869155766273-knub/?utm_source=share&utm_medium=member_ios&rcm=ACoAADHr_pcBiERSSKG8SPzBeWf3H5Kr8Xyhll8)

The LinkedIn page was not directly readable in the research pass, so the
identity of the project is inferred from the post slug and matching wording:
“cache management layer for LLM apps.” The project matching that description
is LMCache. Re-check the post before treating any claim made in the social post
as an authoritative benchmark or compatibility statement.

### Official project sources

- [LMCache documentation](https://docs.lmcache.ai/)
- [LMCache GitHub repository](https://github.com/LMCache/LMCache)
- [Installation guide](https://docs.lmcache.ai/getting_started/installation.html)
- [Quickstart](https://docs.lmcache.ai/getting_started/quickstart.html)
- [Integration guide](https://docs.lmcache.ai/developer_guide/integration.html)
- [Architecture overview](https://docs.lmcache.ai/developer_guide/architecture.html)
- [MacBook and CPU development guide](https://blog.lmcache.ai/en/2026/06/23/vllm-lmcache-a-starter-guide-no-gpu-required/)
- [NVIDIA Dynamo agentic-inference context](https://docs.nvidia.com/dynamo/dev/digest/agentic-inference)

## What LMCache is

LMCache is an inference-time **KV-cache management layer**. During prompt
processing, a transformer produces key/value tensors (KV) for the tokens it has
read. Those tensors are normally held inside the inference engine's working
memory and may be discarded when a request ends or when a worker evicts them.

LMCache makes those intermediate tensors reusable. It can store and retrieve
KV chunks across requests, sessions, engine processes, and—in the appropriate
deployment—multiple inference workers. A later request with a matching token
sequence can reuse the cached KV representation instead of recomputing the
same prompt prefix.

This targets workloads such as:

- multi-turn conversations with a long, growing shared prefix;
- coding agents that resend large system prompts, tool definitions, and history;
- RAG requests that repeatedly process the same documents;
- agent teams whose workers share system instructions or project context;
- long-context inference where prefill time and GPU memory are material costs;
- prefill/decode disaggregation and migration between inference workers.

The official documentation describes tiered storage across GPU memory, CPU
memory, local disk, and remote backends such as Redis/Valkey, S3-compatible
storage, Mooncake, and NIXL-backed systems. It also describes non-prefix reuse
through CacheBlend and cache transformations such as compression or custom
serialization.

## What LMCache is not

LMCache is not:

- a durable memory database for user facts, decisions, goals, or notes;
- a semantic search or embeddings system;
- a replacement for Obsidian, Graphify, Veloce Memory, Journal, or Goals;
- a response cache that safely returns an old answer for a new question;
- a middleware layer that can transparently accelerate any hosted model API;
- a substitute for prompt design, retrieval quality, routing, or evaluation.

The distinction matters for Veloce. Durable memory answers “what should the
system remember?” LMCache answers “which internal model computations can the
inference engine avoid repeating?” They are complementary layers, not
alternatives.

## Why it is relevant to Veloce

Veloce is an agentic operating layer with repeated context patterns:

1. An agent may send the same system instructions and tool definitions across
   many turns.
2. Agent Room may run several agents against overlapping user context.
3. Fusion, Loop, and coding workflows may repeatedly include long histories.
4. RAG-style workflows may revisit the same project or business documents.
5. A future hosted client runtime could serve many tenants with repeated
   approved system prefixes.

These are the same broad workload shapes for which KV reuse can be valuable.
However, the benefit appears only where Veloce controls the inference engine or
where the upstream model provider exposes an equivalent prompt-cache feature.

## Current Veloce architecture fit

### Local operator runtime

The current local model path uses Ollama's native `/api/chat` endpoint and can
optionally use an OpenAI-compatible MLX server. The local model is selected from
the already-warm Ollama process when possible, and requests use a bounded
`keep_alive` period.

Relevant implementation references:

- [`src/lib/localModel.ts`](../../src/lib/localModel.ts)
- [`src/app/api/local/chat/route.ts`](../../src/app/api/local/chat/route.ts)
- [`src/lib/localOllama.ts`](../../src/lib/localOllama.ts)

LMCache does not currently attach to this path. Its documented engine
integration is through vLLM and SGLang connectors, with TRT-LLM listed as a
future/coming integration in the official integration guide. Installing the
LMCache Python package beside the Next.js app would not make the Ollama
requests cacheable.

### Hosted and provider-backed runtime

Veloce also calls provider APIs and CLIs, including OpenRouter-backed routes.
For example, Fusion posts directly to OpenRouter's
`/api/v1/chat/completions` endpoint.

Relevant implementation reference:

- [`src/app/api/fusion/chat/route.ts`](../../src/app/api/fusion/chat/route.ts)

LMCache cannot access or manage the provider's internal KV cache in this mode.
The provider controls tokenization, model weights, cache placement, eviction,
and any provider-side prompt caching policy. Veloce can still improve reuse by
keeping stable prefixes stable and by using provider-native cache controls when
the provider supports them, but it cannot insert LMCache into a remote API call.

### Durable Veloce memory

Obsidian plus Graphify remain the durable knowledge system. That is the right
place for user-approved facts, decisions, goals, journals, project knowledge,
and agent outputs that should survive model changes and cache eviction.

LMCache should never become the source of truth for that information.

## Machine and deployment fit

The current project documentation describes the operator machine as an Apple
M3 Pro MacBook with 18 GB of memory and arm64/Metal acceleration. This is a
good fit for Ollama and MLX, which are already part of Veloce's local strategy.

The normal LMCache installation guide is oriented toward Linux, Python, and
accelerated inference environments. LMCache also documents a CPU/no-GPU
development path for MacBooks using `NO_GPU_EXT=1`, and a vLLM CPU experiment.
That makes experimentation possible, but it does not automatically make a
MacBook CPU deployment the best production inference path.

The practical trade-off on this machine is:

| Question | Current answer |
| --- | --- |
| Can we study or benchmark LMCache on macOS? | Yes, using its CPU/development path. |
| Can we drop it into the existing Ollama route? | No, not without changing the inference engine. |
| Should we replace Ollama with vLLM CPU now? | No; the added runtime and memory pressure are not justified. |
| Could it make sense on a dedicated server later? | Yes, if Veloce owns a vLLM/SGLang workload with measurable repetition. |
| Can it accelerate Claude/OpenRouter/Kimi requests? | No; those providers own their inference caches. |

## Possible future integration shape

The preferred architecture is to keep LMCache outside the Veloce web process:

```text
Veloce dashboard and orchestration
        |
        | OpenAI-compatible internal inference contract
        v
Veloce inference adapter / gateway
        |
        v
vLLM or SGLang worker(s) + LMCache connector
        |
        +--> GPU or CPU working memory
        +--> LMCache CPU/RAM tier
        +--> NVMe or approved remote cache tier
```

Veloce would own the control-plane concerns:

- selecting an approved backend and model;
- attaching tenant, session, agent, and workload metadata;
- applying budgets and concurrency limits;
- routing requests to a cache-local worker where possible;
- recording TTFT, cache hits, misses, token counts, and cost;
- enforcing retention, isolation, deletion, and shutdown policies.

The inference service would own the data-plane concerns:

- tokenization and model execution;
- KV chunk creation and injection;
- GPU/CPU/NVMe movement;
- cache eviction and persistence;
- engine-specific correctness and compatibility.

This separation protects Veloce from becoming coupled to Python, CUDA, vLLM,
or a particular accelerator while leaving room for a high-throughput backend.

## Integration options

### Option A: Do nothing now — recommended

Keep Ollama and MLX as the local paths, use provider-native caching where
available, and add telemetry before adding infrastructure.

**Pros:** no new dependency, no new daemon, no new model format, no memory
pressure, and no change to the current stable path.

**Cons:** repeated local prefill work remains inside Ollama, and Veloce cannot
share KV state across separate local inference workers.

### Option B: Benchmark LMCache separately on the Mac

Create a disposable Python environment outside the Veloce app and run the
official CPU/server benchmark or a tiny vLLM CPU experiment. Do not route normal
Veloce traffic through it during the experiment.

**Purpose:** establish whether the end-to-end latency and memory overhead are
interesting on Apple Silicon, not to declare production support.

**Gate:** preserve at least the project's documented storage headroom, cap the
model and context size, record idle and active memory, and remove the experiment
if it affects Ollama or general Mac responsiveness.

### Option C: Add an external self-hosted inference plane later

Run vLLM/SGLang + LMCache on a dedicated Linux/GPU host or a properly sized
private runtime. Veloce connects through a narrow, authenticated OpenAI-
compatible adapter.

**This becomes attractive when:** repeated long prompts dominate cost or TTFT,
there are multiple inference workers, cache-local routing matters, or a client
workload needs high concurrency.

### Option D: Put LMCache inside the Next.js app — reject

Do not embed the LMCache daemon, Python runtime, model server, and cache storage
inside the Veloce Next.js process. This would mix the control plane and the
inference data plane, complicate deployment, make failure recovery harder, and
provide no benefit for the hosted providers Veloce currently uses.

## Security and privacy considerations

KV caches are not ordinary harmless application cache entries. They are derived
from prompts and can carry information about system instructions, tools,
documents, and conversation context. Any future deployment must assume that a
cache entry is sensitive until proven otherwise.

Required controls:

- isolate cache namespaces by tenant, user, project, model, model revision, and
  tokenizer/runtime compatibility;
- never share KV blocks between tenants merely because token prefixes match;
- define TTL, eviction, clear, export, and offboarding behavior;
- encrypt remote cache transport and storage where remote tiers are used;
- avoid writing secrets or credentials into prompts in the first place;
- treat cache metrics and diagnostics as potentially sensitive metadata;
- keep cache management endpoints private and authenticated;
- test process restart, partial cache loss, model changes, and corrupted entries;
- fail safely to recomputation when a cache entry is incompatible or unavailable.

LMCache's ability to persist caches is a performance feature, not a memory
retention policy. Veloce's retention and deletion policy must remain authoritative.

## What Veloce should build before LMCache

The following small platform changes preserve the option without committing to
the runtime:

1. Define an internal `InferenceBackend` contract with `provider`, `model`,
   `baseUrl`, `stream`, `usage`, and capability metadata.
2. Add stable request metadata for `tenant`, `session`, `agent`, `workflow`, and
   `cachePolicy`, without placing secrets in the metadata.
3. Record `promptTokens`, `completionTokens`, `ttftMs`, `durationMs`, backend,
   model, and provider-reported cache usage when available.
4. Separate durable context retrieval from transient prompt assembly so the
   same context can be sent to different model backends.
5. Keep system prompts, tool definitions, and stable instructions at the front
   of requests and put fast-changing user content afterward.
6. Add a provider capability matrix for native prompt caching, streaming,
   tool-use, reasoning, and local/self-hosted inference.

These changes help immediately with observability and provider-side caching and
make a future LMCache adapter a bounded addition rather than an architectural
rewrite.

## Proof-of-value plan if revisited

Only revisit implementation after a real workload produces evidence. Use one
representative, non-sensitive benchmark with fixed model weights and fixed
tokenizer/runtime versions.

### Workload

- 10–20 repeated requests sharing a 10k–50k token prefix;
- a growing multi-turn agent history;
- a repeated RAG document set;
- one cold worker and one warm worker;
- single-worker and multi-worker routing if applicable.

### Compare

1. Existing Ollama or current hosted provider path.
2. A self-hosted vLLM/SGLang path without LMCache.
3. The same engine with LMCache in memory.
4. The same engine with the intended persistent tier.

### Required measurements

- time to first token;
- end-to-end latency;
- prompt prefill time;
- generation throughput;
- cache hit ratio and reused tokens;
- CPU, GPU, RAM, and disk usage;
- cold-start and restart behavior;
- cache read/write bandwidth;
- cost of the additional server and storage;
- correctness across model, tokenizer, and prompt changes.

### Minimum acceptance bar

Do not integrate unless the target workload shows a material improvement—such
as a repeatable TTFT reduction or increased useful throughput—that exceeds the
operational cost and complexity of the added inference plane. A benchmark that
only proves that the cache can store and retrieve tensors is not enough; it must
improve the actual Veloce workflow.

## Revisit triggers

Reopen this decision when one or more of these become true:

- Veloce operates its own vLLM or SGLang endpoint;
- one workflow repeatedly sends more than roughly 10k tokens of stable context;
- multiple inference workers are recomputing the same prefixes;
- TTFT becomes a user-visible problem in Agent Room, Fusion, Loop, or hosted
  client workflows;
- provider-side prompt caching is unavailable or too expensive for a measured
  workload;
- a dedicated Linux/GPU or properly sized private inference host is available;
- the team is prepared to own cache isolation, retention, observability, and
  rollback.

## Final decision

**Keep LMCache in the future-integration register. Do not install or wire it
into the current Veloce runtime.**

The right long-term role is an optional data-plane accelerator behind a stable
Veloce inference adapter. It should complement—not replace—Obsidian,
Graphify, Veloce memory, provider routing, and durable workflow state.
