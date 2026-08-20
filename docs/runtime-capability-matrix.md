# Runtime Capability Matrix

Updated 2026-08-12 after the tenant memory graph deployment, Groq activation,
and native context-compression pilot.
owner-cloud OpenRouter/Gemini activation checkpoint.

For the complete 13-layer business readiness assessment, shareability decision,
and tab-by-tab operator dependency inventory, see
[`docs/client-runtime-13-layer-readiness.md`](client-runtime-13-layer-readiness.md).

## Runtime boundary

| Runtime | Purpose | What it may use |
|---|---|---|
| `http://127.0.0.1:3939/` | Private operator edition | Personal CLI sessions, local vault/files, Ollama, local helper services, and operator credentials |
| `http://127.0.0.1:8082/` | Free Claude Code helper | A loopback `fcc-server` proxy used only by the local Free Claude Code route; it is not a product URL |
| Cloud Run `veloce-cloud-test` | Client-safe validation edition | Supabase Auth, approved provider APIs, client-scoped storage/secrets, and human approval policy |

The local `8082` helper is currently healthy. The Cloud Run runtime must never depend on it because a Cloud Run container cannot reach a service listening on the operator laptop.

## Dependency classes

### Client-safe now

- Mission Control home.
- Context intake, workflow requests, production briefs, and delivery review. These are Supabase-backed intake surfaces and do not need a model key to submit a request.
- Credentials status and catalogued provider submission to the client vault inbox, once the GCP inbox secret and IAM grant are configured. Submission does not activate a provider; promotion, manifest binding, and deployment are separate gates.
- Capabilities registry, when it contains only built-in capabilities with no operator destination.
- Tenant Memory Markdown/text import and Markdown export are deployed in the
  client runtime. Import stores the original source as a verified tenant
  artifact and creates a linked tenant memory record.
- The tenant memory knowledge map turns explicit Markdown `#tags` in active
  tenant memory records into document/tag nodes and source-linked edges. This
  is a bounded hosted memory feature, not Graphify AI extraction or semantic
  retrieval.

### Client-safe after provider API configuration and approval

These can be exposed only through server-side provider APIs, a per-client allowlist, a model allowlist, budgets, and approval gates. Keys remain in the client secret namespace and are never returned to the browser.

| Surface | Provider requirement currently represented in the UI |
|---|---|
| Claude | `ANTHROPIC_API_KEY` |
| Codex | `OPENAI_API_KEY` |
| OpenClaw, Hermes, Free Claude Code, Fusion | `OPENROUTER_API_KEY` or a reviewed replacement adapter |
| Sakana Fugu | `SAKANA_API_KEY` through the reviewed Sakana adapter |
| Antigravity | `GEMINI_API_KEY` |
| Kimi Code | `MOONSHOT_API_KEY` |
| GLM 5.2 and GLM Code | `GLM_API_KEY` |
| Grok Build | `XAI_API_KEY` |
| Web Studio | `OPENAI_API_KEY` or another approved model adapter |
| Flow Lab | `FIRECRAWL_API_KEY`, only for an authorized source workflow |
| Video, Music, Thumbnails | The specific media provider API, with output storage and budget controls. ElevenLabs speech, Suno music polling, and HeyGen video polling now have server-side queue adapters; image and broader production workflows remain gated. |
| Recorded microphone input | Groq `whisper-large-v3-turbo` through `/api/speech/transcribe`; the key remains server-side and audio is bounded before dispatch. Continuous wake-word/realtime loops remain browser/WebRTC-specific until a streaming provider contract is added. |

| Research provider | Placement | Current state |
|---|---|---|
| Firecrawl | Existing governed research worker | Default provider; existing cloud behavior unchanged |
| Brave Search API | Existing governed research worker | Native-enabled; Secret Manager binding, direct Brave smoke, durable citations, HTTPS/result bounds, and idempotency passed on owner-cloud |
| Native research router | Shared client research route + worker job metadata | Flag-gated deterministic selection: Brave for bounded search when approved/available, Firecrawl for content extraction, safe fallback otherwise; enabled on owner-cloud revision `00161-gc6` |
| Crawl4AI | Separate external Python/browser worker | Pinned reference-only; never selected automatically or bundled |
| Crawlee | Separate external Node crawler worker | Pinned reference-only; never selected automatically or bundled |
| Jina Reader | Separate hosted/open-source reader boundary | Pinned reference-only; never selected automatically or bundled |

The shared provider adapter also applies the server-manifest-controlled native
`context-compression` trait to provider-bound jobs. It is dependency-free,
deterministic, preserves authoritative content, and records only redacted
hash/count evidence. Local activation is configured by the client launcher;
owner-cloud evidence is revision `veloce-cloud-test-00148-xwg` with image digest
`sha256:b777a525336d237837acd642657733534feba86dd92ccd9822dc41366fdd8444`.
The license-reconciled Wave 4C/Wave 5 image is deployed as revision
`veloce-cloud-test-00157-cqk` with digest
`sha256:69bc95b8e4da1aab804e448817659e3388d6333ecb629ef1ed9a4135965a5521`;
authenticated smoke evidence for the current image is still pending. The
previous `00155-mhd` deployment remains historical evidence in the verification
report.

