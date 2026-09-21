# MiroFish-inspired GTM scenario test — Veloce AgenticOS

**Method version:** `mirofish-inspired-gtm-v1`  
**Status:** hypothesis exercise; no customers were contacted and no market outcome is claimed.

This is a clean-room use of the public MiroFish workflow shape—seed material,
personas, scenarios, and report—not a copy of its AGPL-licensed software or a
claim that an agent simulation predicts market behaviour.

## Seed and constraints

- Product: a governed, client-safe operating workspace for context-heavy work.
- Existing proof: a working client login, a human approval gate, provider and
  model allowlists, budget controls, and a production product surface.
- Constraint: do not position the product as a mature, general-purpose SaaS or
  promise automation without human approval.

## Segment hypotheses

| Segment | Job to be done | Adoption trigger | Primary friction |
| --- | --- | --- | --- |
| Technical agency owner | Turn repeated client delivery into a governed system | One recurring, expensive handoff | Fear of brittle automations and client-data exposure |
| Founder/operator | Preserve context from strategy through shipping | A project loses decisions across tools | Setup effort and unclear first use case |
| Operations lead | Make AI-assisted work auditable before scaling it | Need for permissions, approval, and cost visibility | Procurement and proof-of-value burden |

## Scenarios

| Scenario | Hypothesis | Observable signal | Decision rule |
| --- | --- | --- | --- |
| Base | Technical agencies respond to a concrete delivery-system audit | At least 3 qualified conversations from 20 highly relevant, consent-based invitations | Continue the wedge if 2 conversations identify the same costly handoff |
| Upside | A live, scoped workflow demo converts better than architecture claims | At least 2 prospects request a tailored workflow review | Package the demo as the primary offer and document objections |
| Downside | Prospects see the product as an undifferentiated AI dashboard | Fewer than 2 qualified conversations or repeated "what does it replace?" feedback | Rework positioning around one named workflow before adding features |

## Test conclusion

The first GTM wedge should be **technical agencies with a recurring
context-to-delivery handoff**, not a broad "AI operating system" promise. The
first experiment is a small workflow audit offer: map one client workflow,
identify where decisions or approvals are lost, and show a governed replacement
in the live product. Measure qualified conversations, repeated pain language,
and requests for a tailored review—not clicks alone.

## Pipeline integration

When a captured item contains GTM/launch/positioning signals, Pipeline shaping
now asks for this scenario method. The proposed plan must include audience,
hypothesis, channel, success metric, and a kill/iterate/scale rule; the item
still stops at the existing human approval gate before any execution.

## Provider decision

- **Adopted:** a direct Groq OpenAI-compatible text lane is available in the
  adapter as disabled-by-default BYOK. A tenant must explicitly supply
  `GROQ_API_KEY`, allowlist `groq` and its model, enable provider calls, and
  provide a model-pricing entry. Groq free-plan rate limits are useful for a
  controlled test, but they are not an SLA or a substitute for a budget cap.
- **Not adopted as production dependencies:** `freellmapi` markets itself for
  personal experimentation, while `awesome-freellm-apis` is a discovery
  directory. Neither is a stable, tenant-governed production router.
- **Pilot/reference only:** MiroFish and Recordly are AGPL-3.0; OpenScreen and
  the Higgsfield-style studios are separate desktop/self-hosted products. They
  should be evaluated as isolated tools, not embedded into the hosted client
  runtime without a licensing, security, GPU, and data-handling review.
