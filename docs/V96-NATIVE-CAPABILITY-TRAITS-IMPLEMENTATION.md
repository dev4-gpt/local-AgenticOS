# V96 Native Capability-Traits implementation map

This document maps the approved plan to the source implementation and keeps
later waves explicitly gated.

| Plan area | Source boundary | State |
|---|---|---|
| Baseline + capability resolver | `src/lib/capabilityTraits.ts` | implemented |
| STAR repository references | `src/lib/v96RepositoryCatalog.ts` + `src/lib/v96StarredPortfolio.ts` | 101 current starred sources are pinned and classified; executable catalog activation remains evidence-gated |
| Automatic job attachment | `src/lib/clientDataPlane.ts` | implemented at enqueue |
| Worker enforcement | `src/app/api/internal/client-runtime/jobs/route.ts` + `src/app/api/internal/client-runtime/visual-qa-dispatch/route.ts` | fail-closed validation; optional dedicated Visual QA Cloud Run Job |
| Operator inspection | `src/app/api/internal/client-runtime/trait-inspection/route.ts` | local/operator only |
| Native routing compression | `src/lib/contextCompression.ts` + `src/lib/clientProviderAdapter.ts` | dependency-free deterministic trait; owner-cloud evidence passed on `veloce-cloud-test-00158-24s`; current research-routing rollout is `00162-7tn` |
| Standing-instruction budget | `src/lib/instructionBudget.ts` + `src/lib/clientProviderAdapter.ts` | dependency-free redacted measurement at the provider boundary; shared authenticated current-image smoke passed |
| Native industry playbooks | `src/lib/nativeIndustryPlaybooks.ts` + `src/lib/clientPlaybooks.ts` | data-driven 14-family/28-outcome registry; shared authenticated intent and gating smoke passed; specialized evidence remains bounded |
| Research evidence | structured research worker output metadata | implemented and cloud-smoked on `00145-jcn` |
| Research provider routing | `src/lib/researchProviderRouter.ts` + `/api/client-runtime/research` + `src/lib/researchWorkerAdapters.ts` | dependency-free, deterministic, flag-gated; bounded search prefers approved Brave, extraction uses Firecrawl or an explicitly configured isolated worker, and unavailable providers fail closed or fall back safely; Brave owner-cloud evidence passed on `00162-7tn`; crawler workers are contract-active but not enabled |
| Knowledge evidence | `src/lib/contextCompiler.ts` snapshot + reviewed activation | implemented |
| Visual-QA persistence | `product-experience/supabase-client-visual-qa.sql` | identifier defect fixed; authenticated queue route, bounded adapter, replay-safe smoke harness, and report/findings persistence implemented; owner-cloud activation remains pending |
| Client UX | existing workflow and manifest | unchanged; no skill/tool selector |

## Promotion order

1. Run `npm run verify:capability-traits`, `npx tsc --noEmit`, the focused
   Research/Notebook/SEO suites, security and client-isolation checks, and the
   production build.
2. Deploy the same image to local and owner-cloud test lanes. **Local build is
   complete; the current owner-cloud research-routing revision is
   `veloce-cloud-test-00162-7tn` (the earlier `00158-24s` compression/intent
   evidence remains preserved below).
   This shared smoke is not evidence for the separately gated Visual QA
   `dofgfood` activation.**
3. Run authenticated Research + Knowledge smoke with a fresh query and
   idempotency key. Verify citations, trait evidence, tenant isolation,
   deletion lineage, retry identity, budget settlement, and operator inspection.
   **Completed: 2 records, 2 citations, trait version `v96-traits-1`, 13
   evidence entries, and deterministic replay.**
4. Record the image digest/revision in `docs/V96-VERIFICATION-REPORT.md` before
   promoting the manifest.
5. Only then advance a catalog entry into a pilot or enabled state.

