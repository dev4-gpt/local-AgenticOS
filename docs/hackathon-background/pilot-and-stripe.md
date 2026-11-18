# Pilot and Stripe Background

## Owner-supplied prospect context

The owner named an architecture/interiors studio as a prospective pilot and
identified themselves as the person doing the relevant work. The prospect and
contact names are deliberately omitted from this shareable pack. A specific
recurring workflow, measured baseline, studio approval and acceptance criteria
have not yet been established.

The owner selected no application setup or subscription fee for this client
pilot. Its duration is unspecified. This is not a product-wide free plan, an
agreement to absorb unlimited model/cloud costs, proof of customer adoption or
willingness to pay. No outreach, testimonial, client-file access, hosted import
or spending permission is inferred from the prospect being named.

The next buyer step is to obtain one approved recurring-work example, baseline
effort and a measurable output criterion. The studio owner should approve the
scope and data handling before real client material is used. MiroFish's
synthetic personas are research fixtures, not substitutes for that evidence.

## Existing Stripe-related code

The baseline already contains a public-intake Checkout route and signed webhook
handling. Relevant implementation and local tests:

- [Checkout route](../../product-experience/src/app/api/billing/checkout/route.ts)
- [Webhook route](../../product-experience/src/app/api/billing/webhook/route.ts)
- [Operator financial-event review](../../product-experience/src/app/api/internal/billing/webhook-review/route.ts)
- [Intake, Checkout and webhook tests](../../tests/public-intake-checkout.spec.ts)
- [Managed-credit retention tests](../../tests/client-credit-retention.spec.ts)
- [Credit retention migration](../../product-experience/supabase-v49-managed-credit-retention.sql)

The code distinguishes managed-credit and public-launch financial events,
checks signatures and event identity, and guards against replay. Local
retention work keeps outstanding balances until spent/refunded, expires the
purchase/allocation linkage at day 35, and routes later reconciliation to
manual review. This describes code and owner policy, not a legal retention
assessment or confirmation that the migration is installed in a hosted target.

## Hackathon contribution boundary

A possible new contribution is a clearly scoped, synthetic tenant workflow
showing how payment/credit state relates to budget admission and reviewed
delivery. It is a proposal, not an implemented CreateOS integration or a live
Stripe demonstration. Record all new work against the existing baseline, use
only approved test-mode credentials, and do not create real charges or refunds.

Do not claim live-payment acceptance, fully reconciled invoices, validated
market demand or production billing from local tests. A free client pilot and a
synthetic billing demonstration are different scopes.
