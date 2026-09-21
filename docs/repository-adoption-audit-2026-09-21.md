# Repository adoption audit — 21 September 2026

Companion to [the architecture and production plan](native-capability-and-edition-parity-plan-2026-09-21.md).

## Scope and interpretation

124 unique repositories: 121 in the supplied attachment plus MiroFish and the two explicitly linked free-API repositories. All 101 entries in the existing August 20 portfolio are covered. Groq is tracked as a provider separately, not counted as a repository.

This is an exhaustive inventory/disposition audit, not a full source-code, security or benchmark audit of 124 upstream projects. Existing metadata and gates are transcribed below; selected candidates received upstream documentation review. “Discovery” explicitly means suitability remains unverified. Existing license strings are snapshot metadata, not a new legal opinion or current license verification.

The original reasons are frequently generated from category and license rules rather than a documented individual rejection. A missing mapping is not evidence that a repository is inferior. Recommendations below are NEW planning judgments; they do not change runtime activation, grant permissions, certify production, or claim to be historical decisions.

P0 = reconcile/restore existing capability and evidence; P1 = low-incremental-cost candidate after acceptance; P2 = optional measured pilot; P3 = hold, discovery, or explicit specialist opt-in. Cost descriptions distinguish no new provider fee from zero total cost.

## Index

