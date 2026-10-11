# MiroFish buyer-scenario pilot

Status: the latest bounded synthetic run, `sim_4d52cec6d408`, completed with two of ten buyers active. Its technical and private content audit passes, and current-source release-evidence capture accepts the artifacts. This is not market validation or a 10,000-person test. Actual provider charges have not been independently reconciled. Last checked: 2026-10-10.

## Pinned upstream and non-spending evidence

- Upstream: `https://github.com/666ghj/MiroFish`, source commit `39d849138ef254f6c737ab4c4705e5545dbe31d4`, AGPL-3.0. Use as an isolated research tool, not copied into the proprietary AgentOS runtime pending legal/security review.
- Isolated checkout: `/private/tmp/agentos-mirofish-pilot`. Python 3.12.6 environment installed from the committed lockfile via `uv sync --frozen --no-dev` with a temporary cache. Upstream backend tests: 129 passed, 6 third-party syntax warnings. Flask test-client `/health`: 200, `status: ok`. These checks made no LLM or Zep calls.
- Required for a real run: `LLM_API_KEY` with an OpenAI-compatible endpoint/model and `ZEP_API_KEY`. Both are now present in the private pilot file; values were not printed or committed. MiroFish's runner validates both before starting. Its `/api/simulation/start` accepts `max_rounds`, but preparation/profile generation and graph building also consume model/Zep resources. The repository warns to begin below 40 rounds.

## Private pilot setup

The ignored `/private/tmp/agentos-mirofish-pilot/.env` file was created on 2026-09-29 with mode `0600`. Put only pilot-specific values there: `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL_NAME`, and `ZEP_API_KEY`. Do not paste values into chat, AgentOS, Git, a browser URL, or an evidence bundle. It now points to Groq's OpenAI-compatible endpoint and `openai/gpt-oss-20b`. The user confirmed Groq and Zep Free plans and approved $0 paid spend. This is a user-confirmed tier, not independent access to either billing dashboard.

**Read-only billing refresh, 2026-10-06:** In the user's Chrome Work profile, GroqCloud Billing showed the Personal organization's Free ($0) plan as current. Zep Billing showed the `veloce` project on Free with 29 credits used this month, a 10,000-credit plan, and no payment method added. Zep's notify-at control explicitly says alerts do not cap usage. These are independently viewed account states, but they do not prove which accounts the private pilot keys belong to or actual billed spend. The Zep key previously pasted into chat still requires user-completed rotation and replacement in the private pilot file before another live request; no new pilot ran in this refresh.

**Compatibility check, 2026-10-02:** The original temporary checkout lost tracked files and Git metadata, so a fresh isolated copy was checked out at the pinned upstream commit in `/private/tmp/agentos-mirofish-pilot-restored`; the private `.env` remained in the original path. Dependencies were restored from `backend/uv.lock`, and 130 backend tests passed (six third-party syntax warnings). One Groq Chat Completions request using a synthetic JSON prompt, `openai/gpt-oss-20b`, and disabled SDK retries returned valid JSON (`finish_reason=stop`, 108 prompt tokens, 51 completion tokens). No customer data, Skool content, or Zep request was involved.

The first MiroFish ontology-generation attempt with the synthetic buyer seed did **not** pass: `openai/gpt-oss-20b` returned HTTP 400 `json_validate_failed`. An alternate Free-plan `qwen/qwen3.8-27b` attempt produced an unusable length-limited response; its bounded content retry then received HTTP 429. No graph or simulation existed **at that point**. The manually reviewed ontology below allowed a separate, later pilot to proceed.

