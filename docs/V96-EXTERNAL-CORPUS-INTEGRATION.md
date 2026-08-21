# V96 external corpus integration — one OS, two deployments

**Status:** active governed registry; Waves 1 and 2 are accepted, Waves 3–5
are implemented locally and present in the owner-cloud image. The shared
authenticated smoke passed on `veloce-cloud-test-00162-7tn`; Brave research
routing is now cloud-enabled. Visual QA, full tunnel-parity, and two-tenant
evidence remain separate gates.
Native Veloce behavior is enabled only where evidence says so; upstream
runtimes remain outside the product image.
**Date:** 2026-08-13

Ten external resources are to be absorbed into the OS, plus a **30-repository
harness corpus** catalogued in its own section below. This file records what each
one is, its licence, and exactly where it lands — so the decision is reviewable
before any of it is built, and so nobody re-derives it later.

The product model itself is not restated here. It lives in
[local-to-cloud-client-product-model.md](./local-to-cloud-client-product-model.md);
this document is the corpus disposition and defers to that one on the graduation
contract, release process, and guardrails.

---

## Wave 2 parity and research-provider checkpoint — 2026-08-13

The shared research boundary now supports a server-selected Brave adapter
beside Firecrawl. Firecrawl remains the default and requires only
`FIRECRAWL_API_KEY`; Brave requires only `BRAVE_API_KEY` when the manifest
selects `CLIENT_RESEARCH_PROVIDER=brave`. Both use the existing tenant RPCs,
budget ledger, retry identity, citation persistence, deletion lineage, and
audit metadata. Brave is search-only: three results maximum, HTTPS URLs only,
bounded queries, and no caller-controlled scraping even for manually crafted
jobs. Brave is now cloud-enabled: direct Brave smoke passed on `00160-x4m`,
and automatic-routing smoke passed on `00162-7tn`. Firecrawl remains the
extraction fallback and configured provider default.

Crawl4AI, Crawlee, and Jina Reader are pinned Apache-2.0 architectural
references with a Veloce-owned `v96-research-worker-v1` contract adapter. They
are contract-active in the registry but still disabled: no upstream runtime is
installed, no worker endpoint is bundled, and no client can choose one. The
Jina worker implementation is now present in `workers/research-jina/` and
locally tested; it remains disabled until its endpoint, separate worker and
upstream secrets, authenticated smoke, citation/budget parity, tenant/deletion
evidence, and rollback bundle pass. The server router may compose Brave search
with a worker only after those gates pass.

For full local Cloud Tasks parity, start the tunnel manually and pass its
HTTPS origin to the launcher:

```bash
cloudflared tunnel --url http://127.0.0.1:3939
npm run dev:client-runtime -- --env-file ~/.veloce-supabase.env --port 3939 --public-base-url https://<temporary-tunnel>.trycloudflare.com --gcp-auth
VELOCE_LOCAL_PUBLIC_URL=https://<temporary-tunnel>.trycloudflare.com npm run verify:parity:local:tunnel
```

Without a tunnel, localhost remains fail-closed with `task_base_url_not_public`.
The tunnel is never started or persisted by Veloce, and the community Cloud
Tasks emulator is test-only rather than authoritative. `--gcp-auth` is an
explicit local-development opt-in that calls `gcloud auth print-access-token`
only when the metadata identity is unavailable; it is disabled in production
and never logs or persists the token.

## The framing

**Local and cloud are the same OS.** `veloce-cloud-test` is the dogfood tenant.
Every other client gets the same architecture; exactly two things differ:

1. **What they create** — content, artifacts, records.
2. **Their GCP secrets** — provider keys in their own Secret Manager.

Surfaces, playbooks, loops, roles, traits and the intent router are one
architecture in **one image**, shipped to both. This is already the stated design
goal of the native intent router: *"Roll out identically to local and
`veloce-cloud-test` … the same deployed image used for both environments."*

"Veloce-authored" governs **the products and changes a client creates**. It is a
rule about work product, not an architectural wall between environments.

### Why this makes absorption cheap

Every registry lives in `src/lib` and ships in the same image:

| Registry | File | Entries today |
|---|---|---|
| Playbooks | `clientPlaybooks.ts` + native playbook registries | 62 native registry entries (6 core, 14 Wave 4A/4B, 28 Wave 4C family outcomes, 7 loops, 7 curated roles) |
| Intent router | `clientIntentRouter.ts` | confidence threshold `0.78` |
| Traits | `capabilityTraits.ts` | 27 trait ids |
| Repository provenance | `v96RepositoryCatalog.ts` | 43 licensed/pinned entries; 2 unlicensed portfolio references remain explicit but outside the executable catalog |
| Curated skill roles | `v96SkillPack.ts` | 7 roles |

**Adding a corpus entry to a shared registry is parity-correct by construction** —
it is literally the same code in both environments. Parity can only break where a
lane reads the operator filesystem.

---

## Dispositions

