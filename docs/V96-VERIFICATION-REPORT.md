# V96 verification report — what is actually proven, and how

**This document exists because "everything is tested" turned out to be false.**
The execution log recorded a full-surface sweep as evidence that every surface
worked. That sweep ran on `00132-xw5`; live was `00137-j6j`, five revisions
later, and nobody re-ran it. A claim that was true when written had quietly
decayed into a claim that was not.

So this file records verification differently. Every row says **which revision
it was proven against**. A result without a revision is not a result.

**Revision under historical test:** `veloce-cloud-test-00139-w6s`
**Image:** `v101-plan-artifacts`
**Release:** `plan-artifacts-20260811`
**Superseded:** `00138-68l` / `v100-skill-gate` — surface coverage in §3 was
proven there and has not been re-run since; the change between them is the
reviewed-plan fix and a Next.js patch, neither of which touches surface routing.
**Date:** 2026-08-11

## Wave 2 parity checkpoint — both environments green 2026-08-13

`npm run verify:parity:local` and `npm run verify:parity:cloud` both pass.

| Environment | Scope | Result |
|---|---|---|
| Local `127.0.0.1:3939` | 45 routes, capabilities, credentials, provider-history, 4 record kinds | **passed** |
| Cloud `00151-hzm` | full surface map incl. 8 workflow and 11 brief surfaces | **passed** |

Gates: focused 43, references 22, full suite **311 passed**, typecheck, lint,
build, worker verifier and three security gates all clean.

### The local blocker was not what it looked like

The first diagnosis — a rate-limit data-plane gap — was wrong. Calling
`consume_client_runtime_rate_limit` directly with the same anon key and session
returns HTTP 200 `true`; the limiter was never the problem.

Two real causes, found by making the parity script report the server's error
code instead of a bare status:

1. **`tenant-data` was missing from the local launcher's capability default**
   while the cloud manifest enabled it, so every tenant record answered `403
   capability_not_enabled` locally and succeeded in cloud. A genuine parity
   defect in the launcher; `tenant-data` and `artifacts` are now defaults.
2. **15 client routes require Cloud Tasks or a GCP metadata identity.** Cloud
   Tasks is a *push* queue, so Google must call the runtime back over public
   HTTPS, and `cloudTasks.ts` deliberately refuses a localhost base URL
   (`task_base_url_not_public`). This is architecture, not configuration: a
   laptop is not reachable from Google's task dispatcher.

`verify:parity:local` therefore runs with `--no-gcp-dependent` and says so in
its own output. **Local parity verifies a strictly smaller surface than cloud**
— routes, capabilities and tenant records — and that limit is stated rather than
hidden. True full-surface local parity would need a public HTTPS tunnel, which
is a security decision, not a config change.

### Why the cause stayed hidden for so long

`verify-client-runtime-surface-map.mjs` reported bare HTTP statuses for workflow
and brief checks while already reporting the error body for provider checks. A
`503` alone cannot distinguish "the limit service is down" from "this runtime
cannot enqueue from localhost", and the two need completely different responses.
All three checks now report the error code.

### Rate-limit interference is real and self-inflicted

Running the sweep twice in succession returns `429` on the second pass:
`workspace-execution-write` is 12 per 900s and the sweep exceeds it. That is the
guard working. A parity run needs a clear window, or its failures are noise.

## Wave 1 intent-router checkpoint — verified 2026-08-13

Commit `6ff8bfe` on `origin/main`. Cloud revision `veloce-cloud-test-00151-hzm`,
release `v111-intent-wave1-20260813`.

**Deployment timing checked, not assumed:** the commit landed
`2026-08-12T19:36:13Z` and the image built `2026-08-12T19:40:07Z` — 3m54s later,
so the running revision contains the change. This project has twice shipped a
"verified" result against an image that predated the fix.

| Check | Result |
|---|---|
| `test:focused` | 37 passed |
| `verify:references` | 16 passed |
| typecheck / lint / build | clean |
| `verify-client-runtime-worker.mjs` | passed |
| Full suite | **305 passed, 0 failed** |
| Cloud authenticated smoke (`--workflow-only --intent-smoke`) | **passed** |

### Both new gates were verified by breaking them

Reverting the worker's `missingRequiredTraits` check fails the enforcement test;
removing `loop` from `CLIENT_INTENT_SURFACES` fails the reachability test. A gate
never observed failing is not a verified gate.

### Local parity — partially proven, and the gap is environmental

The `loop` surface is proven live on the local runtime by a control comparison
against the intent route:

| surface | result |
|---|---|
| `loop` | `model_not_allowlisted` |
| `chat` (known-good) | `model_not_allowlisted` |
| `notarealsurface` | `intent_input_invalid` |

`loop` fails at the *same, later* gate as a known-good surface rather than at
input validation, which is what proves it is accepted.

**The local runtime cannot complete a provider call**, and this is configuration,
not a code parity defect. `scripts/run-client-runtime-local.mjs` supplies no
model allowlist and no queue, so intent stops at `model_not_allowlisted` and
workflow creation returns `503`. Cloud supplies both through its manifest.

Two further local prerequisites were found, both fail-closed by design and
simply unset by the launcher:

- `CLIENT_ALLOWED_USER_EMAILS` — `clientAuth.ts:19-22` returns `false` for every
  user when the allowlist is empty and `VELOCE_CLIENT_EDITION=1`. Unset, local
  denies everyone with `401`.
- `CLIENT_SLUG` — required to scope the tenant.

A full local↔cloud parity smoke therefore needs the local launcher to carry a
model allowlist and a queue equivalent. That is Wave 2 of the external corpus
plan, and it is the first concrete instance of the asymmetry that wave exists to
close.

## Native capability-traits source checkpoint — 2026-08-12

The V96 trait kernel, repository catalog, enqueue integration, worker fail-closed
validation, Research + Knowledge evidence metadata, operator inspection route,
and visual-QA SQL identifier fix are implemented and deployed. Revision
`veloce-cloud-test-00145-jcn` serves image digest
`sha256:c2d5bfc98d4c7fda6cee5ef1f3d48c63bb319be0fcd89fc38f7a3993f0fc6be0` at
100% traffic. The focused contract/configuration suite, TypeScript check,
security gates, and production build pass.

The authenticated fresh browser smoke completed with job `succeeded`, research
`complete`, 2 durable records, 2 citations, trait version `v96-traits-1`, 13
trait-evidence entries, and deterministic replay of the same job ID. The
smoke intentionally disabled scraping, so `failureDisposition: partial` is
the expected honest outcome for snippet-only evidence; it is not a job failure.

### Native context-compression pilot — source checkpoint 2026-08-12

The shared provider adapter now has a Veloce-owned, dependency-free
`context-compression` trait. It is enabled locally by the client runtime
launcher and is configured for cloud through the reviewed `CLIENT_ENABLED_TRAITS`
manifest value. The trait is attached to provider-bound jobs, compresses only
non-authoritative repeated context, preserves current requests, system policy,
code, URLs, citations, and approval instructions, and records hash/count-only
evidence before cost estimation. The upstream Headroom runtime is not
installed.

Local evidence: `npm run test:focused` passed 27/27; `npm run typecheck`,
`npm run lint`, and `npm run verify:references` passed. `npm run build` reached
the known sandbox Turbopack process/port permission failure; `next build
--webpack` was attempted and stopped after exceeding the sandbox build window.
No cloud compression claim is made yet: the discoverable service is
`veloce-cloud-test` revision `veloce-cloud-test-00147-lbh`, which predates this
pilot. A new image and authenticated smoke must record the revision, digest,
manifest trait, compression evidence, budget trace, replay result, and rollback
check before promotion.

## Shared microphone transcription checkpoint — 2026-08-12

The shared `VoiceButton` path now records browser audio and posts it to the
server-only `/api/speech/transcribe` route. The route uses Groq's
`whisper-large-v3-turbo`, caps uploads at 25 MB, keeps the provider key out of
the browser, and is included in local/client route allowlists. The existing
OpenClaw recording route tries the same adapter first, so MiniMax voice loops
use the same provider when `GROQ_API_KEY` is configured.

Groq is a provider service reference, not a bundled runtime. Cloud activation
requires `GROQ_API_KEY` in Secret Manager, `providerCallsEnabled: true`, the
key in the client provider allowlist, and an authenticated smoke. Continuous
wake-word and realtime WebRTC loops are intentionally not converted to
request-per-utterance transcription; they require a separate streaming
contract.

### Cloud Groq activation checkpoint — 2026-08-12

Cloud Run service `veloce-cloud-test` now serves revision
`veloce-cloud-test-00146-h7l` at 100% traffic from image digest
`sha256:c0cdf8e055d356e580c2195b0c184671059f03637b50e9e1617e5ae28e046439`.
The runtime maps `GROQ_API_KEY` from Secret Manager version `latest`, enables
the `voice` capability, allowlists the speech route and provider, and keeps
provider calls enabled under the existing client policy. The old Secret
Manager version 1 was destroyed after rotation; version 2 is enabled.

Evidence recorded:

- Groq credential check: HTTP 200 against the authenticated models endpoint.
- Real Whisper request: HTTP 200 using `whisper-large-v3-turbo`; generated
  speech fixture returned `Veloce Speech Smoke Test.`.
- Cloud unauthenticated route check: HTTP 401, fail-closed as required.

An authenticated browser microphone click remains the final user-session
check: hard-refresh the cloud `/goals` or `/notebook` page and speak into a
microphone button. The provider and deployed route are proven; this last step
verifies the browser session, microphone permission, and UI insertion path.

### Microphone Permissions-Policy fix — 2026-08-12

