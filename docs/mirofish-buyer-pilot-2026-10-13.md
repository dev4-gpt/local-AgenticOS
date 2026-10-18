# MiroFish Buyer Pilot: 2026-10-13

## Run Record

- Simulation: `sim_f91504972e42`
- Prepared configuration SHA-256: `1614f845385a638189f7cff61672b6c02476a4d9037b1d9e73041f22bfd9c09c`
- Provider/model: Groq Free endpoint, `openai/gpt-oss-120b`
- Scope: 10 synthetic personas, 2 active buyers, 10 rounds, one simulated social platform
- Result: completed round 10; runner recorded 8 Twitter actions
- Local database: 4 posts, 0 likes, 0 comments, 0 follows
- Zep graph-memory updates were disabled. No product or customer data was included.
- The tokenizer cache was fetched from the pinned public asset URL and matched the SHA-256 required by the pilot script.

## Qualitative Output

The two active synthetic personas were an AI-consultancy security reviewer and
a healthcare-administration budget holder. Their generated posts asked for a
concrete isolated client-document or administrative handoff, an auditable
draft, and visible costs/access controls before considering a pilot. Both
openers repeated the `$2,500 setup + $1,250/month` base price, which is shown
on the checked-in product-experience Credits page and matches the commercial
model. This simulation tested reactions to that stated price only; it did not
test price sensitivity or willingness to pay. The low-budget persona's
rejection is a synthetic nonbuyer signal, not customer pricing evidence.

## Interpretation

This is a small model simulation, not interviews or evidence of willingness to
pay. Two synthetic agents produced no likes, comments, or follows; the output
is useful only for generating hypotheses and checking whether the product
brief elicits relevant objections. It does not validate demand, pricing, or
market size. The next real-world validation should be interviews with reachable
consultancy owners and a narrowly scoped client-deliverable pilot.

The user had confirmed both provider accounts were on Free plans and approved
one run under a `$0` paid-spend limit. This report does not include an
independent post-run provider usage or billing receipt, so exact token usage and
provider-side charges remain unverified. The Groq Free tier has published
model rate limits; Groq documents paid-tier spend limits separately.

## Offline Evidence Audit

An offline audit of the stored run artifacts confirms the technical telemetry:
all 10 expected personas and workflows are present, the run completed all 10
rounds, the 8 action-log entries reconcile, and the two active buyers each
generated one novel post quoting the other buyer. Persona attribution and
completion telemetry pass; there are no duplicate dynamic posts or self-quotes.

The pilot acceptance gate still fails because only one response was approved;
the other was reviewed and rejected as role-unfaithful and not actionable for
the stated low budget. Do not treat telemetry or the cross-buyer quotes as
validated buyer interest. The repeated `$2,500 setup + $1,250/month` figure is
the documented public base price, but this single-price synthetic run cannot
test price sensitivity or willingness to pay. No new provider request was
made for this audit.
