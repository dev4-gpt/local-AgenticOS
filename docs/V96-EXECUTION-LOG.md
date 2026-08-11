# V96 execution log and next setup

**This file is the single place Claude records what it added.** The design
rationale lives in [V96-INFRASTRUCTURE-STAR-PLAN.md](V96-INFRASTRUCTURE-STAR-PLAN.md)
(Codex-owned) and the evidence trail lives in
[cloud-memory-and-inference.md](future-integrations/cloud-memory-and-inference.md).
This one answers a narrower question: *what changed, what is live, and what is
next.* Update this file rather than opening a second log.

**Last updated:** 2026-08-11
**Live:** `veloce-cloud-test-00137-j6j` · image `v99-integrations-hub`
**Branch:** work lands on `origin/main` directly — the
`codex/reviewed-additions-2026-08-10` remote branch was merged and deleted on
2026-08-11. A local branch of that name may still exist with no upstream; `main`
is the one to track.
**Tests:** 227 passing · **19 failing (pre-existing, unrelated)** · build clean ·
three security gates passing

**Verification:** see [V96-VERIFICATION-REPORT.md](V96-VERIFICATION-REPORT.md) for
what is proven live and against which revision — including a **high-severity
defect**: four of eight client-reachable provider lanes cannot complete a
workspace execution, because forced tool-calling and fence-based artifact
extraction are mutually exclusive.

The 19 failures are in `product-experience`, `public-edition`, `sidebar-smoke`
and `visual-shell` — the public-site and local mission-control specs. They fail
identically at a clean `HEAD` with every working change stashed, so they are not
caused by anything in this branch. Earlier entries in this log recorded "221
passing" as if that were the whole suite; it was the pass count only.

---

## 1. Current tenant configuration

Facts, not intentions. Read from the manifest and the live revision.

| Setting | Value |
|---|---|
| `enabledCapabilities` | `tenant-data`, `artifacts`, `orchestration`, `delivery`, `quality`, `text-agents`, `seo-research`, **`media`** |
| `providerAllowlist` | Supabase, Anthropic, OpenRouter, Gemini, **Firecrawl**, **ElevenLabs**, **ElevenLabs Music** |
| `capabilityProviderAllowlist` | `{ "media": ["elevenlabs", "elevenlabs-music", "openai", "heygen"] }` |
| `seoAllowedHosts` | `markexis.com` |
| `budget.monthlyCap` | **$10** shared across every lane — **3.21% used** ($0.321) |
| `budget.warningThreshold` | `0.8` — warns at **$8.00** |

`media` now covers **all four lanes — speech, music, video and images**, each
proven live against a real provider call. `capabilityProviderAllowlist` scopes
the capability to the four providers there are keys for, which is what stops
enabling `media` from demanding a Secret Manager slot for every provider the
code can reach. Suno stays implemented and allowlistable but is not what the
music surface calls.

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
- **Market research lane** — Firecrawl search, bounded, with v96-contract
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
| Images | `OPENAI_API_KEY` | **yes — credit added 2026-08-11, lane live** |
| Video | `HEYGEN_API_KEY` | **yes — provisioned, lane live (§2e)** |

`~/.hermes/auth.json` holds CLI subscription auth (Codex, Copilot, Gemini CLI,
Kimi). Those authenticate a terminal session, not server-side API calls, and are
not usable as cloud keys.

**The music lane was repointed from Suno to ElevenLabs** because the owner
already holds that key, and both lanes are now proven live. `POST /v1/music` returns audio directly, so the lane is
synchronous like speech with no task polling. Suno stays implemented and
allowlistable; it is simply not what the surface calls.

**Net effect as of 2026-08-11: all four media lanes are live.** This table began
as a snapshot when only speech and music had keys; video followed once HeyGen
was provisioned, and images once OpenAI credit was added. Every key listed is
now present in Secret Manager and every lane has produced a real artifact
verified by magic bytes.

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

## 2f. Integrations is a hub again (2026-08-11)

Local `/integrations` is a hub: what the machine can do, which adapters are
connected, which specialist roles exist. The hosted version was a single "plan
an integration" brief screen, which kept the planning lane and lost the hub —
including seven curated role contracts that already reached client edition in
the data layer and were rendered nowhere.

Three tabs now: **Capabilities** (what is switched on for this client),
**Specialist roles**, and **Plan** (the existing lane, unchanged).