The cloud revision initially returned `microphone=()` from the global security
header, which caused Chrome to report microphone blocking despite OS and site
permissions being enabled. `source/next.config.ts` now permits the top-level
origin with `microphone=(self)` while continuing to deny camera and geolocation.
Revision `veloce-cloud-test-00147-lbh` serves the fix at 100% traffic; the live
header was verified as `camera=(), microphone=(self), geolocation=()`.

### Reference register integrity checkpoint — 2026-08-12

The catalog validator now requires clean non-tokenized resource URLs, pinned
repository revisions or dated service/guide records, known licenses, runtime
classes, statuses, non-empty execution permissions, placements, and evidence
gates. The focused suite contains a negative tokenized/under-specified source
case. `npm run verify:references` passes with 5/5 tests.

## Current Codex portfolio wave — source and deployment verified

- Local HEAD includes the governed capability, structured research, SEO,
  quality, media/VQA, operator, exposure, Notebook lineage, and OpenSEO waves.
- npx tsc --noEmit and npm run build pass after the latest changes.
- Focused V96, route-allowlist, Notebook, and SEO suites pass; the worker
  verifier passes its static boundary checks and its live unauthenticated
  probes pass against local 3940.
- The complete repository run recorded **278 passed and 3 known baseline
  failures**: two visual-shell expectations and one sidebar theme expectation.
  These are unrelated to the V96 files and are retained as explicit follow-up,
  not hidden by changing the suite.
- Cloud Run now serves revision 00144-tn6, image v105-v96-research-lineage-isolation, digest
  sha256:61b0892b23ffe0140770bcb82df8e7fa53e8f338d4ca298d8b903fce1d997669,
  at 100% traffic. Root redirects to login; capabilities and the new Notebook
  source route return 401 without a session. The structured-research migration
  is applied and its authenticated research workflow is verified below; visual
  QA and Notebook lineage remain separately gated migrations.

### Authenticated cloud Notebook research smoke — verified 2026-08-12

Against `veloce-cloud-test-00144-tn6` / `v105-v96-research-lineage-isolation`,
the fresh browser smoke created a tenant notebook and source, queued a new
idempotent research request, and completed with:

- job status: `succeeded`
- research status: `complete`
- durable records: `2`
- citations: `2`
- error: `null`

The first final-write failure was diagnosed through the tenant-scoped research
failure ledger as SQLSTATE `42702` with `record_count = 2`. The cause was an
ambiguous PL/pgSQL variable collision with the `research_run_id` and
`research_record_id` columns in the two upserts. The variables were renamed in
commit `412ab6d`, the migration was re-applied, and the smoke then passed.

## Historical Hermes checkpoint — superseded by the current portfolio wave

- Implementation commit: `75cf39d`.
- The complete Playwright suite passes **255/255**; the focused Hermes/parser/
  allowlist suite passes **40/40**.
- `npx tsc --noEmit`, production `npm run build`, provider-policy,
  security-release, and lifecycle checks pass.
- `npm audit --audit-level=high` reports no high/critical findings and three
  moderate PostCSS advisories; no forced dependency upgrade was applied.
- Local operator `3939` and client `3940` both start; the client is isolated in
  `.next-client` when both runtimes are opened from one checkout. The local
  Hermes smoke proved deterministic replay and 409 publication refusal before
  approval without invoking a provider.
- This historical checkpoint was superseded by 00143-7vg / v104-v96-research-run-reconciliation;
  see the current section above for the active revision and the remaining SQL
  migration prerequisites.
- The current shell has no `SUPABASE_SERVICE_ROLE_KEY` or Supabase access token,
  so no secret value was requested, read, or printed.

### Authenticated cloud workflow result

The owner completed the final browser smoke against revision
`veloce-cloud-test-00140-5qb` after applying the Supabase migration. Workflow
`a4ffc6fe-8a04-433c-9236-85087c351736` produced one citation and a passing
quality report, refused publication with HTTP 409 before approval, then
published after approval. Repeating the publish request returned the original
delivery (`replayed: true`, `sameDelivery: true`).

---

## 0. The rule this document exists to enforce

> **A verification result is bound to a revision. When the revision changes, the
> result expires.**

Three separate claims in the execution log were stale when this session started,
all in the same way — true when written, never re-checked:

| Claim | Reality |
|---|---|
| "221 tests passing" | 221 passing **and 19 failing**; the pass count was recorded as the whole suite |
| §4.1 "no client UI shows the skill pack" | Shipped in §2f; the entry described a state that no longer existed |
| "every surface is proven" | Proven on `00132-xw5`, never re-run across five revisions |

None was a lie. Each was a true statement left to rot. That is the failure mode
this format is designed to prevent.

---

## 1. Deployment drift — found and closed

The running cloud **did not contain the last two code commits.**

```
live revision built : 2026-08-10T18:43:02Z
5a61ff0 (v90→v96 rename)   : 2026-08-10T19:15:11Z   → 32 min AFTER the build
6516f6f (skill exit gate)  : 2026-08-10T19:35:54Z   → 53 min AFTER the build
```

The rename is behaviourally neutral. The **exit gate was not** — the validator
and route filter existed in `main` and not in the thing a client would hit. A
guarantee described as enforced was enforced nowhere.

Closed by building `v100-skill-gate` and deploying `00138-68l`. Verified live:
the skills route returns **6 roles**, `minimal-change` filtered as operator-only,
every `allowedTools` value inside the permitted vocabulary.

**Rule:** compare the deployed image's build time against the commit time before
believing any live test. This is the second time this trap has been hit — it is
already rule 2 in the execution log's rules section.

---

## 2. DEFECT: half the provider lanes cannot complete a workspace execution — **FIXED 2026-08-11**

**Severity was high. Reproducible. Structural, not probabilistic.**

> **Fixed and verified live on `veloce-cloud-test-00139-w6s`** (`v101-plan-artifacts`).
> `artifactFromWorkspaceOutput` now recognises a serialized reviewed plan and
> renders it as markdown. The isolation test below was re-run against the new
> revision with surface, intent and goal held identical: **all 8 lanes
> succeeded**, where the four `reviewed-plan` lanes previously failed every
> time. The `openclaw` artifact was downloaded and confirmed to be a real
> markdown plan carrying the "Human approval required" marker.
>
> `preview` intent downgrades to markdown and records `downgradedFrom` rather
> than synthesising HTML the model never produced.
>
> **Still broken, deliberately out of scope:** the same providers feed
> `parseLoopVerdict` and the pipeline shape parser, which receive the same
> envelope and fail with `loop_verdict_unparsable` /
> `pipeline_shape_unparsable`.

The original diagnosis is kept below, because the reasoning is what makes the
fix reviewable.

*(Original diagnosis, written before the fix:)* Four of the eight
client-reachable provider lanes can **never** produce an artifact from a
workspace execution. Not sometimes — never, by construction.

### The chain

```
contract toolMode: "reviewed-plan"
  → clientProviderToolPayload() returns a FORCED tool choice
      openai:    tool_choice: { type: "function", function: {...} }
      gemini:    toolConfig.functionCallingConfig.mode = "ANY"
      anthropic: tool_choice: { type: "tool", ... }
  → the model cannot return free text; it must return a tool call
  → callOpenAiCompatible takes the tool-call branch and sets
      output = serializeClientReviewedPlan(...) 
             = JSON.stringify({ type: "reviewed_plan", ... })
  → that string contains ZERO fenced code blocks (verified: grep ``` → 0)
  → artifactFromWorkspaceOutput() calls extractFence(output, "html"|"markdown")
      which requires a ``` fence
  → extractFence returns null → artifact is null
  → job fails with workspace_artifact_invalid
```

Forced tool-calling and fence-based artifact extraction are **mutually
exclusive**. A lane configured for one cannot satisfy the other.

### Evidence — isolation test, `00138-68l`

Surface, intent and goal held identical. Only the provider varied.

| Provider | `toolMode` | Result |
|---|---|---|
| anthropic | `none` | **SUCCEEDED** |
| openrouter | `none` | **SUCCEEDED** |
| freeclaude | `none` | **SUCCEEDED** |
| gemini | `none` | **SUCCEEDED** |
| openclaw | `reviewed-plan` | FAILED `workspace_artifact_invalid` |
| hermes | `reviewed-plan` | FAILED `workspace_artifact_invalid` |
| fusion | `reviewed-plan` | FAILED `workspace_artifact_invalid` |
| antigravity | `reviewed-plan` | FAILED `workspace_artifact_invalid` |

**8/8 correlation with `toolMode`, 0 exceptions.**

This is not a model-quality effect. `openclaw`, `hermes`, `fusion`, `freeclaude`
and `openrouter` resolve to the **same model, endpoint and API key**
(`google/gemini-3.1-flash-lite` on OpenRouter). `gemini` and `antigravity` are
likewise identical. Within each identical pair, the `toolMode: "none"` side
passes and the `reviewed-plan` side fails, every time.

### Why it was not caught

`tests/` asserts file contents and local invariants. Nothing exercises a
`reviewed-plan` provider through a workspace execution against a live model.
The lanes are configured correctly, the contracts are internally consistent, and
every unit test passes — the incompatibility only exists at runtime, where the
two subsystems meet.

### Options considered

1. **Teach `artifactFromWorkspaceOutput` to accept a reviewed plan** — map the
   plan JSON into a markdown artifact. Keeps the review boundary, makes the lane
   usable.
2. **Do not force the tool for workspace executions** — pass the tool as
   available rather than mandatory, so the model can return a fenced document.
   Weakens the reviewed-plan guarantee.
3. **Gate the lanes explicitly** — refuse a workspace execution on a
   `reviewed-plan` provider with a named error instead of a generic artifact
   failure. Honest, but leaves half the lanes unusable.

