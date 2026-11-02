# ADR 020: Adapters reach AI models through the host

**Status:** direction decided by the owner on 2026-11-02 ("Through Veloce"); open points settled and option A chosen by the owner the same day. Host side built (`a7865ab`, local) and its database rules proven on staging 2026-11-02. The content adapter switch and Forge are still to do.
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
   `{ taskKey, provider, model, messages, maxOutputTokens }` (1 to 50 messages, roles system, user or assistant, at most 4,096
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
- Not yet: the same through the real REST layer (`scripts/staging-model-call-proof.mjs`, for the owner's terminal), and a real
  model call end to end, which needs the content adapter switched and the host deployed with the route on.

## Still open

- The content adapter's host-brokered `AgentRunner` and `modelGrant` in its `task.run`.
- The Spend check (ADR-016) matches exact task ids, so per-call rows do not roll up under their task yet.
- A replayed start with a new grant id is refused (`task_has_grant`); a caller that retries a start must reuse its grant id.
- Forge (Phase 4) on the same operation, once where Forge is hosted is known.

## Consequences

More host work and one more network hop per model call. In return, keys, caps, policy and deletion are enforced in one place, and
adapters hold nothing worth stealing.
