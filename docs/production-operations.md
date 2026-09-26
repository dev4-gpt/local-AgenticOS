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

## Controlled-beta ownership

Aryaman is the accountable owner for the controlled internal beta's incident
response, billing/reconciliation, access revocation, and customer-data
deletion. The assignment and its runbook references are maintained in
`docs/organizational-structure.md#interim-controlled-beta-operating-ownership`.
It is a release-evidence requirement, not authorization to open public
traffic, paid operations, or managed-provider execution.

## Stripe destination verification

For the shared billing endpoint, verify the selected account and mode in
Stripe Workbench, then confirm these eight event subscriptions:

    charge.dispute.created
    charge.refunded
    checkout.session.async_payment_succeeded
    checkout.session.completed
    checkout.session.expired
    customer.subscription.deleted
    invoice.payment_failed
    payment_intent.payment_failed

An unpaid checkout completion does not fulfill a purchase. Its later paid
event must reach the application, so a handler-only test is insufficient:
verify the destination's saved event list too. Distinguish failed delivery
attempts from distinct failed payments, and inspect each event's `livemode`.
Do not mark a missing-plan refund processed merely to clear retries.

[September 11 live verification](ga-live-stripe-verification-2026-09-11.md)
records the repaired delayed-payment subscription and the still-open
classification gap for a public-launch refund. Existing seven-event
configuration snapshots are historical, not the current requirement.

## Phase 3f — platform RBAC and backup/restore drill (2026-09-07)

**Tenant RBAC: complete, proven live.** `client_memberships.role`
(`owner`/`admin`/`member`/`viewer`) existed in schema but was never
enforced -- `client_member()` and both BYOK mutating functions
(`record_client_provider_connection`, `revoke_client_provider_connection`)
only checked `status = 'active'`, so a `viewer` had identical control over
a tenant's provider credentials as an `owner`. `supabase-v39-tenant-rbac.sql`
now requires `role in ('owner', 'admin')` for both functions; read-only
listing stays open to every active role. Proven live via
`supabase-v39-tenant-rbac-canary.sql` against disposable fixtures (a real
`owner` and a real `viewer`, simulated via `set_config` the same way as the
Phase 3d revoke canary): a viewer was refused submitting and revoking a
credential; an owner succeeded at both. Cleanup confirmed zero residual
rows, including both disposable auth users.

*Not done in this pass, flagged rather than silently skipped*: operator-level
role separation. `CONTROL_PLANE_OPERATOR_SECRET` is currently one flat
secret granting full access to every sensitive control-plane operation
(rollback, disable, reconcile, delete) across all tenants -- there is no
read-only or scoped operator role. Splitting this into tiered
operator credentials touches three production services simultaneously
(Vercel, the `managed-openrouter` gateway, the `gcp-provisioner` worker)
and deserves its own dedicated stage rather than a rushed change here.

**Backup/restore: mechanism already existed in `scripts/client-lifecycle.mjs`
(`--mode export` / `--mode restore`), but had never been live-proven with
real evidence in this engagement** -- only referenced as a documented usage
example. Ran a real drill against disposable tenant `backup-drill-20260907`:
seeded 5 real `client_runtime_audit_events` rows, exported (6.3s wall
clock), independently verified the export file actually captured the
tenant row and all 5 event rows (not just that the command exited 0),
deleted all 5 rows to simulate real data loss (independently confirmed
zero rows remained), restored from the export file (0.6s wall clock), and
independently verified all 5 rows came back with byte-identical content.
Fixture fully cleaned up afterward, zero residue confirmed.

This proves the on-demand export/restore mechanism itself works correctly
and is fast: a restore of this shape completes in well under a second,
comfortably inside a 4-hour RTO target even scaled up by orders of
magnitude. It does **not** by itself prove a 24-hour RPO platform-wide --
that depends on either (a) scheduling this export on a recurring cadence
(a policy/cron decision, not a code gap), or (b) Supabase's own
point-in-time-recovery backup service, whose actual configuration
(enabled/disabled, retention window) for this project could not be
verified from this session -- it requires the Supabase dashboard or
Management API, neither available here. **Action item for the project
owner:** confirm PITR is enabled and its retention window in the Supabase
project settings; if it is not on a plan with PITR, the 24-hour RPO target
is not actually met platform-wide regardless of this drill's result.