**Option 1 was chosen and implemented** — it preserves the forced-tool review
boundary and makes the lanes usable, without weakening a guarantee or writing
off half the providers. See the banner at the top of this section for the live
evidence.

---

## 3. Surface coverage on `00138-68l`

Each surface was sent the `artifactIntent` it actually declares in
`ClientExecutionWorkspace` (`preview: true` → `preview`, otherwise `brief`), with
a goal that explicitly demands the matching fenced format.

### Proven working

Every one produced a real artifact through the hosted worker.

| Surface | Intent | Provider | Surface | Intent | Provider |
|---|---|---|---|---|---|
| guide | brief | openrouter | studio | brief | anthropic |
| paperclip | preview | anthropic | openmontage | brief | openrouter |
| agent-kanban | preview | openrouter | music | brief | freeclaude |
| opendesign | preview | freeclaude | thumbnails | brief | gemini |
| games | preview | gemini | integrations | brief | anthropic |
| room | brief | anthropic | seo | brief | openrouter |
| pipeline | brief | openrouter | seo-guide | brief | freeclaude |
| loop | preview | anthropic | deliver | brief | gemini |
| create | preview | openrouter | kanban | brief | anthropic |
| web-studio | preview | freeclaude | ruflo | brief | openrouter |
| orchestrate | brief | gemini | flow-lab | brief | freeclaude |
| video | brief | gemini | leads | brief | anthropic |
| radar | brief | openrouter | notebook | brief | freeclaude |

**All 26 of 26 surfaces verified working against this revision**, spread across
all four usable provider lanes. Every `preview` surface produced HTML; every
`brief` surface produced markdown. No surface failed for a surface-specific
reason.

### What the successful runs prove about the defect

The four lanes that failed in §2 were re-run here against the **same surfaces**
using a `toolMode: "none"` provider, and every one succeeded — `loop`, `create`,
`web-studio`, `orchestrate` and `kanban` among them. That rules out any
surface-specific cause and leaves the provider contract as the sole variable.

**Why coverage takes multiple sessions of wall time:** `workspace-execution-write`
allows **12 writes per 900s**. Twenty-six surfaces cannot be swept inside one
window by design. A full pass is three windows, roughly 45 minutes, and any
harness must batch under twelve or wait the window out.

---

## 4. Media lanes — all four verified

| Lane | Provider | Artifact | Verification | Revision |
|---|---|---|---|---|
| Speech | elevenlabs | `29025b7b` | mp3 magic bytes | earlier |
| Music | elevenlabs-music | `e1e95906` | mp3 magic bytes | earlier |
| Video | heygen | `cbb8da42` | 2.4 MB mp4 | earlier |
| **Images** | **openai** | **`86ac3e37`** | **`89504e470d0a1a0a`; `file` → PNG 1024×1024 8-bit RGB** | **`00137-j6j`** |

Images were verified this session after prepaid credit was added. The same
revision that had been returning `provider_credit_balance_exhausted` succeeded
on the first call with no code change — the cleanest available proof that the
block was the provider balance and never the code.

**Verify media by magic bytes, never by `output_metadata.contentType`** — that
field is written by the adapter and agrees with itself regardless of what the
provider actually returned.

---

## 5. Route parity — local vs cloud

50 local pages, 46 in the cloud allowlist. The four not served are `/login`,
`/client-unavailable`, `/demo-history` and `/seo-guide`.

**`/seo-guide` is not a gap.** It is present in `clientRuntimePolicy.ts`,
`run-client-runtime-local.mjs` and `provision-gcp-client.mjs`, and confirmed
present in `CLIENT_ALLOWED_ROUTES` on the running service. Only the
`Dockerfile.client` ENV *default* omitted it, and the provisioner overrides that
at deploy. Synced anyway, because a container run without the provisioner's env
would 404 that route.

The other three are auth, error and demo scaffolding — correctly not client
surfaces.

---

## 6. Test suite — **250 passing, 0 failing**

Green for the first time. Every one of the nineteen failures was environmental,
and none was a product defect.

| Cause | Tests | Fix |
|---|---|---|
| No `playwright.config.ts` existed, so no `webServer` — specs pointed at ports nobody started | 10 | Added the config with three servers |
| A `next-server` **started 17 days earlier** held port 3737, serving a `.next-v0` directory with no `BUILD_ID` and no CSS chunks. Its stylesheet 404'd, so the page had **no styles at all** | 8 | Killed the orphan; `reuseExistingServer: false` so it fails loudly instead |
| The site's privacy claim genuinely reversed | 1 | Test updated to assert the current, more honest copy |

### The 8 were misdiagnosed, and it is worth knowing how

They were first read as four separate product problems: a genuine horizontal
overflow at 390px, an assertion pinned to a retired parchment theme, headless
canvas visibility, and unstubbed local Obsidian vault state. **All four
diagnoses were wrong.** With no stylesheet, `.home-immersive__stage` computed to
`height: 0`, so the canvas and its fallback were correctly reported hidden;
`color-scheme` computed to `normal` because no rule set it; and the body could
not overflow a layout that never had one.

The tell was `getComputedStyle` reporting `position: static` where
`globals.css:660` declares `position: sticky` — a rule that is present in the
file cannot fail to apply unless the file never arrived. Fetching the
referenced chunk returned `Not Found`, 9 bytes.

**Rule: before attributing a visual test failure to the UI, confirm the page
under test actually loaded its stylesheet.** A dead server produces failures
that look exactly like design regressions.

Six of the 250 are the reviewed-plan artifact tests added in §2, verified by
reverting the fix: exactly the three behavioural ones failed, then all passed on
restore. A gate never observed failing is not a verified gate.

## 7. Spend

| Item | Cost |
|---|---|
| Session start | $0.2610 |
| Session end | $0.3854 |
| **Session delta** | **$0.1244** (3.85% of the $10 cap) |

Of that, the image smoke was $0.0600 and roughly fifty workspace executions
across three sweeps and the isolation test came to about $0.0644 — text is
effectively free, media is the entire cost.

Per provider at session end: anthropic $0.1069, heygen $0.1000,
elevenlabs-music $0.1000, openai $0.0600, openrouter $0.0103, firecrawl
$0.0060, antigravity $0.0009, gemini $0.0006, elevenlabs $0.0004, freeclaude
$0.0002.

**`openclaw`, `hermes` and `fusion` each show $0.0000** despite being called
repeatedly. Their spend rounds below a hundredth of a cent, but the calls were
real and were billed upstream — a lane can look free in the ledger and still
consume provider tokens.

Image cost was **$0.06, not the $0.04** in the log's table, and both are correct:
`estimateClientImageCostMicros` multiplies the 40,000-micro base by 1.5 for
`quality: "medium"`. The $0.04 figure is the base rate at low/auto quality.
Delta was exactly 60,000 micros against a 60,000-micro estimate.

**Failed executions still cost provider tokens.** The four `reviewed-plan` lanes
called a real model and were billed before the artifact check rejected the
output. A defect that fails late is a defect that spends.

---

## 8. What is still unproven

Stated plainly, because an unproven thing recorded as proven is how this
document came to be needed.

- **`/api/client-runtime/provider-chat` is operator-only** — it returns
  `client_route_not_enabled` to a client session for all 16 providers. That is
  correct behaviour, but it means the client model path is `executions`, and any
  harness testing "models" through `provider-chat` is testing nothing.
- **Supervision visual QA** remains deliberately unbuilt (§4.2 of the execution
  log). Decided, not overlooked.

### 8.1 Structured-research smoke correction — historical, resolved 2026-08-12

The authenticated browser smoke initially showed Notebook/source success but
`researchStatus: undefined` and zero citations. Cloud Run request logs proved
the internal worker callback ran and returned HTTP 200; this was a persistence
observability defect, not a Cloud Tasks delivery outage. The follow-up closed
that gap. The worker now creates and reconciles a durable
research run across all terminal branches. The migration was applied, the
SQLSTATE `42702` upsert defect was fixed in `412ab6d`, and the authenticated
smoke completed with two durable records and two citations on `00144-tn6`.

---

## 9. How to re-verify

### Visual QA owner-cloud checkpoint — pending target manifest

The Visual QA route now queues a tenant-bound `visual-qa` job, resolves the
native trait bundle, rejects external frame inputs, persists reports/findings
through the worker RPC, and returns review status without publishing artifacts.
When `CLIENT_VISUAL_QA_RUN_JOB` is present, Cloud Tasks calls a separate
authenticated dispatcher and Cloud Run Job (`visual-qa-runner`); otherwise local
and test environments use the bounded queue-worker fallback.
The authenticated harness now covers artifact upload, replay identity, durable
report/trait evidence, and source-artifact cleanup. The cloud checkpoint has not
been claimed: the discoverable service is `veloce-cloud-test` with
`CLIENT_SLUG=veloce-cloud-test`, while the approved activation target is the
separate `dofgfood` manifest. Retargeting that service would risk cross-tenant
data, so deployment waits for the approved `dofgfood` service/manifest and its
secret references.

```bash
# 1. Does the deployed image contain the code you are testing?
gcloud run services describe veloce-cloud-test --region asia-south1 \
  --format='value(status.latestReadyRevisionName)'
gcloud run revisions describe <revision> --region asia-south1 \
  --format='value(spec.containers[0].env)' | tr ';' '\n' | grep VELOCE_RELEASE
# compare against: git log --format='%h %cI %s' -5

# 2. Suite + gates
npx playwright test tests/ --reporter=line     # expect 227 pass / 19 pre-existing fail
npm run verify:security                        # three gates

# 3. Live Visual QA surface execution (12 writes per 900s) after the
#    `dofgfood` manifest is deployed and the cookie belongs to that tenant.
node scripts/verify-client-runtime-authenticated.mjs \
  --url https://<dofgfood-service>.run.app \
  --cookie-file ~/.veloce-cookie \
  --workflow-only --visual-qa-smoke

# 4. Existing generic live surface execution (12 writes per 900s)
curl -s -H "Cookie: $(cat ~/.veloce-cookie)" -H 'content-type: application/json' \
  -X POST -d '{"surface":"guide","title":"probe","goal":"Return a short markdown brief inside a single ```markdown fenced code block. No text outside the fence.","artifactIntent":"brief","provider":"anthropic"}' \
  https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/api/client-runtime/executions