Adding one of these keys does not automatically enable the route. The implementation must stop using local CLI/filesystem calls, use the client provider API, write to tenant-scoped storage, and be added to that client manifest.

## Hosted replacement evidenced, full parity still gated

- Local and Local Engine routes use the hosted, queued API model workspace in
  the client edition. Scoped Gate 12 jobs proved the Local, Engine, and Free
  Claude adapters against reviewed `openrouter/free`; they do not expose
  Ollama, local files, or local agent execution. The current owner-cloud
  `veloce-cloud-test` revision enables provider calls for the approved
  Anthropic, OpenRouter, and Gemini/Antigravity lanes with exact model
  allowlists, pricing, and a $1 monthly test cap. Codex/OpenAI remains gated
  until a separate OpenAI API key and billing decision are approved.
- Open Design, Web Studio, Flow Lab, Agent Studio, OpenMontage, Game Studio,
  Thumbnail Studio, Integrations, Leads, Radar, and Build Guide now have a
  tenant-safe brief/request workspace. Provider generation, publishing, and
  account-connected actions remain separate approved adapters.

## Operator-only until adapted

### Native capability reference placement

The current reference portfolio is cataloged as architectural input and does
not change the client runtime by itself. Visual QA is the first owner-cloud
test adapter; GPU, security execution, communications, and worktree references
remain gated behind their own worker, approval, budget, and rollback evidence.
See the [V96 capability reference register](future-integrations/v96-capability-reference-register.md)
for source pins, placement, permissions, and evidence gates.

These currently rely on local infrastructure or personal operator state and therefore show a private dependency boundary in the client edition:

- Paperclip: local service at `localhost:3100` and local company/workspace data.
- The private 3939 Local Engine and local model execution: Ollama and local
  filesystem/agent execution remain operator-only; the client edition uses the
  hosted API replacement described above.
- The private 3939 Free Claude Code chat: local `fcc-server` on `8082` and
  the local Claude CLI remain operator-only. The client edition's separately
  approved OpenRouter free-model adapter passed the scoped smoke and is
  currently gated off with the rest of provider execution.
- Private Open Design and related local production services: local service at
  `127.0.0.1:7456` or local output paths. The client brief workspace does not
  expose those dependencies.
- Pipeline, Agent Kanban, Loop, and Ruflo: local files, local model/CLI execution, or operator vault state.
- SEO, Integrations, and Build Guide: current implementations expose operator configuration, local data, or source material that has not yet been reduced to a client-safe contract.

To move one of these into a client edition, build a separate adapter using Supabase/Cloud Storage/Cloud Tasks and provider APIs. Do not make the browser call a localhost service and do not copy the operator vault into the image.

## Cloud test configuration

The release-gate baseline for `veloce-cloud-test` intentionally proved
`tenant-data`, `orchestration`, `delivery`, and `quality` with provider calls
disabled. That remains the rollback-capable safety baseline.

The current owner-cloud checkpoint additionally enables `text-agents` for the
operator-owned test account only. It allowlists Supabase, Anthropic,
OpenRouter, and Gemini secrets, pins exact models, records pricing, and keeps
the monthly test cap at $1. This is a controlled activation step toward local
parity; it is not a claim that every local tab, CLI subscription, vault,
Ollama model, or personal tool is now cloud-safe.

The next safe expansion is still one adapter at a time: add its API contract,
tenant-scoped persistence, approval behavior, provider secret reference,
acceptance tests, and only then add the capability and route to a client
manifest.

## Native intent plane — 2026-08-13

| Surface | Local | Owner-cloud | Placement | Gate |
|---|---|---|---|---|
| Natural-language provider chat | Native-enabled | Manifest-enabled with same image | `intent-routing` preflight + provider worker | 0.78 classifier confidence; approval for review/external work |
| Ready playbooks library | Native-enabled | Client-ready read-only response | Integrations / skills route | Registry and manifest filtering |
| Specialized forms | Existing contracts | Existing contracts | Surface-specific routes | Unchanged |
| Visual QA, GPU, security execution, communications, worktrees, streaming speech | Gated | Gated | Isolated future workers | Separate evidence bundle |

## Content and copyright boundary

The Build Guide and any bundled third-party instructions should be reviewed before distributing them to clients. The client image should contain Veloce-authored guidance, links to upstream documentation, and client-owned material only. Do not ship private notes, copied vendor documentation, personal credentials, local paths, or source content that is not licensed for redistribution.
