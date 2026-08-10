# V90 execution log and next setup

**This file is the single place Claude records what it added.** The design
rationale lives in [V90-INFRASTRUCTURE-STAR-PLAN.md](V90-INFRASTRUCTURE-STAR-PLAN.md)
(Codex-owned) and the evidence trail lives in
[cloud-memory-and-inference.md](future-integrations/cloud-memory-and-inference.md).
This one answers a narrower question: *what changed, what is live, and what is
next.* Update this file rather than opening a second log.

**Last updated:** 2026-08-10
**Live:** `veloce-cloud-test-00136-p5j` · image `v98-provider-diagnostics`
**Branch:** `codex/reviewed-additions-2026-08-10` = `origin/main`
**Tests:** 215 passing · build clean · three security gates passing

---

## 1. Current tenant configuration

Facts, not intentions. Read from the manifest and the live revision.

| Setting | Value |
|---|---|
| `enabledCapabilities` | `tenant-data`, `artifacts`, `orchestration`, `delivery`, `quality`, `text-agents`, `seo-research`, **`media`** |
| `providerAllowlist` | Supabase, Anthropic, OpenRouter, Gemini, **Firecrawl**, **ElevenLabs**, **ElevenLabs Music** |
| `capabilityProviderAllowlist` | `{ "media": ["elevenlabs", "elevenlabs-music", "openai", "heygen"] }` |
| `seoAllowedHosts` | `markexis.com` |
| `budget.monthlyCap` | **$10** shared across every lane — **3% used** ($0.261) |
| `budget.warningThreshold` | `0.8` — warns at **$8.00** |

`media` is enabled for **speech and music only**. `capabilityProviderAllowlist`
scopes it to the two providers there are keys for; without that, enabling the
capability demands a Secret Manager slot for HeyGen and Suno as well. Adding
images or video later is a manifest line plus a secret, not a code change.

---

## 2. What was added (chronological, with evidence)

### Hosted surface parity
- **Notebook** — four decorative tabs replaced with real lanes; notebooks became
  containers (`client_notebooks`, nullable `notebook_id`, `on delete set null`).
- **Radar** — rebuilt to the local structure: Signals → oracle → Published.
  `RadarOrb` ported unchanged; its sweep state is driven by real in-flight work.
- **Video** — Script → Storyboard → Library, matching local's two histories.
- **SEO** — all eight local tabs restored: Research, AEO, OpenSEO, Generate,
  Deploy, History, Transcripts, Skill.
- **Memory** — the Search view was decorative; it now filters real records.
- **Media surfaces** — Agent Studio, Music, OpenMontage, Thumbnails given real
  modes, libraries and provider-naming gates.

### Spend visibility
- **`/api/client-runtime/budget`** and **`ClientSpendMeter`** — every surface
  that can charge a provider key now shows the money spent and the percentage
  of the cap together, broken down per provider. The keys are the client's own,
  so this is their bill, not an abstract quota. Small charges render `<$0.01`
  rather than `$0.00`.
- Verified live: **$0.0578 of $1.00 (6%)** — anthropic $0.0439, openrouter
  $0.0080, firecrawl $0.0050, antigravity $0.0009.

### Media lanes — speech and music live
Proven on `00131-9rt` with keys the owner already held:

| Lane | Artifact | Bytes | Cost |
|---|---|---|---|
| Speech (`elevenlabs`) | `29025b7b` | 85,725 | $0.0002 |
| Music (`elevenlabs-music`, 30s) | `e1e95906` | 479,862 | $0.1000 |

Both verified as real mp3 by magic bytes rather than content-type, and the
ledger recorded them as separate providers — which is the point of keeping the
two on separate keys and meters. Budget moved 6% → 16%, delta $0.1002 against a
$0.1002 estimate.

**Music is the expensive lane.** Eight more thirty-second tracks exhaust the $1
cap, and the guard then fails other surfaces. Raise the cap before real use.

### Runtime
- **`copy` artifact intent** — `preview` renders, `brief` plans, `copy` returns
  the finished piece. Added because the runner's format instruction is appended
  *after* the goal and therefore wins: Radar asked for a thread and got a brief.
- **Market research lane** — Firecrawl search, bounded, with v90-contract
  normalisation. Live and proven.
- **AEO check** — robots.txt, llms.txt and structured-data detection.

### Defects found by running the deployed product
Each passed every unit test and was invisible until a real call was made.

1. **Artifact gallery hid everything the runtime produced.** It filtered on
   `created_by`, which the worker's RPC never sets. Gallery went 2 → 17.
2. **A Ruflo swarm with no coordinator report read as a clean run.** Fixed in
   the worker, the label, and the settle RPC.