# 5. Poll — state is nested under job.status, NOT top level.
#    A poller reading the top level sees "" and records a false hang.
curl -s -H "Cookie: $(cat ~/.veloce-cookie)" \
  https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/api/client-runtime/jobs/<id>
```

**Artifact download is a 302 to a signed `storage.googleapis.com` URL.** Read the
`Location` and fetch it *without* the cookie — a plain `curl -L` forwards custom
headers to the redirect target and would hand a tenant session cookie to a
storage host that does not need it.

---

## 10. Traps that cost time in this session

Recorded so the next session does not pay for them again.

- **`grep -icE "python|pip" Dockerfile.client` returns 1, and it is a false
  positive** — `CLIENT_ALLOWED_ROUTES` contains `/pipeline`. Anchor to
  `^(FROM|RUN)` and it returns 0.
- **Loop reports `passed`, not `succeeded`.** A poller matching the usual word
  records a failure against a lane that worked.
- **`artifactIntent` must match the surface's declared `preview` flag.** Sending
  `preview` to a `brief` surface fails with `workspace_artifact_invalid`, which
  looks exactly like a broken surface and is not.
- **n=1 per cell is not evidence.** Two wrong conclusions were drawn from the
  first sweep — first "surface-specific", then "provider-specific but probably
  nondeterministic" — before an isolation test holding everything but the
  provider constant produced the real, structural answer. Vary one thing.

## 11. Native Headroom compression cloud checkpoint — 2026-08-12

This is an additive checkpoint; earlier historical evidence above is preserved.

- **Image:** `asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/client-runtime:v109-native-headroom-compression-20260812`
- **Digest:** `sha256:b777a525336d237837acd642657733534feba86dd92ccd9822dc41366fdd8444`
- **Cloud Run revision:** `veloce-cloud-test-00148-xwg`, 100% traffic
- **Manifest:** `CLIENT_ENABLED_TRAITS=context-compression`
- **Local gates:** 27 focused tests passed; typecheck, lint, reference validation, and the approved-environment production build passed.
- **Authenticated cloud smoke:** workflow + artifact round-trip passed; provider request passed; fresh idempotency replay returned the original job identity.
- **Compression evidence:** provider output metadata included policy `v96-context-compression-1`, original/compressed character counts, a reduced compressed count for repeated context, and a SHA-256 input hash. Evidence did not contain the repeated context.
- **Boundary:** Headroom remains a provenance reference. No external Headroom runtime was installed or bundled.

The Visual QA `dofgfood` owner-cloud checkpoint remains pending as documented
above. GPU media, Supervision enhancement, security execution,
communications, worktrees, and continuous streaming speech remain intentionally
gated and were not promoted by this checkpoint.

## 12. Native intent router and built-in playbook plane — 2026-08-13

This is an additive checkpoint; the historical Visual QA and Headroom evidence
above remains unchanged.

- **Image:** `asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/client-runtime:v110-native-intent-router-20260813c`
- **Digest:** `sha256:8ad5c776862fbf5177e51a560f5a3ea65cd58678939f608b9b53280155f8e43c`
- **Cloud Run revision:** `veloce-cloud-test-00150-m7z`, 100% traffic
- **Manifest:** `CLIENT_INTENT_ROUTING_ENABLED=1`; the intent route is in the
  authenticated client API allowlist.
- **Native-enabled behavior:** the Veloce-owned intent resolver and playbook
  registry are active. Upstream repositories remain catalog provenance; no
  external skill or repository runtime was installed in the image.
- **Local gates:** 33 focused tests passed; typecheck, lint, production build,
  worker-boundary verification, and reference validation passed. The build
  emitted the existing broad filesystem-trace warnings and middleware
  deprecation warning, but completed successfully.
- **Authenticated cloud smoke:** passed for low-risk automatic dispatch,
  one-question ambiguity handling, gated-request refusal, idempotency replay,
  tenant-scoped plan reads, and redacted plan evidence.
- **Evidence:** plan snapshots expose selected playbook/capability IDs,
  confidence, risk and approval state, trait evidence, counts, hashes, and
  classifier metadata without raw request or classifier prompt content.
- **Rollback:** disable `CLIENT_INTENT_ROUTING_ENABLED`; direct specialized
  capability routes remain available and catalog data is retained.

The first smoke run identified and corrected a read-contract omission: the
ambiguous plan was being created with a clarification question, but the GET
plan response did not return it. The final deployment and smoke above include
that field. Visual QA cloud promotion for `dofgfood`, GPU media, Supervision
enhancement, security execution, communications, worktrees, and continuous
streaming speech remain intentionally gated.

## 13. Wave 2 parity closure and additive research providers — 2026-08-13

| Checkpoint | Result |
|---|---|
| Focused trait/contract/research/worker suite | **50 passed** |
| TypeScript | **passed** |
| ESLint | **passed** |
| Production build | **Webpack fallback passed**; default Turbopack is sandbox-blocked while spawning/binding its CSS worker |
| Reference catalog validation | **22 passed**; three new crawler references are pinned, Apache-2.0, and reference-only |
| Client worker verification | **passed** |
| Firecrawl policy | **Default and unchanged**; Firecrawl-only tenants do not need Brave |
| Brave policy | **Implemented and local-tested; not cloud-enabled** until `BRAVE_API_KEY` Secret Manager evidence and authenticated smoke |
| Local parity | **Pending runtime**; no authenticated local service was listening on `127.0.0.1:3939` during this run |
| Full local parity | **Manual tunnel pending**; requires a user-installed `cloudflared` and `VELOCE_LOCAL_PUBLIC_URL` |
| Cloud parity | **passed** against final revision `veloce-cloud-test-00153-wn6` (100% traffic), image digest `sha256:1e5395fcf9e5b41967c5bfd1738cdef33be7dc348993edd9eebb435c401f2123` |

The worker now records the selected research provider in budget and evidence
metadata, clamps Brave to three HTTPS search results, and ignores caller
scraping flags for Brave jobs. The tunnel verifier accepts only a public HTTPS
origin and never starts or persists a tunnel. Crawl4AI, Crawlee, and Jina Reader
remain catalog references, not installed runtimes or client-selectable tools.

The previously gated capabilities remain unchanged: `dofgfood` Visual QA
promotion, GPU media, Supervision enhancement, security execution,
communications, worktrees, and continuous streaming speech.

## 14. Wave 3 hosted-loop enforcement checkpoint — 2026-08-19

This is a local source checkpoint. It is not a cloud deployment claim.

| Checkpoint | Result |
|---|---|
| Named loop contracts | **Implemented** in `clientLoopRegistry`; default direct Loop contract is `plan-generate-verify-fix` |
| Live worker stop policy | **Implemented locally**; the hosted worker now calls `loopStopDecision` after every recorded round |
| Cost evidence | Combined builder-plus-judge round cost is persisted; settlement includes estimate, actual, compression-savings, retry, and budget fields |
| Anti-spin / quality streak | **Wired**; anti-spin stops before another round, and `quality-streak` requires the configured consecutive-pass target |
| Focused suite | **75 passed** |
| TypeScript | **passed** |
| ESLint | **passed**; loop adapter and tests are now included in the root lint allowlist |
| Reference suite | **47 passed** |
| Worker boundary verifier | **passed** |
| Production build | **Passed in the approved external build environment**; default sandbox Turbopack remains blocked by its internal port restriction |
| Cloud deployment/smoke | **Pending** for the worker-wiring image; no cloud revision is claimed here |

The starred GitHub portfolio was rechecked on 2026-08-19: 100 starred
repositories were returned. The governed Veloce catalog currently contains 39
GitHub references; the remaining sources are wave candidates, reference-only,
or gated and must not be treated as installed runtimes. Unlicensed or
`NOASSERTION` sources remain outside executable catalog rows until a license
and provenance review is complete.

## 15. Wave 3 cloud deployment attempt — 2026-08-19

The verified source was committed as `ee900ac` and pushed to `origin/main`.
The production build passed in the approved external build environment, but a
new owner-cloud image could not be published from this workstation:

| Attempt | Result |
|---|---|
| `npm run build:client-image` via Cloud Build | **Blocked before build** — the active account `aryamandev777@gmail.com` cannot access the project Cloud Build source bucket `veloce-agenticos-2026_cloudbuild`; Google reported missing `serviceusage.services.use`/bucket access |
| Direct Artifact Registry inspection | **Blocked** — the active account lacks `artifactregistry.repositories.get` |
| Local Docker fallback | **Unavailable** — Docker daemon is not running |
| Cloud Run deployment | **Not attempted**; no new image or revision exists |
| Current cloud revision | Remains the previously verified Wave 2 image; no Wave 3 cloud claim is made |

This is an environment/IAM prerequisite, not an application test failure. The
next controlled deployment requires either Cloud Build bucket and Artifact
Registry permissions for the deploy identity, or a running Docker daemon plus
Artifact Registry write permission. After the image exists, run a fresh
authenticated smoke and record the revision, digest, loop contract, stop
reason, combined builder/judge cost, settlement, and idempotency replay.

## 16. Wave 4A native specialist checkpoint — 2026-08-19

Eight new Veloce-authored playbooks were added to the shared native registry:
competitor intelligence, SEO content planning, launch content, customer
response, product requirements, operations checklist, accessibility review, and
release readiness. They use existing approved roles and capabilities; no
upstream prompt or runtime was copied into the image.

| Checkpoint | Result |
|---|---|
| Native implementation | **Passed locally** in `nativeSpecialistPlaybooks.ts` |
| Intent routing | **Passed**; specialist selection is deterministic for a uniquely matched request |
| Capability gating | **Passed**; research specialists disappear without `research`, and gated capabilities are never eligible |
| Approval boundary | **Passed**; no new playbook is `external`; review-required outputs remain review-required |
| Focused suite | **77 passed** |
| Reference suite | **49 passed** |
| TypeScript / lint | **Passed** |
| Cloud deployment | **Pending** with the IAM/build prerequisite recorded in §15 |

The broader Wave 4 target remains a staged expansion toward the documented
60–80 industry playbooks. The 100-repository portfolio plan remains a governed
reference inventory, not a runtime installation list.

## 17. Wave 5A harness audit checkpoint — 2026-08-19

The harness audit is now a deterministic Veloce-owned evidence reducer. It
covers personalisation, context, action, memory, delegation, and the newly
first-class cost dimension. It accepts only bounded evidence flags and does not
read prompts, tenant rows, local files, or upstream runtime code.

| Checkpoint | Result |
|---|---|
| Six-component frame | **Passed**; cost is included explicitly |
| Local-only evidence | **Review**, never falsely promoted to cloud parity |
| Missing fail-closed evidence | **Blocked** in focused test |
| Focused suite | **80 passed** |
| Reference suite | **52 passed** |
| TypeScript / lint / worker boundary | **Passed** |
| Cloud evidence | **Pending**; deployment prerequisite remains recorded in §15 |

## 18. Wave 5B standing-instruction budget checkpoint — 2026-08-19

The provider boundary now measures standing instruction cost without storing
raw policy or private context. The evidence includes the policy version,
segment count, character/line totals, mandatory versus optional character
counts, configured limits, stable input hash, and redacted segment IDs. It is
observability only: mandatory safety and tenant instructions are not edited or
reordered.

| Checkpoint | Result |
|---|---|
| Deterministic measurement | **Passed** |
| Raw instruction redaction | **Passed** |
| Character and line overflow reporting | **Passed** |
| Provider-bound evidence exposure | **Passed locally** |
| Focused suite after Wave 5B | **83 passed** |
| Reference suite after Wave 5B | **55 passed** |
| TypeScript / lint / worker boundary / approved build | **Passed** |
| Cloud evidence | **Pending**; same deployment/IAM prerequisite as §15 |

## 19. Wave 4B domain outcome checkpoint — 2026-08-19

Six additional native playbooks were added for system design, content strategy,
social content, design direction, growth experiments, and knowledge synthesis.
They are Veloce-authored contracts, not imported upstream skills, and remain
filtered by enabled capabilities and approval policy.

| Checkpoint | Result |
|---|---|
| Native playbook contracts | **14 specialist entries total** |
| Intent routing and manifest filtering | **Passed locally** |
| Low-risk versus review classification | **Passed locally** |
| Gated capability exclusion | **Passed locally** |
| Focused suite after Wave 4B | **84 passed** |
| Reference suite after Wave 4B | **56 passed** |
| TypeScript / lint / worker boundary / approved build | **Passed** |
| Cloud evidence | **Pending**; deployment prerequisite remains recorded in §15 |

## 20. Wave 4C industry family checkpoint — 2026-08-19

The specialist registry now compiles fourteen bounded industry families into
twenty-eight native outcomes: a citation-bearing evidence brief and a bounded
operating plan per family. This is a Veloce-owned registry compiler; no
upstream repository prompts or runtimes are installed.

| Checkpoint | Result |
|---|---|
| Industry families | **14** |
| Compiled native outcomes | **28** |
| Total native playbook registry | **62 entries** |
| Intent routing, uniqueness, and gating | **Passed locally** |
| Focused suite after Wave 4C | **85 passed** |
| Reference suite after Wave 4C | **57 passed** |
| TypeScript / lint / worker boundary / approved build | **Passed**; typecheck, lint, static worker verification, and the approved-environment production build are green |
| Cloud evidence | **Pending**; deployment prerequisite remains recorded in §15 |

## 21. Wave 4C/Wave 5 re-audit — 2026-08-19

The current clean commit `d9a3c93` was rechecked after the Wave 4C registry
landed. The focused and reference suites are the authoritative contract gates
for these waves; the broader browser suite was also attempted, but its UI
portion could not start in this sandbox because Chromium is denied the macOS
bootstrap service and no local application server was listening on port 3737.

| Checkpoint | Result |
|---|---|
| Focused Wave 3–5 suite | **86 passed**; includes one acceptance case for every Wave 4C family |
| Reference suite | **58 passed** |
| Full repository suite | **277 passed; 64 environment-blocked UI/server tests** — no application failure established |
| TypeScript | **Passed** |
| Lint | **Passed** |
| Production build | **Passed** in approved environment; existing broad filesystem-trace warnings remain |
| Worker boundary verifier | **Passed** |
| Security/provider/lifecycle gates | **Passed** |
| Cloud access recheck | **Historical blocker cleared for deployment** using the configured application-default credential; the interactive gcloud user remains under-scoped |
| Cloud deployment and authenticated smoke | **Deployment complete; authenticated smoke pending**; the deployed revision is recorded in §22 |

## 22. Wave 4C/Wave 5 cloud deployment checkpoint — 2026-08-20 UTC

The current source commit `5a4aeb4` was built and deployed through the existing
client manifest. This proves image delivery and manifest wiring, but it does
not yet certify authenticated behavior because no session cookie was available
to the smoke harness.

| Checkpoint | Result |
|---|---|
| Cloud Build | **Passed**; build `94c32c66-ff63-4efb-8a72-dc0028cd971b` |
| Image | `client-runtime:v112-wave4c-wave5-20260819` |
| Image digest | `sha256:8b15d02a92d89e3cd8ca13bfd4903d7487f2b5d853b8297c7b7a847fb09536f2` |
| Cloud Run revision | **`veloce-cloud-test-00155-mhd`**, 100% traffic |
| Isolated workspace job | **Deployed** as `veloce-cloud-test-workspace` |
| Manifest wiring | **Passed**; intent routing enabled, `context-compression` enabled, Firecrawl remains selected, 62 native playbooks are in the image |
| Public login route | **Passed**; `/login` returned `200` |
| Unauthenticated intent boundary | **Passed**; `POST /api/client-runtime/intent` returned `401` |
| Authenticated workflow/intent smoke | **Pending**; requires a fresh authenticated session cookie file |
| Gated capability status | **Unchanged**; GPU, Visual QA promotion, Supervision, security execution, communications, worktrees, and streaming speech remain gated |

## 23. Starred-portfolio license reconciliation — 2026-08-20 UTC

The public starred-repository snapshot contains 100 sources. A license audit
against the pinned revisions found two sources with no license file:
`AI-Builder-Club/skills` and `goabiaryan/awesome-gpu-engineering`. They remain
explicit portfolio references but are excluded from the executable catalog and
cannot contribute native activation. The audit also corrected four catalog
labels: Open Notebook is MIT, RAG-Anything is MIT, Wan2GP uses its custom
`WanGP Community License 2.0`, and SkyReels is recorded as repository
metadata/other pending its gated legal review.

| Checkpoint | Result |
|---|---|
| Executable pinned catalog | **43 entries; validator passes** |
| Explicit unlicensed portfolio references | **2; reference-only and non-executable** |
| Native-enabled status expansion | **None**; license reconciliation did not promote any capability |
| Gated statuses | **Unchanged**; GPU, Visual QA promotion, security execution, communications, worktrees, and streaming speech remain gated |

## 24. License-reconciled catalog image deployment — 2026-08-20 UTC

The corrected catalog was built from source commit `24f14eb`. This deployment
supersedes §22 for current-image tracking while preserving §22 as historical
evidence. It contains the corrected pinned license metadata and the explicit
non-executable treatment of the two portfolio sources without license files.

| Checkpoint | Result |
|---|---|
| Cloud Build | **Passed**; build `51106b2b-6d5e-48e2-97f4-21a6308b716e` |
| Image | `client-runtime:v113-wave5-license-20260820` |
| Image digest | `sha256:69bc95b8e4da1aab804e448817659e3388d6333ecb629ef1ed9a4135965a5521` |
| Cloud Run revision | **`veloce-cloud-test-00157-cqk`**, 100% traffic |
| Isolated workspace job | **Deployed** as `veloce-cloud-test-workspace` |
| Manifest wiring | **Unchanged**; intent routing and context compression enabled; Firecrawl remains selected |
| Public/unauthenticated boundary | **Passed**; `/login` 200 and unauthenticated intent 401 after this revision |
| Authenticated Wave 3–5 smoke | **Pending**; requires a fresh authenticated session cookie file |
| Gated capability status | **Unchanged**; GPU, Visual QA promotion, Supervision, security execution, communications, worktrees, and streaming speech remain gated |

## 25. Full local wave re-verification — 2026-08-19 UTC

The current working tree was rechecked after the license-reconciled deployment
record was added. This is local contract/build evidence only; it does not
replace the missing authenticated cloud smoke.

| Checkpoint | Result |
|---|---|
| Starred portfolio refresh | **100 public repositories** returned; planning inventory covers all 100 |
| Reference suite | **60 passed** |
| Focused Wave 3–5 suite | **88 passed** |
| TypeScript | **Passed** |
| Lint | **Passed** with `--max-warnings=0` |
| Production build | **Passed** in the approved environment; existing filesystem-trace and middleware-convention warnings remain non-fatal |
| Worker boundary verifier | **Passed** |
| Security/provider/lifecycle gates | **Passed** |
| Example client manifest | **Passed** |
| Public cloud boundary | **Passed**; `/login` 200 and unauthenticated intent 401 on revision `00157-cqk` |
| Authenticated cloud smoke | **Pending**; `/private/tmp/veloce-runtime-cookie.txt` is not present |
| Two-tenant isolation smoke | **Pending**; requires two fresh tenant tokens and an anon key |

## 26. Hosted loop retry closure — 2026-08-19 UTC

The local audit found that the hosted loop route generated a fresh run UUID on
every retry, even though the downstream job had an idempotency key. The route
now derives a tenant-scoped deterministic run identity from a bounded caller
idempotency key and returns the existing run/job on replay. The authenticated
verifier now exposes `--loop-smoke` to exercise enqueue, replay, terminal
status, durable run, and durable round evidence against the cloud worker.

| Checkpoint | Result |
|---|---|
| Route correction | **Implemented**; no schema migration required |
| Focused suite | **89 passed** |
| Reference suite | **61 passed** |
| TypeScript / lint / build / worker / security | **Passed** |
| Authenticated hosted-loop smoke | **Pending**; requires the session cookie file and a deployment containing this correction |
| Corrected-image deployment | **Blocked by deployment IAM**; Cloud Build source upload is denied for both locally authenticated gcloud accounts on `veloce-agenticos-2026_cloudbuild`; live revision `00157-cqk` therefore does not contain this fix |

## 27. Authenticated cloud recheck after Supabase restoration — 2026-08-20 UTC

The Supabase project was restored and a fresh authenticated runtime cookie file
was created with mode `600`. The authenticated verifier reached the live Cloud
Run service successfully, so authentication and the tenant data plane are no
longer the immediate blocker. The result is intentionally recorded as a
partial acceptance: the live revision is older than the current source.

| Checkpoint | Result |
|---|---|
| Authenticated workflow smoke | **Reached cloud; passed its workflow assertions** |
| Authenticated intent smoke | **Partial**; low-risk path reached the service, but the gated security request returned `dispatched` on the old live image |
| Authenticated hosted-loop replay | **Failed on old image**; replay produced duplicate run/job identity because revision `00157-cqk` predates the deterministic run-ID correction |
| Current source gated-intent guard | **Implemented and locally tested**; explicit security-assessment requests produce no executable candidates and one review clarification |
| Current local evidence | **90 focused tests, 62 reference tests, typecheck, lint, worker verifier passed** |
| Historical stale-server Playwright run | **338/346 passed**; the 8 failures were browser-shell checks against a 7-day-old `next-server` already occupying port `3737`, not the current source build |
| Current fresh-source Playwright suite | **346/346 passed** using the configurable isolated browser server on port `3741` |
| Production build | **Passed in the approved environment**; the default sandbox EPERM remains non-authoritative and the build emitted only non-fatal dynamic-filesystem warnings |
| Corrected-image deployment | **Still blocked by IAM**; active `aryamandev777@gmail.com` lacks Cloud Build/source-bucket access |
| Gated capabilities | **Unchanged**; GPU, Visual QA promotion/Supervision, security execution, communications, worktrees, and streaming speech remain gated |

The live smoke must be rerun only after deploying the corrected image. The
expected acceptance result is: gated intent `needs_clarification` or `blocked`
with no dispatched job, and hosted-loop replay returning the original run and
job identity.

## 28. Fresh local verification after browser harness correction — 2026-08-20 UTC

The Playwright harness now accepts `CLIENT_BROWSER_PORT` and
`CLIENT_BROWSER_BASE_URL`, so a stale development server cannot silently serve
an old build. The immersive home fallback also waits for the renderer canvas to
be mounted before advertising canvas readiness. This is a local test-harness
and UI correctness change; it does not alter the cloud acceptance state.

| Checkpoint | Result |
|---|---|
| Focused trait/contract suite | **90 passed** |
| Reference validation suite | **62 passed** |
| Full Playwright suite | **346/346 passed** against current source |
| TypeScript | **Passed** |
| Lint | **Passed** |
| Production build | **Passed** in the approved environment |
| Worker, security, and manifest gates | **Passed** |
| Cloud deployment and authenticated recheck | **Pending deployment IAM**; the live image still predates the gated-intent and deterministic hosted-loop fixes |
| Intentionally gated capabilities | **Unchanged**; GPU, Visual QA promotion/Supervision, security execution, communications, worktrees, and streaming speech remain gated |

## 29. Corrected image deployment and authenticated cloud acceptance — 2026-08-20 UTC

The corrected image from commit `64956f7` was built and deployed after the
Cloud Run deployment account was re-authenticated against the owning Google
Cloud project. This closes the previous stale-image boundary: the live service
now contains the gated-intent guard and deterministic hosted-loop identity
correction.

| Checkpoint | Result |
|---|---|
| Cloud Build | **Passed**; build `29fc9718-85fd-4666-adae-22e570d92a94` |
| Image tag | `client-runtime:v119-wave3-wave4-wave5-64956f7-20260820` |
| Image digest | `sha256:28d8c72df8ff5b30d404dba3ba7b0750625f189a006df5a1d3086c5a64f45c15` |
| Cloud Run revision | **`veloce-cloud-test-00158-24s`**, 100% traffic, Ready |
| Authenticated workflow smoke | **Passed** |
| Provider compression smoke | **Passed**; compression evidence and replay completed |
| Intent routing smoke | **Passed**; low-risk dispatch, ambiguity clarification, and gated security hold |
| Hosted-loop smoke | **Passed**; replay preserved the original run and job identity |
| Private evidence handling | **Passed**; plan/compression evidence remained redacted |
| Gated capability status | **Unchanged**; GPU, Visual QA promotion/Supervision, security execution, communications, worktrees, and streaming speech remain gated |

The first verifier invocation in this session returned synthetic `503` results
because the sandbox could not resolve the public service hostname. A direct
authenticated capabilities request returned `200`, and the exact verifier was
rerun with network access and passed. This environment detail is retained so a
future checker run does not misclassify a sandbox DNS failure as an application
failure.

Brave Search remains implemented and locally tested but is not promoted to
cloud-enabled status until its Secret Manager key and separate authenticated
provider smoke are recorded. Crawl4AI, Crawlee, Jina Reader, GPU, Visual QA
promotion/Supervision enhancement, security execution, communications,
worktrees, and continuous streaming speech remain intentionally gated.

## 30. Current starred portfolio reconciliation and documentation cleanup — 2026-08-20 UTC

The current authenticated GitHub profile returned 101 starred repositories.
The prior 100-entry Markdown inventory is preserved as historical context; the
machine-readable snapshot now records all 101 current sources with exact
default-branch or tag commit SHAs and GitHub license metadata.

| Checkpoint | Result |
|---|---|
| Portfolio source | **Passed**; `https://github.com/dev4-gpt?tab=stars` |
| Current portfolio size | **101 entries** |
| Exact pin validation | **Passed**; every entry has a 40-character commit SHA |
| License/provenance handling | **Passed**; missing and `NOASSERTION` licenses remain reference-only |
| Permission validation | **Passed**; no entry grants `execute-shell` or `arbitrary-network` |
| Activation boundary | **Passed**; only existing Veloce implementation mappings can be native-enabled |
| Documentation reconciliation | **Passed**; current docs point to revision `00161-gc6`; historical evidence remains preserved |
| Runtime installation | **None**; portfolio records do not install upstream repositories |

