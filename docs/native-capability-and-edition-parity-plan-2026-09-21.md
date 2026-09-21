# Native capability expansion and local/cloud parity plan

Prepared: 21 September 2026. Status: analysis and proposed implementation plan; no application changes or deployment performed by this audit.

## Executive decision

Yes: considerably more of this portfolio can become useful inside Veloce without installing every upstream application. Native usability should mean a coherent in-product workflow, supported by an attributable method, a tested library, or a governed adapter—not merely a repository appearing in a list.

The highest-value order is:

1. Reconcile the inventory and restore/reverify previously implemented capabilities affected by configuration drift.
2. Deliver one shared workspace UI and common behavior contracts across the local and cloud editions.
3. Add selected low-incremental-cost methods, static checks and local utilities.
4. Pilot additional workers and expensive capabilities only where measured outcomes justify their resource and maintenance costs.
5. Certify the full customer journeys on immutable releases, not merely source files or historical screenshots.

Do not expand the number of runtimes to improve a headline count. Do not equate “free repository,” “no new API subscription,” and “zero operating cost.”

The architecture-review skill informed this plan's separation of interfaces from execution backends, explicit tradeoffs, incremental migration and validation gates. It did not authorize implementation.

## 1. Corrections to previous reporting

The earlier 6 native / 10 contract / 17 gated / 68 reference breakdown does not match the currently evaluated 101-entry portfolio. Earlier overall production-readiness estimates of 35% / 30% / 20% / 15% were not based on an approved denominator and completed acceptance tests; they should be withdrawn.

Evaluating the current source's August 20 snapshot yields:

| Portfolio label | Repositories | Share of that 101-entry snapshot | What this actually establishes |
|---|---:|---:|---|
| Native-enabled | 10 | 9.9% | Recorded native mapping, sometimes an adapted method rather than an upstream runtime |
| Contract-active | 8 | 7.9% | An integration contract exists; live execution remains a separate question |
| Externally-gated | 7 | 6.9% | Execution has additional requirements |
| Reference-only | 76 | 75.2% | Catalog reference; not a measured rejection or installation |
| Total | 101 | 100% | Historical portfolio denominator; rounding applies |

The latest attachment contains 121 unique repositories, including all 101 above. Adding MiroFish and the two separately linked free-API projects gives **124 unique repositories in requested scope**. The old dashboard is therefore incomplete even before interpreting its statuses.

The 48-entry repository catalog is a different collection, with base statuses and activation overlays. Mixing those numbers with the 101-entry portfolio produces misleading totals. Some catalog entries are methods/guides rather than GitHub repositories. Groq is a provider and should not inflate repository counts.

The production-readiness matrix currently computes 0 “end-to-end-current-revision,” 10 “source-tests-cloud-evidence-stale,” 11 “contract-static-only,” 4 “pilot-isolated-worker,” 54 “reference-only,” and 22 “blocked-review.” These are rule-derived evidence labels, not a live probe. Zero current-revision certifications in this matrix does **not** mean no product features work.

## 2. Where the exclusion reasons are—and why they are insufficient

| Source | Information present | Limitation |
|---|---|---|
| [v96RepositoryCatalog.ts](../src/lib/v96RepositoryCatalog.ts) | Activation, implementation mapping, evidence, runtime, rollback | Several mappings/evidence strings are generic, not exact code/test/release references |
| [v96StarredPortfolio.ts](../src/lib/v96StarredPortfolio.ts) | 101 pinned references, category, placement, permissions, evidence gate, security notes | August snapshot; category defaults and exact-case URL joins can misclassify entries |
| [productionReadinessMatrix.ts](../src/lib/productionReadinessMatrix.ts) | Readiness label and next gate | Derived from labels/license rules; does not establish current production behavior |
| [integrationGovernance.ts](../src/lib/integrationGovernance.ts) | Additional integration-specific governance | Another partially overlapping source of truth |
| [hosted adapter roadmap](hosted-capability-adapter-roadmap.md) | Adapter-versus-tenant activation and live gates | Must be reconciled against each tenant's current configuration |
| [ECC integration](ecc-integration.md) and [deployment receipt](evidence/ecc-production-deployment-2026-09-13.json) | Later installed/adapted components and historical live evidence | Not reflected accurately by the old portfolio |

