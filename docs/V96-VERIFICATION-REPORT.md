# V96 verification report — what is actually proven, and how

**This document exists because "everything is tested" turned out to be false.**
The execution log recorded a full-surface sweep as evidence that every surface
worked. That sweep ran on `00132-xw5`; live was `00137-j6j`, five revisions
later, and nobody re-ran it. A claim that was true when written had quietly
decayed into a claim that was not.

So this file records verification differently. Every row says **which revision
it was proven against**. A result without a revision is not a result.

**Revision under test:** `veloce-cloud-test-00138-68l`
**Image:** `v100-skill-gate`, digest `sha256:795f6fee…`
**Release:** `skill-gate-20260811`
**Date:** 2026-08-11

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

## 2. DEFECT: half the provider lanes cannot complete a workspace execution

**Severity: high. Reproducible. Structural, not probabilistic.**

Four of the eight client-reachable provider lanes can **never** produce an
artifact from a workspace execution. Not sometimes — never, by construction.

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

### Options (not yet decided)

1. **Teach `artifactFromWorkspaceOutput` to accept a reviewed plan** — map the
   plan JSON into a markdown artifact. Keeps the review boundary, makes the lane
   usable.
2. **Do not force the tool for workspace executions** — pass the tool as
   available rather than mandatory, so the model can return a fenced document.
   Weakens the reviewed-plan guarantee.
3. **Gate the lanes explicitly** — refuse a workspace execution on a
   `reviewed-plan` provider with a named error instead of a generic artifact
   failure. Honest, but leaves half the lanes unusable.

Option 1 preserves both guarantees and is the recommendation. **Not implemented
— this is a finding, not a fix.**

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
| video | brief | gemini | | | |

**23 of 26 surfaces verified working against this revision**, spread across all
four usable provider lanes. Every `preview` surface produced HTML; every `brief`
surface produced markdown.

### Not yet verified on this revision

`leads`, `radar`, `notebook` — **3 surfaces**, held back only by the 12-per-900s
write limit, not by any observed problem.

These are *unverified*, not *broken*. The distinction matters and this document
will not blur it.

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

## 6. Test suite

**227 passing · 19 failing · build clean · three security gates passing.**

The 19 failures are in `product-experience`, `public-edition`, `sidebar-smoke`
and `visual-shell` — public-site and local mission-control specs. They fail
identically at a clean `HEAD` with every working change stashed, so they predate
this branch. **They are pre-existing and unrelated, not passing.**

Six of the 227 are new this session, enforcing the skill pack's exit gate. That
gate was verified by planting `execute-shell` in a real role and confirming the
suite failed with `tool is outside the permitted vocabulary: execute-shell`,
then passed again on revert. **A gate that has never been observed failing is
not a verified gate.**

---

## 7. Spend

| Item | Cost |
|---|---|
| Before this session | $0.2610 |
| Image smoke (`gpt-image-1`, medium, 1024×1024) | $0.0600 |
| Workspace executions (~30 across sweeps and isolation) | small, text-lane |

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

- **15 of 26 surfaces** not exercised on `00138-68l`.
- **The `reviewed-plan` defect has no fix**, only a diagnosis and three options.
- **`/api/client-runtime/provider-chat` is operator-only** — it returns
  `client_route_not_enabled` to a client session for all 16 providers. That is
  correct behaviour, but it means the client model path is `executions`, and any
  harness testing "models" through `provider-chat` is testing nothing.
- **19 pre-existing test failures** are unexplained. They are not this branch's
  doing, but nobody has diagnosed them.
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