The canonical snapshot is `src/lib/v96StarredPortfolio.ts`; the human-readable
disposition index is `docs/V96-STARRED-PORTFOLIO-WAVE-PLAN.md`. This portfolio
sync does not change the gated status of GPU, Visual QA promotion/Supervision,
security execution, communications, worktrees, streaming speech, or external
crawler runtimes.

## 31. Native research provider routing — 2026-08-20 UTC

The Veloce-owned research router is implemented locally and enabled by the
owner-cloud manifest. It selects only providers that are both configured
server-side and allowed by the capability policy.

| Checkpoint | Result |
|---|---|
| Bounded search selection | **Implemented**; approved Brave is preferred when routing is enabled and available |
| Content extraction selection | **Implemented**; Firecrawl is required because Brave is search-only |
| Safe fallback | **Implemented**; unavailable Brave falls back to approved Firecrawl; no eligible provider fails closed |
| Rollout flag | `CLIENT_RESEARCH_ROUTING_ENABLED=1`; enabled on owner-cloud revision `00161-gc6` |
| Evidence metadata | Selection policy, reason, eligible providers, and bounded cost only; no API keys or raw private evidence |
| Source contract check | **Passed**; syntax, diff validation, and direct deterministic selection cases for bounded search, extraction, and fallback |
| Authenticated provider smoke harness | **Passed twice**; `--research-provider-smoke` verified Brave identity, replay identity, durable runs/citations, HTTPS URLs, three-result bound, and secret redaction on `00160-x4m` and `00161-gc6` |
| Full local checker loop | **Environment-blocked in this session**; after stopping the stale local runtime, the Playwright CLI, TypeScript, ESLint, and both production-build modes still timed out before reporting checker output; no application failure was emitted |
| Cloud activation | **Passed**; `BRAVE_API_KEY` Secret Manager binding and direct Brave smoke passed on `00160-x4m`; automatic-routing smoke passed on `00161-gc6`; Firecrawl remains the extraction fallback |