The complete [124-repository annex](repository-adoption-audit-2026-09-21.md) now places each recorded reason beside a proposed adoption mode, cost caveat and next gate. Where no individual reason exists, it says so. It does not invent historical rationale.

### Confirmed inventory defects

- Source URLs are joined case-sensitively. Crawl4AI is reference-only in the portfolio but contract-active in the catalog; Open-Generative-AI and SkyReels-V2 also disagree across the join. Normalize repository identity separately from display spelling. License gates must still apply.
- ECC is still reference-only in the August portfolio despite September integration and deployment evidence.
- “Existing Veloce native capability policy” and “Existing focused capability evidence” are insufficient production evidence. Nonempty-string tests do not validate the claim.
- License metadata conflicts exist between registries, including Semantica and company-research-agent. Reconcile against the specific upstream revision and intended use.
- A blanket GPL/AGPL rule conflates hosted API use, distribution, modified upstream software and independently implemented methods. Firecrawl's hosted API use illustrates why repository licensing and provider access must be represented separately.

GPL/AGPL are not blanket prohibitions on commercial use. Obligations depend on the license and use mode; a separate process or worker is not an automatic exemption. Review intended incorporation/distribution/network use before promotion. [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.html), [GNU AGPL](https://www.gnu.org/licenses/agpl-3.0.html).

### Proposed single capability registry

Use a canonical repository identity plus a separate product capability ID. A capability may use several references; a repository may support several capabilities.

Record: source pin, code/model/asset licenses, reuse mode, exact implementation paths, supported local/cloud/hybrid modes, runtime dependencies, permission and egress scopes, incremental costs, current tenant availability, acceptance test IDs, evidence timestamp/revision/image/config digest, owner, blocker, next action and rollback.

Show users separate fields: **method available / adapter implemented / configured here / tested on this release**. An “unavailable” badge should explain the specific missing dependency or policy, with a safe setup action. “Native-enabled” should not conceal all four states.

## 3. Ways to make more repositories native-usable

| Reuse mode | Product integration | Incremental cost | Promotion requirement |
|---|---|---|---|
| Method | Selected review rubric, GTM hypothesis process, context policy | Review effort and possible extra prompt tokens | Attribution, bounded behavior and comparative quality tests |
| Deterministic component | Parser, packer, static scanner, validator | Local/CI CPU, storage and maintenance | Dependency/security review, performance and correctness |
| Local connector | User-approved capture, files or local model | Customer hardware, packaging and support | Explicit permissions, supported OS and no unintended upload |
| Hosted worker | Crawler, document/media processor | Compute, queues, storage, egress, operations | Tenant isolation, resource caps and failure recovery |
| Direct provider adapter | Approved remote model/service | Free quota or paid usage, provider dependency | Terms/privacy review, limits, health, budget and opt-in |
| Full upstream application | Complete additional stack | Largest integration and operational surface | Only if a clear unmet capability outweighs overlap and migration |

The same native UI can use any of these. File interoperability is often a useful first step: a customer can import an OpenScreen recording into Studio without embedding a second desktop application inside the cloud runtime.

### Priority candidates

| Priority | Candidate | Recommendation and rationale |
|---|---|---|
| P0 | ECC | Reconcile existing seven deterministic adapters, current capability flags and tenant policy; restore only after configuration diff and current tests |
| P0 | Jina / Firecrawl metadata | Distinguish actual worker/API availability from catalog labels and licensing use mode |
| P1 | MiroFish methodology | Share persona/scenario/evidence/risk method across local and hosted pipeline; do not call it validated prediction |
| P1 | Existing ECC/agent-skills/agency roles, selected research skills | Deduplicate task-relevant methods, load on demand, benchmark against existing prompts |
| P1 | AgentShield | Project-scoped deterministic checks; optional model review excluded initially |
| P1 | Repomix | Productize scoped context packing with preview and secret exclusions; operator mapping already exists |
| P1 | Graphify code-only | Pilot local structural context before adding model-driven graph extraction |
| P1 | Giskard | Add deterministic quality/security fixtures first; paid/generated judges separately budgeted |
| P1 | Headroom | Compare current adapted compression against upstream options; keep only demonstrated gains |
| P1 | Crawlee vs Crawl4AI vs Scrapling | Run one comparative extraction pilot and select a default, rather than operate three redundant stacks |
| P1 | OpenScreen | Local recording import/export first; deeper capture connector after packaging/permission validation |
| P2 | Company research / Open SEO | Map evidence-oriented outputs into existing research contracts; actual retrieval requires configured execution |
| P2 | RAG-Anything / RagFlow / Cognee / Semantica | Choose a single retrieval problem and pilot one backend; do not create four competing memory stores |
| P2 | Three Higgsfield/Generative-AI projects | Compare model selection, generation history and media UX; integrate selected improvements into one Studio |
| P2 | VoxCPM, Supervision, other media | Optional workload-specific workers with code/model rights and hardware budgets |
| P3 | Extra agent platforms, notification stacks, experimental routers | Hold unless a concrete gap and measured advantage justify extra infrastructure |

These are evaluation priorities, not claims of superiority. Their upstream descriptions establish candidate functionality, not performance in this product.

Selected primary references supporting the proposed modes: [AgentShield](https://github.com/affaan-m/agentshield), [Repomix](https://github.com/yamadashy/repomix), [Graphify](https://github.com/Graphify-Labs/graphify), [Giskard](https://github.com/Giskard-AI/giskard-oss), [Headroom](https://github.com/headroomlabs-ai/headroom), [Crawlee](https://github.com/apify/crawlee), [Crawl4AI](https://github.com/unclecode/crawl4ai), [Scrapling](https://github.com/D4Vinci/Scrapling), [OpenScreen](https://github.com/getopenscreen/openscreen).

### What should remain conditional

- Full MiroFish simulation introduces model calls, simulation rounds and memory dependencies. The current integration is only a MiroFish-inspired GTM prompt method; it does not install or execute the upstream simulator. Synthetic personas produce hypotheses, not customer validation. [MiroFish](https://github.com/666ghj/MiroFish).
- The free-API list is a directory, not a router. Use it for reviewed provider discovery. The separate FreeLLMAPI project describes personal experimentation; no production reliability or client-data suitability was established in this audit. Do not automatically send customer prompts to endpoints from either list. [Directory](https://github.com/open-free-llm-api/awesome-freellm-apis), [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi).
- Generative UI code can be free while Muapi/Higgsfield inference, local models and storage are not. Autom8AI overlaps the Anil-matcha project; compare feature deltas before incorporating both. Do not copy client-side key-storage patterns into the hosted product. [Autom8AI](https://github.com/Autom8AI/Open-Higgsfield-AI), [Open-Generative-AI](https://github.com/Anil-matcha/Open-Generative-AI), [wide-trace](https://github.com/wide-trace/open-higgsfield).
- OpenScreen and Recordly overlap; choose one capture path after use-mode licensing and quality review. [Recordly](https://github.com/webadderallorg/recordly).
- Autoresearch's bounded baseline/experiment/keep-or-revert discipline can inform product evaluation without deploying its GPU training loop. [Autoresearch](https://github.com/karpathy/autoresearch).
- Arbitrary shell agents and active security scanners must remain explicitly authorized, scoped specialist workflows—not enabled for every customer by default.

## 4. Why local and cloud look different

This is not simply a theme or cache issue. There are deliberate implementation forks.

[Shell.tsx](../src/components/Shell.tsx) selects different client components when the client-edition flag is set. [layout.tsx](../src/app/layout.tsx) supplies that flag. The sidebar/top bar are partly shared, but numerous page bodies are replaced.

| Surface | Local behavior | Hosted behavior | Consequence |
|---|---|---|---|
| Pipeline | PipelineView and local pipeline APIs, filesystem/vault-oriented state | ClientPipelineWorkspace, client-runtime API, tenant records and queued jobs | Different page layouts, IDs and workflow semantics |
| Agents | Specialized local/provider pages | ClientAgentConsole | Different controls and credential availability |
| Room, Boards, Loop, Ruflo | Local modules | Separate client adapters and components | Features can advance independently |
| Research, SEO, Video, Studio, Data | Local workspaces | Client-specific workspace replacements | Separate forms, empty states and output presentation |
| Authentication | Private localhost/operator assumptions | Issued client credentials and tenant session | Local developer access is not yet a finished customer installation model |
| Public portal | Separate product-experience app | Handoff into customer runtime | Branding, routes, sessions and versions can drift |

[laneParity.ts](../src/lib/laneParity.ts) lists ten local/hosted pairs, but “paired” means corresponding modules exist. The tests check file existence and forbidden filesystem imports; they do not compare screenshots, action semantics or end-to-end outcomes.

The September 19 browser observations showed a cloud Game Studio with historical successful jobs and downloadable artifacts, but inconsistent “PRIVATE OPERATING EDITION CLIENT” branding and duplicated page headings. Another cloud agent surface showed “awaiting provider/credential.” These are observations, not proof of the credential failure's exact cause. The attempted local service at port 3939 was unavailable, so no live pixel-parity claim is made.

There are also behavior-level mismatches: the new GTM method is imported by the hosted pipeline, not the local pipeline; cloud routes labelled local/engine map into hosted-provider agent configuration rather than proving execution on the customer's Ollama instance.

## 5. Target: one product, two delivery offers

Offer **Private Local** and **Managed Cloud**, with Hybrid as an optional connection between them. Private Local must be independently usable offline for supported local features. Do not require cloud login merely to use an installed local model.

The earlier [hybrid product plan](hybrid-edition-product-plan.md) contains cloud-start assumptions. Revise these explicitly rather than letting them override the desired independently usable local edition.

```text
Shared workspace UI + shared task/job/artifact contracts
                    |
          Capability + target resolver
             /                 \
     Local adapter          Cloud adapter
   local identity/store    tenant identity/store
   approved files/Ollama   provider vault/queues
             \                 /
              Optional paired bridge
         explicit sharing, no implicit sync
```

Share navigation, typography, page composition, forms, run status, errors, artifacts and capability names. Show a clear execution target: “This device” or “Cloud.” Hardware/provider differences should change availability and setup explanations, not produce an unrelated application.

Do not unify by giving cloud processes access to operator home directories or copying local secrets into cloud sessions. Share interfaces and domain behavior; preserve backend security boundaries.

### Concrete implementation shape

1. Extract common page components and domain logic, beginning with Pipeline and one agent workflow. Use existing better-performing layouts; no blanket redesign is needed.
2. Define versioned contracts for capabilities, task input, start/status/events/cancel/retry, output artifacts and typed errors. Include idempotency, target, actor/tenant identity and policy constraints. Enforce permissions and budgets at the execution boundary, not only in the UI.
3. Implement LocalAdapter and CloudAdapter behind those contracts. Translate local slugs and cloud UUIDs into a common resource envelope rather than leaking storage formats into components.
4. Use one server-resolved capability manifest for initial rendering; avoid client-only discovery causing incorrect branding or flicker.
5. Share login design and workspace selection while preserving appropriate authentication mechanisms. Local device unlock/offline identity differs from cloud tenant login. If using a handoff, use short-lived scoped exchange tokens, never raw credentials in URLs.
6. Keep local/cloud data separate by default. Sharing or synchronization must explicitly identify what leaves the device, its destination, retention and deletion behavior.
7. Pin the same frontend release and contract version across local packages and cloud image. Allow backend-specific settings, not untracked UI forks.
8. Migrate route families incrementally, with side-by-side acceptance and feature flags. Remove a replaced branch only when equivalent actions and artifacts pass.

The existing [local-worker bridge](../workers/local-worker/README.md) is useful foundation: loopback-only, one-time pairing, approved file scopes and selected Ollama execution. It is explicitly a development bridge, not a signed customer installer. Remaining work includes packaging/signing/notarization as applicable, durable device identity and revocation, upgrades/rollback, restart recovery, explicit supported-platform testing and actual deployed-origin browser permission tests. Do not broaden CORS or expose a shell to avoid setup issues.

## 6. Live configuration and production evidence

Read-only Cloud Run refresh on September 21 confirmed for **veloce-cloud-test only**:

- 100% traffic on revision `veloce-cloud-test-00197-fwx`.
- Release label `mirofish-gtm-groq-20260919`.
- Enabled capabilities: tenant-data, artifacts, orchestration, delivery, quality, text-agents, seo-research, media.
- `ecc-workflows` is absent.
- Research worker configuration is an empty array.
- A Groq API secret reference is bound. No secret value was printed or placed in this report.

This supports a configuration-gap diagnosis; it does not prove every customer tenant has the same configuration. The prior private deployment manifest is a likely source of drift, but the full change history must be compared before claiming the precise cause.

ECC's September 13 receipt reports 183 authenticated checks, 14 artifacts, and 14 final worker checks across two tenants. That is meaningful historical evidence, not a certification of the currently served revision. The seven deterministic ECC adapters have no provider inference; cloud infrastructure cost was not measured as zero.

Groq is similarly not “done” because a key is attached. The hosted pipeline defaults to OpenRouter unless workspace routing configuration selects another provider. Tenant admission, model allowlisting, credentials, UI availability, rate limits and successful artifact creation still need an authenticated test. Adding Groq speech configuration does not automatically expose Groq text generation everywhere. Do not silently change every task's provider or fall back from free to paid execution.

### Verification performed

On September 21, the focused suite passed **13 tests**:

```sh
npx --no-install playwright test tests/production-readiness-matrix.spec.ts tests/lane-parity.spec.ts tests/hybrid-capability-catalog.spec.ts tests/client-free-provider-router.spec.ts tests/mirofish-gtm.spec.ts --config=playwright.unit.config.ts --reporter=line
```

These establish structural/policy behavior, not production UI parity or real model quality.

The strict production check returned `releaseReady: false` for source HEAD `2a013bc36dd83f57461068fc83b8aa99b89a3882`, citing a dirty tree, missing current release ledger and release-environment evidence. The September 21 check was repeated with authorized cloud access and returned the same failure, so this is not merely a sandbox-access observation. The final check counted 12 uncommitted paths, including this audit's two new documents; ten paths predated these documents. Repeat the strict check against the clean, fully tested release candidate at release time.

The [September 14 GA candidate record](evidence/ga-current-candidate-status-2026-09-14.json) also explicitly leaves current two-tenant journeys, BYOK lifecycle, tenant isolation and owner approvals pending. These are not fixed by changing a label or publishing a fabricated receipt.

## 7. Superiority and cost admission test

“No additional cost” should initially mean **no new mandatory paid service and no increase beyond the approved per-task model budget**. It cannot literally mean no engineering, support, compute, storage or hardware consumption.

For each proposed promotion:

1. Define the missing user outcome and baseline implementation.
2. Pin upstream source/dependencies and review code/model/assets licenses, permissions and egress.
3. Use a proposed 30–50 representative fixtures plus a held-out subset; include adversarial and failure cases. Repeat nondeterministic trials. This evaluation has not yet been run.
4. Measure task success, citation validity, factual error rate, latency, tokens, actual billed usage, local memory/CPU and operations burden. Use human-reviewed ground truth where semantic quality matters.
5. Set workload-specific thresholds before testing. Require a meaningful quality/reliability gain or a clear cost/latency saving with acceptable quality. Security/isolation must not regress.
6. Compare total change in existing and new costs; “free tier” quota exhaustion is a failure scenario, not an invitation to silently spend.
7. Pilot behind a scoped flag, publish redacted results and keep a tested rollback.

For GTM specifically: use the same briefs and source evidence for baseline and new method; score segmentation clarity, evidence support, objections, channel hypotheses, testability and calibrated uncertainty. Separate synthetic scenario findings from actual interview, conversion and campaign data. No simulator score alone proves market demand.

## 8. Implementation milestones and exit criteria

| Milestone | Work | Exit gate |
|---|---|---|
| M0: truthful baseline | Canonicalize 124 entries; reconcile ECC/Jina/provider manifests; inventory every visible customer action; capture current release/config digests | Every claimed capability has an exact mapping or explicit blocker; changes reviewed before deployment |
| M1: shared vertical slice | Shared Pipeline + agent UI/contracts; local and cloud adapters; common GTM method; Groq setup/health/routing when selected | Same brief → run → artifact → reopen journey in both editions, with intentional target-specific differences only |
| M2: complete parity | Migrate remaining route families; login/handoff/deep links; local packaging and optional pairing | Approved route/action matrix passes on actual customer environments |
| M3: low-cost adoption | Selected methods, scoped static checks/context packing, one research comparison, local recording import | Measured wins, permission/cost gates, no regression in M1/M2 |
| M4: production certification | Current two-tenant, credentials, billing, recovery, isolation, observability, release/rollback evidence | All critical supported journeys pass on immutable candidate; strict ledger and required owner approvals complete |
| M5: optional expansion | Selected graph/media/simulation workers | Separate hardware/cost/terms acceptance; no claim these are included in baseline GA |

Product owner approves supported journeys and intentional differences. Application engineering owns shared interfaces; platform engineering owns manifests, packaging and rollback; security/privacy review owns sensitive boundaries; QA owns independent evidence. These are roles to assign, not assumed staffing or deadlines.

M0 and M1 precede broad expansion. Optional workers must not delay core local/cloud parity or hide its defects.

### Required end-to-end matrix

| Journey | Local | Cloud | Hybrid / failures |
|---|---|---|---|
| Install/open/login | Clean supported machine, local unlock, offline launch | Public entry, issued account, tenant selection, deep link, refresh/logout | Pair/unpair, expired session, wrong tenant/origin |
| Select provider and run | Installed model, hardware check, no external calls in local-only mode | BYOK/managed admission, configured model and budget | Explicit target; missing key/model, 401/429/timeout, no silent paid fallback |
| Pipeline and agent output | Persisted task/history/artifact | Queued job/history/artifact | Double submit, cancel/retry, process restart, reconnect |
| Research/context | Approved local scopes, secret exclusions | Allowed URLs, redirect/SSRF controls, citations | No implicit file upload, scope revocation, malicious source instructions |
| Artifacts | Save/reopen/export/delete | Tenant-scoped signed download, expiry and deletion | Oversize/corrupt media, interrupted upload, retention propagation |
| Isolation | Device permissions and multiple local users as supported | Tenant A cannot read/run/delete tenant B records or artifacts | Revoked device/credential cannot continue access |
| Operations | Upgrade/rollback, storage pressure, model unavailable | Worker crash, queue replay, bounded retries, rate/budget caps | Partial outage and recovery without duplicate effects |
| Billing where offered | Explicitly distinguish local compute from paid provider use | Managed/BYOK caps and authorized billing paths | No charge on rejected/duplicate work; existing financial acceptance gates |

Use actual browser journey tests and visual regression at fixed viewports, plus API/worker assertions. Exclude only documented intentional differences (execution badge, hardware setup, cloud billing), not missing core features.

Record evidence against source SHA, frontend deployment, container digest, database migration version, tenant policy/config digest and test timestamp. Historical receipts remain historical. A release may not remove existing configured capabilities unintentionally: diff manifests, test a canary, then promote with a known rollback image/config pair.

## 9. Honest production percentages

Do not publish an overall completion percentage now. Build an approved customer-action matrix first.

Report separate metrics per edition:

- Implementation coverage = implemented promised actions / all promised actions.
- Current-release acceptance = actions with passing current-release evidence / all promised actions.
- UI parity = passing comparable shared interactions / all comparable shared interactions.
- Tenant availability = configured supported capabilities / capabilities promised to that tenant.
- Critical-journey release gate = all pass or release blocked, regardless of average percentage.

Always display numerator, denominator, date, release and blockers. A large catalog or 99% average cannot compensate for broken login, wrong-tenant access or failure to deliver an artifact.

## 10. Boundary of this audit

Completed: source/registry analysis, full inventory disposition, selected upstream documentation research, configuration refresh for one cloud tenant, focused tests, production-gate inspection and a phased plan.

Not completed or claimed: full source/security audit of all 124 upstream repos, measured superiority benchmarks, a fresh paid Groq or MiroFish simulation, all-tenant configuration validation, current local/cloud visual acceptance, deployment, credential changes, or production certification.

The next implementation step is M0 followed by the shared Pipeline/agent vertical slice. It should start from the existing worktree changes, preserve unrelated work, and explicitly review deployment configuration before any production promotion.
