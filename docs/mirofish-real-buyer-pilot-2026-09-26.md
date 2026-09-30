# MiroFish buyer-scenario pilot

Status: environment and sampling frame prepared; **no dynamic simulation has run**. Last checked: 2026-09-29.

## Pinned upstream and non-spending evidence

- Upstream: `https://github.com/666ghj/MiroFish`, source commit `39d849138ef254f6c737ab4c4705e5545dbe31d4`, AGPL-3.0. Use as an isolated research tool, not copied into the proprietary AgentOS runtime pending legal/security review.
- Isolated checkout: `/private/tmp/agentos-mirofish-pilot`. Python 3.12.6 environment installed from the committed lockfile via `uv sync --frozen --no-dev` with a temporary cache. Upstream backend tests: 129 passed, 6 third-party syntax warnings. Flask test-client `/health`: 200, `status: ok`. These checks made no LLM or Zep calls.
- Required for a real run: `LLM_API_KEY` with an OpenAI-compatible endpoint/model and `ZEP_API_KEY`. The private pilot file now has a Zep key, but the LLM key is still empty; values were not inspected or printed. MiroFish's runner validates both before starting. Its `/api/simulation/start` accepts `max_rounds`, but preparation/profile generation and graph building also consume model/Zep resources. The repository warns to begin below 40 rounds.

## Private setup for the first real run

The ignored `/private/tmp/agentos-mirofish-pilot/.env` template was created on 2026-09-29 with mode `0600`. Put only pilot-specific values there: `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL_NAME`, and `ZEP_API_KEY`. Do not paste values into chat, AgentOS, Git, a browser URL, or an evidence bundle. The template currently names OpenAI's Chat Completions-compatible endpoint and `gpt-4o-mini`; change both if using another provider. Zep is configured, the model key is empty, and no model or Zep call has started from this pilot.

MiroFish uses OpenAI-compatible Chat Completions, so an OpenAI Platform key is **not required**. For a free-tier-only first smoke test, [Gemini's compatibility endpoint](https://ai.google.dev/gemini-api/docs/openai) supports `LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/`, `LLM_MODEL_NAME=gemini-2.5-flash`, and a Google AI Studio key in `LLM_API_KEY`. [Gemini lists free input/output tokens for that model](https://ai.google.dev/gemini-api/docs/pricing), but its free-tier prompts and outputs may be used to improve Google's products; use only synthetic, non-confidential material. Confirm the project is actually on the free tier with billing unlinked and check [its live per-project request/token limits](https://ai.google.dev/gemini-api/docs/rate-limits) before a run. MiroFish's JSON-mode and multi-agent behavior still need a one-request compatibility smoke test; documentation compatibility alone is not proof.

[OpenRouter's free plan](https://openrouter.ai/pricing/) currently lists 50 requests/day, so it may suffice for a tiny compatibility check but is too restrictive to assume a 50-person simulation will finish. [NVIDIA NIM exposes an OpenAI-compatible chat endpoint](https://docs.api.nvidia.com/nim/reference/llm-apis), but available free credits and quota must be verified in the specific account before choosing it. None of these LLM arrangements pays for Zep or removes the separate data-use review.

As checked on 2026-09-29, [OpenAI's API spend-limit guide](https://developers.openai.com/api/docs/guides/spend-limits) distinguishes alerts from enforced hard limits; hard enforcement may lag slightly. [Zep's pricing page](https://www.getzep.com/pricing/) lists a Free plan with no auto-top-up, while paid Flex plans auto-top up. Use a separate capped model project and Zep Free for the first pilot, or obtain an equivalent verified provider-side stop control before running. Record the approved combined pilot maximum and current account usage before any request. A monthly limit shared with other workloads is not a clean per-pilot budget.

## Persona design

`scripts/generate-buyer-persona-frame.mjs` produces 10,000 unique cells: 10 fields × 5 decision postures × 4 organization sizes × 5 AI-literacy levels × 5 monthly budget bands × 2 privacy postures. Region is assigned deterministically across six broad regions. The 50-person pilot selects one cell per field × literacy level using a stable seed. This frame is a **coverage target and audit reference**, not a claim that MiroFish accepted or ran those exact profiles. The upstream app generates agents from its graph; compare actual `/profiles` output to the frame before reporting coverage.

Generated local artifacts (not customer data):

| Artifact | Rows | SHA-256 |
| --- | ---: | --- |
| `tmp/mirofish-buyer-pilot-50.jsonl` | 50 | `607f74991c3e35ab9ec29aff2e174e9090a756b04b776294cc6dd46c63403f6a` |
| `tmp/mirofish-buyer-frame-10000.jsonl` | 10,000 | `862697ef32e1081ca88f20329cdc4a1d8555ec08f592dafd983f972694f8c69e` |

Regenerate with `node scripts/generate-buyer-persona-frame.mjs --pilot --out=tmp/mirofish-buyer-pilot-50.jsonl` or omit `--pilot` for the full frame. The seed product brief is `docs/mirofish-buyer-pilot-seed.md`. It deliberately marks unverified customer-journey steps as unverified.

## External-run gate and protocol

1. Obtain legal/security signoff for the isolated AGPL research use and the data sent to the selected LLM/Zep services. Use only a sanitized, non-confidential synthetic seed, never tenant records, Skool content, secrets, or unpublished customer material. For a free-tier-only pilot, verify billing is unlinked and the provider stops at quota; otherwise confirm provider-side **hard total** spend caps and disabled auto-top-up for both services. An alert or soft monthly warning is not sufficient. Record the account/project identity, model price or free-tier status, Zep quota, and owner approval without storing key values.
2. Start MiroFish privately. Upload the seed Markdown with a buyer-evaluation requirement through `/api/graph/ontology/generate`, review ontology/agents, build the graph, create and prepare a simulation. Capture project/graph/simulation IDs and generated profile counts. Reject the run if low-literacy, skeptical, security/budget, or sector coverage is absent; revise the seed before continuing.
3. Pilot one platform with a low `max_rounds` value (at most 10 initially), graph-memory updates disabled, and stop/monitor controls ready. Record actual LLM/Zep usage, errors, elapsed time, generated profiles, and actions. Do not scale from 50 to hundreds or 10,000 without evidence that the model is producing useful, distinct objections and a fresh cost approval.
4. Produce a cited objection/failure report with seeds, upstream commit, model/version, scenario, profile counts, spend, and variance across runs. Compare themes with real prospective-buyer interviews and observed product friction. Convert the highest-evidence issues to product fixes, retest the journey, and keep simulated claims separate from measured conversion.
5. Stop if any provider cap is unverified, cost approaches the cap, sensitive material appears in an output, generated profiles collapse into a narrow archetype, or the test no longer adds decision value. Preserve redacted evidence and follow upstream graph/project deletion procedures after the retention window.

10,000 is a scale ambition, not an automatic API call. MiroFish may not support that exact agent count or input composition without upstream changes. Do not report “10,000 personas tested” unless its actual run artifacts prove it.