The implementation boundary is `src/lib/researchProviderRouter.ts`, called by
`/api/client-runtime/research`. Crawl4AI, Crawlee, and Jina Reader remain
catalog references and are not eligible candidates for this router.

### 31.1 Local checker and tunnel rerun — 2026-08-20 UTC

The local environment was cleaned and the remaining checks were rerun without
changing the application contract:

| Checkpoint | Result |
|---|---|
| Focused suite | **Passed**; 98/98 |
| Reference suite | **Passed**; 64/64 |
| TypeScript | **Passed**; `tsc --noEmit` completed with the supported Node 24 runtime |
| Worker/provider policy gates | **Passed** |
| ESLint | **Environment-blocked**; the local ESLint dependency loader stalled before emitting diagnostics, including on a single file |
| Production build | **Environment-blocked**; local Turbopack stalled at `Creating an optimized production build` before emitting a result |
| Generated-cache cleanup | **Completed**; stale `.next/dev` (16 GB), `.next-client`, and `.next-client-test` caches were removed after the stale server was stopped |
| `cloudflared` | **Installed locally**; no service, named tunnel, or persistent configuration was created |
| Authenticated local tunnel parity | **Not claimed**; an anonymous Quick Tunnel would carry the runtime session cookie through an untrusted public origin, so the authenticated verifier was not run without explicit approval or a named tunnel |
| Visual QA owner-cloud gate | **Still gated**; the approved `dofgfood` manifest/service is not available in this deployment |