**Six roles published**, at pinned revision `ebe9c99`, each showing its source
commit, license, readable context, permitted tools, required output fields and
approval requirement — so a client can audit a role rather than take it on
trust.

### Two boundaries that are enforced, not assumed

**The client never touches `/api/integrations`.** That operator route also
writes credentials into the operator's own config file. The client reads a new
read-only `/api/client-runtime/skills`, and the operator route returns **403**
to a client session. A test asserts it stays out of the allowlist.

**Operator-only roles are filtered at the route.** A test caught that
`minimal-change` runs on the `local` model lane, which a tenant does not have —
publishing it would have been a control that cannot run. The pack keeps the
role and the route filters it, rather than editing curated data to suit one
consumer. Verified live: six roles published, `local` absent.

## 2g. The v90 label was stale — renumbered to v96 (2026-08-11)

The program reached v96 while the docs, contracts and adapters still carried a
`v90` prefix. Renamed across **19 text files**: six file renames
(`V90-EXECUTION-LOG.md`, `V90-INFRASTRUCTURE-STAR-PLAN.md`, `v90Contracts.ts`,
`v90ResearchAdapter.ts`, `v90SkillPack.ts`, `v90-contracts.spec.ts`), every
`V90*` symbol, and the contract value itself.

### Two things checked before the rename, because both could have been silent breaks

**`V90_CONTRACT_VERSION` was not just a name — its value was the string `"v90"`,
enforced by a validator** (`contractVersion must be v90`) and used as the
discriminator on six record types. If that value were persisted, bumping it
would reject every stored record. It is not: `contractVersion` appears in no SQL
schema, and `v96ResearchAdapter.ts:13-14` constructs the request and validates it
in the same call, so producer and validator move together. Safe, no migration.

**Historical image tags are facts and must not be renumbered.**
`cloud-memory-and-inference.md:705` records a real past deployment,
`veloce-cloud-test-00123-cg6` (`v90-radar-video`). A global replace rewrote it to
`v96-radar-video` — falsifying the evidence trail — and it was restored. The
neighbouring `v91-create-parity`, `v93-hosted-jobs-fix` and `v99-integrations-hub`
were never at risk, since only `v90` was targeted.

**The two counters are independent and should not be reconciled.** The image tag
is a build counter that increments every deploy (now `v99`); `v96` is the program
milestone. A milestone below the image number is correct, not a mistake.

**Worth knowing:** naming durable modules after a counter guarantees this recurs
— `v96Contracts.ts` goes stale at v97. Renaming to something version-free would
end the cycle. Not done here, because the ask was to correct the number.

### Also cleaned

Six untracked iCloud `" 2"` files removed — five byte-identical to their
originals, and `ClientWorkflowWorkspace 2.tsx` a **Jul 27** snapshot superseded by
the **Aug 7** original that adds tabs, lanes and `ClientRuntimeNotice`. iCloud
resurrected an old version, not newer work. Moved to a scratchpad rather than
deleted, per the rule against `rm` on unrecoverable untracked files.

Still untracked and left alone: `launch-system/pitch-deck-local-product/` and
`scripts/create-local-product-pitch-deck.mjs` (Aug 8, ~10 MB, referenced by no
tracked file). A standalone deliverable, not runtime — someone should decide
whether it is committed or ignored.

## 3. Next setup — media providers

**All four media lanes are live.** Speech, music, video and — as of 2026-08-11 —
images. Nothing here is outstanding.

### Images went live once credit was added (2026-08-11)

The owner added OpenAI prepaid balance and the lane worked on the first call,
against the same `00137-j6j` revision that had been failing. No code changed
between the failure and the success, which is the clearest possible evidence
that the block was always the provider's balance:

| | Before credit | After credit |
|---|---|---|
| Job | `8a88dc56-e67e-406b-bd8d-d9f436dd321a` | `8622cfd4-5f50-434f-89cf-863982cc2af1` |
| Status | `failed` after 1.6 s | `succeeded` after 20.6 s |
| Error | `provider_credit_balance_exhausted` | `null` |

Artifact `86ac3e37-b266-4561-bb78-75d534e17c97`, 1,515,152 bytes, `gpt-image-1`
via the `openai-image` adapter.

**Verified by magic bytes, not by content-type.** The artifact was downloaded
and the leading bytes are `89504e470d0a1a0a`; `file` independently reports *PNG
image data, 1024 x 1024, 8-bit/color RGB, non-interlaced*, and the byte count
matches the job's `byteSize` exactly. `output_metadata.contentType` is written
by the adapter and would have agreed either way.