Visual QA is implemented as a governed capability targeting the `dofgfood`
owner-cloud manifest, but its authenticated cloud activation/smoke is still
pending because the currently discoverable service is `veloce-cloud-test` with
`CLIENT_SLUG=veloce-cloud-test`; it is not a `dofgfood` deployment. GPU media,
security execution, communications, and resumable worktrees remain gated. Their
repository references are useful contracts, not permission to run imported
runtimes in the Next.js process.

The reference register integrity layer is now machine-checked: references
must have clean URLs, pinned revisions or dated records, known licenses,
runtime classes, statuses, non-empty execution permissions, placements, and
evidence gates. Tokenized URLs and under-specified entries fail the focused
suite. The preserved planning brief is
[`docs/future-integrations/V96-NATIVE-CAPABILITY-PLANE-BRIEF.md`](./future-integrations/V96-NATIVE-CAPABILITY-PLANE-BRIEF.md).

## Wave 2 parity closure and additive research providers — 2026-08-13

The research worker now distinguishes the selected provider at every boundary:
job metadata, trait provenance, budget reservation/settlement, research runs,
citations, and operator evidence. Firecrawl-only manifests do not require a
Brave secret. Brave-only manifests require `BRAVE_API_KEY` and enforce
search-only behavior at the worker even if a job is manually crafted.

The local parity command remains intentionally non-GCP-dependent. The separate
`verify:parity:local:tunnel` command accepts only a manually supplied public
HTTPS tunnel URL and runs the Cloud Tasks-dependent surfaces. `cloudflared` is
not installed or launched automatically. Crawl4AI, Crawlee, and Jina Reader
are `contract-active` references with disabled external workers; their upstream
runtimes remain outside the image until separately evidenced.

Current evidence: focused tests, typecheck, lint, reference validation, worker
verification, and the production Docker build pass. Full local tunnel parity
also requires the explicit development-only `--gcp-auth` launcher option (or
`CLIENT_RUNTIME_LOCAL_GCLOUD_AUTH=1`) so a laptop can obtain a Cloud Tasks API
token; production never shells out to gcloud. Cloud parity and Brave promotion
remain separate acceptance gates. Firecrawl remains the deployed default. Visual QA promotion
for `dofgfood`, GPU, Supervision enhancement, security execution,
communications, worktrees, and continuous streaming speech remain gated.
The historical owner-cloud Firecrawl-default deployment was revision
`veloce-cloud-test-00153-wn6`, image digest
`sha256:1e5395fcf9e5b41967c5bfd1738cdef33be7dc348993edd9eebb435c401f2123`,
with `context-compression` and intent routing enabled. Authenticated intent
smoke and full cloud parity passed.

## Native research provider routing — 2026-08-20

`src/lib/researchProviderRouter.ts` is a Veloce-owned routing boundary, not an
upstream runtime. The owner-cloud server manifest now sets
`CLIENT_RESEARCH_ROUTING_ENABLED=1`. With the flag enabled, bounded search
prefers Brave only when its server-side key and capability allowlist are both
present; content extraction selects Firecrawl because Brave is search-only; if
Brave is unavailable, the router uses approved Firecrawl, and if neither lane
is eligible it fails closed. The selection reason, eligible providers, policy
version, and bounded cost estimate are stored in job metadata without keys or
raw evidence. Direct Brave smoke passed on `00160-x4m`; automatic-routing smoke
passed on `00162-7tn`; Firecrawl remains the manifest default while Brave is
the automatically selected bounded-search lane when eligible.

## Isolated research-worker plane — 2026-08-20

`src/lib/researchWorkerAdapters.ts` defines the Veloce-owned
`v96-research-worker-v1` HTTPS contract for Crawl4AI, Crawlee, and Jina Reader.
The adapter sends only a bounded public-HTTPS extraction request, uses a
server-side worker token, hashes the tenant scope, rejects private or
credential-bearing URLs, bounds response bytes/text, redacts secret-like
output, and normalizes citation-ready extraction results. The deterministic
router considers content fit, configured cost, latency, and reliability.

