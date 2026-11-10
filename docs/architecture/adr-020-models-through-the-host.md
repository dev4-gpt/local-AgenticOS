# ADR 020: Adapters reach AI models through the host

**Status:** direction decided by the owner on 2026-11-02 ("Through Veloce"); open points settled and option A chosen by the owner the same day. Host side built (`a7865ab`, local) and its database rules proven on staging 2026-11-02 and through the REST layer 2026-11-04; the content adapter's host mode built (ContractorOS `ba40b41`, local); ProofMint (formerly Forge) built on the same operation 2026-11-04 (`61ffae3`, local). Deployment and a real end-to-end call are still to do.
**Builds on:** ADR-005 (host and adapter contract), ADR-012 (adapter token keys), ADR-013 (what vendors may receive), ADR-016 (budget reconcile),
ADR-018 ("Models through the host" under What comes next). **Affects:** the content adapter now, Forge in Phase 4, every later adapter.

## The decision

Adapters hold no model keys. When an adapter needs a model, it asks the host. The host makes the call with the client's own
provider key, reserves the cost in the budget first, settles the real cost afterwards and returns only the answer.

Options weighed: adapters keep their own keys and report spend afterwards (today's content adapter, checked by the ADR-016 spend
check), and a hybrid where only work with no client data may use an adapter's own free key. The owner chose the host route.

## Why

- **One place for keys.** A client's provider keys live only in that client's own secret store (as today). No adapter, and no
  adapter operator, ever holds them.
- **Caps that hold.** Every model call is reserved before it runs, so an adapter cannot spend past its cap and report it later.
  The ADR-016 spend check then compares reserved against actual for every call.
- **One policy.** Allowed providers and models, prompt size limits and the secret-like-input refusal apply once, in the host.
- **Deletion and egress stay true.** Prompts and answers pass through the host, which keeps nothing beyond the task and logs no
  content (ADR-013), so the 28 + 7 day promise covers model traffic too, and the ADR-018 free-tier terms question disappears for
  adapters that move.

## What changes

The rule "an adapter never calls the host" (ADR-005, ADR-012) is reversed for **one operation only**: `model.call`. Adapters still
cannot read memory except through the scoped read, cannot publish without an approval, and cannot reach any other host route.

## The design (built)

Two facts in the existing code shaped it: the budget ledger allows **one reservation per task id**, and **no host code
started adapter tasks**. So the host now starts the task itself (option A), and every model call gets its own ledger key.

1. **The grant (settled: one per task, not one per call).** The adapter cannot mint tokens, so a credential per call would
   need a round trip each time. When the host starts a task (`src/lib/adapterTaskStarter.ts`) it opens a grant in the
   database (`client_adapter_model_grant_open`): the host's key for the task (the `task.run` idempotency key, at most 120
   characters), the `provider:model` list for that adapter from the host's own setting `ADAPTER_MODEL_ALLOWLIST_JSON` (never
   the adapter's manifest), a call limit (default 20) and a token limit (default 60,000, the content adapter's own cap), and an
   expiry of at most 15 minutes. It then sends `task.run` with a single-use host token (ADR-012, unchanged) and a body field
   `modelGrant: { token, url }`. The token is an Ed25519 credential with version `mg1` (`src/lib/adapterModelGrant.ts`): tenant,
   adapter, task key, scope `model.call`, grant id. It is reused for every call of the task, which is why it is checked
   against the grant row on every call. Neither kind of token can stand in for the other. When `task.run` answers, the host
   records the adapter's own task id on the grant (`client_adapter_model_grant_bind`); the sync job closes the grant by that
   id when the task's final state arrives (best effort; the grant expires anyway). If `task.run` fails the grant is left to
   expire, because the adapter may have received it.
2. **The operation.** `POST /api/adapter-host/model-call` with `Authorization: Bearer <grant>` and exactly
   `{ taskKey, provider, model, messages, maxOutputTokens }` (1 to 50 messages, roles system, user or assistant, at most 8,192 (raised from 4,096 for ProofMint, 2026-11-04)
   output tokens). Text in, text out; no tools, no streaming. Off unless `ADAPTER_HOST_ENABLED` and `ADAPTER_MODEL_CALLS_ENABLED`
   are both `true`; a client edition must also list the path in `CLIENT_ALLOWED_API_ROUTES`. There is no member session: the
   grant is the only way in.
