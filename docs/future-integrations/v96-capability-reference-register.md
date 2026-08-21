# V96 Capability Reference Register

Updated 2026-08-21. These references are architectural inputs, not runtime
dependencies, plugins, marketplace entries, or permission grants. Every
licensed executable GitHub source is pinned in `src/lib/v96RepositoryCatalog.ts`;
unlicensed portfolio references are preserved in the starred-portfolio plan and
explicitly excluded from the executable catalog. External guides and services
use a dated reference and remain contract-only until their terms and behavior
are reviewed. Activation is explicit: native Veloce behavior is
`native-enabled`; an unexecuted boundary is `contract-active`; guidance is
`reference-only`; separate worker evidence is `externally-gated`.

| Reference | Placement | Runtime class | Status | Activation | Evidence gate |
| --- | --- | --- | --- | --- | --- |
| [Agent Skills](https://github.com/addyosmani/agent-skills) | Build, Quality, Review | dependency-free | cataloged | native-enabled | Local checker evidence |
| [FounderOS-DEMO](https://github.com/Bennettxai/FounderOS-DEMO) | Control Room | adapter | contract-only | contract-active | Tenant-safe approval adapter |
| [Semantica](https://github.com/semantica-agi/semantica) | Knowledge, Research | adapter | contract-only | contract-active | Graph isolation and deletion |
| [Wan2GP](https://github.com/deepbeepmeep/Wan2GP) | Media, GPU worker | gpu-worker | gated | externally-gated | Custom WanGP Community License 2.0, VRAM, cost, rollback, quality |
| [AI Builder Club skills](https://github.com/AI-Builder-Club/skills) | Build, Quality | dependency-free | portfolio-only | reference-only | No LICENSE at pinned source; excluded from executable catalog |
| [RAG-Anything](https://github.com/HKUDS/RAG-Anything) | Knowledge, Notebook | adapter | contract-only | contract-active | MIT at pinned source; multimodal provenance and retention |
| [Awesome GPU Engineering](https://github.com/goabiaryan/awesome-gpu-engineering) | GPU infrastructure | dependency-free | portfolio-only | reference-only | No LICENSE at pinned source; excluded from executable catalog |
| [Headroom](https://github.com/headroomlabs-ai/headroom) | Routing, Quality | adapter | pilot | native-enabled | Token, quality, and cost trace |
| [RAGFlow](https://github.com/infiniflow/ragflow) | Knowledge, Research | adapter | contract-only | contract-active | External-service tenant isolation |
| [Google agents-cli](https://github.com/google/agents-cli) | Operator Build | operator-worker | operator-only | Disposable worktree review |
| [Cognee](https://github.com/topoteretes/cognee) | Knowledge | adapter | contract-only | contract-active | Graph ownership and retention |
| [AI Engineering from Scratch](https://github.com/rohitg00/ai-engineering-from-scratch) | Engineering reference | dependency-free | cataloged | Reference review |
| [Company Research Agent](https://github.com/guy-hartstein/company-research-agent) | Research | adapter | contract-only | contract-active | Citation and confidence parity |
| [gstack](https://github.com/garrytan/gstack) | Operator Workspaces | operator-worker | operator-only | Bounded commands and discard |
| [AGENTS.md](https://github.com/agentsmd/agents.md) | Workspace provenance | dependency-free | cataloged | native-enabled | Instruction-scope review |
| [500 AI Agents Projects](https://github.com/ashishpatel26/500-AI-Agents-Projects) | Control Room discovery | dependency-free | cataloged | Use-case review |
| [Appsmith](https://github.com/appsmithorg/appsmith) | Operator Console | adapter | contract-only | Separate deployment and tenant auth |
| [FounderOS Agent Stack](https://founderos-agent-stack.vercel.app/) | Control Room reference | adapter | contract-only | Token-free contract review |
| [AI Loops guide](https://learnaiwithmariah.com/guides/ai-loops-worth-stealing/) | Orchestration reference | dependency-free | cataloged | native-enabled | Reference review |
| [Roboflow Supervision](https://github.com/roboflow/supervision) | Visual QA worker | operator-worker | gated | externally-gated | Fixed-fixture reproducibility |
| [Groq Speech-to-Text](https://console.groq.com/docs/speech-to-text) | All recorded microphone inputs | adapter | pilot | native-enabled | Server-only key, 25 MB bound, tenant auth, rate/budget evidence, local/cloud smoke |
| [Brave Search API](https://brave.com/search/api/) | Research, Knowledge | adapter | pilot | native-enabled | Server-only `BRAVE_API_KEY`; direct smoke passed on `00160-x4m`, automatic-routing smoke passed on `00161-gc6`, with max 3 HTTPS results and budget/citation/idempotency evidence |
| [Crawl4AI](https://github.com/unclecode/crawl4AI) | Research, Knowledge external worker | operator-worker | contract-only | contract-active | Veloce `v96-research-worker-v1` adapter is locally tested; isolated Python/browser worker, SSRF/egress, cost, citation, authenticated smoke, and rollback evidence still required |
| [Crawlee](https://github.com/apify/crawlee) | Research, Knowledge external worker | operator-worker | contract-only | contract-active | Veloce `v96-research-worker-v1` adapter is locally tested; isolated Node crawler, SSRF/egress, rate/budget, citation, authenticated smoke, and rollback evidence still required |
| [Jina Reader](https://github.com/jina-ai/reader) | Research, Knowledge isolated reader worker | operator-worker | pilot | contract-active | Owner-cloud worker active on `00164-8vh`; separate endpoint/secrets, direct extraction, Brave+Jina authenticated smoke, bounded citations, and replay identity passed; explicit tenant isolation, deletion lineage, and rollback evidence remain; never bundled |

## Placement rules

- Quality and routing references inform native traits and review policies.
- Knowledge and research references must preserve tenant ownership, citations,
  retention, and deletion lineage.
- GPU references remain outside the main Next.js image and require a separate
  cost/license/VRAM evidence bundle.
- Operator workers may use disposable worktrees or staging fixtures only after
  explicit scope and approval.
- A catalog entry never installs a runtime or grants tools; native activation
  means only the corresponding Veloce-owned trait/adapter is enabled.
- Query-string tokens, private credentials, cookies, local paths, and copied
  vendor documentation are not stored in this register.
- `cloudflared tunnel --url http://127.0.0.1:3939` is temporary local parity
  infrastructure only. The Cloud Tasks emulator is optional offline test
  infrastructure and is not the parity authority. Veloce never starts,
  installs, or persists a tunnel automatically.
- The three crawler entries are contract-active but disabled external workers.
  They cannot replace Firecrawl or Brave unless their server manifest entry is
  explicitly enabled after evidence, appear in no client-facing provider or
  worker selector, and are never included in the Next.js image.
