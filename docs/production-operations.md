# Production operations gates

The public launch requires an operational owner, not only passing application
tests. Configure these controls per tenant and provider before opening public
traffic:

- hard monthly and per-request spend caps, with a lower default for new tenants;
- alerts for wallet depletion, reservation expiry, webhook failures,
  reconciliation drift, provider outage/rate limiting, queue backlog, and retry
  storms;
- dashboards for request latency, provider status, reservation age, settlement
  variance, refunds, failed provisioning, and tenant lifecycle state;
- SLOs and escalation ownership for the public portal, billing webhook,
  provisioner, tenant runtime, and managed provider worker;
- tested export, restore, rollback, suspension, deletion, and offboarding
  evidence with a named rollback revision and backup verification timestamp;
- a bounded-load, failure-injection, and recovery run before public traffic.

The release evidence artifact records the current commit, deployment revision,
image digest, migration result, configuration-shape hash, test results, and
rollback target. It intentionally records configuration presence rather than
secret values. It also records the public-journey, live-Stripe, provider
catalog, BYOK lifecycle, two-tenant isolation, managed-OpenRouter, operations,
and legal acceptance results. A release is not ready when any of those fields
is missing or not owner-approved.