3. **Checks, in order** (`src/lib/adapterModelCall.ts`), first refusal wins and returns a short code only: the credential;
   the request shape and that it names the credential's task; the provider is one of the first five (OpenAI, Anthropic, Gemini,
   Groq, OpenRouter) and the client allows it (provider-call switch, provider switch, model allowlists); prompt size per
   provider contract; secret-like input; a price for the model; then the database counts the call
   (`client_adapter_model_call_begin`: grant open, not expired, right adapter and task, adapter still in preview or enabled,
   model on the grant's list, call and token limits, at most 30 calls a minute per adapter and 60 per client by default);
   then the reservation (`client_adapter_budget_reserve`, adapter cap then the client's monthly cap `CLIENT_BUDGET_CAP`).
4. **Cost estimate (settled: the token price table).** The existing `CLIENT_MODEL_PRICING_JSON` and estimator: characters
   counted as tokens and output priced at its maximum, so it over-reserves. A model with no price entry is refused. A free model
   is priced 0 and still bounded by the grant's token limit.
5. **The call.** Made with the client's key through the existing provider code (`callClientTextProvider`, no tools, the usual
   timeout). Settled at the real cost from the provider's usage, never above the reservation, or at the full reservation when no
   usage comes back; a failed call releases the reservation and returns `provider_*` codes only. The ledger key is
   `<task key>/m<n>` with `n` the grant's call number. An answer the provider gave is still returned if settling fails, marked
   `settled: false`. The grant's held tokens are then replaced by the real number.
6. **What is kept.** Budget events, and grant rows with counts only (`client_adapter_model_grants`,
   `client_adapter_model_calls`); no prompt or answer is stored, logged or sent to telemetry vendors (ADR-013). Grant rows are
   purged 35 days after opening by the lifecycle job (`client_adapter_purge_model_grants`; a missing migration is reported as
   `not_installed`).
7. **Host unreachable (settled).** The adapter's task fails with `model_host_unreachable`; it never falls back to a key of its
   own, and in brokered mode it refuses to start with a model key setting (to build in the content adapter).

## Proof so far

- 37 new tests (grant SQL on real Postgres, the credential, the starter, the call and the route) and 3 updated suites;
  `test:focused` 1038 passed; typecheck clean. Mutation check: 86 mutations in the sweep, 83 caught and 3 explained as
  equivalent after seven missing tests were added; the 11 refusals in the call-counting function, which the sweep does not
  mutate, were checked by hand and all caught (tracker P2-4).
- Staging, 2026-11-02: migration `client_adapter_model_grants` applied to `veloce-agentos-staging`. In one rolled-back
  transaction with a fake tenant and user, under the real roles: open, repeat, wrong worker token, a 20-minute lifetime, bind,
  wrong model, counting, a real reserve and settle under `…/m1`, the token limit, the call limit, members and the publishable key
  refused on the tables and the close function, close by the adapter's task id, and a call after closing, all as tested. A check
  afterwards found no row left.
- Staging through the real REST layer, 2026-11-04: the owner ran `scripts/staging-model-call-proof.mjs` (the host's real
  model.call code, a stand-in provider): 19 passed, 0 failed, and a check afterwards found nothing left behind.
- Not yet: a real model call end to end, which needs the content adapter switched and the host deployed with the route on.

## The content adapter (built)

ContractorOS `ba40b41` (local): `CONTENT_OS_MODEL_MODE=host` makes Content OS keyless. `task.run` takes `modelGrant`, each draft
task gets its own runner that calls only the configured `CONTENT_OS_HOST_MODEL_URL` with that grant (never the address in the
request; one naming another address is refused), the grant is never written to disk, and an unreachable host fails the call
with no fallback. Host mode refuses a model key or provider address at start-up. Direct mode stays the default until the host
route is deployed. Tests and a 32-mutation hand sweep are clean (tracker P2-4).

## Veloce ProofMint, formerly Forge (Phase 4, built)

Owner choices on 2026-11-04 ("Yes, use recommendations"): a minimal h1 surface plus a "veloce" provider, off by default; the host's
output cap raised from 4,096 to 8,192 tokens (host `0300844`), because ProofMint asks for 8,192 so reasoning models are not cut off
mid-code; the host pays for the model calls and ProofMint's own wallet charges only sandbox time and the round fee, so nothing is
charged twice; a new branch. ProofMint (`dev4-gpt/veloce-proofmint`, adapter id `veloce-proofmint`) `feat/veloce-host` commit
`61ffae3`, local only:

- h1 operations at `/h1/<op>` (manifest, health, task.run, task.get, task.result, task.cancel, events), off unless
  `FORGE_H1_ENABLED=true`. Host tokens are checked by the same rules as the content adapter; used token ids are kept in Postgres
  until they expire, because ProofMint runs as serverless functions.
- One draft-class task, `proofmint.round`. `task.run` requires `modelGrant { token, url }`, and the address must equal the configured
  `VELOCE_HOST_MODEL_URL`. The round runs after the reply (`after()`, within the 300-second limit). A task still running after
  330 seconds is recorded as failed (`timed_out`), so the host's feed always ends with a final state.
- Every model answer for such a round comes from `model.call` with the grant: the grant is kept in memory only, there is no retry
  and no fallback to ProofMint's own free-tier keys, refusals come back as short codes only, and redirects are refused. The page's
  own rounds still use those keys and are unchanged.
- 29 new tests; all 348 pass; typecheck clean. A hand sweep of 95 mutations: 92 caught, 3 equivalent, files restored.

Gaps in this slice: its deletion guarantee is `none`, which keeps it out of a client edition until it can give receipts; a
running round cannot be cancelled part way (`task.cancel` answers `cancelled: false`); running it needs a host registry row for
`veloce-proofmint`, an allowlist entry in `ADAPTER_MODEL_ALLOWLIST_JSON` and both sides deployed.

## An adapter's own spend (built 2026-11-05; owner: "Yes, plan it", then "Yes, build it")

ProofMint pays for a sandbox and a round fee besides its model calls. The host now sets that aside and settles it, so the
client's budget covers it and the Spend check (ADR-016) can compare it:

- The starter takes `ownSpend { tenantMonthlyCapMicros }`: after opening the grant it reserves `budgetMaxMicros` under the host's
  key for the task (`own-reserve-<key>`, provider `adapter`). A refused budget stops the start (`budget_refused`); a clear refusal
  from the adapter (4xx, or 503 busy) releases it; an unclear failure keeps it for the final state. Without `ownSpend` nothing
  changes.
- ProofMint refuses a budget below one round's cap (`budget_too_low`, $0.25) and reports `spentMicros` on the final state: what
  its wallet was charged; 0 for a refused payment or a round released before any sandbox; the full cap when the cost is unknown.
- The sync job settles the reservation when the final state arrives (`client_adapter_own_spend_settle`, service role): at the
  reported figure but never above the reservation, or the full reservation when no usable figure came. A task with nothing set
  aside is passed quietly; a database without the function yet (404) is treated the same, so the job never stalls on an
  unmigrated database; any other failure stops the run before that task, so the next run settles it.
- The Spend check finds the reservation from the adapter's own task id through the grant. Model calls are left out of the
  comparison (the host settles each at real cost), which replaces the earlier "roll up per-call rows" item.
- Host `src/lib/adapterTaskStarter.ts`, `src/lib/adapterEventsPuller.ts`, `product-experience/supabase-client-adapter-spend-rollup.sql`
  (applied to staging and proven in a rolled-back transaction, nothing left behind); ProofMint `64666d4`. Tests: 7 SQL, 4 starter,
  3 sync job, ProofMint h1 updated; hand sweep of 38 mutations across both repos, 36 caught on the first run and the 2 survivors
  (the adapter filters, each masked by the other) now caught by a new test.

## Starting tasks from the host (built 2026-11-10; owner: "Yes, plan it", then "Yes, build it")

`POST /api/client-runtime/adapter-tasks` with exactly `{ adapterId, task, input, requestId }` (`src/lib/adapterTaskRequest.ts`):

- Owners and admins only (checked on the server), behind the usual member gate and a rate limit of 10 per 15 minutes; off unless
  `ADAPTER_HOST_ENABLED` and `ADAPTER_MODEL_CALLS_ENABLED` are both `true`. The tenant comes from the server's setting.
- Only adapters and tasks listed in the host's setting `ADAPTER_TASKS_JSON`, for example
  `{"veloce-proofmint": {"tasks": ["proofmint.round"], "budgetMaxMicros": 250000, "ownSpend": true}}`, which also fixes each
  task's budget (at most $100) and whether the adapter has costs of its own. The request can name neither. One wrong entry
  refuses the whole setting.
- The adapter's address comes from `ADAPTER_ENDPOINTS` (the sync job's setting), its models from `ADAPTER_MODEL_ALLOWLIST_JSON`,
  the host's own model.call address from `CLIENT_RUNTIME_BASE_URL`, and the own-spend cap from `CLIENT_BUDGET_CAP`.