**The download is a 302 to a signed `storage.googleapis.com` URL.** Follow it
without resending the tenant cookie — a plain `curl -L` forwards custom headers
to the redirect target, which would hand the session cookie to a storage host
that does not need it.

**Cost: $0.06, not the $0.04 in the table below.** Both are right.
`estimateClientImageCostMicros` multiplies the 40,000-micro base by 1.5 for
`quality: "medium"` and again by 1.5 for a non-square size. The table's 40,000
is the base rate at low/auto quality and 1024×1024. Budget moved $0.2610 →
$0.3210, delta exactly 60,000 micros against a 60,000-micro estimate, and
`byProvider.openai` went 0 → 60,000. **3.21% of the $10 cap.**

**Reading the job record:** state is nested under `job.status`, not top level. A
poller reading the top level sees an empty string and records a false hang —
that happened here before credit was added.

### A Gemini image provider was evaluated and declined (2026-08-11)

`GEMINI_API_KEY` is already in this tenant's `providerAllowlist` and Secret
Manager, so routing images to Gemini looked like a way to unblock the lane
without any OpenAI balance. It is a real option, and it is **not** a config
line:

- `capabilityProviderAllowlist.media` is `[elevenlabs, elevenlabs-music,
  openai, heygen]` — Gemini is absent, and so is any Gemini branch in the code.
- `runClientImageAdapter` (`clientMediaAdapter.ts:135`) is hardcoded to OpenAI:
  a fixed `OPENAI_IMAGE_ENDPOINT`, a literal `provider: "openai"` on the result,
  a `CLIENT_IMAGE_MODEL` defaulting to `gpt-image-1`, and an `isPng` magic-byte
  check that Imagen output would likely fail because it can return JPEG.

So it means a new adapter branch, provider key map, media allowlist entry, cost
estimator, a generalized image-type check, tests, a new image build, a redeploy
and a live smoke. **Declined:** topping up the OpenAI balance costs minutes and
no deploy risk, against roughly a session of work to avoid it. Revisit only if
OpenAI credit becomes an ongoing obstacle rather than a one-time top-up.

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

## 4. Remaining V96 items

**All six are decided as of 2026-08-11. None is waiting on engineering.** The
open question was never "how do we build these" — it was whether they should be
built at all, and that is now answered. Do not re-cost them; if you disagree,
say so and change the decision deliberately rather than reopening the analysis.

| Item | State | Waiting on |
|---|---|---|
| 4.1 Curated skill pack in client UI | **Done** | — |
| 4.2 Supervision visual QA | **Deferred** (decided) | A client who needs it |
| 4.3 Agency Agents skill packs | **Done** — exit gate now enforced | — |
| 4.4 ScrapeGraphAI | **Closed** — superseded by Firecrawl | — |
| 4.5 SkyReels V2 | **Closed** — contract only | GPU host + license review |
| 4.6 Prime Agent | **Closed** — operator-side by design | — |

Images are not on this list because they are not a V96 item: the lane is built,
deployed and correct, and waits only on an OpenAI balance top-up (§3).

### 4.1 Curated skill pack in the client UI — **DONE (2026-08-11)**
Superseded by §2f. Client `/integrations` is a hub with Capabilities, Specialist
roles and Plan tabs, and six roles are published live at revision `ebe9c99`. This
entry described the pre-2f state and was left stale; it is closed.

### 4.2 Roboflow Supervision visual QA — blocked on infrastructure, costed
Needs a Python worker. **There is no Python in `Dockerfile.client`** (verified:
anchored `grep -icE "^(FROM|RUN).*(python|pip)"` returns `0`; the base is
`node:24.14.1-slim`). `V96VisualQaReport` exists in `v96Contracts.ts` and is
imported by nothing — the contract is ready, the runtime is not.

**Money is not the obstacle.** A second Cloud Run service scales to zero, so idle
cost is Artifact Registry storage — a Python + OpenCV image runs roughly 1–1.5 GB
at about $0.10/GB/month, so cents. Compute is per-invocation on a lane that would
be used rarely.

**Surface area is the obstacle, and it is measurable:**