3. **`hosted-jobs` conflated provider name and provider key — twice, in
   opposite directions.** The first fix corrected the fallback path, which
   compares against the global allowlist of *keys*. Setting
   `capabilityProviderAllowlist` then activated the per-capability JSON path,
   which lists provider *names*, and the same single parameter was now wrong
   the other way. Codex settled it in `74af0c1` by taking both identifiers
   separately. Until then no provider capability had ever been reachable
   through that route.
4. **A correct fix in the repo is not a correct deployment.** The v96 image was
   built at 13:14 UTC and `74af0c1` landed at 13:33 UTC, so the smoke failed
   against code that was already fixed on disk. With two sessions committing,
   check the commit timestamp against the build timestamp before diagnosing.

### Owed evidence, closed
- Controlled cloud failures for Ruflo and Room.
- Two-tenant isolation across 21 tables.
- Service-role export covering 29 tables.

---

## 2b. Local key audit (presence only, values never read)

| Cloud lane | Key it needs | Owner already has it |
|---|---|---|
| Speech | `ELEVENLABS_API_KEY` | **yes** |
| Music | `ELEVENLABS_MUSIC_API_KEY` | **yes** |
| Images | `OPENAI_API_KEY` | no |
| Video | `HEYGEN_API_KEY` | no |

`~/.hermes/auth.json` holds CLI subscription auth (Codex, Copilot, Gemini CLI,
Kimi). Those authenticate a terminal session, not server-side API calls, and are
not usable as cloud keys.

**The music lane was repointed from Suno to ElevenLabs** because the owner
already holds that key, and both lanes are now proven live. `POST /v1/music` returns audio directly, so the lane is
synchronous like speech with no task polling. Suno stays implemented and
allowlistable; it is simply not what the surface calls.

**Net effect: two of four media lanes are live on keys already owned.** Images
need an `OPENAI_API_KEY`; video needs `HEYGEN_API_KEY`. Neither is bought yet.

## 2c. Full-surface test campaign inside $10

The cap was raised from $1 to $10 (config-only; same image, revision
`00132-xw5`) so every surface can be exercised without a media test starving
the rest.

**The whole of this session's work cost $0.158.** That covered Ruflo swarms,
Room rounds on six models, Loop iterations, the Batch A sweep, SEO research
with live Firecrawl calls, and one voiceover and one music track. Text is
effectively free; media is the entire cost.

### What a complete sweep costs

Grounded in the ledger's observed figures, not vendor list prices.

| Group | Runs | Estimated |
|---|---|---|
| Orchestrate — Paperclip, Room, Pipeline, both Kanbans, Loop, Ruflo | ~10 | $0.06 |
| Create text — Brief, OpenDesign, Web Studio, Flow Lab, Games, Agent Studio, OpenMontage | ~15 | $0.02 |
| Govern — SEO all eight tabs, both Guides, Integrations | ~12 | $0.03 |
| Deliver — Delivery, Leads, Radar | ~8 | $0.01 |
| Context — Memory, Notebook, Journal, Goals | ~8 | $0.01 |
| Speech | 10 | $0.03 |
| **Music** | 5 | **$0.50** |
| **Images** *(needs an OpenAI key)* | 20 | **$0.80** |
| **Video** *(needs a HeyGen key)* | 5 | **$0.50** |
| | **Total** | **≈ $1.96** |

A complete sweep of every surface fits in roughly **20% of the cap**, leaving
room to repeat it several times.

### Where the money actually goes

- **Anthropic is the expensive text model.** A single Room round across six
  personas cost $0.0439 — more than every other text call this session
  combined. Prefer the OpenRouter lane for bulk testing.
- **Media dominates everything.** One 30-second track costs more than the
  entire Orchestrate group.
- **Firecrawl is negligible** at $0.001 per page; scraping three results is
  $0.004.

### Still to buy

Images need `OPENAI_API_KEY`, video needs `HEYGEN_API_KEY`. Both slot into the
existing `capabilityProviderAllowlist` as a manifest line plus a secret — no
code change. Without them the sweep costs about **$0.66**.

**The cap is Veloce's own ledger, computed from estimates, and that risk scales
with the ceiling.** At $10 an under-counting estimate can overspend by ten
times what it could at $1. Set hard limits in the ElevenLabs and OpenAI
dashboards too; that is the only ceiling the party billing you enforces.

## 2d. Full-surface sweep (2026-08-10, `00132-xw5`)

**Every surface is proven.** Twenty-one in one consolidated run, five already
holding artifacts from earlier the same day on the same lane.

