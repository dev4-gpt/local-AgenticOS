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

## Current Codex checkpoint — step 4 source complete, cloud deployment pending

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
- Cloud DNS/runtime reachability is restored. Live is now
  `00140-5qb`/`v102-hermes-content-factory`, digest
  `sha256:21b310438520f3870eb0af743c11acb87d35666ca362a5165c6233c548879ffe`;
  root and `/hermes` return the login boundary and the new API returns 401
  without a session. Authenticated workflow verification awaits applying the
  new Supabase migration.
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

---

## 9. How to re-verify

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

# 3. Live surface execution (12 writes per 900s)
curl -s -H "Cookie: $(cat ~/.veloce-cookie)" -H 'content-type: application/json' \
  -X POST -d '{"surface":"guide","title":"probe","goal":"Return a short markdown brief inside a single ```markdown fenced code block. No text outside the fence.","artifactIntent":"brief","provider":"anthropic"}' \
  https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/api/client-runtime/executions

# 4. Poll — state is nested under job.status, NOT top level.
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
