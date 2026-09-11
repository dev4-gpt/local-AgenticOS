# Live Stripe verification, 2026-09-11

The user completed Stripe sign-in. At approximately `2026-09-11T04:10:25Z`,
the live dashboard identified **Veloce AgenticOS**, account
`acct_1U7KNI2UC1bGDyMo`. This is distinct from the locally configured CLI
sandbox account `acct_1U7KIqEQWtozPK4Z`; browser sign-in does not refresh that
CLI's credentials. No secret keys or signing secrets were revealed.

## Confirmed configuration gap and repair

[Production destination](https://dashboard.stripe.com/acct_1U7KNI2UC1bGDyMo/workbench/webhooks/we_1U8QPk2UC1bGDyMoG7ah8GsH)
`we_1U8QPk2UC1bGDyMoG7ah8GsH` was active and targeted
`https://app.veloceos.cloud/api/billing/webhook`, API version
`2026-07-29.dahlia`, snapshot payloads from this account. It subscribed to
seven events but omitted `checkout.session.async_payment_succeeded`.

The deployed handler supports that event and intentionally leaves an unpaid
`checkout.session.completed` awaiting payment. Without the success-event
subscription, delayed payment could succeed at Stripe without the app
receiving the event that completes fulfillment.

Added exactly `checkout.session.async_payment_succeeded` in Edit destination
and saved. The returned Overview showed **8 events**, and expanding the list
confirmed the new event alongside all seven previous events. Endpoint URL,
API version and account scope remained unchanged. The complete observed
before/after sets are in [the evidence record](evidence/ga-live-stripe-verification-2026-09-11.json).
This proves configuration persistence, not a new delayed-payment transaction.

## Historical live drill, independently inspected

The dashboard showed nine delivery attempts for this week: two successes and
seven failures. The failures are retries of one refund notification, not
seven different failed payments.

| Event | Stripe delivery evidence |
| --- | --- |
| `evt_1UCvqA2UC1bGDyMo1LRtT2f7` — checkout completed | Live event, HTTP 200, body `status: processed`; September 7, 02:15:41 EDT. |
| `evt_1UCvs02UC1bGDyMoIftmJS2f` — subscription deleted | Live event, HTTP 200, body `status: processed`; September 7, 02:17:33 EDT. |
| `evt_3UCvq62UC1bGDyMo1nKzGG7L` — charge refunded | Live event, seven HTTP 422 attempts; latest September 9, 21:55:36 EDT, body `credit_plan_metadata_missing`. |

The refund payload identifies charge `ch_3UCvq62UC1bGDyMo1NEZqvSn`,
customer `cus_VDMZCHDl4nnNie`, currency USD, amount 200 cents,
amount captured 200 cents, amount refunded 200 cents, description
`Subscription creation`, and empty charge metadata. Stripe describes the
$2 refund as issued. The customer matches the original public-launch
fixture recorded in `v3.3-current-release-audit.md`. That fixture combined
setup and subscription charges; it was not a managed-credit purchase plan.

This closes the earlier uncertainty about whether this particular event was
live and whether Stripe actually refunded the charge. It does **not** turn
its failed application acknowledgment into a passing webhook lifecycle test.

## Open: non-credit lifecycle event classification

In deployed source `9ba8d46`,
`product-experience/src/app/api/billing/webhook/route.ts` routes every
`charge.refunded` through managed-credit plan resolution. If charge metadata
has no plan ID and the payment-intent lookup finds no plan, it records
`credit_plan_metadata_missing` and responds 422. Thus the observed public
setup/subscription refund is retried as though it were a malformed credit
refund. The original fixture's onboarding records were already deleted.

The mismatch is confirmed; a safe general policy for unsupported non-credit
refunds remains unresolved. Do not fix it by acknowledging every unmatched
refund or by assigning it to a customer-wide wallet: missing metadata or
out-of-order delivery for a real credit purchase must remain reviewable.
The follow-up needs durable payment-to-product correlation, explicit handling
of public-launch versus credit lifecycle events, and tests for missing
metadata, lookup failure, deleted fixtures and delivery ordering before
changing financial behavior. No event was replayed, no failed DB row was
marked processed, and no wallet or onboarding state was changed in this pass.

No new payment, refund, provider call or paid service was used. The deployed
application/runtime source remains `9ba8d46`; this repair changes Stripe
configuration and documentation only. The existing release ledger remains
`releaseReady: false`; the other acceptance journeys and approvals remain open.