| Group | Artifacts |
|---|---|
| Create | `d696f4f0` create · `f95c1a7b` opendesign · `6d6ff58d` web-studio · `d5971266` flow-lab · `4ea2f777` games · `1f338ea3` studio · `5b95f48e` openmontage · `7c960f43` thumbnails · `432dfc76` video |
| Govern | `8b1cc84a` seo · `93c09ef8` seo-guide · `6058b210` guide · seo/research (3 sources) · seo/aeo |
| Orchestrate | `756c95a6` ruflo · loop `passed` |
| Media | `35e8392e` speech |
| Context | memory, journal, goal, notebook records all `201` |
| Earlier same day | `41719bcd` integrations · `eeba26e5` deliver · `7dc1f7b1` leads · `9a3238a4` radar · `66b9593f` notebook |

**Cost: $0.0031** for twenty-one runs. Total spend $0.1610 of $10.00 (2%), and
the music track from earlier is still most of it.

### Two apparent failures that were not defects

**Loop reports `passed`, not `succeeded`.** The sweep polled for the wrong word
and recorded a failure against a lane that had worked. Worth knowing before
writing any harness against it.

**The rate limiter refused the last five.** `workspace-execution-write` allows
**12 per 900s**, and the sweep queued seventeen. That is the guard doing its
job: no client can sweep all surfaces inside one fifteen-minute window, by
design. A harness must either batch under twelve or wait out the window.

## 2e. Media provider status (2026-08-10)

| Lane | Provider | State | Cost |
|---|---|---|---|
| Speech | ElevenLabs | **live** — `29025b7b`, valid mp3 | $0.0002 |
| Music | ElevenLabs Music | **live** — `e1e95906`, valid mp3 | $0.10 |
| Video | HeyGen | **live** — `cbb8da42`, valid mp4 (2.4 MB, `ftyp/isom`) | $0.10 |
| Images | OpenAI `gpt-image-1` | wired and correct, **blocked: no OpenAI credit** | — |

Three of four are live. The gap is a balance on the owner's OpenAI account, not
anything in the codebase.

### HeyGen needs an avatar and a voice, and refuses without them

The first render failed `video_input_invalid`, which is **our** validation
rather than HeyGen's: the adapter requires `avatar_id` and `voice_id` and
refuses rather than guessing, so no call was made and nothing was charged.

Those ids are account-specific. The account holds 1,276 avatars and 2,461
voices; the tenant defaults are now set in `runtimeEnv`:

```
CLIENT_HEYGEN_AVATAR_ID   11c86ee5b38a41e389b75bc6120f1aa8
CLIENT_HEYGEN_VOICE_ID    b28d98301ed04b849591e98c2598d5b4
```

A render takes about 50 seconds and moves through `queued -> running ->
succeeded`. This is a better failure than the image lane's: it caught missing
configuration *before* spending anything, where OpenAI's only surfaced after a
round trip.

`outputUrl` is `none` on a succeeded video job by design. The worker downloads
the render and commits it to tenant storage, so the client owns a durable file
rather than a link to the provider's CDN that expires.

### The image lane is blocked at the provider, not in the code

The first live call returned `provider_request_failed`, which was true and
useless. The Cloud Run logs held the real answer: OpenAI replied **429**.

That is ambiguous in an expensive way — a 429 there is either a real rate limit,
which waiting fixes, or `insufficient_quota`, which waiting never fixes. So the
image adapter now carries the provider's own short machine code through to the
job. Retried on `v98`, the same request answered immediately:

```
-> failed: provider_credit_balance_exhausted
```

That is OpenAI's code, not our interpretation. The key is valid, the wiring is
right, and the account has no prepaid balance. Image generation bills against
purchased credit; a payment method on file is not sufficient.

Only the machine code is propagated — the message body can echo request
content, so it is deliberately dropped.

**A failed provider call costs nothing.** Both attempts settled at `$0.0000`
with the reservation refunded, visible as `openai $0.0000` in the ledger.

### Expect the same shape from HeyGen

HeyGen also runs on prepaid credit. If that balance is empty it will fail the
same way — but it will now say so on the job rather than in the logs.

## 3. Next setup — media providers

Speech, music and video are **done**. Images are wired and correct but blocked
on an empty OpenAI balance. Nothing is constrained by the Veloce cap, which sits
at 3% of $10 — only by provider credit.

### Cost per run

| Provider | Micros | Per run | Runs per $1 |
|---|---|---|---|
| HeyGen | 100,000 | $0.10 | 10 |
| ElevenLabs Music (30s) | 100,000 | $0.10 | 10 |
| Suno *(no longer used)* | 100,000 | $0.10 | 10 |
| OpenAI image (standard) | 40,000 | $0.04 | 25 |
| OpenAI image (high, non-square) | 120,000 | $0.12 | 8 |
| ElevenLabs | 3,000 / 1k chars | ~$0.003 | ~330k chars |