**Manual ontology bootstrap, 2026-10-02:** `evaluations/mirofish-buyer-ontology-v1.json` defines three entity types and four relationships. The ten role, literacy, budget, and privacy distinctions remain in the seed and `Buyer` attributes. This fits [Zep Free's five custom entity and five custom edge type limits](https://www.getzep.com/pricing/); [Zep says the two limits apply independently](https://help.getzep.com/customizing-graph-structure). An earlier ten-entity/six-edge draft was corrected before any Zep call. `scripts/bootstrap-mirofish-buyer-pilot.py` checks the pinned upstream commit, validates the ontology with MiroFish's own normalizer, and prepares a project without LLM or Zep calls. Its dry run reported the seed SHA-256 `83daeb6dea9d58733ecb9fe2aa6056eb07f5c9c880cecca3972a310d9ff3c66c` and ontology SHA-256 `01cc25c989394ab788c53a69c7ee6f680592a565294be69ccd497cb83f671335`. Local bootstrap project `proj_be9a7e7fec4e` was superseded by the actual pilot project below. This bypasses only the failed ontology-generation request; the graph and simulation were tested separately.

## Bounded run receipt, 2026-10-02

- Input: the ten **fictional** buyer cells in `evaluations/mirofish-buyer-micro-v1.json` and the synthetic seed SHA-256 above. No customer data, Skool material, or credentials were sent as scenario text.
- Isolated run: pinned MiroFish source `39d849138ef254f6c737ab4c4705e5545dbe31d4c`, project `proj_4e70b3d820b9`, Zep graph `mirofish_65a5169e2cd24f01`, simulation `sim_6339fcf4322c`. Graph build task `dd7ad1cd-c04a-466d-bcf2-ac4cf24ee7ce` completed with seven chunks, 31 nodes, and 48 edges. The graph initially copied another buyer's attributes onto `P04949`; one disposable research node was corrected from the source frame. `scripts/audit-mirofish-buyer-graph.py` then found ten Buyer nodes and zero role/budget/privacy mismatches. The initial extraction must not be represented as automatically accurate.
- Preparation: Twitter only; `entity_types=["Buyer"]`, rule-based profiles, one profile-generation worker, and `openai/gpt-oss-120b` through Groq Free for configuration. Ten unique buyer profiles were generated. They retained the frame's roles, fields, regions, privacy postures, and normalized budget bands, but invented demographic details; age/country/gender claims are not frame-backed. The profile CSV SHA-256 is `6ef07dc0fec27cc15f30dc5afe71ad1a6b855c6fd6e6f9e90ef2075f7d0e704c`.
- Simulation: `scripts/arm-mirofish-buyer-smoke.py --config=<isolated simulation_config.json> --apply` bounded the run to ten clock rounds with only two selected buyers active at 09:00, graph-memory updates off. Its config SHA-256 is `338a696fa96a1ed6a7e3f60046aab97e7603010c3a0e26f43fd0564aa7b5cbac`. The simulation log reached round 10 and said the loop completed. The local SQLite file (`3fcb661fac27b8d1d1e5213b98bfa992d0eb71d12a23f6991e527ad14e517edc`) contains four scheduled initial posts and two AI-generated posts, one each from `P04949` and `P00603`. This is **two active buyers in one active round**, not ten tested buyers.
- Quality and observability defects: the parent `/run-status` remained `running` and the actions endpoint returned zero despite the SQLite posts, so the observer stopped the retained process after its timeout. Initial posts were in Chinese despite the English scenario, and the `P03040` initial post was attached to `P09494`'s account. `P04949`'s dynamic post drifted into patient outcomes although the frame's healthcare use case is administrative; `P00603`'s post stayed closer to its privacy-first handoff concern. These are simulation fidelity problems, not evidence of buyer demand.
- Isolated compatibility fixes needed to run: Twitter-only readiness now requires only Twitter profiles; Groq tool calls remove an empty `required` field from parameterless tool schemas. The isolated checkout's focused backend regression tests passed 10/10. These fixes are **not yet part of the pinned upstream commit or AgentOS runtime** and need a reproducible patch before a second run.
- Cost boundary: the user confirmed Groq and Zep Free plans and approved **$0 paid spend**. Provider dashboards and actual billed amounts were not independently verified. No scale-up, production data use, push, or deployment followed this smoke test.

**Read-only artifact audit, 2026-10-03:** `scripts/audit-mirofish-buyer-run.py` compares the cohort, generated profiles, simulation configuration, initial-post attribution, SQLite posts, action logs, and run-state counters without calling providers or printing post text. The pinned pilot artifacts pass ten-persona coverage and agent/profile mapping, but fail three evidence checks: `P03040`'s initial post is assigned to `P09494`, the database has six posts while the action log and reported action count are zero, and the log says the loop completed while the reported round is zero and the final runner state is `stopped`. Only `P00603` and `P04949` made one dynamic post each. The auditor therefore returns nonzero with `pilotEvidencePassed: false` and `marketValidation: false`. Its fixture tests pass via `npm run verify:mirofish-buyer-artifacts`. Do not scale or cite this run as a buyer result until attribution and telemetry are fixed and a fresh bounded run passes the audit.

The smoke scheduler now rejects an initial post unless its single persona ID matches the publishing agent. A dry run against the retained pilot configuration stops with `agent 3 is P09494, text names ['P03040']` before modifying the file or making a provider call. The seven local auditor/preflight fixture tests pass; they do not replace a fresh live simulation or resolve the upstream action-logging gap.

**Isolated runner repair, 2026-10-03:** The AGPL checkout at `/private/tmp/agentos-mirofish-pilot-restored` now has a local, unshipped patch: its Twitter runner mirrors committed SQLite posts into the action JSONL feed, emits a progress event for every round and an end event, and accepts `wait_for_commands: false` so a bounded smoke run exits normally. `scripts/arm-mirofish-buyer-smoke.py` now sets that no-wait option. The feed is **post-only**; it does not certify likes, follows, or every OASIS action. The isolated backend suite passes 137/137 tests, including writer-to-monitor compatibility. This is offline evidence only: the patch has not been exercised in a new live simulation, and the old pilot artifacts remain failed. Do not copy this AGPL patch into the proprietary AgentOS runtime without a separate legal review.

The tested patch is preserved as local commit `208353f` on branch `buyer-pilot-telemetry` in the separate checkout `/Users/aryamandev/Documents/Codex/Projects/MiroFish-Buyer-Pilot`. That checkout has no `.env` key file, its push URL is disabled, and its full backend suite again passes 137/137 tests using the isolated pilot environment. The private key file remains only under `/private/tmp/agentos-mirofish-pilot/.env`; neither keys nor generated simulation data were copied into the persistent research checkout. The branch is not pushed upstream or deployed.

**Offline telemetry follow-up, 2026-10-03:** Local commit `3406776` on the isolated `buyer-pilot-telemetry` branch mirrors committed non-post OASIS `trace` actions into the action feed, excluding setup sign-ups and post traces already represented by committed posts. It records action kind and persona mapping but omits the trace's free-form `info` payload. Initial-event and round boundaries capture these actions before progress events. The separate backend suite passes 138/138 with a fixture for no duplicate posts, incremental non-post capture, and payload omission. This does not repair the old run's attribution error, retroactively fill its empty action log, verify a new live run, or establish market demand. The patch remains local to the AGPL research checkout and is not part of AgentOS runtime.

**Fresh bounded retry, 2026-10-03:** `scripts/prepare-mirofish-repeat-smoke.mjs` checked the original configuration and profile hashes, then prepared a new Twitter-only simulation from the same ten fictional profiles. Only `P00603` and `P04949` were active in one round; their two English initial posts each matched the publishing agent. The isolated runner used Groq `openai/gpt-oss-120b`, ten clock rounds, no graph-memory updates, and the private pilot key file. The final retry `sim_bfa570ba2a8a` used configuration SHA-256 `1f0f089c94b9b54967954c08c8e9551e3c9fd81ffcd96ea50dbde07bae39ed96` and completed with four posts: two initial and one dynamic post from each active buyer. The read-only auditor passed all seven checks (`pilotEvidencePassed: true`, `marketValidation: false`), including final run status, round/action counters, attribution, and actual dynamic buyer activity. A preceding sandboxed attempt `sim_9a18332f2a72` had no dynamic activity because its network calls failed; the auditor now rejects it. The Groq Console displayed the signed-in project's Free plan; key-to-account binding and actual billed spend were not independently verified. No Zep request was made in the retry. The user's limit remains $0 paid spend.

This retry proves the small simulation and its evidence pipeline can complete; it does **not** prove useful buyer insight. The healthcare-budget buyer's generated post drifted into patient outcomes despite the explicitly administrative scenario, and the solo-agency buyer asked for generic recommendations instead of assessing AgentOS. Both posts need prompt/role-fidelity improvements and comparison with real buyer interviews before product decisions. The local runner is unshipped research code, not production AgentOS functionality; no push or deployment followed the retry.

**Profile-fidelity correction, 2026-10-03:** The current `scripts/audit-mirofish-buyer-run.py` requires each generated profile to retain the exact first workflow from the ten-buyer cohort. Re-auditing `sim_bfa570ba2a8a` found seven missing workflow phrases, including both active buyers (`P00603` and `P04949`). All seven earlier technical telemetry/attribution checks still pass, but the new eighth check fails, so `pilotEvidencePassed` is now false. The prior technical pass must not be used as buyer-scenario acceptance.

`scripts/prepare-mirofish-reviewed-profiles.py` now derives canonical, fictional profiles from the fixed cohort and deterministic buyer frame, preserving MiroFish agent IDs and usernames while removing generated biographies. It writes a private CSV and SHA-256 manifest. A dry `scripts/prepare-mirofish-repeat-smoke.mjs` run accepted only that reviewed manifest and prepared `sim_10a4701927e5` with ten distinct profiles, both selected active buyers, and zero missing first workflows. The reviewed CSV hash is `16d5aaf680fe45be99bfe7d4196688b43b4f6514c3f21f2ab8f88daaf30baa78`; the prepared config hash is `a37cdf59aa029f567b2c2464734172ff4db904209eb996239acfb7fa72c2ea9d`. **No simulation or provider request used those revised profiles yet.** A future run must report them as manually source-grounded profiles, not as untouched MiroFish-generated biographies, and still needs human review of dynamic posts and product decisions.

MiroFish uses OpenAI-compatible Chat Completions, so an OpenAI Platform key is **not required**. For a free-tier-only first smoke test, [Gemini's compatibility endpoint](https://ai.google.dev/gemini-api/docs/openai) supports `LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/`, `LLM_MODEL_NAME=gemini-2.5-flash`, and a Google AI Studio key in `LLM_API_KEY`. [Gemini lists free input/output tokens for that model](https://ai.google.dev/gemini-api/docs/pricing), but its free-tier prompts and outputs may be used to improve Google's products; use only synthetic, non-confidential material. Confirm the project is actually on the free tier with billing unlinked and check [its live per-project request/token limits](https://ai.google.dev/gemini-api/docs/rate-limits) before a run. MiroFish's JSON-mode and multi-agent behavior still need a one-request compatibility smoke test; documentation compatibility alone is not proof.

[OpenRouter's free plan](https://openrouter.ai/pricing/) currently lists 50 requests/day, so it may suffice for a tiny compatibility check but is too restrictive to assume a 50-person simulation will finish. [NVIDIA NIM exposes an OpenAI-compatible chat endpoint](https://docs.api.nvidia.com/nim/reference/llm-apis), but available free credits and quota must be verified in the specific account before choosing it. None of these LLM arrangements pays for Zep or removes the separate data-use review.

As checked on 2026-09-29, [OpenAI's API spend-limit guide](https://developers.openai.com/api/docs/guides/spend-limits) distinguishes alerts from enforced hard limits; hard enforcement may lag slightly. [Zep's pricing page](https://www.getzep.com/pricing/) lists a Free plan with no auto-top-up, while paid Flex plans auto-top up. Use a separate capped model project and Zep Free for the first pilot, or obtain an equivalent verified provider-side stop control before running. Record the approved combined pilot maximum and current account usage before any request. A monthly limit shared with other workloads is not a clean per-pilot budget.

## Persona design

`scripts/generate-buyer-persona-frame.mjs` produces 10,000 unique cells: 10 fields × 5 decision postures × 4 organization sizes × 5 AI-literacy levels × 5 monthly budget bands × 2 privacy postures. Region is assigned deterministically across six broad regions. The 50-person pilot selects one cell per field × literacy level using a stable seed. This frame is a **coverage target and audit reference**, not a claim that MiroFish accepted or ran those exact profiles. The upstream app generates agents from its graph; compare actual `/profiles` output to the frame before reporting coverage.

For a first micro-run, `evaluations/mirofish-buyer-micro-v1.json` selects ten of those 50 cells: one per field, two per literacy level, all five decision postures, and three strict-privacy buyers. `node scripts/prepare-mirofish-buyer-seed.mjs --out=tmp/mirofish-buyer-seed-10.md` combines them with the candid product seed and specific first workflows. The generated file is synthetic input, not evidence that MiroFish created ten agents. The earlier pre-pricing seed's SHA-256 was `83daeb6dea9d58733ecb9fe2aa6056eb07f5c9c880cecca3972a310d9ff3c66c`; the preparer and coverage tests are in this checkout. A future run should inspect actual profiles and reject collapsed or missing roles before proceeding.

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

## Product briefing correction, 2026-10-04

The Twitter runner does not pass `narrative_direction` to its agent graph.
OASIS constructs the system prompt from the CSV `user_char` instead. Correct
roles and workflows alone therefore did not ensure the buyers saw the product
evidence. The v2 profile preparer now embeds the candid product brief, explicitly
states that buyers have not used the product, and binds the brief's SHA-256 into
the preparation manifest. Repeat preparation rejects outdated briefs and v1
manifests and retains the reviewed manifest beside the simulation inputs.

Prepared, but **not executed**: `sim_3b7bfff26e22`, ten profiles with only two
active buyers in one active round. Config SHA-256:
`01c9981f9025289a76d7caee45e71e68ab425dff4045c30f0078113d21dba267`;
profile SHA-256:
`e47a927cb0b8e83cc16993388a8ab223ac35099ef8c31bb0e41ea916b113db0d`;
brief SHA-256:
`a4caa95feac33b64967f4f9c3e1ae669f16a168fab35adc8bbc98c45b7331507`.
An offline check with the installed OASIS `UserInfo.to_system_message()` confirmed
all ten prompts contain the brief and the no-firsthand-use qualification.
Twelve Python tests and seven focused TypeScript tests passed. These checks made
zero provider calls and do not establish buyer fidelity or demand.

The previously used `/private/tmp/agentos-mirofish-pilot/.env` is missing; its
location was requested from the user without requesting key values. The live
repeat remains pending that private configuration. Historical seed hashes above
refer to earlier preparations, not the revised brief.

## Current repeat preflight, 2026-10-05

The persistent research checkout remains clean on `buyer-pilot-telemetry`.
Its private `.env` now contains the LLM key, endpoint, and model settings, but
no `ZEP_API_KEY`; the old temporary `.env` is still absent. Only configured
variable names were inspected, never printed values. No provider call was made.

Prepared simulation `sim_3b7bfff26e22` still matches the configuration and CSV
hashes above. Its v2 profile manifest matches both the CSV and the current
product brief. It has no run-state file or simulation database, so it remains
prepared, not executed. The runner's application configuration requires the
Zep key; do not insert a placeholder or bypass validation to claim a run.

Re-auditing retained run `sim_bfa570ba2a8a` with the current auditor confirms
two dynamic posts, correct attribution, and completed telemetry, but rejects
the run's profile-workflow coverage: seven of ten profiles lack their assigned
first workflow. `pilotEvidencePassed` and `marketValidation` are both false.
This is consistent with the later profile repair, not a new successful buyer
evaluation. The next meaningful step is restoring private Zep configuration
and executing the already-reviewed bounded repeat within the approved $0
paid-spend limit, then reviewing the actual outputs and current audit result.

## Offline repeat preflight, 2026-10-06

The private pilot `.env` now has a nonempty `ZEP_API_KEY` entry; its value was
not read into a report. An earlier Zep key was pasted into chat, so the live
repeat remains gated on confirmation that the key in the file was newly
created after revoking the exposed one. The user has approved $0 paid spend.

The pinned Python 3.12 environment installed from `backend/uv.lock` into the
ignored `backend/.venv`. The simulation runner imports, and 15 focused pilot,
Zep-barrier, and preparation-failure tests pass. The buyer smoke script now
checks hashes, bounds, and replay state without loading credentials or the
simulation stack unless `--apply` is explicitly supplied. Running it without
`--apply` against `sim_3b7bfff26e22` passed: ten agents, two active buyers,
ten configured rounds, the reviewed Groq endpoint/model, graph updates off,
and `applied: false`. The script reports `applied: true` only after a completed
run. No Groq or Zep request was sent, and no buyer result is claimed.

## Offline evidence gate, 2026-10-07

The buyer-run auditor now requires each `CREATE_POST` telemetry entry to match
one committed SQLite post by post ID, agent ID, and content; unrelated actions
cannot substitute for missing posts. Its action count must equal the final
runner counter. Completion requires the matching simulation ID,
`runner_status: completed`, a positive configured round count, Twitter
completion, and exactly one structured `simulation_end` event with matching
rounds and action count, even when the text log has no completion phrase.
Sixteen offline audit/arming/profile tests pass. The
retained `sim_bfa570ba2a8a` still fails profile-workflow coverage (seven of
ten missing) despite matching post and completion telemetry. No new simulation
or provider request was made; the prepared `sim_3b7bfff26e22` remains unrun.

## Buyer-content review gate, 2026-10-07

Telemetry and profile coverage alone do not establish useful buyer-scenario
output. After a technically complete run, use
`python3 scripts/audit-mirofish-buyer-run.py --simulation-dir <private-run-dir> --cohort evaluations/mirofish-buyer-micro-v1.json --prepare-review`
to create an exclusive mode-0600 `buyer_review.json` beside the run. The template
contains each dynamic post's actual text, post/agent IDs, and SHA-256; every
verdict defaults to false. A reviewer must inspect each post and fill their
name, a timezone-aware `reviewedAt`, and four explicit booleans:
`scenarioRelevant`, `roleFaithful`, `scopeSafe`, and `actionable`. Keep the file
private and out of Git. The read-only auditor requires exact post text and hash
matches, one positive review per dynamic post, and private file permissions
before `pilotEvidencePassed` can be true. It reports only counts and check
results, not generated post text. Even a passing reviewed synthetic run remains
`marketValidation: false` until compared with real buyers.

## Latest bounded run and release binding, 2026-10-09

The isolated run `sim_fe9b23d28531` completed ten configured rounds with ten profiles, two scheduled active buyers, two seeded posts, and two dynamic posts. The read-only AgentOS auditor passed all ten checks after an AI-assisted content review; it reports `pilotEvidencePassed: true` and `marketValidation: false`. It does not show that ten buyers acted, that real prospects evaluated the product, or that 10,000 personas were simulated. The user's $0 paid-spend limit remains in force; no scale-up is authorized by this receipt.

The release evidence capturer now requires the run's `profile-preparation.json`, verifies its reviewed-profile hash against the actual simulation CSV, and binds its cohort and product-brief hashes to the current AgentOS files. A changed brief or manifest fails capture, and the local receipt schema is now version 2. The October 9 run passed capture with its then-current brief; after the pricing correction below, it fails current capture. This prevents a stale scenario from being represented as a current product test, but it does not prove hosted customer behavior, actual provider charges, or market demand. The 50-person and 10,000-person frames remain unexecuted coverage targets.

## Price-aware scenario correction, 2026-10-10

The old brief said public pricing was unknown, while the commercial model and public Credits page both state a $2,500 one-time setup fee plus $1,250/month, with provider usage separate. That omission matters: a buyer with a budget below the published offer could appear interested in an imagined lower-priced plan. The October 9 posts remain synthetic objections worth examining, but cannot support a current price-sensitive buying decision. One healthcare-administration persona asked for privacy, cost controls, and tenant-isolation evidence; one security reviewer asked for a live isolation and governance demonstration while expecting under $50/month. The latter is not an eligible buyer for the published base offer absent an explicitly approved different quote. Neither post is a real customer interview or evidence of willingness to pay.

The brief now states both prices and directs budget-incompatible personas to reject or defer. An offline preparer produced a private, ten-profile CSV and manifest at `/Users/aryamandev/Documents/Codex/Projects/MiroFish-Buyer-Pilot/backend/uploads/buyer-price-aware-profiles-v3.csv` with all ten profiles price-aware. The brief SHA-256 is `a85cb70b0cbfe264fd8b6bc7d3cbfc648bac7b9b047ae19bc7a5896607deb42f`; the reviewed CSV SHA-256 is `c79c2ca401d3de43b05f918ea111e8fc4564a91cd487e7b46b7792e56baae63e`. The file is private and ignored by Git. Preparation itself made no MiroFish, LLM, or Zep call; the later bounded run is recorded below. The simulation must pass the technical, content, and current release-binding gates before its output can be considered scenario evidence, and it would still not be market validation.

## Price-aware bounded run, 2026-10-10

The isolated repeat `sim_49b3a7426c50` used the price-aware CSV above. Its configuration SHA-256 is `8564a473049ed73d8e97d6fe7a2d6252874c2384eb1e605f11169fcaff9dae50`; the private preparation manifest SHA-256 is `7eed5da0e1499de01dc79abc462769b7b01e307f527527114773cf58efefa97c`. Ten profiles were configured, only `P00603` and `P04949` acted, and the runner completed ten rounds with eight recorded actions and two generated quote-posts. Graph-memory updates were disabled. The user-approved paid-spend limit remained $0; actual provider charges were not independently checked, and no customer or Skool material was sent as scenario text.

The first read-only audit exposed an OASIS representation mistake: for a quote-post, `post.content` contains the quoted original, while the new buyer response is in `post.quote_content`. After correcting the auditor to review and hash the generated quote text while retaining the original-content telemetry check, all 11 technical checks pass. The private mode-0600 review file has SHA-256 `15b04eda3484976099ef4f3e73e9c53546cd0f638a71348945bec952088d7bb9`. The solo-agency security reviewer correctly rejected the $2,500 setup and $1,250/month offer against an under-$50 budget, and asked for client-file isolation evidence. The healthcare budget holder asked for an administrative intake demo, audit logs, isolation, and total-cost clarity, but asserted a `$2k+` monthly budget not supported by its source band of `over $1000`. The review approves only the agency reply: `buyerContentReview: false`, `pilotEvidencePassed: false`, `marketValidation: false`. These are synthetic hypotheses, not buyer interviews or measured conversion.

Profile preparation now explicitly forbids inventing a precise budget or affordability from a broad band. This change has not been used in a provider run. Do not cite the October 10 run as a passed buyer pilot; a fresh reviewed profile file and a new bounded run would be required, followed by real-prospect comparison. The 50-person and 10,000-person frames remain unrun.

## Revised repeat prepared, 2026-10-10

The canonical preparer produced a private, mode-0600 ten-profile CSV from the
runner-pinned source file, with reviewed SHA-256
`83a0d906dbcf522e00dcb5082cdd6c97340f829dafd63b332c14adf4de7b2911`.
All ten profiles contain their exact source budget band and the instruction not
to invent a precise amount. The isolated candidate `sim_4d52cec6d408` is
prepared with config SHA-256
`c5fbce5a16820723f3a48a7db980f871318f34c77c05489acb1506b5e2fb90ac`:
ten configured profiles, only `P00603` and `P04949` active in one round, ten
clock rounds total, and no wait-for-command loop. The arming preflight returned `applied: false`;
three repeat-smoke tests and three profile-preparer tests passed. Preparation
made zero Groq or Zep calls. The isolated runner is pinned to those hashes;
its six offline tests and dry-run preflight passed with `applied: false` and
graph-memory updates disabled. The candidate is not a buyer result: live
execution and private content review await actual dashboard verification of
both Free plans and no paid overage under the owner's $0 ceiling. A prior
"confirmed" answer was later clarified as an assumption, so it is not treated
as cost-control evidence.

## Revised repeat result, 2026-10-10

After the user checked the dashboards and reported both Groq and Zep on Free
plans, the owner-approved $0-spend bounded repeat ran as `sim_4d52cec6d408`.
The isolated runner completed ten configured rounds with ten profiles but only
two active buyers, eight actions, two seeded posts, and two generated
quote-posts. Graph-memory updates were disabled; no customer or Skool material
was used as scenario text. The audit passed all 12 technical/content checks,
with correct persona attribution and two reviewed dynamic replies. The private
mode-0600 review file has SHA-256
`c45b52d72107a412e685f88b1de698059ad72332946f4fbd06c9d1ca0d294945`.
The release capturer accepted eight hashed artifacts against AgentOS source
`d13a53570c53bdd4e1532f603ffe2e2b61b457b2` and the current cohort and
product brief. Its receipt reports `pilotEvidencePassed: true` and
`marketValidation: false`.

The agency security reviewer remains below the published offer and asks for
client-file isolation proof before reconsidering at another budget. The
healthcare-administration budget holder asks for an auditable intake handoff,
cost transparency, and access controls while citing the published $2,500 setup
and $1,250 monthly fees; it does not invent a precise personal budget. These
are useful acceptance-test prompts, not real objections from buyers or evidence
of willingness to pay. Prioritize a same-revision isolation/access-control
demonstration and an explicit total-cost view in the hosted customer journey;
compare with actual prospects before changing pricing or scaling personas.
The user's Free-plan check is not a post-run provider billing receipt, and the
keys' account linkage was not independently verified. No paid-spend or broad
market claim is made.

## Pinned bounded repeat review, 2026-10-11

The latest MiroFish workspace candidate `sim_b0958acead3f` was checked without
provider calls. Its config, profile, and preparation hashes match the reviewed
runner pins. Run-state and event telemetry report ten configured rounds,
10 generated profiles, two active synthetic buyers, eight Twitter action rows,
two dynamic quote-posts, and one completion event. The simulation had already
completed before this review; no new Groq or Zep request was made here.

The two dynamic posts were reviewed locally by an explicitly identified
AI-assisted reviewer against the exact profile roles and first workflows. Both
were scenario-relevant, role-faithful, scope-safe, and actionable: one demands
proof of an isolated client handoff and provider boundary before considering
price; the other asks for an auditable administrative-intake demo, isolation,
and transparent pricing. The private mode-0600 review file remains under the
ignored MiroFish simulation directory. The current AgentOS evidence capturer
accepted the run against source `0729e69c411afdc7e3943584fadbbefac7af4760`:
`pilotEvidencePassed: true`, 10 profiles, 10 rounds, and two reviewed posts.

This is a technically and content-reviewed synthetic scenario, not market
validation: only two synthetic buyers acted, no real prospects were interviewed,
and actual Groq/Zep usage or billing was not independently reconciled. The
user-reported $0 limit and Free plans remain the authorization boundary; no
additional simulation or paid call is authorized by this audit.

## Saved-run audit recheck, 2026-10-10

The AgentOS read-only auditor was rerun against the saved MiroFish directory
`/Users/aryamandev/Documents/Codex/Projects/MiroFish-Buyer-Pilot/backend/uploads/simulations/sim_4d52cec6d408`
using the current `evaluations/mirofish-buyer-micro-v1.json` cohort. It returned
all 12 checks true: run identity, 10-profile/workflow coverage, persona and
post attribution, novelty, action/completion telemetry, two active-buyer
replies, and exact private content-review coverage. The saved state reports
`completed`, round 10 of 10, eight actions, and one completion event. The
auditor still returns `marketValidation: false`; its receipt is synthetic
scenario evidence only. The MiroFish workspace also has `buyer_review.json`
and is ignored `.env` (not tracked by Git), but the saved provider-status
marker says `stopped` and contains no billing reconciliation. This recheck
made no provider request and does not establish actual provider charges or
independent account-level $0 spend.
