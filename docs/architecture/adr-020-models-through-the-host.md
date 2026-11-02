# ADR 020: Adapters reach AI models through the host

**Status:** direction decided by the owner on 2026-11-02 ("Through Veloce"); the design below is a proposal to be confirmed when it is built.
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

## Proposed design (to confirm when built)

1. **The operation.** `model.call` with task id, provider, model, messages and maximum output tokens. Text in, text out; no
   tools and no streaming in the first version.
2. **Who may call.** A short-lived call credential bound to one tenant, one adapter and one running task, signed with the
   existing Ed25519 key (ADR-012), checked on every call, and dead once the task ends.
3. **Checks, in order.** Adapter enabled for this client; provider and model on both the client's allowlist and the adapter's
   manifest; prompt size and secret-like-input checks; per-task call and token limits; budget reservation
   (`client_adapter_budget_reserve`, adapter cap then the client's monthly cap). Refusals return a short code, never provider text.
4. **The call.** Made with the client's key through the existing provider adapter code, with a timeout; the real cost is settled
   (`client_adapter_budget_settle`), and a failed call releases the reservation.
5. **What is kept.** A budget event and a count; no prompt or answer is stored or sent to telemetry vendors.
6. **Order.** The content adapter first: its runner is behind the `AgentRunner` interface (ADR-018), so a host-brokered runner
   replaces the direct free-tier call. Forge moves in Phase 4 on the same operation.

## Open points for the build

- Credential shape and lifetime: one per task or one per call.
- Cost estimate before the call: token-based price table per provider, or a conservative fixed amount per call.
- First providers: those a client already allowlists for text (OpenAI, Anthropic, Gemini, Groq, OpenRouter).
- Host unreachable: the task fails with a clear reason and never falls back to an adapter-held key.
- Rate limits per adapter and per client.

## Consequences

More host work and one more network hop per model call. In return, keys, caps, policy and deletion are enforced in one place, and
adapters hold nothing worth stealing.
