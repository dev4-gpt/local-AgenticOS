# MiroFish Buyer-Pilot Evidence, October 13, 2026

## Run receipt

- Simulation: `sim_f91504972e42` in the isolated MiroFish buyer-pilot checkout.
- State: completed, 10/10 rounds, 10 synthetic profiles configured, 2 active buyers, 8 total actions.
- Provider configuration recorded in the simulation log: Groq OpenAI-compatible endpoint, `openai/gpt-oss-120b`.
- Graph-memory updates were disabled. No customer data was used.
- The user reported that Groq and Zep were on Free plans and approved one run with a $0 paid-spend limit. A provider usage/billing receipt was not captured, so actual cost and free-tier enforcement are unverified.

## Output quality

The read-only audit found two distinct quote responses from the active
synthetic profiles, no additional standalone posts, and eight simulation
actions. The private schema-v2 review identifies Aryaman and is bound to both
saved response posts, their exact content hashes, and their quoted parent
posts. Both responses were reviewed; one was approved on all four quality
flags. The other was relevant and safe, but rejected as role-unfaithful and
not actionable because a sub-$50 budget did not fit the $1,250/month offer.

The audit now reports review completeness separately from full content
approval: `buyerReviewComplete: true`, `reviewedDynamicPosts: 2`,
`approvedDynamicPosts: 1`, and `buyerContentReview: false`. Technical telemetry
passes, but `pilotEvidencePassed` and `marketValidation` remain false. This is
the intended result: a complete review can reject a low-value response without
misreporting that the review itself is missing. The latest AgentOS tests cover
this distinction, 17/17 audit tests pass, and the isolated MiroFish backend
suite passes 154 tests on checkout commit `51fb237`. That checkout's configured
Git remote disables push, so its local commits are not published upstream.

## Interpretation and limits

This run is an engineering smoke test, not evidence of buyer demand, willingness
to pay, product fit, or production readiness. The synthetic response approved
by review is not a real buyer signal. The rejected response is consistent with
its stated sub-$50 monthly budget and the $1,250/month base price displayed in
the checked-in product-experience Credits page; treat it as a synthetic
nonbuyer observation, not evidence of actual price acceptance or rejection by
the market. The live deployment of that page was not verified in this run. The
pilot still lacks a verified provider-cost receipt, and no live-provider
free-tier or $0 spend enforcement was independently verified.

Any new live run requires a fresh, non-replayed simulation configuration and
confirmation that the provider-side $0 cap is actually enforced; this report
does not authorize another run.
