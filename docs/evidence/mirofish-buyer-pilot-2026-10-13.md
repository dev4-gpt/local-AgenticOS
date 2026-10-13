# MiroFish Buyer-Pilot Evidence, October 13, 2026

## Run receipt

- Simulation: `sim_f91504972e42` in the isolated MiroFish buyer-pilot checkout.
- State: completed, 10/10 rounds, 10 synthetic profiles configured, 2 active buyers, 8 total actions.
- Provider configuration recorded in the simulation log: Groq OpenAI-compatible endpoint, `openai/gpt-oss-120b`.
- Graph-memory updates were disabled. No customer data was used.
- The user reported that Groq and Zep were on Free plans and approved one run with a $0 paid-spend limit. A provider usage/billing receipt was not captured, so actual cost and free-tier enforcement are unverified.

## Output quality

The read-only buyer-activity evaluator found two distinct quote responses from
the two active synthetic profiles, zero distinct posts beyond the opening
prompts, and eight total simulation actions. The two saved quote annotations
mark `scenarioRelevant`, `roleFaithful`, `scopeSafe`, and `actionable` false.
The review file has empty `reviewer` and `reviewedAt` fields, so these
annotations do not establish a named human review. The original run receipt's
`distinct_response_activity_observed` status was only a text-difference signal.
The evaluator has since been updated to report review annotations separately;
re-evaluation returns `unattributed_annotations`, 0 qualified, 2 rejected, with
artifact binding explicitly marked unverified. The 13 focused pilot tests pass.

## Interpretation and limits

This run is an engineering smoke test, not evidence of buyer demand, willingness
to pay, product fit, or production readiness. Its generated responses were
rejected by the saved quality annotations and should not be used to make product
or pricing decisions. The pilot currently lacks a verified provider-cost
receipt and an attributable human review.

Next MiroFish work should make the evaluation receipt distinguish raw synthetic
activity from scenario/role/safety/actionability review, enforce identity and
quote attribution against stored simulation artifacts, and preserve a reviewed
human disposition. Any new live run requires a fresh, non-replayed simulation
configuration and confirmation that the provider-side $0 cap is actually
enforced; this report does not authorize another run.