- The task key is `<adapter id>-<request id>` and the grant id is derived from tenant, adapter and key, so a retry with the same
  request id reopens the same grant, finds the same reservation and replays the task. This closes "a caller that retries a start
  must reuse its grant id" for this route.
- Answers are short codes (`not_permitted`, `task_not_allowed`, `tasks_not_configured`, `host_not_configured`, `adapter_not_ready`,
  `budget_exceeded`, `adapter_refused`, `adapter_unavailable`, ...). Every start and failure is recorded in the audit log with
  ids and the code only; the task's input is never recorded.
- A client edition that turns this on must also list `/api/client-runtime/adapter-tasks` in `CLIENT_ALLOWED_API_ROUTES`. No
  button yet: the Adapters page is the next slice.
- 11 tests; hand sweep of 49 mutations over the library and route, 48 caught on the first run and the survivor (the monthly
  cap read) caught by an added test.

## On the Adapters page (built 2026-11-10; owner: "Yes, plan it", then "Yes, build it")

- A "Start a round" panel (`src/components/AdapterTasksPanel.tsx`) shows the tasks the host's setting offers, with their budget. An entry in `ADAPTER_TASKS_JSON` may list `"input": {"field": "family", "choices": [...]}`; the panel shows those as a list and the start route refuses anything else. Only owners and admins can press Start. A start that got no answer keeps its request id, so Try again is the same round.
- The panel follows the round every 5 seconds until it finishes (six minutes at most) and lists the last 10 starts from the audit log, each with Check. `GET /api/client-runtime/adapter-tasks` (any member) returns the options, whether this person may start one and the recent starts; with `?adapterId=&taskId=` it reads that task from the adapter (`src/lib/adapterTaskStatus.ts`): a fresh single-use host token per operation (`task.get`, then `task.result` once succeeded), https only, no redirects, a size cap, and only a whitelisted summary back (state, a short error code, what it cost, verdict, whether it needs approval, the proposal's fingerprint and test counts). The proposal's code is never sent to the page; it is reviewed and approved in the adapter.
- The web server already held the host's signing key for the model-call route, so reading task results from a page needs no new key decision (ADR-017 left that open for drafts).
- 8 new tests (6 status, 2 choices) and the route's GET wiring; hand sweep of 46 mutations, 45 caught and 1 explained (the read route's own task-id check duplicates the reader's). The panel itself has no automated test; it was checked with typecheck and lint only, and needs a look in a browser on a deployed host.

## Still open

- Deploying both sides on staging and one real model call end to end (content adapter and ProofMint).
- `founder.board` has no model in host mode yet.
- A browser check of the Start a round panel on a deployed host with the settings on.
- The own-spend settle has no report of its own in the Spend check when an adapter sends no figure: it is settled in full and
  counted in the sync job's report (`ownSpendSettledFull`), not listed as a reconcile row.
- A replayed start with a new grant id is refused (`task_has_grant`); the host's task route derives the grant id from the task key, so its retries are safe.

## Consequences

More host work and one more network hop per model call. In return, keys, caps, policy and deletion are enforced in one place, and
adapters hold nothing worth stealing.