| # | Repository | Old 101 status | Proposed next step |
|---|---|---|---|
| 1 | [Autom8AI/Open-Higgsfield-AI](#repo-1) | outside old 101 | P2: Consolidate with one generative studio |
| 2 | [wide-trace/open-higgsfield](#repo-2) | outside old 101 | P2: Compare studio patterns; keep current vault/storage |
| 3 | [Orchestra-Research/AI-Research-SKILLs](#repo-3) | outside old 101 | P1: Selected research methods only |
| 4 | [getopenscreen/openscreen](#repo-4) | outside old 101 | P1: Local capture/import integration |
| 5 | [webadderallorg/Recordly](#repo-5) | outside old 101 | P2: Alternative recorder; choose one |
| 6 | [affaan-m/agentshield](#repo-6) | outside old 101 | P1: Scoped deterministic security checks |
| 7 | [affaan-m/JARVIS](#repo-7) | outside old 101 | P2: Discovery and overlap review |
| 8 | [affaan-m/claude-swarm](#repo-8) | outside old 101 | P2: Method comparison before orchestration install |
| 9 | [bilawalsidhu/gods-eye-view](#repo-9) | outside old 101 | P3: Discovery; no established core product requirement |
| 10 | [CoreBunch/Instatic](#repo-10) | outside old 101 | P3: Discovery; require a specific product gap |
| 11 | [deepseek-ai/deepseek-harness](#repo-11) | outside old 101 | P2: Discovery before adoption |
| 12 | [lucasrosati/claude-code-memory-setup](#repo-12) | outside old 101 | P2: Inspect scoped memory methods |
| 13 | [jamwithai/production-agentic-rag-course](#repo-13) | outside old 101 | P2: Reference and evaluation ideas first |
| 14 | [karpathy/autoresearch](#repo-14) | outside old 101 | P1: Adopt bounded experiment methodology |
| 15 | [OpenBMB/VoxCPM](#repo-15) | outside old 101 | P2: Optional local voice worker |
| 16 | [framepipe-dev/media-inference-worker](#repo-16) | outside old 101 | P2: Adapter candidate, not free inference |
| 17 | [novuhq/novu](#repo-17) | outside old 101 | P3: Defer replacement; evaluate notification gaps |
| 18 | [useplunk/plunk](#repo-18) | outside old 101 | P3: Defer replacement; preserve existing delivery |
| 19 | [yamadashy/repomix](#repo-19) | outside old 101 | P1: Expose existing operator context packing safely |
| 20 | [DigitalPlatDev/FreeDomain](#repo-20) | outside old 101 | P3: Reference only for optional domains |
| 21 | [D4Vinci/Scrapling](#repo-21) | reference-only | P1: Alternative extraction benchmark |
| 22 | [x1xhlol/system-prompts-and-models-of-ai-tools](#repo-22) | reference-only | P1: Select bounded quality methods |
| 23 | [multica-ai/andrej-karpathy-skills](#repo-23) | reference-only | P1: Select bounded quality methods |
| 24 | [ComposioHQ/awesome-claude-skills](#repo-24) | reference-only | P1: Select bounded quality methods |
| 25 | [travisvn/awesome-claude-skills](#repo-25) | reference-only | P1: Select bounded quality methods |
| 26 | [jina-ai/reader](#repo-26) | native-enabled | P0: Reconcile existing worker availability |
| 27 | [apify/crawlee](#repo-27) | contract-active | P1: Benchmark one isolated research worker |
| 28 | [unclecode/crawl4ai](#repo-28) | reference-only | P1: Benchmark one isolated research worker |
| 29 | [aman556/DevOps-System-Design](#repo-29) | reference-only | P1: Select bounded quality methods |
| 30 | [jj-vcs/jj](#repo-30) | reference-only | P2: Transfer routing/efficiency methods |
| 31 | [charlie947/social-media-skills](#repo-31) | reference-only | P1: Select bounded quality methods |
| 32 | [jhaizhou-ops/pinrule](#repo-32) | reference-only | P2: Transfer routing/efficiency methods |
| 33 | [appsmithorg/appsmith](#repo-33) | contract-active | P3: Keep reference until a specific gap is identified |
| 34 | [agentsmd/agents.md](#repo-34) | native-enabled | P1: Select bounded quality methods |
| 35 | [guy-hartstein/company-research-agent](#repo-35) | contract-active | P2: Bounded research adapter pilot |
| 36 | [garrytan/gstack](#repo-36) | externally-gated | P2: Reuse methods behind existing orchestration |
| 37 | [goabiaryan/awesome-gpu-engineering](#repo-37) | reference-only | P3: Keep reference until a specific gap is identified |
| 38 | [AI-Builder-Club/skills](#repo-38) | reference-only | P1: Select bounded quality methods |
| 39 | [deepbeepmeep/Wan2GP](#repo-39) | reference-only | P2: Optional local/hosted media worker |
| 40 | [semantica-agi/semantica](#repo-40) | contract-active | P2: One retrieval/context pilot |
| 41 | [Bennettxai/FounderOS-DEMO](#repo-41) | contract-active | P3: Keep reference until a specific gap is identified |
| 42 | [addyosmani/agent-skills](#repo-42) | native-enabled | P1: Select bounded quality methods |
| 43 | [lfnovo/open-notebook](#repo-43) | native-enabled | P2: One retrieval/context pilot |
| 44 | [petergyang/no-ai-slop](#repo-44) | native-enabled | P1: Select bounded quality methods |
| 45 | [ayghri/i-have-adhd](#repo-45) | native-enabled | P1: Select bounded quality methods |
| 46 | [every-app/open-seo](#repo-46) | externally-gated | P2: Bounded research adapter pilot |
| 47 | [usestrix/strix](#repo-47) | externally-gated | P3: Explicitly scoped security workflow only |
| 48 | [diegosouzapw/OmniRoute](#repo-48) | externally-gated | P2: Transfer routing/efficiency methods |
| 49 | [virgiliojr94/book-to-skill](#repo-49) | native-enabled | P3: Keep reference until a specific gap is identified |
| 50 | [Anil-matcha/Open-Generative-AI](#repo-50) | reference-only | P2: Reuse selected studio UX behind existing adapters |
| 51 | [roboflow/supervision](#repo-51) | externally-gated | P2: Optional local/hosted media worker |
| 52 | [ScrapeGraphAI/Scrapegraph-ai](#repo-52) | externally-gated | P2: Bounded research adapter pilot |
| 53 | [SkyworkAI/SkyReels-V2](#repo-53) | reference-only | P2: Optional local/hosted media worker |
| 54 | [SonarSource/sonarqube-cli](#repo-54) | reference-only | P1: Select bounded quality methods |
| 55 | [yc-software/qm](#repo-55) | reference-only | P2: Reuse methods behind existing orchestration |
| 56 | [shepherd-agents/shepherd](#repo-56) | reference-only | P2: Reuse methods behind existing orchestration |
| 57 | [headroomlabs-ai/headroom](#repo-57) | native-enabled | P1: Benchmark existing adaptation |
| 58 | [PrimeIntellect-ai/prime-agent](#repo-58) | reference-only | P2: Reuse methods behind existing orchestration |
| 59 | [diwenne/openreply](#repo-59) | reference-only | P3: Keep reference until a specific gap is identified |
| 60 | [msitarzewski/agency-agents](#repo-60) | native-enabled | P2: Reuse methods behind existing orchestration |
| 61 | [oblien/openship](#repo-61) | reference-only | P2: Reuse methods behind existing orchestration |
| 62 | [freshtechbro/claudedesignskills](#repo-62) | reference-only | P1: Select bounded quality methods |
| 63 | [codejunkie99/meridian-company-os](#repo-63) | reference-only | P3: Keep reference until a specific gap is identified |
| 64 | [0x4m4/hexstrike-ai](#repo-64) | reference-only | P3: Explicitly scoped security workflow only |
| 65 | [vxcontrol/pentagi](#repo-65) | reference-only | P3: Explicitly scoped security workflow only |
| 66 | [goclone-dev/goclone](#repo-66) | reference-only | P3: Keep reference until a specific gap is identified |
| 67 | [JCodesMore/ai-website-cloner-template](#repo-67) | reference-only | P3: Keep reference until a specific gap is identified |
| 68 | [spencergoldade/cursor-designer](#repo-68) | reference-only | P1: Select bounded quality methods |
| 69 | [maxbogo/awesome-ai-tools-for-ui](#repo-69) | reference-only | P1: Select bounded quality methods |
| 70 | [resemble-ai/chatterbox](#repo-70) | reference-only | P2: Optional local/hosted media worker |
| 71 | [cline/cline](#repo-71) | reference-only | P2: Reuse methods behind existing orchestration |
| 72 | [ItzCrazyKns/Vane](#repo-72) | reference-only | P2: Bounded research adapter pilot |
| 73 | [OpenHands/OpenHands](#repo-73) | reference-only | P2: Reuse methods behind existing orchestration |
| 74 | [calesthio/OpenMontage](#repo-74) | reference-only | P2: Optional local/hosted media worker |
| 75 | [duixcom/Duix-Avatar](#repo-75) | reference-only | P2: Optional local/hosted media worker |
| 76 | [Fincept-Corporation/FinceptTerminal](#repo-76) | reference-only | P3: Keep reference until a specific gap is identified |
| 77 | [Shubhamsaboo/awesome-llm-apps](#repo-77) | reference-only | P3: Keep reference until a specific gap is identified |
| 78 | [bradautomates/claude-video](#repo-78) | reference-only | P2: Optional local/hosted media worker |
| 79 | [HKUDS/RAG-Anything](#repo-79) | contract-active | P2: One retrieval/context pilot |
| 80 | [infiniflow/ragflow](#repo-80) | contract-active | P2: One retrieval/context pilot |
| 81 | [deepseek-ai/DeepSpec](#repo-81) | reference-only | P2: Transfer routing/efficiency methods |
| 82 | [alirezarezvani/claude-skills](#repo-82) | reference-only | P1: Select bounded quality methods |
| 83 | [DietrichGebert/ponytail](#repo-83) | native-enabled | P1: Select bounded quality methods |
| 84 | [google/agents-cli](#repo-84) | externally-gated | P3: Keep reference until a specific gap is identified |
| 85 | [InsForge/InsForge](#repo-85) | reference-only | P2: Reuse methods behind existing orchestration |
| 86 | [topoteretes/cognee](#repo-86) | contract-active | P2: One retrieval/context pilot |
| 87 | [VoltAgent/voltagent](#repo-87) | reference-only | P2: Reuse methods behind existing orchestration |
| 88 | [ashishpatel26/500-AI-Agents-Projects](#repo-88) | reference-only | P3: Keep reference until a specific gap is identified |
| 89 | [hoangsonww/Agentic-AI-Pipeline](#repo-89) | reference-only | P2: Reuse methods behind existing orchestration |
| 90 | [NirDiamant/agents-towards-production](#repo-90) | reference-only | P1: Select bounded quality methods |
| 91 | [elder-plinius/CL4R1T4S](#repo-91) | reference-only | P3: Keep reference until a specific gap is identified |
| 92 | [bytedance/deer-flow](#repo-92) | reference-only | P2: Reuse methods behind existing orchestration |
| 93 | [langchain-ai/deepagents](#repo-93) | reference-only | P2: Reuse methods behind existing orchestration |
| 94 | [firecrawl/firecrawl](#repo-94) | reference-only | P0: Separate API use from vendored-code licensing |
| 95 | [affaan-m/ECC](#repo-95) | reference-only | P0: Restore and verify existing integration |
| 96 | [rohitg00/ai-engineering-from-scratch](#repo-96) | reference-only | P3: Keep reference until a specific gap is identified |
| 97 | [harry0703/MoneyPrinterTurbo](#repo-97) | reference-only | P2: Optional local/hosted media worker |
| 98 | [Giskard-AI/giskard-oss](#repo-98) | reference-only | P1: Deterministic evaluation first |
| 99 | [0ldh/claude-code-agents-orchestra](#repo-99) | reference-only | P3: Keep reference until a specific gap is identified |
| 100 | [katanemo/plano](#repo-100) | reference-only | P2: Transfer routing/efficiency methods |
| 101 | [sickn33/agentic-awesome-skills](#repo-101) | reference-only | P1: Select bounded quality methods |
| 102 | [ruvnet/ruflo](#repo-102) | reference-only | P2: Reuse methods behind existing orchestration |
| 103 | [Arindam200/reddit-mcp](#repo-103) | reference-only | P2: Bounded research adapter pilot |
| 104 | [Arindam200/awesome-ai-apps](#repo-104) | reference-only | P1: Select bounded quality methods |
| 105 | [vercel-labs/zerolang](#repo-105) | reference-only | P2: Transfer routing/efficiency methods |
| 106 | [Graphify-Labs/graphify](#repo-106) | reference-only | P1: Code-only local context pilot |
| 107 | [OpenBMB/ChatDev](#repo-107) | reference-only | P2: Reuse methods behind existing orchestration |
| 108 | [NousResearch/hermes-paperclip-adapter](#repo-108) | reference-only | P2: Reuse methods behind existing orchestration |
| 109 | [NousResearch/hermes-agent](#repo-109) | reference-only | P2: Reuse methods behind existing orchestration |
| 110 | [paperclipai/paperclip](#repo-110) | reference-only | P2: Reuse methods behind existing orchestration |
| 111 | [WeaveMindAI/weft](#repo-111) | reference-only | P3: Keep reference until a specific gap is identified |
| 112 | [kyegomez/OpenMythos](#repo-112) | reference-only | P3: Keep reference until a specific gap is identified |
| 113 | [MadAppGang/claudish](#repo-113) | reference-only | P2: Reuse methods behind existing orchestration |
| 114 | [google-research/timesfm](#repo-114) | reference-only | P2: One retrieval/context pilot |
| 115 | [sipeed/picoclaw](#repo-115) | reference-only | P2: Reuse methods behind existing orchestration |
| 116 | [codecrafters-io/build-your-own-x](#repo-116) | reference-only | P1: Select bounded quality methods |
| 117 | [donnemartin/system-design-primer](#repo-117) | reference-only | P1: Select bounded quality methods |
| 118 | [jasontang-ai/Context-Engineering](#repo-118) | reference-only | P1: Select context assembly methods |
| 119 | [wshobson/agents](#repo-119) | reference-only | P1: Select and deduplicate role methods |
| 120 | [Zie619/n8n-workflows](#repo-120) | reference-only | P2: Reuse methods behind existing orchestration |
| 121 | [huggingface/agents-course](#repo-121) | reference-only | P3: Keep reference until a specific gap is identified |
| 122 | [666ghj/MiroFish](#repo-122) | outside old 101 | P1: Shared GTM methodology; simulation remains optional |
| 123 | [open-free-llm-api/awesome-freellm-apis](#repo-123) | outside old 101 | P1: Operator-reviewed provider discovery |
| 124 | [tashfeenahmed/freellmapi](#repo-124) | outside old 101 | P3: Do not use as default production dependency |

<a id="repo-1"></a>

## 1. Autom8AI/Open-Higgsfield-AI

[Upstream repository](https://github.com/Autom8AI/Open-Higgsfield-AI)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: not recorded in the old inventory; a discovery review is required.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P2 — Consolidate with one generative studio.** Fork overlaps Open-Generative-AI. Select useful UX components/methods, not an additional full studio runtime.

Incremental cost: Muapi/provider inference is not made free by open source.

Promotion gate: Fork/license/assets provenance, feature delta and existing-provider adapter.

<a id="repo-2"></a>

## 2. wide-trace/open-higgsfield

[Upstream repository](https://github.com/wide-trace/open-higgsfield)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: not recorded in the old inventory; a discovery review is required.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P2 — Compare studio patterns; keep current vault/storage.** Separate generation application using remote API and storage. Reuse a superior workflow only after side-by-side evaluation.

Incremental cost: Generation and storage may cost; avoid mandatory new services.

Promotion gate: Provider contract, secret handling, asset license and artifact round-trip.

<a id="repo-3"></a>

## 3. Orchestra-Research/AI-Research-SKILLs

[Upstream repository](https://github.com/Orchestra-Research/AI-Research-SKILLs)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: not recorded in the old inventory; a discovery review is required.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P1 — Selected research methods only.** Curated guidance can be mapped into existing tasks. Do not import every instruction/tool or grant execution permissions implicitly.

Incremental cost: No required service for selected methods; token/review costs.

Promotion gate: License and instruction provenance, deduplication and task-specific eval.

<a id="repo-4"></a>

## 4. getopenscreen/openscreen

[Upstream repository](https://github.com/getopenscreen/openscreen)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: User-operated capture consent, tenant-owned artifact import, malware/SBOM scan, render-worker isolation, storage-retention, budget, deletion, and rollback evidence.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P1 — Local capture/import integration.** Promising local screen-recording workflow: start with file import/export into the shared studio, then explicit local connector. Not a cloud browser recording service.

Incremental cost: Local disk/CPU; OS permissions and packaging effort.

Promotion gate: Pinned license, capture consent, OS support and import/export quality.

<a id="repo-5"></a>

## 5. webadderallorg/Recordly

[Upstream repository](https://github.com/webadderallorg/Recordly)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Written AGPL/SaaS legal approval, attribution decision, source-disclosure plan, user-operated capture consent, tenant-artifact isolation, SBOM, deletion, and rollback evidence.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P2 — Alternative recorder; choose one.** Overlaps OpenScreen. Assess intended AGPL use mode and feature advantage; do not bundle two recorders by default.

Incremental cost: Local compute/packaging and license obligations.

Promotion gate: License/use-mode decision plus actual advantage over selected capture tool.

<a id="repo-6"></a>

## 6. affaan-m/agentshield

[Upstream repository](https://github.com/affaan-m/agentshield)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: not recorded in the old inventory; a discovery review is required.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P1 — Scoped deterministic security checks.** Use project-scoped static configuration checks first; avoid scanning unrelated home configuration or enabling optional model review.

Incremental cost: CI/local CPU; optional model review excluded.

Promotion gate: Pinned source, explicit paths, secret redaction, finding precision and no accidental upload.

<a id="repo-7"></a>

## 7. affaan-m/JARVIS

[Upstream repository](https://github.com/affaan-m/JARVIS)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: not recorded in the old inventory; a discovery review is required.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P2 — Discovery and overlap review.** New attachment entry; no pinned source/security audit here. Compare specific behaviors with existing ECC/agent surfaces before another runtime.

Incremental cost: Unknown; assess inference, host access and services.

Promotion gate: License, permissions, overlap and representative task benchmark.

<a id="repo-8"></a>

## 8. affaan-m/claude-swarm

[Upstream repository](https://github.com/affaan-m/claude-swarm)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: not recorded in the old inventory; a discovery review is required.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P2 — Method comparison before orchestration install.** New attachment entry; candidate coordination methods may overlap current orchestration. No full integration evidence collected.

Incremental cost: Potential extra model calls and concurrency.

Promotion gate: Pinned license, checkpoint/idempotency/approval semantics and measured benefit.

<a id="repo-9"></a>

## 9. bilawalsidhu/gods-eye-view

[Upstream repository](https://github.com/bilawalsidhu/gods-eye-view)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: not recorded in the old inventory; a discovery review is required.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P3 — Discovery; no established core product requirement.** New entry lacking a pinned capability/security evaluation in this audit. Do not auto-enable broad data access based on a repository listing.

Incremental cost: Unknown.

Promotion gate: Source/license, legitimate data sources, permissions and concrete product need.

<a id="repo-10"></a>

## 10. CoreBunch/Instatic

[Upstream repository](https://github.com/CoreBunch/Instatic)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: not recorded in the old inventory; a discovery review is required.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P3 — Discovery; require a specific product gap.** New entry with no verified integration mapping here; suitability and dependencies remain unassessed.

Incremental cost: Unknown.

Promotion gate: Pinned source/license, use case, dependencies and superiority evidence.

<a id="repo-11"></a>

## 11. deepseek-ai/deepseek-harness

[Upstream repository](https://github.com/deepseek-ai/deepseek-harness)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: not recorded in the old inventory; a discovery review is required.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P2 — Discovery before adoption.** New attachment entry not represented in the old portfolio. No pinned source/compatibility audit completed here; do not infer fitness from its name.

Incremental cost: Unknown until runtime/model requirements are inspected.

Promotion gate: Pinned source, license, actual capability delta and bounded evaluation.

<a id="repo-12"></a>

## 12. lucasrosati/claude-code-memory-setup

[Upstream repository](https://github.com/lucasrosati/claude-code-memory-setup)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: not recorded in the old inventory; a discovery review is required.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P2 — Inspect scoped memory methods.** New entry; do not automatically import machine-level configuration. Prefer selective, reversible context methods after review.

Incremental cost: Unknown full setup; methods may fit existing infrastructure.

Promotion gate: Source/license review, file scope, delete/rollback and memory quality.

<a id="repo-13"></a>

## 13. jamwithai/production-agentic-rag-course

[Upstream repository](https://github.com/jamwithai/production-agentic-rag-course)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: not recorded in the old inventory; a discovery review is required.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P2 — Reference and evaluation ideas first.** Educational material can inform tests; a course entry is not a deployed retrieval product. No full source audit completed.

Incremental cost: Reading/method use versus runnable examples assessed separately.

Promotion gate: Attribution/license and concrete missing retrieval test or behavior.

<a id="repo-14"></a>

## 14. karpathy/autoresearch

[Upstream repository](https://github.com/karpathy/autoresearch)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: not recorded in the old inventory; a discovery review is required.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P1 — Adopt bounded experiment methodology.** Transfer baseline, fixed budget, holdout and keep/revert discipline. Full upstream GPU training loop is not required for GTM.

Incremental cost: Method has no new service; real training/inference costs separately.

Promotion gate: Reproducible objective, budget, holdout, rollback and no fabricated results.

<a id="repo-15"></a>

## 15. OpenBMB/VoxCPM

[Upstream repository](https://github.com/OpenBMB/VoxCPM)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: not recorded in the old inventory; a discovery review is required.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P2 — Optional local voice worker.** Treat code, model weights, voice rights and hardware separately. Existing governance mentions this family but that is not a certified customer runtime.

Incremental cost: Model downloads, local memory/compute or hosted inference.

Promotion gate: Pinned model terms, hardware envelope, consent and voice quality/latency.

<a id="repo-16"></a>

## 16. framepipe-dev/media-inference-worker

[Upstream repository](https://github.com/framepipe-dev/media-inference-worker)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: not recorded in the old inventory; a discovery review is required.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P2 — Adapter candidate, not free inference.** A client/worker wrapper does not supply free model compute. Map only if it simplifies an existing media provider integration.

Incremental cost: Underlying provider/local inference and storage.

Promotion gate: Provider compatibility, retries/cancellation, artifact validation and measured integration benefit.

<a id="repo-17"></a>

## 17. novuhq/novu

[Upstream repository](https://github.com/novuhq/novu)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Provider failure handling, tenant retention, delivery audit, and rollback evidence.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P3 — Defer replacement; evaluate notification gaps.** Potential additional platform overlaps delivery. Need a missing user journey before adding another stateful system; detailed source review pending.

Incremental cost: Hosting, delivery provider and operational cost not established.

Promotion gate: Feature gap, intended license mode, delivery semantics and migration cost.

<a id="repo-18"></a>

## 18. useplunk/plunk

[Upstream repository](https://github.com/useplunk/plunk)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Deliverability, tenant isolation, bounce handling, legal retention, and rollback evidence.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P3 — Defer replacement; preserve existing delivery.** Email platform adoption would add deliverability and operations work; not necessary merely to raise repo count.

Incremental cost: Mail provider/hosting/deliverability costs.

Promotion gate: Unmet delivery need, license/terms, consent/unsubscribe and migration evidence.

<a id="repo-19"></a>

## 19. yamadashy/repomix

[Upstream repository](https://github.com/yamadashy/repomix)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: Operator and CI context bundles only; customer-private context requires an explicit reviewed export.
- Recorded activation evidence: Context compression and instruction-budget suites.
- Existing reason/gate: Token-count, compression parity, and secret-exclusion evidence; never pack customer-private data by default.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P1 — Expose existing operator context packing safely.** Not in the old 101, but catalog already calls it native for operator/CI context bundles. Tenant use requires selected files, preview and explicit export.

Incremental cost: Local CPU; larger generated prompts can increase token use.

Promotion gate: Ignore secrets, size caps, tenant scope, preview and export consent.

<a id="repo-20"></a>

## 20. DigitalPlatDev/FreeDomain

[Upstream repository](https://github.com/DigitalPlatDev/FreeDomain)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: not recorded in the old inventory; a discovery review is required.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P3 — Reference only for optional domains.** A domain program is not an OS capability or production reliability guarantee. No reason to replace established product identity from this inventory alone.

Incremental cost: Eligibility/renewal/security obligations require verification.

Promotion gate: Current terms, renewal/control and concrete customer need.

<a id="repo-21"></a>

## 21. D4Vinci/Scrapling

[Upstream repository](https://github.com/D4Vinci/Scrapling)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: cb00f1bba8f5ab91a454c2b2c87d0018fc66e6ae; license BSD-3-Clause (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: URL policy, SSRF/egress controls, citation parity, rate limits, budget, deletion lineage, and rollback.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P1 — Alternative extraction benchmark.** Reference label does not demonstrate inferiority. Compare adaptive extraction on permitted sources against the chosen crawler.

Incremental cost: CPU/browser compute and maintenance.

Promotion gate: Pinned dependency/license review, source permission, SSRF controls and measured extraction gain.

<a id="repo-22"></a>

## 22. x1xhlol/system-prompts-and-models-of-ai-tools

[Upstream repository](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: 1e4203a7d88873c1b37ab2d1c07074fea498c274; license GPL-3.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Focused contract tests, redacted evidence, permission review, and rollback mapping.
- Existing safety note: license requires non-vendoring/legal review; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-23"></a>

## 23. multica-ai/andrej-karpathy-skills

[Upstream repository](https://github.com/multica-ai/andrej-karpathy-skills)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: 2c606141936f1eeef17fa3043a72095b4765b9c2; license NOASSERTION (missing).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Focused contract tests, redacted evidence, permission review, and rollback mapping.
- Existing safety note: license requires non-vendoring/legal review; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-24"></a>

## 24. ComposioHQ/awesome-claude-skills

[Upstream repository](https://github.com/ComposioHQ/awesome-claude-skills)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: be2a406907dbc61b73e6827ded415c96139d13a2; license NOASSERTION (missing).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Focused contract tests, redacted evidence, permission review, and rollback mapping.
- Existing safety note: license requires non-vendoring/legal review; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-25"></a>

## 25. travisvn/awesome-claude-skills

[Upstream repository](https://github.com/travisvn/awesome-claude-skills)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: 1da55aa810f206d3fe2005e7e3989b15a275d942; license NOASSERTION (missing).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Focused contract tests, redacted evidence, permission review, and rollback mapping.
- Existing safety note: license requires non-vendoring/legal review; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-26"></a>

## 26. jina-ai/reader

[Upstream repository](https://github.com/jina-ai/reader)

- Recorded state: native-enabled; readiness ledger: source-tests-cloud-evidence-stale.
- Snapshot provenance: 1574bfd380d249c86c82db4dace0d9c8fe17e2b1; license Apache-2.0 (confirmed).
- Catalog mapping: Veloce v96 research-worker-v1 extraction adapter with an isolated Jina Reader Cloud Run worker.
- Recorded activation evidence: Owner-cloud revision veloce-cloud-test-00168-h5t; authenticated Brave→Jina worker smoke; budget reservation/settlement; two-tenant isolation; deletion lineage; and disable/restore rollback evidence.
- Existing reason/gate: Hosted boundary review, tenant isolation, provider terms, citation parity, rate/budget evidence, and rollback.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P0 — Reconcile existing worker availability.** Catalog native status conflicts with an empty research-worker configuration in the audited tenant; a recorded adapter is not an active worker.

Incremental cost: Hosted API limits or self-hosted compute; measure chosen mode.

Promotion gate: Tenant worker configuration, URL/SSRF policy, live citations, budget and deletion.

<a id="repo-27"></a>

## 27. apify/crawlee

[Upstream repository](https://github.com/apify/crawlee)

- Recorded state: contract-active; readiness ledger: contract-static-only.
- Snapshot provenance: b0e828ae4c30920ccbab095847f3b2191caf5001; license Apache-2.0 (confirmed).
- Catalog mapping: Veloce v96 research-worker-v1 extraction adapter and deterministic worker router.
- Recorded activation evidence: tests/research-worker-adapters.spec.ts; external worker smoke still required.
- Existing reason/gate: Isolated Node crawler worker, SSRF and egress controls, rate/budget review, citation parity, and rollback evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P1 — Benchmark one isolated research worker.** Contract exists; actual external worker smoke is still a separate requirement. TypeScript fit makes it a reasonable first candidate, not a proven winner.

Incremental cost: Self-hosted CPU/browser work; no mandatory new SaaS proposed.

Promotion gate: Bounded crawl benchmark, citation provenance, cancellation, resource caps and worker smoke.

<a id="repo-28"></a>

## 28. unclecode/crawl4ai

[Upstream repository](https://github.com/unclecode/crawl4ai)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 7e801521428ee12509994d39151006f64055ebe3; license Apache-2.0 (confirmed).
- Catalog mapping: Veloce v96 research-worker-v1 extraction adapter and deterministic worker router.
- Recorded activation evidence: tests/research-worker-adapters.spec.ts; external worker smoke still required.
- Existing reason/gate: URL policy, SSRF/egress controls, citation parity, rate limits, budget, deletion lineage, and rollback.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

- Registry discrepancy: catalog says **contract-active**, portfolio says **reference-only**. Reconcile case-insensitive identity and license/use-mode policy; do not blindly promote.

Recommendation: **P1 — Benchmark one isolated research worker.** Exact-case source URL lookup loses its contract-active catalog match. Repair identity independently of runtime activation; compare against Crawlee/Scrapling, do not deploy three by default.

Incremental cost: CPU/browser memory and maintenance; optional model calls separately.

Promotion gate: Pinned license, bounded crawl, SSRF/redirect/DNS controls, extraction accuracy, tenant isolation.

<a id="repo-29"></a>

## 29. aman556/DevOps-System-Design

[Upstream repository](https://github.com/aman556/DevOps-System-Design)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: 119dcea7b82ef62746b7308d36b8be8bee4338dd; license NOASSERTION (missing).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Focused contract tests, redacted evidence, permission review, and rollback mapping.
- Existing safety note: license requires non-vendoring/legal review; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-30"></a>

## 30. jj-vcs/jj

[Upstream repository](https://github.com/jj-vcs/jj)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 7007d08537a872dd708f112e2b289ca5a681c692; license Apache-2.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Allowlist, deterministic fallback, budget trace, redacted route evidence, and quality parity.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Transfer routing/efficiency methods.** Keep a single accountable provider router. Evaluate useful policy or optimization without forwarding secrets to an unreviewed proxy.

Incremental cost: Proxy/compute and model costs depend on mode.

Promotion gate: Allowlist, privacy, fallback cost ceiling, route traces and quality parity.

<a id="repo-31"></a>

## 31. charlie947/social-media-skills

[Upstream repository](https://github.com/charlie947/social-media-skills)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 69d9488e880cceaf418329dfa64b44b9bf022174; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Focused contract tests, redacted evidence, permission review, and rollback mapping.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-32"></a>

## 32. jhaizhou-ops/pinrule

[Upstream repository](https://github.com/jhaizhou-ops/pinrule)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 2aa78c30c73c8d562db2a39730c1a8e12a5d5293; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Allowlist, deterministic fallback, budget trace, redacted route evidence, and quality parity.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Transfer routing/efficiency methods.** Keep a single accountable provider router. Evaluate useful policy or optimization without forwarding secrets to an unreviewed proxy.

Incremental cost: Proxy/compute and model costs depend on mode.

Promotion gate: Allowlist, privacy, fallback cost ceiling, route traces and quality parity.

<a id="repo-33"></a>

## 33. appsmithorg/appsmith

[Upstream repository](https://github.com/appsmithorg/appsmith)

- Recorded state: contract-active; readiness ledger: contract-static-only.
- Snapshot provenance: 5c89c11224a65952e10dd9f5dc1eaad68a18da3b; license Apache-2.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Separate deployment and tenant auth review.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P3 — Keep reference until a specific gap is identified.** The stored category is often a name-based default, not a documented rejection. Identify an actual reusable behavior before installing anything.

Incremental cost: Unknown for full runtime; static reference has no provider fee.

Promotion gate: Source/license review, product need and comparison with existing implementation.

<a id="repo-34"></a>

## 34. agentsmd/agents.md

[Upstream repository](https://github.com/agentsmd/agents.md)

- Recorded state: native-enabled; readiness ledger: source-tests-cloud-evidence-stale.
- Snapshot provenance: d1ac7f063d20e70015ed6732664049ae4ba9d74e; license MIT (confirmed).
- Catalog mapping: Veloce workspace provenance and instruction-scope validation.
- Recorded activation evidence: Focused contract and workspace policy suites.
- Existing reason/gate: Instruction scope and permission review.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-35"></a>

## 35. guy-hartstein/company-research-agent

[Upstream repository](https://github.com/guy-hartstein/company-research-agent)

- Recorded state: contract-active; readiness ledger: contract-static-only.
- Snapshot provenance: 52c904c8169f0a36ee8c1de46d5745aee731a0b4; license Apache-2.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Citation, confidence, and source-policy parity.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Bounded research adapter pilot.** Map the useful retrieval/output behavior into existing research contracts; external worker or API availability is a separate gate.

Incremental cost: CPU/API quotas; model extraction may add inference.

Promotion gate: URL/egress/SSRF safety, provenance, rate/budget caps and real extraction smoke.

<a id="repo-36"></a>

## 36. garrytan/gstack

[Upstream repository](https://github.com/garrytan/gstack)

- Recorded state: externally-gated; readiness ledger: pilot-isolated-worker.
- Snapshot provenance: 51932eceef9cf45ad5fbf2b19e15615f96df2872; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Disposable worktree and bounded command evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Reuse methods behind existing orchestration.** Avoid a second scheduler/state store just to activate the repository. Map useful roles, checkpoints or task contracts into the current runtime first.

Incremental cost: Methods may fit existing budget; full runtimes add inference/ops.

Promotion gate: Approval, idempotency, resumability, tenant scope and outcome benchmark.

<a id="repo-37"></a>

## 37. goabiaryan/awesome-gpu-engineering

[Upstream repository](https://github.com/goabiaryan/awesome-gpu-engineering)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: bb8cf16e32a780dd84e2fb1184e2b4695ed0e3b6; license NOASSERTION (missing).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: License, provenance, behavior review, permission review, and explicit adoption decision.
- Existing safety note: license requires non-vendoring/legal review; no runtime activation implied by catalog presence.

Recommendation: **P3 — Keep reference until a specific gap is identified.** The stored category is often a name-based default, not a documented rejection. Identify an actual reusable behavior before installing anything.

Incremental cost: Unknown for full runtime; static reference has no provider fee.

Promotion gate: Source/license review, product need and comparison with existing implementation.

<a id="repo-38"></a>

## 38. AI-Builder-Club/skills

[Upstream repository](https://github.com/AI-Builder-Club/skills)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: d4cd90f5915b10412595733a0fbdca96f65115b1; license NOASSERTION (missing).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Focused contract tests, redacted evidence, permission review, and rollback mapping.
- Existing safety note: license requires non-vendoring/legal review; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-39"></a>

## 39. deepbeepmeep/Wan2GP

[Upstream repository](https://github.com/deepbeepmeep/Wan2GP)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: 022622cfa4ccc0058fcdac8c4f03d3224b43e009; license NOASSERTION (unresolved).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: GPU cost, custom-license review, VRAM, rollback, and quality bundle.
- Existing safety note: license requires non-vendoring/legal review; execution remains separately gated.

- Registry discrepancy: catalog says **externally-gated**, portfolio says **reference-only**. Reconcile case-insensitive identity and license/use-mode policy; do not blindly promote.

Recommendation: **P2 — Optional local/hosted media worker.** Open-source application code does not establish free inference or rights to model weights/assets. Reuse UI/methods independently where useful.

Incremental cost: Hardware, inference, storage and packaging.

Promotion gate: Code/model/assets terms, resource budget, consent and artifact quality.

<a id="repo-40"></a>

## 40. semantica-agi/semantica

[Upstream repository](https://github.com/semantica-agi/semantica)

- Recorded state: contract-active; readiness ledger: contract-static-only.
- Snapshot provenance: 58b77ddcf56df2e257014f18b206b3920fdd2818; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Tenant graph isolation and deletion lineage.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — One retrieval/context pilot.** Compare against current notebook/context stack. Do not deploy several overlapping graph/retrieval databases simultaneously.

Incremental cost: Storage/embedding/model/worker costs depend on chosen mode.

Promotion gate: Citation accuracy, retention/deletion, tenant isolation and retrieval benchmark.

<a id="repo-41"></a>

## 41. Bennettxai/FounderOS-DEMO

[Upstream repository](https://github.com/Bennettxai/FounderOS-DEMO)

- Recorded state: contract-active; readiness ledger: contract-static-only.
- Snapshot provenance: 7b1260857232ee9ac9ad4b0c709a6f231b22a0de; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Tenant-safe adapter and approval evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P3 — Keep reference until a specific gap is identified.** The stored category is often a name-based default, not a documented rejection. Identify an actual reusable behavior before installing anything.

Incremental cost: Unknown for full runtime; static reference has no provider fee.

Promotion gate: Source/license review, product need and comparison with existing implementation.

<a id="repo-42"></a>

## 42. addyosmani/agent-skills

[Upstream repository](https://github.com/addyosmani/agent-skills)

- Recorded state: native-enabled; readiness ledger: source-tests-cloud-evidence-stale.
- Snapshot provenance: df1edb2e05487d0aa6d93c747141e0aed1187f25; license MIT (confirmed).
- Catalog mapping: Veloce output-quality and reviewed-plan policies.
- Recorded activation evidence: Focused capability and quality suites.
- Existing reason/gate: Contract review and local checker evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-43"></a>

## 43. lfnovo/open-notebook

[Upstream repository](https://github.com/lfnovo/open-notebook)

- Recorded state: native-enabled; readiness ledger: source-tests-cloud-evidence-stale.
- Snapshot provenance: a7de90d38aaf18ee85fd661854d35c11e44613e2; license MIT (confirmed).
- Catalog mapping: Existing Veloce native capability policy.
- Recorded activation evidence: Existing focused capability evidence.
- Existing reason/gate: Existing capability evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — One retrieval/context pilot.** Compare against current notebook/context stack. Do not deploy several overlapping graph/retrieval databases simultaneously.

Incremental cost: Storage/embedding/model/worker costs depend on chosen mode.

Promotion gate: Citation accuracy, retention/deletion, tenant isolation and retrieval benchmark.

<a id="repo-44"></a>

## 44. petergyang/no-ai-slop

[Upstream repository](https://github.com/petergyang/no-ai-slop)

- Recorded state: native-enabled; readiness ledger: source-tests-cloud-evidence-stale.
- Snapshot provenance: d30eddb9e04562234f2070b5ee63ca4649d9a05e; license MIT (confirmed).
- Catalog mapping: Existing Veloce native capability policy.
- Recorded activation evidence: Existing focused capability evidence.
- Existing reason/gate: Existing capability evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-45"></a>

## 45. ayghri/i-have-adhd

[Upstream repository](https://github.com/ayghri/i-have-adhd)

- Recorded state: native-enabled; readiness ledger: source-tests-cloud-evidence-stale.
- Snapshot provenance: e7555fcaf612dfa1739dc86610ea926a906db614; license MIT (confirmed).
- Catalog mapping: Existing Veloce native capability policy.
- Recorded activation evidence: Existing focused capability evidence.
- Existing reason/gate: Existing capability evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-46"></a>

## 46. every-app/open-seo

[Upstream repository](https://github.com/every-app/open-seo)

- Recorded state: externally-gated; readiness ledger: contract-static-only.
- Snapshot provenance: cd6a782092556d6f7a0e3ab1cdb66a4dada30e28; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Existing capability evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Bounded research adapter pilot.** Map the useful retrieval/output behavior into existing research contracts; external worker or API availability is a separate gate.

Incremental cost: CPU/API quotas; model extraction may add inference.

Promotion gate: URL/egress/SSRF safety, provenance, rate/budget caps and real extraction smoke.

<a id="repo-47"></a>

## 47. usestrix/strix

[Upstream repository](https://github.com/usestrix/strix)

- Recorded state: externally-gated; readiness ledger: pilot-isolated-worker.
- Snapshot provenance: 6f88b7d7d5b6f57833b73a5384079e229e21aa2f; license Apache-2.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Existing capability evidence.
- Existing safety note: license metadata resolved from GitHub; execution remains separately gated.

Recommendation: **P3 — Explicitly scoped security workflow only.** High-privilege or active scanning must not become a default client capability. Passive methods may be separately reviewed.

Incremental cost: Sandbox/compute/inference and security operations.

Promotion gate: Authorized targets, least privilege, isolation, logs and bounded execution.

<a id="repo-48"></a>

## 48. diegosouzapw/OmniRoute

[Upstream repository](https://github.com/diegosouzapw/OmniRoute)

- Recorded state: externally-gated; readiness ledger: contract-static-only.
- Snapshot provenance: 41ffb08e4a4a4f14e8178641c7874712789a038d; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Existing capability evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Transfer routing/efficiency methods.** Keep a single accountable provider router. Evaluate useful policy or optimization without forwarding secrets to an unreviewed proxy.

Incremental cost: Proxy/compute and model costs depend on mode.

Promotion gate: Allowlist, privacy, fallback cost ceiling, route traces and quality parity.

<a id="repo-49"></a>

## 49. virgiliojr94/book-to-skill

[Upstream repository](https://github.com/virgiliojr94/book-to-skill)

- Recorded state: native-enabled; readiness ledger: source-tests-cloud-evidence-stale.
- Snapshot provenance: 3a97a7115ab3c82edf47f315b544fbcefdd8559c; license MIT (confirmed).
- Catalog mapping: Existing Veloce native capability policy.
- Recorded activation evidence: Existing focused capability evidence.
- Existing reason/gate: Existing capability evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P3 — Keep reference until a specific gap is identified.** The stored category is often a name-based default, not a documented rejection. Identify an actual reusable behavior before installing anything.

Incremental cost: Unknown for full runtime; static reference has no provider fee.

Promotion gate: Source/license review, product need and comparison with existing implementation.

<a id="repo-50"></a>

## 50. Anil-matcha/Open-Generative-AI

[Upstream repository](https://github.com/Anil-matcha/Open-Generative-AI)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 2bbee22d534b10b148b358ea3edba52afab794c4; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Provider license, artifact ownership, fixture quality, cost/VRAM bounds, approval, and rollback.
- Existing safety note: license metadata resolved from GitHub; execution remains separately gated.

- Registry discrepancy: catalog says **externally-gated**, portfolio says **reference-only**. Reconcile case-insensitive identity and license/use-mode policy; do not blindly promote.

Recommendation: **P2 — Reuse selected studio UX behind existing adapters.** Case-sensitive catalog mismatch hides an externally-gated entry. UI/model-catalog patterns can be adopted separately from Muapi/local-model execution. Do not copy browser key storage into hosted product.

Incremental cost: Provider inference or local hardware; optional storage.

Promotion gate: License/assets review, server-side keys, compatible model capabilities and media artifacts.

<a id="repo-51"></a>

## 51. roboflow/supervision

[Upstream repository](https://github.com/roboflow/supervision)

- Recorded state: externally-gated; readiness ledger: pilot-isolated-worker.
- Snapshot provenance: 31738b2293a09129341bd95331cdcbcbae313ca3; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Existing capability evidence.
- Existing safety note: license metadata resolved from GitHub; execution remains separately gated.

Recommendation: **P2 — Optional local/hosted media worker.** Open-source application code does not establish free inference or rights to model weights/assets. Reuse UI/methods independently where useful.

Incremental cost: Hardware, inference, storage and packaging.

Promotion gate: Code/model/assets terms, resource budget, consent and artifact quality.

<a id="repo-52"></a>

## 52. ScrapeGraphAI/Scrapegraph-ai

[Upstream repository](https://github.com/ScrapeGraphAI/Scrapegraph-ai)

- Recorded state: externally-gated; readiness ledger: contract-static-only.
- Snapshot provenance: bc73824b9c6d8afc6058138484e9926499fe37cf; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Existing capability evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Bounded research adapter pilot.** Map the useful retrieval/output behavior into existing research contracts; external worker or API availability is a separate gate.

Incremental cost: CPU/API quotas; model extraction may add inference.

Promotion gate: URL/egress/SSRF safety, provenance, rate/budget caps and real extraction smoke.

<a id="repo-53"></a>

## 53. SkyworkAI/SkyReels-V2

[Upstream repository](https://github.com/SkyworkAI/SkyReels-V2)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: 9351d13152207cc04de780e055346b08ade0b851; license NOASSERTION (unresolved).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Provider license, artifact ownership, fixture quality, cost/VRAM bounds, approval, and rollback.
- Existing safety note: license requires non-vendoring/legal review; execution remains separately gated.

- Registry discrepancy: catalog says **externally-gated**, portfolio says **reference-only**. Reconcile case-insensitive identity and license/use-mode policy; do not blindly promote.

Recommendation: **P2 — Optional local/hosted media worker.** Open-source application code does not establish free inference or rights to model weights/assets. Reuse UI/methods independently where useful.

Incremental cost: Hardware, inference, storage and packaging.

Promotion gate: Code/model/assets terms, resource budget, consent and artifact quality.

<a id="repo-54"></a>

## 54. SonarSource/sonarqube-cli

[Upstream repository](https://github.com/SonarSource/sonarqube-cli)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: 222ba3e8919fee5cc078b70b4a7d0ad502d94305; license NOASSERTION (unresolved).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Existing capability evidence.
- Existing safety note: license requires non-vendoring/legal review; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-55"></a>

## 55. yc-software/qm

[Upstream repository](https://github.com/yc-software/qm)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 568252bd4e6da5288b239573abef972f3e16b3f9; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Existing capability evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Reuse methods behind existing orchestration.** Avoid a second scheduler/state store just to activate the repository. Map useful roles, checkpoints or task contracts into the current runtime first.

Incremental cost: Methods may fit existing budget; full runtimes add inference/ops.

Promotion gate: Approval, idempotency, resumability, tenant scope and outcome benchmark.

<a id="repo-56"></a>

## 56. shepherd-agents/shepherd

[Upstream repository](https://github.com/shepherd-agents/shepherd)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 4b44f4e8822a919a74b4bf9c13d9370dbf4cd9be; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Existing capability evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Reuse methods behind existing orchestration.** Avoid a second scheduler/state store just to activate the repository. Map useful roles, checkpoints or task contracts into the current runtime first.

Incremental cost: Methods may fit existing budget; full runtimes add inference/ops.

Promotion gate: Approval, idempotency, resumability, tenant scope and outcome benchmark.

<a id="repo-57"></a>

## 57. headroomlabs-ai/headroom

[Upstream repository](https://github.com/headroomlabs-ai/headroom)

- Recorded state: native-enabled; readiness ledger: source-tests-cloud-evidence-stale.
- Snapshot provenance: b88b9078d8eda7b91e1543b33fa44d793869afa6; license Apache-2.0 (confirmed).
- Catalog mapping: Veloce dependency-free context-compression routing trait.
- Recorded activation evidence: Compression contract suite plus authenticated local/cloud provider smoke.
- Existing reason/gate: Quality parity, token savings, and cost trace.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P1 — Benchmark existing adaptation.** Already labelled native, but adapted compression is not installation of the full upstream proxy. Improve only if our held-out evaluations win.

Incremental cost: Existing deterministic CPU work; model/proxy options separate.

Promotion gate: Token reduction with no material answer/citation loss; latency and rollback.

<a id="repo-58"></a>

## 58. PrimeIntellect-ai/prime-agent

[Upstream repository](https://github.com/PrimeIntellect-ai/prime-agent)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: af0b8e00b9f704e834787fd321065ca78281f2aa; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Existing capability evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Reuse methods behind existing orchestration.** Avoid a second scheduler/state store just to activate the repository. Map useful roles, checkpoints or task contracts into the current runtime first.

Incremental cost: Methods may fit existing budget; full runtimes add inference/ops.

Promotion gate: Approval, idempotency, resumability, tenant scope and outcome benchmark.

<a id="repo-59"></a>

## 59. diwenne/openreply

[Upstream repository](https://github.com/diwenne/openreply)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 80fa38780e2973a0299c05019bc0d0657044220c; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: License, provenance, behavior review, permission review, and explicit adoption decision.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P3 — Keep reference until a specific gap is identified.** The stored category is often a name-based default, not a documented rejection. Identify an actual reusable behavior before installing anything.

Incremental cost: Unknown for full runtime; static reference has no provider fee.

Promotion gate: Source/license review, product need and comparison with existing implementation.

<a id="repo-60"></a>

## 60. msitarzewski/agency-agents

[Upstream repository](https://github.com/msitarzewski/agency-agents)

- Recorded state: native-enabled; readiness ledger: source-tests-cloud-evidence-stale.
- Snapshot provenance: ebe9c99acb5c96f9468de368d8bead775387d1a7; license MIT (confirmed).
- Catalog mapping: Existing Veloce native capability policy.
- Recorded activation evidence: Existing focused capability evidence.
- Existing reason/gate: Existing capability evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Reuse methods behind existing orchestration.** Avoid a second scheduler/state store just to activate the repository. Map useful roles, checkpoints or task contracts into the current runtime first.

Incremental cost: Methods may fit existing budget; full runtimes add inference/ops.

Promotion gate: Approval, idempotency, resumability, tenant scope and outcome benchmark.

<a id="repo-61"></a>

## 61. oblien/openship

[Upstream repository](https://github.com/oblien/openship)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 92fffe4f7291969fc65ac067b85018d414561a2a; license Apache-2.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Bounded plan, checkpoint, idempotency, approval, tenant isolation, and disposable execution evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Reuse methods behind existing orchestration.** Avoid a second scheduler/state store just to activate the repository. Map useful roles, checkpoints or task contracts into the current runtime first.

Incremental cost: Methods may fit existing budget; full runtimes add inference/ops.

Promotion gate: Approval, idempotency, resumability, tenant scope and outcome benchmark.

<a id="repo-62"></a>

## 62. freshtechbro/claudedesignskills

[Upstream repository](https://github.com/freshtechbro/claudedesignskills)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 1da73febff0c3e1dfefc07f8a5ef8f7d1dfdb6cd; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Focused contract tests, redacted evidence, permission review, and rollback mapping.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-63"></a>

## 63. codejunkie99/meridian-company-os

[Upstream repository](https://github.com/codejunkie99/meridian-company-os)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 79309eb13bdcad5ea76d3fc56b1a42bd80c01302; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: License, provenance, behavior review, permission review, and explicit adoption decision.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P3 — Keep reference until a specific gap is identified.** The stored category is often a name-based default, not a documented rejection. Identify an actual reusable behavior before installing anything.

Incremental cost: Unknown for full runtime; static reference has no provider fee.

Promotion gate: Source/license review, product need and comparison with existing implementation.

<a id="repo-64"></a>

## 64. 0x4m4/hexstrike-ai

[Upstream repository](https://github.com/0x4m4/hexstrike-ai)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: d689933ff579d839c676c82b231f8e98326c5f04; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Explicit staging target, signed scope, egress allowlist, maintenance window, approval, cleanup, and rollback.
- Existing safety note: license metadata resolved from GitHub; execution remains separately gated.

Recommendation: **P3 — Explicitly scoped security workflow only.** High-privilege or active scanning must not become a default client capability. Passive methods may be separately reviewed.

Incremental cost: Sandbox/compute/inference and security operations.

Promotion gate: Authorized targets, least privilege, isolation, logs and bounded execution.

<a id="repo-65"></a>

## 65. vxcontrol/pentagi

[Upstream repository](https://github.com/vxcontrol/pentagi)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: ea665308baaff015b226f308438a68d929d0f29b; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Explicit staging target, signed scope, egress allowlist, maintenance window, approval, cleanup, and rollback.
- Existing safety note: license metadata resolved from GitHub; execution remains separately gated.

Recommendation: **P3 — Explicitly scoped security workflow only.** High-privilege or active scanning must not become a default client capability. Passive methods may be separately reviewed.

Incremental cost: Sandbox/compute/inference and security operations.

Promotion gate: Authorized targets, least privilege, isolation, logs and bounded execution.

<a id="repo-66"></a>

## 66. goclone-dev/goclone

[Upstream repository](https://github.com/goclone-dev/goclone)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 1fcaa12f76dc1af09422470d550fed82f3cc7e9d; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: License, provenance, behavior review, permission review, and explicit adoption decision.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P3 — Keep reference until a specific gap is identified.** The stored category is often a name-based default, not a documented rejection. Identify an actual reusable behavior before installing anything.

Incremental cost: Unknown for full runtime; static reference has no provider fee.

Promotion gate: Source/license review, product need and comparison with existing implementation.

<a id="repo-67"></a>

## 67. JCodesMore/ai-website-cloner-template

[Upstream repository](https://github.com/JCodesMore/ai-website-cloner-template)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 92872bc40ced2c5edb4d5dc9fd3970d40c77f4ca; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: License, provenance, behavior review, permission review, and explicit adoption decision.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P3 — Keep reference until a specific gap is identified.** The stored category is often a name-based default, not a documented rejection. Identify an actual reusable behavior before installing anything.

Incremental cost: Unknown for full runtime; static reference has no provider fee.

Promotion gate: Source/license review, product need and comparison with existing implementation.

<a id="repo-68"></a>

## 68. spencergoldade/cursor-designer

[Upstream repository](https://github.com/spencergoldade/cursor-designer)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: 30b15ac1d67a7cdc0986f3a20ceb91943e683cec; license GPL-3.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Focused contract tests, redacted evidence, permission review, and rollback mapping.
- Existing safety note: license requires non-vendoring/legal review; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-69"></a>

## 69. maxbogo/awesome-ai-tools-for-ui

[Upstream repository](https://github.com/maxbogo/awesome-ai-tools-for-ui)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: f26e77e58791e3a64b08a7ef2b249afe506405cd; license NOASSERTION (missing).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Focused contract tests, redacted evidence, permission review, and rollback mapping.
- Existing safety note: license requires non-vendoring/legal review; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-70"></a>

## 70. resemble-ai/chatterbox

[Upstream repository](https://github.com/resemble-ai/chatterbox)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 5de7a54aa4e5e2baadb0182dde554908b48b85c2; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Provider license, artifact ownership, fixture quality, cost/VRAM bounds, approval, and rollback.
- Existing safety note: license metadata resolved from GitHub; execution remains separately gated.

Recommendation: **P2 — Optional local/hosted media worker.** Open-source application code does not establish free inference or rights to model weights/assets. Reuse UI/methods independently where useful.

Incremental cost: Hardware, inference, storage and packaging.

Promotion gate: Code/model/assets terms, resource budget, consent and artifact quality.

<a id="repo-71"></a>

## 71. cline/cline

[Upstream repository](https://github.com/cline/cline)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 16875140fbc7bae51aad79c203837b4f51e54aa5; license Apache-2.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Bounded plan, checkpoint, idempotency, approval, tenant isolation, and disposable execution evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Reuse methods behind existing orchestration.** Avoid a second scheduler/state store just to activate the repository. Map useful roles, checkpoints or task contracts into the current runtime first.

Incremental cost: Methods may fit existing budget; full runtimes add inference/ops.

Promotion gate: Approval, idempotency, resumability, tenant scope and outcome benchmark.

<a id="repo-72"></a>

## 72. ItzCrazyKns/Vane

[Upstream repository](https://github.com/ItzCrazyKns/Vane)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 7dc5d088f7262fbc5e39037f84940a8a2193c5fb; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: URL policy, SSRF/egress controls, citation parity, rate limits, budget, deletion lineage, and rollback.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Bounded research adapter pilot.** Map the useful retrieval/output behavior into existing research contracts; external worker or API availability is a separate gate.

Incremental cost: CPU/API quotas; model extraction may add inference.

Promotion gate: URL/egress/SSRF safety, provenance, rate/budget caps and real extraction smoke.

<a id="repo-73"></a>

## 73. OpenHands/OpenHands

[Upstream repository](https://github.com/OpenHands/OpenHands)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: f2dd33090592f8777e3f2d1a519ddb44866e595e; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Bounded plan, checkpoint, idempotency, approval, tenant isolation, and disposable execution evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Reuse methods behind existing orchestration.** Avoid a second scheduler/state store just to activate the repository. Map useful roles, checkpoints or task contracts into the current runtime first.

Incremental cost: Methods may fit existing budget; full runtimes add inference/ops.

Promotion gate: Approval, idempotency, resumability, tenant scope and outcome benchmark.

<a id="repo-74"></a>

## 74. calesthio/OpenMontage

[Upstream repository](https://github.com/calesthio/OpenMontage)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: 1bab711820828c2e5fc1f87ed274a32587cb048f; license AGPL-3.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Provider license, artifact ownership, fixture quality, cost/VRAM bounds, approval, and rollback.
- Existing safety note: license requires non-vendoring/legal review; execution remains separately gated.

Recommendation: **P2 — Optional local/hosted media worker.** Open-source application code does not establish free inference or rights to model weights/assets. Reuse UI/methods independently where useful.

Incremental cost: Hardware, inference, storage and packaging.

Promotion gate: Code/model/assets terms, resource budget, consent and artifact quality.

<a id="repo-75"></a>

## 75. duixcom/Duix-Avatar

[Upstream repository](https://github.com/duixcom/Duix-Avatar)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: 1328feb5871448c8fa3d0e45b3bbc87e7c1d458a; license NOASSERTION (unresolved).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Provider license, artifact ownership, fixture quality, cost/VRAM bounds, approval, and rollback.
- Existing safety note: license requires non-vendoring/legal review; execution remains separately gated.

Recommendation: **P2 — Optional local/hosted media worker.** Open-source application code does not establish free inference or rights to model weights/assets. Reuse UI/methods independently where useful.

Incremental cost: Hardware, inference, storage and packaging.

Promotion gate: Code/model/assets terms, resource budget, consent and artifact quality.

<a id="repo-76"></a>

## 76. Fincept-Corporation/FinceptTerminal

[Upstream repository](https://github.com/Fincept-Corporation/FinceptTerminal)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: c388a881628cdb3c5bbdd5f35a8511abd69f47b7; license NOASSERTION (unresolved).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: License, provenance, behavior review, permission review, and explicit adoption decision.
- Existing safety note: license requires non-vendoring/legal review; no runtime activation implied by catalog presence.

Recommendation: **P3 — Keep reference until a specific gap is identified.** The stored category is often a name-based default, not a documented rejection. Identify an actual reusable behavior before installing anything.

Incremental cost: Unknown for full runtime; static reference has no provider fee.

Promotion gate: Source/license review, product need and comparison with existing implementation.

<a id="repo-77"></a>

## 77. Shubhamsaboo/awesome-llm-apps

[Upstream repository](https://github.com/Shubhamsaboo/awesome-llm-apps)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 813a55e1a6a80d2329b55287b4f33cbf661538ea; license Apache-2.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: License, provenance, behavior review, permission review, and explicit adoption decision.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P3 — Keep reference until a specific gap is identified.** The stored category is often a name-based default, not a documented rejection. Identify an actual reusable behavior before installing anything.

Incremental cost: Unknown for full runtime; static reference has no provider fee.

Promotion gate: Source/license review, product need and comparison with existing implementation.

<a id="repo-78"></a>

## 78. bradautomates/claude-video

[Upstream repository](https://github.com/bradautomates/claude-video)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 83da59fa78c3eee9e20f515fe75c438bb5166efd; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Provider license, artifact ownership, fixture quality, cost/VRAM bounds, approval, and rollback.
- Existing safety note: license metadata resolved from GitHub; execution remains separately gated.

Recommendation: **P2 — Optional local/hosted media worker.** Open-source application code does not establish free inference or rights to model weights/assets. Reuse UI/methods independently where useful.

Incremental cost: Hardware, inference, storage and packaging.

Promotion gate: Code/model/assets terms, resource budget, consent and artifact quality.

<a id="repo-79"></a>

## 79. HKUDS/RAG-Anything

[Upstream repository](https://github.com/HKUDS/RAG-Anything)

- Recorded state: contract-active; readiness ledger: contract-static-only.
- Snapshot provenance: d8cdaa66c074a6351b9ee6ab1dd54f43bb56e436; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Multimodal provenance and retention evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — One retrieval/context pilot.** Compare against current notebook/context stack. Do not deploy several overlapping graph/retrieval databases simultaneously.

Incremental cost: Storage/embedding/model/worker costs depend on chosen mode.

Promotion gate: Citation accuracy, retention/deletion, tenant isolation and retrieval benchmark.

<a id="repo-80"></a>

## 80. infiniflow/ragflow

[Upstream repository](https://github.com/infiniflow/ragflow)

- Recorded state: contract-active; readiness ledger: contract-static-only.
- Snapshot provenance: 618c4599b10e792a5eaf3dee9c1cbe7c741c4803; license Apache-2.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: External-service tenant isolation and export/delete evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — One retrieval/context pilot.** Compare against current notebook/context stack. Do not deploy several overlapping graph/retrieval databases simultaneously.

Incremental cost: Storage/embedding/model/worker costs depend on chosen mode.

Promotion gate: Citation accuracy, retention/deletion, tenant isolation and retrieval benchmark.

<a id="repo-81"></a>

## 81. deepseek-ai/DeepSpec

[Upstream repository](https://github.com/deepseek-ai/DeepSpec)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 005e03b81cec38b7da6399833d609ee89a2587f2; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Allowlist, deterministic fallback, budget trace, redacted route evidence, and quality parity.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Transfer routing/efficiency methods.** Keep a single accountable provider router. Evaluate useful policy or optimization without forwarding secrets to an unreviewed proxy.

Incremental cost: Proxy/compute and model costs depend on mode.

Promotion gate: Allowlist, privacy, fallback cost ceiling, route traces and quality parity.

<a id="repo-82"></a>

## 82. alirezarezvani/claude-skills

[Upstream repository](https://github.com/alirezarezvani/claude-skills)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: aa8d778811a557a2c28ccadda4cf3d0bd028a4cc; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Focused contract tests, redacted evidence, permission review, and rollback mapping.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-83"></a>

## 83. DietrichGebert/ponytail

[Upstream repository](https://github.com/DietrichGebert/ponytail)

- Recorded state: native-enabled; readiness ledger: source-tests-cloud-evidence-stale.
- Snapshot provenance: 2ed6c52c9d7e5e56942508591085fd45dea277d3; license MIT (confirmed).
- Catalog mapping: Veloce detectLoopSpin plus ponytailRestraintVerdict in loopCostLedger.
- Recorded activation evidence: tests/loop-registry.spec.ts — anti-spin and Ponytail restraint decisions.
- Existing reason/gate: Anti-spin and fail-closed restraint detection proven on stalled, progressing, and low-value paid rounds; no upstream runtime installed.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-84"></a>

## 84. google/agents-cli

[Upstream repository](https://github.com/google/agents-cli)

- Recorded state: externally-gated; readiness ledger: pilot-isolated-worker.
- Snapshot provenance: 66976f5cf53c39995dce1cdb3638c6b5e7cb2e4b; license Apache-2.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Disposable worktree and review-before-apply evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P3 — Keep reference until a specific gap is identified.** The stored category is often a name-based default, not a documented rejection. Identify an actual reusable behavior before installing anything.

Incremental cost: Unknown for full runtime; static reference has no provider fee.

Promotion gate: Source/license review, product need and comparison with existing implementation.

<a id="repo-85"></a>

## 85. InsForge/InsForge

[Upstream repository](https://github.com/InsForge/InsForge)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 268d79d274b07317ffb8ceb14d09485625910592; license Apache-2.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Bounded plan, checkpoint, idempotency, approval, tenant isolation, and disposable execution evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Reuse methods behind existing orchestration.** Avoid a second scheduler/state store just to activate the repository. Map useful roles, checkpoints or task contracts into the current runtime first.

Incremental cost: Methods may fit existing budget; full runtimes add inference/ops.

Promotion gate: Approval, idempotency, resumability, tenant scope and outcome benchmark.

<a id="repo-86"></a>

## 86. topoteretes/cognee

[Upstream repository](https://github.com/topoteretes/cognee)

- Recorded state: contract-active; readiness ledger: contract-static-only.
- Snapshot provenance: fd5045f6b60522c1953fc1ae258e041ba53602d8; license Apache-2.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Graph ownership, retention, and deletion evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — One retrieval/context pilot.** Compare against current notebook/context stack. Do not deploy several overlapping graph/retrieval databases simultaneously.

Incremental cost: Storage/embedding/model/worker costs depend on chosen mode.

Promotion gate: Citation accuracy, retention/deletion, tenant isolation and retrieval benchmark.

<a id="repo-87"></a>

## 87. VoltAgent/voltagent

[Upstream repository](https://github.com/VoltAgent/voltagent)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 35efe178d76b191d0399c9d8bdb576bcbb162f79; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Bounded plan, checkpoint, idempotency, approval, tenant isolation, and disposable execution evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Reuse methods behind existing orchestration.** Avoid a second scheduler/state store just to activate the repository. Map useful roles, checkpoints or task contracts into the current runtime first.

Incremental cost: Methods may fit existing budget; full runtimes add inference/ops.

Promotion gate: Approval, idempotency, resumability, tenant scope and outcome benchmark.

<a id="repo-88"></a>

## 88. ashishpatel26/500-AI-Agents-Projects

[Upstream repository](https://github.com/ashishpatel26/500-AI-Agents-Projects)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 9beeb721c2af551bacaab827a76bddaecaa0ca5e; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Use-case review only.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P3 — Keep reference until a specific gap is identified.** The stored category is often a name-based default, not a documented rejection. Identify an actual reusable behavior before installing anything.

Incremental cost: Unknown for full runtime; static reference has no provider fee.

Promotion gate: Source/license review, product need and comparison with existing implementation.

<a id="repo-89"></a>

## 89. hoangsonww/Agentic-AI-Pipeline

[Upstream repository](https://github.com/hoangsonww/Agentic-AI-Pipeline)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 443716a7d227b0d36cd73b82f134ccf00aa34185; license Apache-2.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Bounded plan, checkpoint, idempotency, approval, tenant isolation, and disposable execution evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Reuse methods behind existing orchestration.** Avoid a second scheduler/state store just to activate the repository. Map useful roles, checkpoints or task contracts into the current runtime first.

Incremental cost: Methods may fit existing budget; full runtimes add inference/ops.

Promotion gate: Approval, idempotency, resumability, tenant scope and outcome benchmark.

<a id="repo-90"></a>

## 90. NirDiamant/agents-towards-production

[Upstream repository](https://github.com/NirDiamant/agents-towards-production)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: df724c58c16a49924b830694ebfc744d67e037d3; license NOASSERTION (unresolved).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Focused contract tests, redacted evidence, permission review, and rollback mapping.
- Existing safety note: license requires non-vendoring/legal review; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-91"></a>

## 91. elder-plinius/CL4R1T4S

[Upstream repository](https://github.com/elder-plinius/CL4R1T4S)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: c3b01557b062e419ccc03e7cf810f9b8bf0ac558; license AGPL-3.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: License, provenance, behavior review, permission review, and explicit adoption decision.
- Existing safety note: license requires non-vendoring/legal review; no runtime activation implied by catalog presence.

Recommendation: **P3 — Keep reference until a specific gap is identified.** The stored category is often a name-based default, not a documented rejection. Identify an actual reusable behavior before installing anything.

Incremental cost: Unknown for full runtime; static reference has no provider fee.

Promotion gate: Source/license review, product need and comparison with existing implementation.

<a id="repo-92"></a>

## 92. bytedance/deer-flow

[Upstream repository](https://github.com/bytedance/deer-flow)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: a5acc25de6742b2166b3f41c97bd895822277b94; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Bounded plan, checkpoint, idempotency, approval, tenant isolation, and disposable execution evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Reuse methods behind existing orchestration.** Avoid a second scheduler/state store just to activate the repository. Map useful roles, checkpoints or task contracts into the current runtime first.

Incremental cost: Methods may fit existing budget; full runtimes add inference/ops.

Promotion gate: Approval, idempotency, resumability, tenant scope and outcome benchmark.

<a id="repo-93"></a>

## 93. langchain-ai/deepagents

[Upstream repository](https://github.com/langchain-ai/deepagents)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 1e4f50794167250dc7d7fd2b352aed684ca1ae69; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Bounded plan, checkpoint, idempotency, approval, tenant isolation, and disposable execution evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Reuse methods behind existing orchestration.** Avoid a second scheduler/state store just to activate the repository. Map useful roles, checkpoints or task contracts into the current runtime first.

Incremental cost: Methods may fit existing budget; full runtimes add inference/ops.

Promotion gate: Approval, idempotency, resumability, tenant scope and outcome benchmark.

<a id="repo-94"></a>

## 94. firecrawl/firecrawl

[Upstream repository](https://github.com/firecrawl/firecrawl)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: 1c522c1ed2b6e9763e48ed7202e08328043db7a0; license AGPL-3.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: URL policy, SSRF/egress controls, citation parity, rate limits, budget, deletion lineage, and rollback.
- Existing safety note: license requires non-vendoring/legal review; no runtime activation implied by catalog presence.

Recommendation: **P0 — Separate API use from vendored-code licensing.** Portfolio blanket AGPL filter does not accurately describe the existing hosted API integration. Correct use-mode/evidence metadata; do not assume licensing disappears behind a worker.

Incremental cost: Existing API usage/quota; self-hosting has separate costs and obligations.

Promotion gate: Intended use-mode license/terms review and current tenant API health.

<a id="repo-95"></a>

## 95. affaan-m/ECC

[Upstream repository](https://github.com/affaan-m/ECC)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: d8409a4b0813771235555e32e3d8046a73988bfa; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Focused contract tests, redacted evidence, permission review, and rollback mapping.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P0 — Restore and verify existing integration.** Seven deterministic adapters already have historical two-tenant evidence; the old reference-only label misses later work. Current cloud-test capability flags omit ecc-workflows. Reconcile manifest and tenant policy before proposing new adapters.

Incremental cost: No provider inference for the seven existing deterministic adapters; infrastructure and maintenance remain.

Promotion gate: Current-revision authenticated two-tenant run, artifact ownership/download, restart and rollback.

<a id="repo-96"></a>

## 96. rohitg00/ai-engineering-from-scratch

[Upstream repository](https://github.com/rohitg00/ai-engineering-from-scratch)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 7c3323508a5186739feecd76838ba1ae962c736f; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Reference review only.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P3 — Keep reference until a specific gap is identified.** The stored category is often a name-based default, not a documented rejection. Identify an actual reusable behavior before installing anything.

Incremental cost: Unknown for full runtime; static reference has no provider fee.

Promotion gate: Source/license review, product need and comparison with existing implementation.

<a id="repo-97"></a>

## 97. harry0703/MoneyPrinterTurbo

[Upstream repository](https://github.com/harry0703/MoneyPrinterTurbo)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: d84f4f344f1434286603994eedc7f46330f456b3; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Provider license, artifact ownership, fixture quality, cost/VRAM bounds, approval, and rollback.
- Existing safety note: license metadata resolved from GitHub; execution remains separately gated.

Recommendation: **P2 — Optional local/hosted media worker.** Open-source application code does not establish free inference or rights to model weights/assets. Reuse UI/methods independently where useful.

Incremental cost: Hardware, inference, storage and packaging.

Promotion gate: Code/model/assets terms, resource budget, consent and artifact quality.

<a id="repo-98"></a>

## 98. Giskard-AI/giskard-oss

[Upstream repository](https://github.com/Giskard-AI/giskard-oss)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 39f4bb2502334d9f594c5b751966d1f4dfcd74f2; license Apache-2.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Focused contract tests, redacted evidence, permission review, and rollback mapping.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P1 — Deterministic evaluation first.** Useful assertion/evaluation framework; start with fixed fixtures. Optional generated tests and LLM judges are not zero-inference.

Incremental cost: CI compute; optional judge calls excluded from baseline.

Promotion gate: Pinned-version compatibility and demonstrated failures caught beyond existing tests.

<a id="repo-99"></a>

## 99. 0ldh/claude-code-agents-orchestra

[Upstream repository](https://github.com/0ldh/claude-code-agents-orchestra)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: e18d323bb3b7b4cf064f292a430861daff92a9af; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: License, provenance, behavior review, permission review, and explicit adoption decision.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P3 — Keep reference until a specific gap is identified.** The stored category is often a name-based default, not a documented rejection. Identify an actual reusable behavior before installing anything.

Incremental cost: Unknown for full runtime; static reference has no provider fee.

Promotion gate: Source/license review, product need and comparison with existing implementation.

<a id="repo-100"></a>

## 100. katanemo/plano

[Upstream repository](https://github.com/katanemo/plano)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 003c36aea896ce6fa98567329588baa582e41f9c; license Apache-2.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Allowlist, deterministic fallback, budget trace, redacted route evidence, and quality parity.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Transfer routing/efficiency methods.** Keep a single accountable provider router. Evaluate useful policy or optimization without forwarding secrets to an unreviewed proxy.

Incremental cost: Proxy/compute and model costs depend on mode.

Promotion gate: Allowlist, privacy, fallback cost ceiling, route traces and quality parity.

<a id="repo-101"></a>

## 101. sickn33/agentic-awesome-skills

[Upstream repository](https://github.com/sickn33/agentic-awesome-skills)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: e2b6ad15c704e47819b0e2393d04b42a9dcf4fc5; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Focused contract tests, redacted evidence, permission review, and rollback mapping.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-102"></a>

## 102. ruvnet/ruflo

[Upstream repository](https://github.com/ruvnet/ruflo)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: fa13ee4ad60ac2090b1480656eb233521790d640; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Bounded plan, checkpoint, idempotency, approval, tenant isolation, and disposable execution evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Reuse methods behind existing orchestration.** Avoid a second scheduler/state store just to activate the repository. Map useful roles, checkpoints or task contracts into the current runtime first.

Incremental cost: Methods may fit existing budget; full runtimes add inference/ops.

Promotion gate: Approval, idempotency, resumability, tenant scope and outcome benchmark.

<a id="repo-103"></a>

## 103. Arindam200/reddit-mcp

[Upstream repository](https://github.com/Arindam200/reddit-mcp)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 5c5636371315386dfcf4cea73123ea4f6c06842a; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: URL policy, SSRF/egress controls, citation parity, rate limits, budget, deletion lineage, and rollback.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Bounded research adapter pilot.** Map the useful retrieval/output behavior into existing research contracts; external worker or API availability is a separate gate.

Incremental cost: CPU/API quotas; model extraction may add inference.

Promotion gate: URL/egress/SSRF safety, provenance, rate/budget caps and real extraction smoke.

<a id="repo-104"></a>

## 104. Arindam200/awesome-ai-apps

[Upstream repository](https://github.com/Arindam200/awesome-ai-apps)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: e7ff378756044f37307b9264963ca59e6c924bc9; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Focused contract tests, redacted evidence, permission review, and rollback mapping.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-105"></a>

## 105. vercel-labs/zerolang

[Upstream repository](https://github.com/vercel-labs/zerolang)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: afcc72da649fe4d4c670ac1489c2197d37436051; license Apache-2.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Allowlist, deterministic fallback, budget trace, redacted route evidence, and quality parity.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Transfer routing/efficiency methods.** Keep a single accountable provider router. Evaluate useful policy or optimization without forwarding secrets to an unreviewed proxy.

Incremental cost: Proxy/compute and model costs depend on mode.

Promotion gate: Allowlist, privacy, fallback cost ceiling, route traces and quality parity.

<a id="repo-106"></a>

## 106. Graphify-Labs/graphify

[Upstream repository](https://github.com/Graphify-Labs/graphify)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: b14b52e94ec3d9840413d81777f4c134eac0a40d; license Apache-2.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Tenant ownership, provenance, retention, deletion lineage, citation parity, and reviewed activation.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P1 — Code-only local context pilot.** Try AST/code-only graph extraction before adding another graph database or model-driven document processing.

Incremental cost: Local CPU/storage; no new inference in code-only pilot.

Promotion gate: Selected-file scope, secret exclusions, usefulness/retrieval benchmark, delete/rebuild.

<a id="repo-107"></a>

## 107. OpenBMB/ChatDev

[Upstream repository](https://github.com/OpenBMB/ChatDev)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 4fb2db0ea90375ce1059f44fe03ffbd191a7a169; license Apache-2.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Bounded plan, checkpoint, idempotency, approval, tenant isolation, and disposable execution evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Reuse methods behind existing orchestration.** Avoid a second scheduler/state store just to activate the repository. Map useful roles, checkpoints or task contracts into the current runtime first.

Incremental cost: Methods may fit existing budget; full runtimes add inference/ops.

Promotion gate: Approval, idempotency, resumability, tenant scope and outcome benchmark.

<a id="repo-108"></a>

## 108. NousResearch/hermes-paperclip-adapter

[Upstream repository](https://github.com/NousResearch/hermes-paperclip-adapter)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 937ea71a34f5efcaa3834b11fdd08cfc1c99cb2c; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Bounded plan, checkpoint, idempotency, approval, tenant isolation, and disposable execution evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Reuse methods behind existing orchestration.** Avoid a second scheduler/state store just to activate the repository. Map useful roles, checkpoints or task contracts into the current runtime first.

Incremental cost: Methods may fit existing budget; full runtimes add inference/ops.

Promotion gate: Approval, idempotency, resumability, tenant scope and outcome benchmark.

<a id="repo-109"></a>

## 109. NousResearch/hermes-agent

[Upstream repository](https://github.com/NousResearch/hermes-agent)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: dbbd8937aec18e0739aec9ba58f1d24f6cb12698; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Bounded plan, checkpoint, idempotency, approval, tenant isolation, and disposable execution evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Reuse methods behind existing orchestration.** Avoid a second scheduler/state store just to activate the repository. Map useful roles, checkpoints or task contracts into the current runtime first.

Incremental cost: Methods may fit existing budget; full runtimes add inference/ops.

Promotion gate: Approval, idempotency, resumability, tenant scope and outcome benchmark.

<a id="repo-110"></a>

## 110. paperclipai/paperclip

[Upstream repository](https://github.com/paperclipai/paperclip)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 5a1ce7aed8238036dc92dcc944c71e08fe6ebc50; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Bounded plan, checkpoint, idempotency, approval, tenant isolation, and disposable execution evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Reuse methods behind existing orchestration.** Avoid a second scheduler/state store just to activate the repository. Map useful roles, checkpoints or task contracts into the current runtime first.

Incremental cost: Methods may fit existing budget; full runtimes add inference/ops.

Promotion gate: Approval, idempotency, resumability, tenant scope and outcome benchmark.

<a id="repo-111"></a>

## 111. WeaveMindAI/weft

[Upstream repository](https://github.com/WeaveMindAI/weft)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: 0f5c2cb7dc4d434554f367c894b839556d00615f; license NOASSERTION (unresolved).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: License, provenance, behavior review, permission review, and explicit adoption decision.
- Existing safety note: license requires non-vendoring/legal review; no runtime activation implied by catalog presence.

Recommendation: **P3 — Keep reference until a specific gap is identified.** The stored category is often a name-based default, not a documented rejection. Identify an actual reusable behavior before installing anything.

Incremental cost: Unknown for full runtime; static reference has no provider fee.

Promotion gate: Source/license review, product need and comparison with existing implementation.

<a id="repo-112"></a>

## 112. kyegomez/OpenMythos

[Upstream repository](https://github.com/kyegomez/OpenMythos)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 155430a88d2a98322fc4c79b2a067792c3c9579a; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: License, provenance, behavior review, permission review, and explicit adoption decision.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P3 — Keep reference until a specific gap is identified.** The stored category is often a name-based default, not a documented rejection. Identify an actual reusable behavior before installing anything.

Incremental cost: Unknown for full runtime; static reference has no provider fee.

Promotion gate: Source/license review, product need and comparison with existing implementation.

<a id="repo-113"></a>

## 113. MadAppGang/claudish

[Upstream repository](https://github.com/MadAppGang/claudish)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: 4daf80403122e61b395d0feb550d049fdd151cc1; license NOASSERTION (missing).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Bounded plan, checkpoint, idempotency, approval, tenant isolation, and disposable execution evidence.
- Existing safety note: license requires non-vendoring/legal review; no runtime activation implied by catalog presence.

Recommendation: **P2 — Reuse methods behind existing orchestration.** Avoid a second scheduler/state store just to activate the repository. Map useful roles, checkpoints or task contracts into the current runtime first.

Incremental cost: Methods may fit existing budget; full runtimes add inference/ops.

Promotion gate: Approval, idempotency, resumability, tenant scope and outcome benchmark.

<a id="repo-114"></a>

## 114. google-research/timesfm

[Upstream repository](https://github.com/google-research/timesfm)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 3dae50b20d7a724981e8ea36cda75578f80dd2dc; license Apache-2.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Tenant ownership, provenance, retention, deletion lineage, citation parity, and reviewed activation.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — One retrieval/context pilot.** Compare against current notebook/context stack. Do not deploy several overlapping graph/retrieval databases simultaneously.

Incremental cost: Storage/embedding/model/worker costs depend on chosen mode.

Promotion gate: Citation accuracy, retention/deletion, tenant isolation and retrieval benchmark.

<a id="repo-115"></a>

## 115. sipeed/picoclaw

[Upstream repository](https://github.com/sipeed/picoclaw)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: bbf6893ca7afad27f1d00a0f5a45982a549c6ed6; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Bounded plan, checkpoint, idempotency, approval, tenant isolation, and disposable execution evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Reuse methods behind existing orchestration.** Avoid a second scheduler/state store just to activate the repository. Map useful roles, checkpoints or task contracts into the current runtime first.

Incremental cost: Methods may fit existing budget; full runtimes add inference/ops.

Promotion gate: Approval, idempotency, resumability, tenant scope and outcome benchmark.

<a id="repo-116"></a>

## 116. codecrafters-io/build-your-own-x

[Upstream repository](https://github.com/codecrafters-io/build-your-own-x)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: aa17439b62f384511a5561ce308e9598b94d8989; license NOASSERTION (missing).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Focused contract tests, redacted evidence, permission review, and rollback mapping.
- Existing safety note: license requires non-vendoring/legal review; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-117"></a>

## 117. donnemartin/system-design-primer

[Upstream repository](https://github.com/donnemartin/system-design-primer)

- Recorded state: reference-only; readiness ledger: blocked-review.
- Snapshot provenance: ae9bbd7b02d90b9866215de185217d33f39ab733; license NOASSERTION (unresolved).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Focused contract tests, redacted evidence, permission review, and rollback mapping.
- Existing safety note: license requires non-vendoring/legal review; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select bounded quality methods.** Review a small non-duplicative method/check against current ECC and quality behavior; source presence alone is not execution.

Incremental cost: No mandatory new service for methods; tokens/CI/review are not zero cost.

Promotion gate: Pinned license/provenance, deterministic fixtures, incremental value and rollback.

<a id="repo-118"></a>

## 118. jasontang-ai/Context-Engineering

[Upstream repository](https://github.com/jasontang-ai/Context-Engineering)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 6158def66a2d2174ed8356cf376e5f44e10d78ea; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Tenant ownership, provenance, retention, deletion lineage, citation parity, and reviewed activation.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select context assembly methods.** Extract task-relevant context policy into shared local/cloud domain behavior; avoid installing a second memory stack by default.

Incremental cost: Existing compute/token budget.

Promotion gate: Relevance, provenance, secret filtering and held-out quality.

<a id="repo-119"></a>

## 119. wshobson/agents

[Upstream repository](https://github.com/wshobson/agents)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 367cb6a4a182cf7e9b0a17c9429f7411ddd9cf35; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: License, provenance, behavior review, permission review, and explicit adoption decision.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P1 — Select and deduplicate role methods.** Methods may improve review roles without deploying another orchestration runtime; no need to load every prompt.

Incremental cost: No required new service; added prompt tokens must be budgeted.

Promotion gate: Attribution, selected role fixtures, prompt-injection review and quality comparison.

<a id="repo-120"></a>

## 120. Zie619/n8n-workflows

[Upstream repository](https://github.com/Zie619/n8n-workflows)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 94007c1445d9258a7da116646b79473e7c7c3282; license MIT (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: Bounded plan, checkpoint, idempotency, approval, tenant isolation, and disposable execution evidence.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P2 — Reuse methods behind existing orchestration.** Avoid a second scheduler/state store just to activate the repository. Map useful roles, checkpoints or task contracts into the current runtime first.

Incremental cost: Methods may fit existing budget; full runtimes add inference/ops.

Promotion gate: Approval, idempotency, resumability, tenant scope and outcome benchmark.

<a id="repo-121"></a>

## 121. huggingface/agents-course

[Upstream repository](https://github.com/huggingface/agents-course)

- Recorded state: reference-only; readiness ledger: reference-only.
- Snapshot provenance: 8c0832eae634ebb34541c65265caa6da4c5d2c57; license Apache-2.0 (confirmed).
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: License, provenance, behavior review, permission review, and explicit adoption decision.
- Existing safety note: license metadata resolved from GitHub; no runtime activation implied by catalog presence.

Recommendation: **P3 — Keep reference until a specific gap is identified.** The stored category is often a name-based default, not a documented rejection. Identify an actual reusable behavior before installing anything.

Incremental cost: Unknown for full runtime; static reference has no provider fee.

Promotion gate: Source/license review, product need and comparison with existing implementation.

<a id="repo-122"></a>

## 122. 666ghj/MiroFish

[Upstream repository](https://github.com/666ghj/MiroFish)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: not recorded in the old inventory; a discovery review is required.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P1 — Shared GTM methodology; simulation remains optional.** Existing code is a MiroFish-inspired persona/scenario prompt in hosted pipeline only, not upstream MiroFish execution. Move common method to both editions and evaluate honestly.

Incremental cost: Method within existing call/token cap; full simulation adds LLM/Zep/compute dependencies.

Promotion gate: Baseline comparison, explicit synthetic hypotheses, evidence citations; capped pilot before any simulation claims.

<a id="repo-123"></a>

## 123. open-free-llm-api/awesome-freellm-apis

[Upstream repository](https://github.com/open-free-llm-api/awesome-freellm-apis)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: not recorded in the old inventory; a discovery review is required.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P1 — Operator-reviewed provider discovery.** This is a directory, not a production router. Convert selected provider metadata into reviewed direct-provider contracts, never auto-trust listed endpoints.

Incremental cost: Free quotas are conditional; integration/security/ops remain.

Promotion gate: Provider terms, privacy, model stability, rate limits, health and tenant opt-in.

<a id="repo-124"></a>

## 124. tashfeenahmed/freellmapi

[Upstream repository](https://github.com/tashfeenahmed/freellmapi)

- Recorded state: not in the old 101-repository portfolio; readiness ledger: not assessed by that ledger.
- Snapshot provenance: no portfolio pin/license assessment; obtain these before adoption.
- Catalog mapping: no specific implementation mapping recorded in the matched catalog row.
- Recorded activation evidence: no explicit matched catalog evidence recorded.
- Existing reason/gate: not recorded in the old inventory; a discovery review is required.
- Existing safety note: new entry; permissions and data boundaries not yet certified.

Recommendation: **P3 — Do not use as default production dependency.** Upstream describes personal experimentation. No reliability/tenant privacy evidence here establishes suitability for production client data.

Incremental cost: Uncertain quota/reliability; operational risk.

Promotion gate: Explicit production suitability, terms/data handling, provider identity and failure tests.

