# V90 execution log and next setup

**This file is the single place Claude records what it added.** The design
rationale lives in [V90-INFRASTRUCTURE-STAR-PLAN.md](V90-INFRASTRUCTURE-STAR-PLAN.md)
(Codex-owned) and the evidence trail lives in
[cloud-memory-and-inference.md](future-integrations/cloud-memory-and-inference.md).
This one answers a narrower question: *what changed, what is live, and what is
next.* Update this file rather than opening a second log.

**Last updated:** 2026-08-10
**Live:** `veloce-cloud-test-00127-zdw` · image `v94-media-lanes`
**Branch:** `codex/reviewed-additions-2026-08-10` = `origin/main` @ `99c882e`
**Tests:** 206 passing · build clean · three security gates passing

---

## 1. Current tenant configuration

Facts, not intentions. Read from the manifest and the live revision.

| Setting | Value |
|---|---|
| `enabledCapabilities` | `tenant-data`, `artifacts`, `orchestration`, `delivery`, `quality`, `text-agents`, `seo-research` |
| `providerAllowlist` | Supabase, Anthropic, OpenRouter, Gemini, **Firecrawl** |
| `seoAllowedHosts` | `markexis.com` |
| `budget.monthlyCap` | **$1** shared across every lane |

`media` is **not** enabled. The adapters exist and the UI is wired; only the
keys and the capability flag are missing.

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
3. **`hosted-jobs` compared a provider *name* against a list of provider
   *keys*.** No provider capability had ever been reachable through that route.

### Owed evidence, closed
- Controlled cloud failures for Ruflo and Room.
- Two-tenant isolation across 21 tables.
- Service-role export covering 29 tables.

---

## 3. Next setup — media providers

The decision to enable all four, HeyGen included, is taken: **everything is
being tested.** The cap stays at $1 for now, which is the binding constraint.

### Cost per run

| Provider | Micros | Per run | Runs per $1 |
|---|---|---|---|
| HeyGen | 100,000 | $0.10 | 10 |
| Suno | 100,000 | $0.10 | 10 |
| OpenAI image (standard) | 40,000 | $0.04 | 25 |
| OpenAI image (high, non-square) | 120,000 | $0.12 | 8 |
| ElevenLabs | 3,000 / 1k chars | ~$0.003 | ~330k chars |

The budget is shared with the model lane and Firecrawl. At $1, roughly **five
HeyGen renders plus normal usage** exhausts the month, and the guard then starts
failing *other* surfaces with `budget_exceeded`. Two workable options: raise the
cap to $10–20 for the testing period, or test one provider at a time.

### Steps

**1. Owner creates four secrets.** Names are prefixed `veloce-<slug>-`; the bare
name is not read. `printf` avoids a trailing newline; `--data-file=-` keeps the
key out of shell history.

```bash
P=veloce-agenticos-2026
for s in elevenlabs-api-key openai-api-key suno-api-key heygen-api-key; do
  gcloud secrets create veloce-veloce-cloud-test-$s --project=$P --replication-policy=automatic
  gcloud secrets add-iam-policy-binding veloce-veloce-cloud-test-$s --project=$P \
    --member="serviceAccount:veloce-cloud-test-run@$P.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
# then, per provider:
printf %s "KEY" | gcloud secrets versions add veloce-veloce-cloud-test-elevenlabs-api-key --project=$P --data-file=-
```

**2. Claude updates the manifest** — add `media` to `enabledCapabilities`, the
four keys to `providerAllowlist` and `secretEnv`, and set an explicit
`CLIENT_OPENAI_IMAGE_COST_MICROS`. Validate before deploying.

**3. Deploy and smoke each lane**, capturing an artifact id per provider. The
deploy refuses if a secret has no enabled version, so a missing key fails loudly
rather than silently.

**Expected first failure:** the media path shares the `hosted-jobs` route whose
key/name bug was only just fixed, and no media provider has ever completed a
live call. Budget the first run for discovery, not confirmation.

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