The local runtime also returned `listen EPERM` when started inside the
sandbox. A host-permission retry reached `Ready`, but local Next requests
stalled before returning bytes; a production-build retry showed the same local
environment stall. No local Cloud Tasks callback, Visual QA promotion, or
gated capability was claimed from these attempts.

### 31.2 Checker closure rerun — 2026-08-20 UTC

The local runtime was started with the supported Node 24 runtime, the private
Supabase env file, and the `veloce-cloud-test` tenant metadata. The launcher
reached `Ready` on port `3939`. The source-level gates were rerun after adding
a bounded request timeout to the parity verifier so a stalled local Next
response becomes a bounded failure instead of an indefinite checker hang.

| Checkpoint | Result |
|---|---|
| Focused suite | **Passed**; 98/98 under Node 24 |
| Reference suite | **Passed**; 64/64 under Node 24 |
| TypeScript | **Passed** under Node 24 |
| Worker/provider policy gates | **Passed** |
| Local launcher | **Passed startup**; authenticated metadata loaded without printing secrets |
| Local surface parity | **Not passed**; Next stalled while compiling the first client route/API response; the verifier now bounds individual requests at 15 seconds (configurable from 1–120 seconds) |
| ESLint | **Still environment-blocked**; dependency loading produced no diagnostics before the bounded run was stopped |
| Production build | **Still environment-blocked**; Turbopack and Webpack both stalled before completion |
| Owner-cloud Brave smoke | **Passed again**; authenticated research-provider smoke completed against `veloce-cloud-test-mquo4bf7aq-el.a.run.app` |
| No-tunnel guard | **Passed**; HTTP and localhost HTTPS origins are rejected before any callback attempt |
| Authenticated tunnel parity | **Not claimed**; requires a named/authenticated tunnel or another trusted public callback origin |
| Visual QA | **Still gated**; no approved `dofgfood` service/manifest was introduced |

The timeout guard is diagnostic only: it does not bypass localhost rejection,
weaken worker authentication, or promote any gated capability. The remaining
local failure is therefore an environment/runtime compilation issue, not a
reported source assertion or a reason to claim Cloud Tasks parity.

### 31.3 Clean container build and runtime smoke — 2026-08-20 UTC

The local macOS build stall was separated from the production image contract
by starting Docker Desktop and building the client image in the pinned Node
24.14.1 container. Generated nested caches were excluded from `.dockerignore`
before the successful retry.

| Checkpoint | Result |
|---|---|
| Docker context | **Passed**; reduced from approximately 170 MB to approximately 98 MB after excluding generated subproject outputs |
| Production image build | **Passed**; `veloce-client-runtime:local-e4948b0` |
| Next compilation | **Passed** in the container; Turbopack compiled successfully in 22.5 seconds |
| TypeScript in image build | **Passed**; completed in 28.1 seconds |
| Static page generation | **Passed**; 58/58 pages generated |
| Standalone runner assembly | **Passed**; image exported and unpacked successfully |
| Clean-container lint | **Passed**; `npm run lint` exited 0 in the Node 24 builder image |
| Clean-container reference suite | **Passed**; 64/64 |
| Clean-container focused suite | **96/98**; the only two failures were the Python Visual QA worker tests because the Node-only image intentionally has no `python3`; the supported host suite remains 98/98 |
| Container runtime smoke | **Passed**; `/status` returned 200 and `/login` returned 200 |
| Build warnings | **Non-fatal**; existing dynamic filesystem trace warning and Docker’s `CLIENT_RUNTIME_ENFORCE_AUTH` name heuristic; no secret value was placed in the image |

This closes the production-build gate in a clean supported environment. It does
not close authenticated local Cloud Tasks parity, because that still requires
a trusted public callback origin and a tenant session that may safely traverse
it.

### 31.4 Corrected production-container local parity — 2026-08-20 UTC

The initial container parity attempt exposed a stale API-route allowlist in the
private local env file: `provider-history` was omitted and correctly returned
403. The container was restarted with the current client API manifest; no
application code or policy was weakened.

| Checkpoint | Result |
|---|---|
| Container image | **Passed**; `veloce-client-runtime:local-e4948b0` |
| Authenticated client routes | **Passed**; all bounded route checks returned the client shell |
| Capabilities and credentials | **Passed** |
| Provider history | **Passed** after current allowlist was supplied |
| Tenant records | **Passed**; memory, journal, goal, and notebook create/list/delete checks completed |
| GCP-dependent surfaces | **Skipped by contract**; 8 workflow and 11 brief surfaces require Cloud Tasks or GCP metadata identity |
| Full local Cloud Tasks parity | **Still not claimed**; requires a trusted public HTTPS callback origin |
| Temporary container | **Stopped** after verification; no local service was left running |

This is the current supported local non-GCP parity result. The no-tunnel
fail-closed behavior and the Visual QA, GPU, security, communications,
worktree, streaming-speech, and external crawler gates remain unchanged.

## 32. Isolated research-worker contract wave — 2026-08-20 UTC

The next research wave now has a Veloce-owned extraction boundary for Crawl4AI,
Crawlee, and Jina Reader. This is contract implementation, not upstream runtime
installation or activation.

| Checkpoint | Result |
|---|---|
| Worker contract | **Implemented**; `v96-research-worker-v1` bounded HTTPS extraction request |
| Automatic selection | **Implemented**; content fit, cost, latency, and reliability are deterministic and server-side |
| Security boundary | **Passed**; public HTTPS-only source URLs, no credentials/private hosts, bounded bytes/text, hashed tenant scope, server-side worker token, secret-like output redaction |
| Budget/idempotency integration | **Implemented**; worker cost is reserved and settled through the existing research job; search replay identity remains unchanged |
| Brave composition | **Implemented**; Brave search may compose with an approved worker only when Firecrawl extraction is unavailable and a read was requested |
| Focused worker tests | **Passed**; adapter normalization, malformed output, redaction, endpoint validation, selection, and disabled-worker behavior |
| Full focused suite | **Passed**; 105/105 on the host runtime |
| Production builder focused suite | **103/105**; the two failures are the intentionally gated Python Visual QA worker tests because the Node-only production image has no `python3` |
| TypeScript/lint | **Passed** |
| Worker/policy/manifest gates | **Passed**; worker boundary, provider policy, and example manifest validation |
| Catalog status | **Contract-active** for all three references; no worker endpoint or token is enabled in the current owner-cloud manifest |
| External runtime smoke | **Pending**; requires separately deployed worker endpoints and authenticated evidence bundles |

The next activation gate is intentionally explicit: add a worker endpoint and
Secret Manager reference to a client manifest, run the authenticated worker
smoke, verify citations, budget settlement, tenant isolation, deletion lineage,
rate limits, and rollback, then enable only that worker. Crawl4AI, Crawlee, and
Jina Reader remain outside the Next.js image and unavailable to client-facing
selectors until that evidence exists.

## 33. Local Cloud Tasks identity closure — 2026-08-20 UTC

The local tunnel runbook now has an explicit identity path. Cloud Run still
uses the metadata-server token and the localhost guard remains unchanged. A
developer running the client runtime locally may pass `--gcp-auth`, which sets
`CLIENT_RUNTIME_LOCAL_GCLOUD_AUTH=1`; only then, and only outside production,
the Cloud Tasks helper may call `gcloud auth print-access-token`. The token is
held in memory, never logged or persisted, and the tunnel lifecycle remains
manual. Without the flag, local runtime behavior remains fail-closed with
`gcp_identity_unavailable` after the public-base-url check.

| Checkpoint | Result |
|---|---|
| Local identity source | **Implemented**; explicit development-only gcloud fallback |
| Production boundary | **Passed by contract**; fallback is rejected for production/client image execution |
| No-tunnel behavior | **Unchanged**; localhost still returns `task_base_url_not_public` before identity lookup |
| Static worker/policy checks | **Passed**; worker boundary, provider policy, reference suite, typecheck, lint, and 106 focused tests |
| Authenticated tunnel smoke | **Pending**; requires a manually managed trusted HTTPS tunnel and a gcloud identity with Cloud Tasks enqueue permission; anonymous Quick Tunnel was not used because it would expose the session cookie |

## 34. Next-round status — 2026-08-20 UTC

The local Cloud Tasks identity closure is now committed and pushed as
`f05166e` (`Add explicit local Cloud Tasks auth path`). The repository is clean
and `main` is synchronized with `origin/main`. The source checker loop and
production Docker build passed for this commit.

