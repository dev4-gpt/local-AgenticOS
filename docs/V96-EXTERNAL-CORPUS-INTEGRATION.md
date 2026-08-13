# V96 external corpus integration — one OS, two deployments

**Status:** active governed registry; additive Wave 2 provider work is in
progress. Native Veloce behavior is enabled only where evidence says so;
upstream runtimes remain outside the product image.
**Date:** 2026-08-13

Nine external resources are to be absorbed into the OS. This file records what
each one is, its licence, and exactly where it lands — so the decision is
reviewable before any of it is built, and so nobody re-derives it later.

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
jobs. Brave is locally implemented and tested, but is not cloud-enabled until
its Secret Manager version and authenticated smoke evidence are recorded.

Crawl4AI, Crawlee, and Jina Reader are pinned Apache-2.0 architectural
references. They are not installed, automatically selected, or allowed to
replace Firecrawl/Brave. A future provider resolver may choose among them only
after each isolated worker/hosted-boundary evidence gate passes.

For full local Cloud Tasks parity, start the tunnel manually and pass its
HTTPS origin to the launcher:

```bash
cloudflared tunnel --url http://127.0.0.1:3939
npm run dev:client-runtime -- --env-file ~/.veloce-supabase.env --port 3939 --public-base-url https://<temporary-tunnel>.trycloudflare.com
VELOCE_LOCAL_PUBLIC_URL=https://<temporary-tunnel>.trycloudflare.com npm run verify:parity:local:tunnel
```

Without a tunnel, localhost remains fail-closed with `task_base_url_not_public`.
The tunnel is never started or persisted by Veloce, and the community Cloud
Tasks emulator is test-only rather than authoritative.

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
| Playbooks | `clientPlaybooks.ts` | 12 |
| Intent router | `clientIntentRouter.ts` | confidence threshold `0.78` |
| Traits | `capabilityTraits.ts` | 27 trait ids |
| Repository provenance | `v96RepositoryCatalog.ts` | 39 entries |
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
| [15 AI loops worth stealing](https://learnaiwithmariah.com/guides/ai-loops-worth-stealing/) | article | **Named loop registry** — makes Loop reachable from the router |
| [system-design-primer](https://github.com/donnemartin/system-design-primer) | **MIT**, 363k★ | System-design playbook + reference role, attribution recorded |
| [DevOps-System-Design](https://github.com/aman556/DevOps-System-Design) | **none** | Reference-only catalog row, `license: "unknown"` — **cite nothing** |
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

### Wave 4 — Industry sweep + content pack

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

### Wave 5 — Design reference + harness audit

- **system-design-primer** → a `system-design` playbook and reference role, MIT
  attribution recorded in the catalog row.
- **DevOps-System-Design** → reference-only row; nothing cited.
- **jj** → concepts only. Its **operation log and undo** map onto plan replay:
  today a repeated `idempotencyKey` returns the same `planId`, but there is no
  operation history to walk back. Worth an ADR, not an install.
- **Harness audit** — map both environments against the essay's five components
  and record, per component, whether local and cloud are at parity:

| Component | Veloce equivalent |
|---|---|
| Personalisation | Tenant brand voice, trait kernel |
| Context | Manifest, surface configuration |
| Action | Provider allowlist, capability gates, delivery adapters |
| Memory | Memory surface, notebooks, lineage |
| Delegation | Curated skill-pack specialist roles |

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

**This wave has not started, and must not start yet.** At the time of writing the
intent router is uncommitted work in progress on
`codex/reviewed-additions-2026-08-10`:

- `clientPlaybooks.ts`, `clientIntentRouter.ts` and the intent route are
  **untracked** — not yet committed.
- `capabilityTraits.ts` and `v96RepositoryCatalog.ts` are modified.
- 52 files dirty overall.

Every Wave 1 and Wave 4 change touches those exact files. Start only once that
work merges.

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