| What it touches | Why |
|---|---|
| `provision-gcp-client.mjs` (510 lines) | Deploys exactly **one** service — `run deploy <serviceName>` from the manifest. Adding a second means restructuring it from *a service* to *services*, and this is the script that ships. |
| `clientRuntimePolicy.ts` + `run-client-runtime-local.mjs` | A new route goes in three places; `tests/route-allowlist.spec.ts` pins them. |
| `client-lifecycle.mjs` (388 lines) + isolation drill | A VQA-report table must register in the same commit or export and offboarding silently drop it. |
| New Dockerfile + service-to-service IAM | No precedent to copy — the project has exactly **one** Cloud Run service today. |

**Decided 2026-08-11: defer.** Not a recommendation any more — a decision, taken
by the owner with the table above in front of them. This is the same commitment
declined for ScrapeGraphAI (§4.4), which Firecrawl then covered through the
existing HTTP boundary. The cost is not the hosting bill; it is turning a
single-service provisioner into a multi-service one, with no client asking for
it yet.

**Reopen it when a client asks for machine-checkable visual QA, and not before.**
`V96VisualQaReport` is already the contract for that day, so reopening costs
design time, not discovery time.

### 4.3 Agency Agents skill packs — **DONE (2026-08-11)**

This entry read as "import more roles". That was already finished. The STAR plan
asks for a *small initial pack* — "architecture, code review, accessibility,
research, technical writing, video, and minimal-change" — and those are exactly
the seven manifests in `V96_CURATED_SKILL_PACK`, with six published live (§2f).
The plan also offers "a local/operator skill-pack importer **or** checked-in
curated manifests"; checked-in manifests is the path taken.

**What was actually unmet was the plan's exit gate:** *a selected role improves a
task without increasing tool permissions or changing the cloud manifest.* The
first half had no enforcement at all.

`allowedTools` was free text. The only assertion was `length > 0`, so a future
manifest could have declared `allowedTools: ["execute-shell"]` and passed every
test in the suite. A curated role would have silently granted a permission the
platform never agreed to — the precise failure the exit gate exists to prevent.

Now closed:

- **`V96_PERMITTED_SKILL_TOOLS`** is a closed vocabulary in `v96Contracts.ts`.
  Every verb is read-only, a test run, or writing a reviewable deliverable.
  Nothing executes a shell, reaches the network, reads credentials, or mutates
  tenant data. A second test asserts the *vocabulary itself* stays that way, so
  widening it is a deliberate act rather than something that arrives attached to
  a new role.
- **`V96_PERMITTED_SKILL_SURFACES`** is closed too — a role advertising a
  surface that does not exist is a control a client can see and never reach.
- **`validateV96SkillManifest`** returns the reasons a role is unpublishable.
  The test suite is the gate; the skills route also filters on it as defence in
  depth, so an unsound role cannot reach a client even if the test is skipped.
- **The manifest half of the gate** is asserted directly: roles carry no
  `provider` or `capability` of their own and reach a model only through the
  existing lane, so publishing the pack requires nothing new from the cloud
  manifest. A test pins that shape.

**The gate was verified by planting `execute-shell` in a real role**, not by
reading the assertions. The suite failed with `tool is outside the permitted
vocabulary: execute-shell`, and passed again once reverted. Six new tests, 227
passing.

The rule from the plan is unchanged and now mechanically enforced: client cloud
receives Veloce-authored reviewed contracts, never third-party prompt files.

### 4.4 ScrapeGraphAI — superseded in practice
Firecrawl covers structured research through the same contract. Revisit only if
a client needs self-hosted extraction for data-residency reasons.

### 4.5 SkyReels V2 — **CLOSED, contract only (2026-08-11)**
Correct as-is. Needs a GPU host and a license review; HeyGen covers the hosted
video need and is live, so there is no gap to fill.

Closed rather than left open, because "contract only" was being re-read each
session as unfinished work. It is not unfinished — it is a provider contract
held deliberately against a need that HeyGen already meets. Reopen only if a
client needs self-hosted video generation.

### 4.6 Prime Agent — **CLOSED, operator-side by design (2026-08-11)**
A disposable-worktree pilot on the operator machine, not a client feature. The
STAR plan says "pilot in a disposable worktree"; that is a local operator
experiment. `V96ResumableWorktreeRun` is the contract if it ever becomes a
hosted feature.

**There is nothing to build in the hosted runtime, and there never was.** This
entry existed to record a decision, not a task. Closed so it stops reading as
one.

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