The budget is shared with the model lane and Firecrawl. The cap was raised to
**$10** for the testing period, which removes the earlier problem where a
handful of renders would exhaust the month and start failing unrelated
surfaces. See §2c for what a full sweep costs.

### Steps

**1. Owner creates four secrets.** Names are prefixed `veloce-<slug>-`; the bare
name is not read. `printf` avoids a trailing newline; `--data-file=-` keeps the
key out of shell history.

Only the keys for lanes being tested are needed. Speech and music can reuse
keys the owner already holds.

```bash
P=veloce-agenticos-2026
for s in elevenlabs-api-key elevenlabs-music-api-key openai-api-key heygen-api-key; do
  gcloud secrets create veloce-veloce-cloud-test-$s --project=$P --replication-policy=automatic
  gcloud secrets add-iam-policy-binding veloce-veloce-cloud-test-$s --project=$P \
    --member="serviceAccount:veloce-cloud-test-run@$P.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
# then, per provider:
printf %s "KEY" | gcloud secrets versions add veloce-veloce-cloud-test-elevenlabs-api-key --project=$P --data-file=-
```

**2. Claude updates the manifest** — add `media` to `enabledCapabilities`, the
keys being used to `providerAllowlist` and `secretEnv`, and set explicit
`CLIENT_OPENAI_IMAGE_COST_MICROS` and `CLIENT_ELEVENLABS_MUSIC_COST_MICROS`.
Validate before deploying.

**3. Deploy and smoke each lane**, capturing an artifact id per provider. The
deploy refuses if a secret has no enabled version, so a missing key fails loudly
rather than silently.

**The first media run did fail**, as expected, though not for the predicted
reason: the deployed image predated the fix rather than lacking it. The lane
itself was sound. Budget the first run of images and video for discovery all
the same — neither has ever completed a live call.

---

## 4. Remaining V90 items

### 4.1 Curated skill pack in the client UI — small, ready
`V90_CURATED_SKILL_PACK` (seven roles: architecture, code-review,
accessibility, research, technical-writing, video, minimal-change) already
reaches client edition through `integrationHub.ts`. But client `/integrations`
renders the Batch A studio screen, not `IntegrationsHub`, so **the data arrives
and no client UI shows it.**

Give `/integrations` its own surface listing each role, what it produces, which
surfaces it supports, and the approval it requires. No new dependency, no
migration. This is the highest value-per-effort item left.

### 4.2 Roboflow Supervision visual QA — blocked on infrastructure
Needs a Python worker. **There is no Python in `Dockerfile.client`** (verified —
an earlier grep matched `/pipeline`, not `pip`). Standing up a Python service is
the same commitment declined for ScrapeGraphAI. Recommend deferring until a
client actually asks for machine-checkable visual QA; `V90VisualQaReport`
already exists as the contract for when it does.

### 4.3 Agency Agents skill packs — extends 4.1
Once 4.1 exists, importing curated role manifests has somewhere to land. Keep
the rule from the plan: client cloud receives only Veloce-authored reviewed
contracts, never third-party prompt files.

### 4.4 ScrapeGraphAI — superseded in practice
Firecrawl covers structured research through the same contract. Revisit only if
a client needs self-hosted extraction for data-residency reasons.

### 4.5 SkyReels V2 — contract only
Correct as-is. Needs a GPU host and a license review; HeyGen covers the hosted
video need meanwhile.

### 4.6 Prime Agent — operator-side
A disposable-worktree pilot on the operator machine, not a client feature.
Nothing to build in the hosted runtime.

---

## 5. Rules that earned their place

- **Provider gates name the provider.** "Generation is unavailable" tells a
  client nothing; "this needs ElevenLabs approved with its own budget" tells
  them what to do.
- **Surfaces read real capability state**, never hardcoded gate text, so a tab
  ungates on approval without a redeploy.
- **A new client API route goes in three places** — `clientRuntimePolicy.ts`,
  `run-client-runtime-local.mjs`, and `provision-gcp-client.mjs`, which is the
  one that ships. `tests/route-allowlist.spec.ts` pins them together.
- **A new table is registered in `client-lifecycle.mjs` and the isolation drill
  in the same commit**, or export and offboarding silently drop it.
- **Unit tests do not prove a lane works.** All three defects above passed
  theirs. Budget a live smoke per lane.
- **Cost estimates err high, never low.** An under-counting ledger lets real
  spend pass the cap before the guard notices; over-counting only stops early.
- **The cap is Veloce's ledger, not a provider limit.** Set hard limits in each
  provider dashboard too; that is the only ceiling the party billing you
  enforces.