The owner-cloud service is still on the previously verified research-routing
revision `veloce-cloud-test-00161-gc6`; the new local-only gcloud identity path
has not been deployed to Cloud Run. This is intentional: Cloud Run continues
to use its metadata-server identity, while the new fallback exists only for a
developer-operated local tunnel run. A local gcloud context currently lacks
Cloud Run read/deploy permission, so the deployment must be performed from the
authorized Cloud Shell account before cloud evidence is refreshed.

| Next-round item | Current status | Required evidence |
|---|---|---|
| Deploy exact `f05166e` image | **Pending** | Cloud Build success, image digest, new Cloud Run revision, 100% traffic |
| Authenticated local tunnel parity | **Pending** | Trusted HTTPS tunnel, `--gcp-auth`, real Cloud Tasks callback, worker authentication, idempotency replay |
| Crawl4AI/Crawlee/Jina activation | **Pending** | Separately deployed worker endpoints/tokens and authenticated citation, budget, tenant, deletion, and rollback smokes |
| `dofgfood` Visual QA acceptance | **Gated** | Approved target manifest and bounded authenticated artifact acceptance bundle |
| GPU, security, communications, worktrees, streaming speech | **Gated** | Separate approved evidence bundles; statuses unchanged |

## 35. Next-round deployment and authenticated smoke — 2026-08-20 UTC

The pushed `b408ff5` source is now deployed to owner-cloud. The deployment used
the authorized isolated gcloud configuration and preserved Firecrawl as the
manifest default while keeping automatic research routing and the Brave Secret
Manager binding enabled.

| Checkpoint | Result |
|---|---|
| Source commit | **Passed**; `b408ff5` |
| Cloud Build | **Passed**; `ac25c8f2-72b0-44f4-bce3-122d7cecc05d`, 4m04s |
| Image | **Passed**; `client-runtime:v121-next-round-20260820` |
| Image digest | **Passed**; `sha256:93ff16a926dc240cd51c00014159a6aad5581cac9ee9a565ead1ba6766b94472` |
| Cloud Run revision | **Passed**; `veloce-cloud-test-00162-7tn`, 100% traffic, Ready |
| Manifest | **Passed**; Firecrawl default, routing enabled, Brave secret bound, compression and intent traits enabled |
| Authenticated Brave/provider smoke | **Passed**; provider identity, bounded HTTPS results, citations, budget/idempotency evidence |
| Authenticated compression/intent/loop smoke | **Passed**; provider compression, intent routing, gated handling, and hosted-loop replay |
| Full local tunnel parity | **Pending**; still requires a trusted public HTTPS callback and real local Cloud Tasks delivery |
| External crawler workers | **Pending**; no endpoints or tokens enabled |
| Visual QA and other gated capabilities | **Unchanged**; `dofgfood`, GPU, security, communications, worktrees, and streaming speech remain gated |

This closes the deployment-alignment gate for the current native research and
routing plane. It does not promote external crawler runtimes or Visual QA;
those require their separate evidence bundles.

## 36. Remaining infrastructure audit — 2026-08-20 UTC

A live read-only audit was run against the authorized owner-cloud project after
revision `00162-7tn` became Ready.

| Surface | Observed state | Interpretation |
|---|---|---|
| Cloud Run services | Only `veloce-cloud-test` is deployed; latest Ready revision is `00162-7tn` | No separate research-worker service exists yet |
| Cloud Run jobs | `veloce-cloud-test-workspace` exists; no Visual QA job is present | The `dofgfood` Visual QA gate cannot be claimed |
| Research-worker manifest | No `CLIENT_RESEARCH_WORKER_CONFIG_JSON` endpoint configuration is bound to the service | Crawl4AI, Crawlee, and Jina remain contract-active and non-executable |
| Secret Manager metadata | Brave, Firecrawl, and existing client worker-token names are present; no research-worker endpoint/token bundle is present | A token alone is not evidence of an isolated worker |
| Cloudflare tunnel | No local origin certificate or named tunnel configuration exists | Full local Cloud Tasks parity still needs a trusted manually managed HTTPS tunnel |

No manifest flag was changed by this audit. The remaining external gates and
all intentionally gated capability statuses are unchanged.

## 37. Jina Reader worker implementation checkpoint — 2026-08-20 UTC

The first isolated research-worker implementation is now present locally at
`workers/research-jina/`. It implements the Veloce `v96-research-worker-v1`
boundary and calls only the official Jina Reader endpoint. The worker requires
an independent Veloce worker token, keeps the upstream Jina key worker-local,
checks public HTTPS targets and DNS resolution, bounds request/output size,
and returns normalized citation-ready evidence without tenant text or secrets
in logs or response metadata.

| Checkpoint | Result |
|---|---|
| Worker implementation | **Passed locally**; isolated Node worker, Dockerfile, and runbook added |
| Focused worker tests | **Passed**; 4 Jina boundary/normalization tests; full focused suite 110/110 |
| Typecheck / lint / build | **Passed**; production build completed with existing Turbopack warnings only |
| Static worker-policy verification | **Passed**; worker contract, public-target, secret, and output-bound checks |
| Cloud worker endpoint | **Not provisioned**; no endpoint or Secret Manager bundle was available in owner-cloud |
| Manifest activation | **Unchanged**; Jina remains `contract-active` and disabled |

Cloud promotion must wait for a separately deployed worker endpoint, a
`JINA_WORKER_TOKEN`, a worker-local `JINA_API_KEY` (or an explicitly approved
anonymous-tier run), authenticated citation/budget/tenant/deletion/idempotency
smokes, and a rollback record. Crawl4AI, Crawlee, Visual QA, GPU, security,
communications, worktrees, and streaming speech remain unchanged.

## 38. Jina Reader owner-cloud activation checkpoint — 2026-08-21 UTC

The isolated Jina Reader worker is now deployed separately from the Next.js
image and is active only through the server-controlled research route. The
owner-cloud manifest uses Brave for bounded search and the Jina worker for
extraction under `CLIENT_CAPABILITY_PROVIDER_ALLOWLIST_JSON={"seo-research":["brave"]}`.
Clients cannot select the worker or supply an arbitrary endpoint.

| Checkpoint | Result |
|---|---|
| Worker image | **Passed**; `jina-reader-worker:v1`, digest `sha256:d5121b34a99d783d306fa48b1aa4861d04273de80b2a3625d8c1cc25895f04a6` |
| Worker service | **Passed**; `veloce-jina-reader-00002-hwj`, 100% traffic, Ready |
| Worker secrets | **Passed**; independent `jina-worker-token` and worker-local `jina-api-key` Secret Manager bindings |
| Direct worker extraction | **Passed**; authenticated `v96-research-worker-v1` request returned bounded normalized output for a public HTTPS URL |
| Main client revision | **Passed**; `veloce-cloud-test-00164-8vh`, 100% traffic, Ready |
| Authenticated research-worker smoke | **Passed**; Brave search selected, `jina-reader` selected for extraction, citations persisted, output bounded, secrets redacted, and replay preserved the original job identity |
| Routing policy | **Passed**; Jina is enabled only for the owner-cloud `seo-research` capability allowlist; Crawl4AI and Crawlee remain disabled |
| Explicit budget reservation/settlement evidence | **Pending**; the bounded worker path ran, but a dedicated budget ledger assertion is still required |
| Explicit tenant isolation | **Pending**; a dedicated two-tenant A/B evidence run is still required |
| Deletion lineage | **Pending**; a dedicated delete-and-verify evidence run is still required |
| Manifest rollback | **Pending**; the disable-and-negative-smoke record is still required |

This checkpoint closes the endpoint, secret, direct extraction, routing, and
authenticated idempotent worker-path gates for Jina. It does not yet close the
full external-worker promotion bundle because tenant-isolation, deletion, and
rollback evidence are intentionally tracked separately. The worker remains an
isolated hosted adapter, never a bundled runtime or client-installed skill.

## 39. Next-round status — 2026-08-21 UTC

The local implementation gate is closed for this round. The next round should
finish the Jina evidence bundle, then move to the bounded `dofgfood` Visual QA
acceptance gate. No additional provider or worker should be activated in
parallel with those checks.

| Next-round item | Status | Next action |
|---|---|---|
| Local focused suite | **Passed**; 111/111 | Keep as the pre-deployment gate |
| Reference suite | **Passed**; 70/70 | Keep as the catalog/regression gate |
| Typecheck / lint / worker policy | **Passed** | No local code blocker |
| Production build | **Passed** with existing Turbopack filesystem-tracing warnings | Treat warnings as a separate hardening task, not a Jina blocker |
| Jina budget evidence | **Passed**; the aggregate meter is healthy and under cap (`392,835` of `10,000,000` micros), and the dedicated bounded worker job has a reservation/settlement ledger row with redacted usage metadata | Retain the owner-cloud ledger query result |
| Jina two-tenant isolation | **Passed**; the existing verifier passed with valid tenant-A and tenant-B sessions | Retain the redacted verifier output as owner-cloud evidence |
| Jina deletion lineage | **Passed**; deployed `delete_client_research_run`, deleted a disposable run, and verified it was absent from the tenant listing | Retain the deletion response and follow-up absence check |
| Jina rollback | **Passed**; disabled-worker smoke returned `403`, then the known-good manifest was restored and the positive smoke passed | Retain the negative and restored-positive smoke outputs |
| `dofgfood` Visual QA | **Next gate** | Run only the approved artifact-bound acceptance bundle when the target manifest and fixture are available |
| Crawl4AI / Crawlee and other gated groups | **Unchanged** | Remain cataloged or gated; do not route automatically |