| Resource | Licence | Lands as |
|---|---|---|
| [500-AI-Agents-Projects](https://github.com/ashishpatel26/500-AI-Agents-Projects) | MIT | Catalog row + **60–80 authored playbooks** across 19 industries |
| [pinrule](https://github.com/jhaizhou-ops/pinrule) | MIT | **`drift-guard` trait** — deterministic, non-LLM, pre-execution |
| [social-media-skills](https://github.com/charlie947/social-media-skills) | MIT | 22 skills → content/social playbooks and roles |
| [The 53 Best Claude Skills](https://drive.google.com/file/d/1SoswRHsGY0oOeWQuKwurXOg2u-OoifL0/view) | index, not code | Curation source; **reconcile with existing catalog rows** |
| Harness essay (Charlie Hills) — `launch-system/Wait, your Claude doesn't have a harness_!.pdf` | essay | **Audit frame** — five components, checked in both environments |
| Instruction-budget essay (Charlie Hills) — `launch-system/Delete your CLAUDE.md - by Charlie Hills - MarTech AI.pdf` | essay | **Instruction-budget discipline** — a measured ceiling on standing instructions, Wave 5 |
| Harness corpus — 30 repositories, same author, grouped by the five components | mixed, see [table](#the-harness-corpus--30-repositories) | Split across Waves 3–5; **10 of 30 slugs as supplied were wrong** |
| [15 AI loops worth stealing](https://learnaiwithmariah.com/guides/ai-loops-worth-stealing/) | article | **Named loop registry** — makes Loop reachable from the router |
| [system-design-primer](https://github.com/donnemartin/system-design-primer) | **MIT**, 363k★ | System-design playbook + reference role, attribution recorded |
| [DevOps-System-Design](https://github.com/aman556/DevOps-System-Design) | **none** | **Cannot be a catalog row** — the validator rejects `license: "unknown"`. Documented here, cite nothing |
| [jj (Jujutsu)](https://github.com/jj-vcs/jj) | Apache-2.0 | Concepts only → operation-log/undo for plan replay (ADR) |

### Runtime reality, not a policy choice

The 500-agents frameworks (CrewAI, AutoGen, Agno, LangGraph) and pinrule are
**Python**. `Dockerfile.client` is `node:24.14.1-slim` with no interpreter —
verified by `grep -icE "^(FROM|RUN).*(python|pip)" Dockerfile.client` returning
`0`. This is the same wall that deferred Roboflow Supervision.

Their *patterns* are therefore re-expressed natively, which has the side benefit
of running identically in both environments. Nothing is installed.

The 53-skills entries are `npx skills add …` packages for the authoring
environment. Their patterns may become playbooks that ship in the image; the
packages themselves do not.

### Two notes on the sources

- **Three of the nine are one system.** `charlie947/social-media-skills` is item
  #53 of *The 53 Best Claude Skills*, and the harness essay is by the same
  author.
- **DevOps-System-Design is the weakest input**: 1 star, 12 commits, and **no
  LICENSE file**, so its content cannot be lawfully reused.
  [system-design-primer](https://github.com/donnemartin/system-design-primer)
  covers the same ground under MIT with attribution. It is catalogued as
  considered, not adopted.

---

## The harness corpus — 30 repositories

The harness essay ships a reading list of 30 repositories grouped under five
headings: **HARNESS** (what it does before it types), **SKILLS** (the jobs it
repeats), **MEMORY** (what survives the session), **TOOLS** (what it reaches past
the terminal), **COST** (what it actually burns).

These are the same author's second taxonomy, and it is *not* identical to the
five-component audit frame already in Wave 5 — it overlaps it. HARNESS covers
Context and Personalisation together, SKILLS lines up with Delegation, MEMORY and
TOOLS map cleanly onto Memory and Action. The residue is the interesting part:
**COST has no row in the Wave 5 component table at all**, which is the corpus's
most useful single finding. See
[Wave 5](#wave-5--design-reference--harness-audit).

### Slugs were resolved before use, and most were wrong

The list as circulated is truncated at the source — several entries are Google
*search* URLs rather than repository URLs, and two owners contradict themselves
between renderings. Every slug below was resolved against the GitHub API. **Ten
of thirty were wrong as supplied; two do not resolve at all.**

| As supplied | Actually | Note |
|---|---|---|
| `thedotkevin/claude-mem` | `thedotmack/claude-mem` | wrong owner |
| `Othmanic/planning-with-files` | `OthmanAdi/planning-with-files` | wrong owner |
| `colbyfayock/codegraph` | `colbymchenry/codegraph` | wrong owner (list gives both) |
| `yamada-ui/repomix` | `yamadashy/repomix` | wrong owner |
| `github/mcp` | `github/github-mcp-server` | wrong name |
| `CompositeAI/awesome-claude-skills` | `ComposioHQ/awesome-claude-skills` | wrong owner |
| `mendableai/firecrawl` | `firecrawl/firecrawl` | org renamed; old slug redirects |
| `leonxlnx/taste-skill` | `Leonxlnx/taste-skill` | case |
| `jarro…/claude-hud` | `jarrodwatts/claude-hud` | truncated |
| `Juliu…/caveman` | `JuliusBrussee/caveman` | truncated |
| `anthropics/claude-plugins` | **unresolved — 404** | excluded until identified |
| `GraphifyAI/graphify` | **unresolved — no canonical repo** | excluded until identified |

Star counts are deliberately not recorded here: the counts this environment's
`gh` returned were implausible on repositories whose real scale is known, so they
are not evidence. Licences were spot-checked against independently known values
and did agree.

### Disposition, by component

`W3`/`W4`/`W5` is the wave; **operator-only** means it configures the authoring
environment and never enters the product image — the same rule already applied to
the 53-skills packages.

| # | Repository | Licence | Wave | Lands as |
|---|---|---|---|---|
| **HARNESS** ||||| 
| 1 | [learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) | MIT | W5 | Minimal-harness baseline — the "0 to 1" agent harness the audit measures against |
| 2 | [andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) | **none** | W5 | Reference-only, `license: "unknown"` — **cite nothing** |
| 3 | [superpowers](https://github.com/obra/superpowers) | MIT | **W3** | Named loops — its methodology *is* a loop registry (brainstorm → plan → TDD → review) |
| 4 | [ponytail](https://github.com/DietrichGebert/ponytail) | MIT | **W3** | Restraint loop — "the best code is the code you never wrote"; pairs with `drift-guard` and Anti-Spin |
| 5 | [gstack](https://github.com/garrytan/gstack) | MIT | W5 | **Already catalogued** as `operator-only` — extend the row, do not duplicate |
| 6 | [ECC](https://github.com/affaan-m/ECC) | MIT | W5 | Closest external analogue to the audit frame: skills, instincts, memory, security, research-first |
| **SKILLS** ||||| 
| 7 | [taste-skill](https://github.com/Leonxlnx/taste-skill) | MIT | W4 | Content/creative playbook input |
| 8 | [anthropics/skills](https://github.com/anthropics/skills) | *not reported* | W4 | Skill-role source — **confirm licence before any reuse** |
| 9 | [wshobson/agents](https://github.com/wshobson/agents) | MIT | W4 | Specialist roles — the direct fix for Wave 4's *weak specialist intents* |
| 10 | [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | MIT | W4 | Design playbook on the Studio surface |
| 11 | [awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) | **none** | W4 | Curation source only — **cite nothing**, same rule as the 53-skills index |
| **MEMORY** ||||| 
| 12 | [planning-with-files](https://github.com/OthmanAdi/planning-with-files) | MIT | W5 | Memory component; crash-proof plans tie into the **jj** plan-replay ADR |
| 13 | [claude-mem](https://github.com/thedotmack/claude-mem) | Apache-2.0 | W5 | Memory component — cross-session persistence |
| 14 | [codegraph](https://github.com/colbymchenry/codegraph) | MIT | W5 | Memory/knowledge surface — pre-indexed graph, auto-synced |
| 15 | [repomix](https://github.com/yamadashy/repomix) | MIT | W5 | Context component — repository packing |
| **TOOLS** ||||| 
| 16 | [multica](https://github.com/multica-ai/multica) | `NOASSERTION` | W5 | Delegation evidence, operator-only — **custom licence, review before reuse** |
| 17 | [firecrawl](https://github.com/firecrawl/firecrawl) | **AGPL-3.0** | — | **Already live** as the default research provider, consumed *as a hosted service*. No new row. AGPL binds on vendoring, which Veloce does not do |
| 18 | [cc-switch](https://github.com/farion1231/cc-switch) | MIT | W5 | Operator-only |
| 19 | [vibe-kanban](https://github.com/BloopAI/vibe-kanban) | Apache-2.0 | W5 | Operator-only |
| 20 | [github-mcp-server](https://github.com/github/github-mcp-server) | MIT | W5 | Action component reference |
| 21 | [playwright-mcp](https://github.com/microsoft/playwright-mcp) | Apache-2.0 | W5 | Action component reference; Veloce already runs Playwright in verification |
| 22 | [claude-code-router](https://github.com/musistudio/claude-code-router) | MIT | W5 | **Strongest Action-component analogue** — a control plane routing across models, which is what the provider allowlist and model routing already are |
| 23 | [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) | MIT | W5 | Curation source |
| **COST** ||||| 
| 24 | [system-prompts-and-models-of-ai-tools](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools) | **GPL-3.0** | W5 | Reference-only. **GPL — never vendored into the image** |
| 25 | [claude-code-best-practice](https://github.com/shanraisshan/claude-code-best-practice) | MIT | W5 | Audit checklist input |
| 26 | [codex-plugin-cc](https://github.com/openai/codex-plugin-cc) | Apache-2.0 | W5 | Delegation component reference |
| 27 | [claude-hud](https://github.com/jarrodwatts/claude-hud) | MIT | W5 | **Cost/observability** — context usage, active tools, running agents |
| 28 | [caveman](https://github.com/JuliusBrussee/caveman) | `other` | W5 | **Cost** — the instruction-budget thesis made executable; **review licence** |
| 29 | `anthropics/claude-plugins` | — | — | **Unresolved (404)** — excluded |
| 30 | `graphify` | — | — | **Unresolved** — excluded |

### Operator-confirmed reference set

Four entries were independently checked by the operator on 2026-08-13 and are
adopted as **governed references**. Their licences make that the only lawful
disposition available, which happens to match the intent exactly:

| Repository | Licence | Disposition |
|---|---|---|
| [system-prompts-and-models-of-ai-tools](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools) | **GPL-3.0** | Read for structure. **Never vendored, never quoted into the image** |
| [andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) | **none** | Read only. `license: "unknown"` — **cite nothing** |
| [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) | **none** | Curation index — tells you what exists; nothing quotable |
| [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) | **none** | Curation index — as above |

Two notes worth having in writing. **`travisvn` and `ComposioHQ` are two
independent lists of the same name, and both are unlicensed** — adding the second
widens coverage but does not relieve the constraint. And **all four are
read-only-by-licence**, so they can shape a design decision but can never supply
a line of shipped text. That is the same rule already applied to
DevOps-System-Design, applied consistently rather than as a special case.

### What this corpus does not become

Twenty-eight resolved repositories do **not** become twenty-eight catalog rows.
`V96RepositoryReference` requires a **pinned `sourceCommit` SHA** per row — no SHA
is invented here, so pinning is work inside the wave that adopts each entry, not a
prerequisite this document can satisfy on paper.

Three licences are hard constraints rather than metadata: **GPL-3.0** (#24) and
the two **no-licence** entries (#2, #11) can be read and learned from but never
quoted or vendored — the rule already established for DevOps-System-Design. Two
more (#16 `NOASSERTION`, #28 `other`) need a human licence read before any use.

---

## Measured parity risk

Registries are safe. The risk is lanes that read the operator machine, which is
already forbidden by the guardrail *"never copy operator vault data, Mac paths,
cookies, personal CLI sessions, or provider credentials into a client image."*

| Measure | Count |
|---|---|
| `src/lib` libs reading `os.homedir()` / `~/.hermes` / `process.env.HOME` | **55** |
| Tenant-scoped `client*.ts` libs | **39** |
| Name-matched local↔hosted pairs | **0** |

The mapping is implicit. `loopEngine.ts` (local, reads `~/.hermes`, not
tenant-safe) and `clientLoopAdapter.ts` (hosted, typed, no filesystem) are two
implementations of one idea with nothing asserting they stay equivalent.

**A parity harness already exists and is not used as one.**
`scripts/verify-client-runtime-surface-map.mjs` accepts `--url` and
`--cookie-file`, and asserts 45 routes, 4 record kinds, 8 workflow surfaces and
11 brief surfaces. Pointed at local and at cloud, its two runs must agree.

---

## Waves

### Wave 1 — Close the plane gaps

Defects in the plane the corpus plugs into. All four are invisible in **both**
environments, so they are not cloud-specific.

1. **`clarificationQuestion` is dead.** The worker writes it; the intent GET
   projection omits it, so the plan card declares a field that never arrives.
   The router's "ask one clarification" behaviour cannot be seen today.
2. **`requiredTraits` is never verified.** Nothing asserts
   `playbook.requiredTraits ⊆ resolvedBundle.traits`; enforcement is advisory.
   **This is the pinrule pattern** — deterministic, pre-execution, logged.
3. **`riskClass: "external"` is declared and unused.** The worker branches only
   `low` vs not-low. Wave 4's publishing playbooks are its first real users.
4. **Loop is unreachable from the router.** `ClientIntentSurface` has no `loop`
   member, and the two surface vocabularies — `ClientIntentSurface` (6 request
   surfaces) and `V96_PERMITTED_SKILL_SURFACES` (12 product surfaces) — are
   unreconciled.

### Wave 2 — Parity spine — **ACCEPTED 2026-08-13**

Accepted at `7cc7d3f`, cloud revision `veloce-cloud-test-00153-wn6`. Both parity
commands pass, the lane map and filesystem guard are enforced, and the launcher
names its own prerequisites instead of failing silently.

**What acceptance does and does not mean.** Local parity passes *the surface
local can run* — 45 routes, capabilities, credentials, provider-history and four
record kinds. It is not equivalence: 15 client routes need Cloud Tasks or a GCP
metadata identity, and Cloud Tasks is a push queue, so `cloudTasks.ts`
fail-closes on a localhost base URL. A `cloudflared` tunnel lane exists for full
local parity but requires a manually installed binary and is never started by
Veloce.


Makes "local = cloud" checkable rather than asserted.

- **Declare the lane map** (`src/lib/laneParity.ts`): each capability's local lane
  and hosted lane, as data.
- **Assert no shared registry depends on a filesystem lane** — a static test that
  no playbook or loop entry transitively imports a lib touching `os.homedir()`.
  This is what stops a playbook working locally and failing in cloud.
- **Promote the surface-map script to a parity gate** with an npm script, so it
  is one command rather than tribal knowledge.

#### Running authenticated local parity

The local launcher cannot invent a tenant or an operator identity, so it now
refuses to pretend: it starts, tells you which of the four prerequisites are
missing, and serves unauthenticated browsing only. Previously it started
silently and answered `401` to everything, because `clientAuth.ts` returns
`false` for every user when the email allowlist is empty under client edition.

Secrets stay in a file and are passed **by path**; only non-secret values go on
the command line:

```bash
# ~/.veloce-supabase.env must be chmod 600 and hold SUPABASE_URL + SUPABASE_ANON_KEY.
CLIENT_SLUG=<tenant-slug> \
CLIENT_ALLOWED_USER_EMAILS=<your-login-email> \
CLIENT_MODEL_ALLOWLIST=<comma-separated approved models> \
npm run dev:client-runtime -- --env-file ~/.veloce-supabase.env --port 3939
```

Then, with a browser session cookie file (never pasted into a terminal or chat):

```bash
npm run verify:parity:local
npm run verify:parity:cloud
npm run verify:parity          # both, in order
```

`CLIENT_MODEL_ALLOWLIST` is the one that is easy to miss. Without it the runtime
authenticates correctly and then stops at `model_not_allowlisted`, which looks
like an application failure and is not — cloud supplies the allowlist through
its manifest, and local has no manifest.

### Wave 3 — Named loop registry

Loop is a free-text goal box with no templates. Add named loops in the
`ClientPlaybook` shape over `clientLoopAdapter.ts` (`LOOP_MAX_ROUNDS = 5`,
`LoopVerdict`). Several of the 15 already exist unnamed — catalogue, do not
rebuild:

| Loop | Veloce status |
|---|---|
| Plan-Generate-Verify-Fix (hard cap) | **Exists** — `clientLoopAdapter`, `LOOP_MAX_ROUNDS` |
| Human-in-the-loop approval queue | **Exists** — the approval boundary |
| Adversarial review / verifier | **Exists** — `loopEngine` builder+judge, **local only**; needs a hosted twin |
| Goal-meta-skill (vague → verifiable goal) | **Is the intent router** |
| Completion contract (no success claim without evidence) | **Is the house rule** |
| Anti-spin (stalls, retries, contradictions) | **New** — pairs with `drift-guard` |
| Quality streak (N consecutive clean passes) | **New** |

**Corpus slice — two repositories inform this wave, neither is installed.**

- [superpowers](https://github.com/obra/superpowers) (MIT) is the closest external
  precedent for what Wave 3 builds: a methodology expressed as *named, invocable
  process loops* rather than prose advice. Read it for loop **granularity and
  naming** — where one loop ends and the next begins — not for content to copy.
- [ponytail](https://github.com/DietrichGebert/ponytail) (MIT) encodes a restraint
  loop: prefer the change not made. That is the missing half of **Anti-Spin**,
  which as specified only detects stalls and contradictions. Restraint is a
  distinct verdict from "spinning" and the `LoopVerdict` union should say so
  before the two get conflated.

Both are Veloce-authored re-expressions. The Wave 3 constraint is unchanged and
binds them: a loop playbook goes through `clientLoopAdapter`, never `loopEngine`,
or the Wave 2 filesystem guard fails it.

#### Wave 3A — native named-loop contracts

A Veloce-owned registry, `src/lib/clientLoopRegistry.ts`, in the terse-row style
the catalog already uses. Each contract declares its stop conditions, round cap,
required traits and risk class as **data**, so the worker enforces them rather
than a prompt requesting them. `superpowers` informs loop granularity and naming;
`ponytail` informs the restraint verdict. Neither runtime is installed.

Every contract preserves the traits already baseline-required — approval, budget,
idempotency, resumability (checkpoints) and audit. A named loop is a bounded
shape over the existing adapter, never a way around its guarantees.

#### Wave 3B — cost accounting and loop budget enforcement

`budget` already exists as a baseline trait, and it answers one question: *is
spend authorised.* It does not answer *what did this actually cost, and is it
still worth continuing.* The new `cost-accounting` trait covers six measures:

| Measure | Substrate |
|---|---|
| Estimated vs actual provider cost | new — variance is the signal |
| Compression savings | pairs with the existing `context-compression` trait |
| Retry and fallback cost | the cost of the Wave 2 provider chain, currently invisible |
| Per-round loop cost | `LoopRound.costMicros` — **already recorded, never enforced** |
| Tenant / job / playbook budget usage | rolls up the above |
| **Hard stop on budget exhaustion** | `onFailure: "blocked"` |

The important discovery is the fourth row: `LoopRun.costMicros` and
`LoopRound.costMicros` exist today and `loopShouldContinue` ignores both. A loop
stops on a pass or the round cap and **on nothing else** — so the round cap is
currently the only thing standing between a tenant and an unbounded spend. That
is the gap 3B closes.

`budget` stays as-is and keeps its meaning; `cost-accounting` is additive.

#### Wave 3C — tests and smoke

Focused tests plus local and cloud smoke. Per the house rule, **each gate is
verified by breaking it**: a loop that exceeds its budget must stop, and the test
must observe it stopping rather than assume it.

#### Wave 3D — pin and catalogue

Only once adopted: pin each reference to a commit SHA and add its catalog row.
Cataloguing last is deliberate — rows then describe what was actually used, not
what was intended.

**Unlicensed references cannot be catalogued at all.**
`validateV96RepositoryReference` rejects a `license` of `unknown`,
`review-required` or `unverified`, so the plan recorded earlier for
DevOps-System-Design — a reference-only row carrying `license: "unknown"` — is not
expressible. Unlicensed entries live in this document and nowhere else. The
catalog is for things with a licence you could act on.

### Wave 3 — landed locally 2026-08-19

3A, 3B and 3D are implemented; 3C's focused tests pass and the cloud smoke
remains outstanding.

| Added | What |
|---|---|
| `src/lib/clientLoopRegistry.ts` | 7 named contracts, stop conditions as data, projected into router playbooks |
| `src/lib/loopCostLedger.ts` | Cost ledger, pre-emptive budget stop, anti-spin detection |
| `src/app/api/client-runtime/loop/route.ts` | Deterministic idempotency identity for replayed hosted loop requests; duplicate runs/jobs are not created |
| `capabilityTraits.ts` | `cost-accounting`, fail-closed, on every provider-bound capability |
| `v96RepositoryCatalog.ts` | `superpowers` and `ponytail` pinned at real SHAs, `native-enabled` with rollback rules |
| `tests/loop-registry.spec.ts` | Contract, budget, anti-spin, and route-idempotency tests; each gate observed failing before being trusted |

Evidence: `npm run test:focused` 89/89, `npm run verify:references` 61/61,
`typecheck`, `lint`, `build`, and
`scripts/verify-client-runtime-worker.mjs` all pass locally. The hosted worker
image still needs a fresh authenticated cloud smoke with
`verify-client-runtime-authenticated.mjs --loop-smoke` before Wave 3 is accepted.

**A second defect surfaced while wiring the traits.** `model-allowlist` was
declared only by `provider-routing` and `intent-routing`, yet the runtime rejects
an off-allowlist model on *every* provider-bound capability with
`model_not_allowlisted`. Loop, research, SEO and orchestration were therefore
running under a guarantee their plans did not claim — the same class of defect as
Wave 1's unverified `requiredTraits`, found the same way, by making a playbook
declare what it actually needs. The trait now sits in `PROVIDER_BOUND_TRAITS`.

**Closed 2026-08-19:** the hosted loop worker now calls `loopStopDecision` after
each recorded round. It carries the selected contract, records the combined
builder-plus-judge cost, enforces budget/anti-spin/quality-streak stops before
the next round, and persists the stop reason, cost summary, and numeric budget
trace in job metadata and settlement evidence. The default direct Loop route
uses `plan-generate-verify-fix`; a governed internal job may carry another
validated contract ID. Upstream runtimes remain uninstalled.

### Wave 4 — Industry sweep + content pack

#### Wave 4A — native specialist slice — implemented locally 2026-08-19

The first eight Veloce-authored specialist playbooks now run through the same
intent router and trait checks as the original core playbooks:

`competitor-intelligence`, `seo-content-plan`, `launch-content`,
`customer-response`, `product-requirements`, `operations-checklist`,
`accessibility-review`, and `release-readiness`.

#### Wave 4B — domain outcome slice — implemented locally 2026-08-19

Six additional Veloce-authored playbooks now cover system design, content
strategy, social content, design direction, growth experiments, and knowledge
synthesis. They use the same intent, manifest, trait, and approval boundaries;
none can publish, send communications, execute security work, use a GPU, or
invoke an upstream runtime.

#### Wave 4C — data-driven industry families — implemented locally 2026-08-19

Fourteen bounded industry families compile into 28 native outcomes: one
evidence brief through the governed research lane and one operating plan through
the resumable orchestration lane. The compiler keeps the family vocabulary
small and auditable while giving the intent router useful coverage across SaaS,
e-commerce, healthcare operations, financial services, education, real estate,
manufacturing, nonprofit, agency, hospitality, legal operations,
cybersecurity readiness, media production, and developer tools.

These are not domain-advice agents and do not take external actions. Research
outcomes require citations and review; operating plans remain bounded plans.

They are deliberately small contracts rather than copied upstream prompts.
They inherit the approved provider, research, quality, budget, provenance,
approval, compression, and idempotency boundaries of their eligible
capabilities. This slice is local-tested only; cloud activation waits for the
same image deployment gate as Wave 3.

60–80 playbooks across the 19 industries. **Do not hand-write 80 verbose
objects** — mirror the catalog's own terse `REPOSITORY_ROWS` tuple table plus the
existing `BASE_TRAITS` / `PROVIDER_TRAITS` presets, expanded by one builder.

Rules per authored playbook:

- Veloce-authored prose; no third-party prompt text copied.
- `riskClass` honest — anything touching an outside system is `external`.
- `eligibleCapabilities` must already exist in the manifest; a playbook may not
  invent a capability.
- `skillIds` must resolve to roles passing `validateV96SkillManifest`.
- One catalog row for the corpus, not eighty.

Also fixes **weak specialist intents**, which today derive only from a role's
label and deliverable kind and match far worse than the hand-written natives.

**social-media-skills** becomes content playbooks on the existing SEO, Radar,
Studio and Video surfaces. Apify and Google-AI dependencies are capability-gated;
posting is `external`. The upstream skills generate prompts rather than posting,
which already matches the approval boundary.

**53-skills reconciliation:** `addyosmani/agent-skills`, `garrytan/gstack` and
`scrapegraphai` are **already** in `V96_REPOSITORY_CATALOG` — extend those rows,
do not duplicate them.

**Corpus slice — the SKILLS five (#7–#11).**
[wshobson/agents](https://github.com/wshobson/agents) (MIT) is the one that earns
its place: it is a *role* library, and weak specialist intents are weak precisely
because they derive from a role's label and deliverable kind alone. Mine it for
how roles are **described and disambiguated**, then author Veloce equivalents that
resolve through `validateV96SkillManifest`.

[taste-skill](https://github.com/Leonxlnx/taste-skill) and
[ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
(both MIT) are Studio-surface design inputs, adjacent to the social pack above.
[anthropics/skills](https://github.com/anthropics/skills) reported **no licence**
through the API — confirm it directly before reusing a single line.
[awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) has
no licence and is a curation source only: it tells you what exists, and nothing
from it is quotable.

### Wave 5 — Design reference + harness audit

#### Wave 5A — bounded harness audit reducer — implemented locally 2026-08-19

`src/lib/harnessAudit.ts` now reduces operator-inspection evidence into the six
component frame: personalisation, context, action, memory, delegation, and
cost. A missing cloud snapshot is `review`, never `pass`; a missing local
fail-closed signal is `blocked`. This keeps the audit honest without adding a
database control plane or reading raw tenant content.

- **system-design-primer** → a `system-design` playbook and reference role, MIT
  attribution recorded in the catalog row.
- **DevOps-System-Design** → reference-only row; nothing cited.
- **jj** → concepts only. Its **operation log and undo** map onto plan replay:
  today a repeated `idempotencyKey` returns the same `planId`, but there is no
  operation history to walk back. Worth an ADR, not an install.
- **Harness audit** — map both environments against the essay's five components
  and record, per component, whether local and cloud are at parity:

| Component | Veloce equivalent | Corpus reference |
|---|---|---|
| Personalisation | Tenant brand voice, trait kernel | #6 ECC |
| Context | Manifest, surface configuration | #1 learn-claude-code, #15 repomix |
| Action | Provider allowlist, capability gates, delivery adapters | #22 claude-code-router, #20, #21 |
| Memory | Memory surface, notebooks, lineage | #12 planning-with-files, #13 claude-mem, #14 codegraph |
| Delegation | Curated skill-pack specialist roles | #9 wshobson/agents, #16 multica, #26 codex-plugin-cc |
| **Cost** — *new sixth row* | Budget ledger, model allowlist, retry identity | #27 claude-hud, #28 caveman, #25 best-practice |

**The sixth component is the finding.** The audit frame as written has no cost
row, so an audit run against it would return five green components while saying
nothing about what the system burns. Veloce does have the machinery — the budget
ledger and model allowlist named in the Wave 2 checkpoint — so this is a gap in
the *frame*, not in the product. Add the row before running the audit, or the
audit certifies a blind spot.

**Cost is promoted out of the audit frame into a first-class trait** — decided
2026-08-13. An audit row is observed once; a trait is enforced on every job. The
specification is in [Wave 3B](#wave-3b--cost-accounting-and-loop-budget-enforcement).

#### Wave 5B — standing-instruction budget measurement — implemented locally 2026-08-19

`src/lib/instructionBudget.ts` measures the standing instruction layer at the
provider boundary without retaining raw instruction content. It records only
segment IDs, counts, limits, and a stable hash. It reports character and line
overflow but does not reorder, delete, or weaken mandatory tenant, provenance,
approval, or safety instructions. Provider preparation exposes this evidence so
operator inspection can compare instruction cost with compression and model
cost. The 200-line guidance from the essay is treated as a measurement default,
not as permission to remove guardrails.

#### Instruction-budget discipline — the second essay

The second Charlie Hills essay (`Delete your CLAUDE.md`) is a cost argument
dressed as a tidying exercise, and it converts into two measurable rules rather
than a philosophy:

1. **A ceiling on standing instructions.** The essay cites Anthropic's published
   guidance — *"target under 200 lines per CLAUDE.md file"* — on the grounds that
   longer files consume context and reduce adherence. Veloce's analogue is the
   manifest and trait kernel: everything loaded on **every** request regardless of
   relevance. That total is measurable today and is not currently measured.
2. **Position, not just volume.** Its second claim is the *Lost in the Middle*
   effect: long contexts are read carefully at the edges and skimmed in the
   middle. This is the sharper of the two for Veloce, because surface
   configuration is assembled programmatically — so **ordering is a build-time
   decision nobody is currently making on purpose.**

The essay's own remedy — audit prompts for instructions, skills and hooks — is an
authoring-environment workflow and does not ship. What ships is the measurement:
record the per-request standing-instruction budget per surface alongside the
existing parity numbers, so the trend is visible before it is a problem.

One caution on adopting the thesis wholesale: *delete 80% and see what happens*
is advice for a personal setup with a human watching every output. Veloce's
standing instructions encode tenant isolation, approval boundaries and deletion
lineage. **Any instruction-budget pass treats guardrails as non-negotiable** —
the same rule the essay itself states as "never touch a truth rule."

---

## Verification

```bash
npm run test:focused && npm run verify:references
npm run typecheck && npm run lint && npm run build
node scripts/verify-client-runtime-worker.mjs
npx playwright test tests/ --reporter=line
```

Parity gate — the same script against both environments, which must agree:

```bash
node scripts/verify-client-runtime-surface-map.mjs --url http://127.0.0.1:3939 --cookie-file <local>
node scripts/verify-client-runtime-surface-map.mjs --url https://veloce-cloud-test-mquo4bf7aq-el.a.run.app --cookie-file ~/.veloce-cookie
```

Then, per new industry cluster: a natural-language request resolves to the
expected playbook **in both**; an `external` playbook stops at `ready`; an
ambiguous request returns one clarification *that now reaches the client*; a
repeated idempotency key reuses the plan.

**Verify each gate by breaking it.** Plant a playbook naming a capability outside
the manifest, and one whose `requiredTraits` cannot resolve; confirm both are
rejected. A gate never observed failing is not a verified gate.

`npm run lint` is an explicit file allowlist with `--max-warnings=0` — every new
file must be added to it or it is silently unlinted.

---

## Sequencing

**Waves 1 and 2 are accepted; Waves 3–5 are implemented and present in the
owner-cloud image.** Native research routing is cloud-enabled on revision
`veloce-cloud-test-00162-7tn`; full local tunnel parity, isolated external
research workers, and the explicitly gated Visual QA/GPU/security/communications
lanes remain separate evidence gates. — *updated 2026-08-20*

The blocker recorded here previously — the intent router sitting uncommitted on
`codex/reviewed-additions-2026-08-10`, 52 files dirty — **is resolved.** That work
merged. `clientPlaybooks.ts`, `clientIntentRouter.ts`, `capabilityTraits.ts` and
`v96RepositoryCatalog.ts` are committed, and Wave 2 was accepted at `7cc7d3f`
against cloud revision `veloce-cloud-test-00153-wn6` with a clean tree.

| Wave | State |
|---|---|
| Wave 1 — plane gaps | Landed; `loop` is a real intake surface with a test asserting it |
| Wave 2 — parity spine | **Accepted** `7cc7d3f` |
| **Wave 3 — named loops** | **Implemented; hosted-loop smoke passed on `veloce-cloud-test-00162-7tn`** |
| Wave 4 — industry sweep | **Wave 4A/4B/4C implemented; shared intent and authenticated cloud smokes passed** |
| Wave 5 — design + harness audit | **Wave 5A/5B implemented; authenticated cloud smoke and live infrastructure audit recorded** |

Wave 3 executes in four steps, and the order is load-bearing — cost enforcement
lands *before* the tests that prove it, and cataloguing lands last so rows are
pinned against what was actually adopted:

| Step | Action |
|---|---|
| **3A** | Native named-loop contracts in the Veloce-owned registry |
| **3B** | Cost accounting and loop budget enforcement |
| **3C** | Focused tests plus local and cloud smoke |
| **3D** | Pin and catalogue the adopted references |

**The standing risk is that Wave 3 degenerates into a repository-import
exercise.** It is a Veloce-native capability implementation *informed by* the
corpus. No upstream runtime is installed; the repositories stay governed
references throughout.

Per the guardrail in the product model — *"treat future-integration research as
backlog until its hosted adapter, data boundary, and evidence bundle exist"* —
each resource above stays backlog until its wave lands with evidence.

## Related

- [Local-to-cloud product model](./local-to-cloud-client-product-model.md) — graduation contract, release process, guardrails
- [V96 infrastructure STAR plan](./V96-INFRASTRUCTURE-STAR-PLAN.md) — portfolio and merge order
- [V96 native capability-traits implementation](./V96-NATIVE-CAPABILITY-TRAITS-IMPLEMENTATION.md) — the trait kernel
- [V96 verification report](./V96-VERIFICATION-REPORT.md) — what is proven, and against which revision
- [Runtime capability matrix](./runtime-capability-matrix.md)
- [Future integration register](./future-integrations/README.md)