The client route can automatically compose Brave search with an approved
extraction worker when Firecrawl is unavailable and a read was requested. A
caller cannot select a worker or provide an arbitrary crawl list. The worker
config is derived from `researchWorkerConfig` in the server manifest and is
disabled unless its secret, allowlist, and evidence reference are present.

The three catalog entries remain `contract-active`, not installed or
cloud-enabled. The Jina Reader worker implementation now lives in
`workers/research-jina/` and is covered by focused boundary tests; it validates
the Veloce worker token, rejects private targets, calls only `r.jina.ai`, and
returns bounded normalized evidence. This is local implementation evidence,
not deployment evidence. Jina still requires a separately deployed worker,
`JINA_WORKER_TOKEN`, an upstream `JINA_API_KEY`, authenticated smoke, budget and
citation parity, tenant/deletion evidence, and rollback proof before its
manifest entry can be enabled.

## Headroom compression pilot — 2026-08-12

The shared provider adapter now resolves `context-compression` for
provider-bound capabilities and applies the server-side
`CLIENT_ENABLED_TRAITS=context-compression` switch. The Veloce-owned contract
deduplicates repeated non-authoritative context and normalizes safe whitespace;
the current request, system policy, code fences, URLs, citations, identifiers,
and approval instructions are preserved. It never silently truncates. If the
compressed payload cannot fit, the original is used only when it fits;
otherwise the job fails closed.

Cost estimation runs against the prepared provider messages. Evidence contains
the policy version, mode, character counts, ratio, content hash, and redacted
segment labels only. The Headroom repository is not installed or bundled.

## Wave 5B standing-instruction budget measurement — 2026-08-19

The provider boundary measures the always-loaded instruction layer with stable
segment IDs, line/character counts, mandatory versus optional counts, limits,
and a hash. Raw policy and private instruction content never enters the
evidence object. This is intentionally measurement-only: safety, tenant,
provenance, approval, and other mandatory instructions are never silently
deleted or reordered. The local focused/reference suites, typecheck, lint,
worker boundary check, and approved-environment build pass; cloud evidence
must be recorded after the next image deployment.

Local evidence: 27 focused tests, typecheck, lint, reference validation, and
the approved-environment production build pass. The default Turbopack build
also passes in the approved build environment; its earlier sandbox failure is
historical infrastructure noise, not an application failure.

Owner-cloud compression evidence: revision `veloce-cloud-test-00158-24s`, image
digest `sha256:28d8c72df8ff5b30d404dba3ba7b0750625f189a006df5a1d3086c5a64f45c15`,
and manifest `CLIENT_ENABLED_TRAITS=context-compression`. The authenticated
workflow, provider, intent, and hosted-loop smoke passed with replay identity
preserved. The provider job persisted reduced character counts and a redacted
input hash; raw repeated context was not persisted. Dedicated Brave, Visual QA,
tunnel-parity, and two-tenant evidence remain separate gates.

## Native intent router and playbook plane — 2026-08-13

Natural-language provider chat now enters the governed `intent-routing`
preflight job. Veloce-owned playbook contracts are filtered by the client
manifest; upstream runtimes are never installed. Deterministic matching runs
first, and ambiguous requests use the approved provider only as a bounded,
tool-free classifier with strict registry validation, a 0.78 confidence
threshold, one clarification question, compression, and redacted hash/count
evidence. The local launcher and cloud provisioning expose the same
`CLIENT_INTENT_ROUTING_ENABLED` manifest switch. A quiet plan card is rendered
in provider chat and a read-only Ready playbooks library is rendered in
Integrations; gated entries remain ineligible.

The resolver also fails closed before classification for explicit
security-execution language such as “security assessment against a staging
target” or “penetration test.” These requests produce a review clarification,
never an automatic dispatch. This guard is implemented locally and must be
revalidated in the owner-cloud image after deployment; the later research
router rollout is recorded on `00162-7tn`. Dedicated Visual QA activation
remains separate and gated.
