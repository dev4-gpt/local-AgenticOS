# Independent GA review — 2026-09-07

**Baseline:** `07f17b9` (`origin/main`, PRs #2–#11 merged).
**Review branch:** `review/ga-independent-hardening`.
**Follow-up, 2026-09-08:** PR #12 merged as `ce71e19` after all required checks
passed. v40–v42 are now applied to production, with 38 live checks and complete
fixture cleanup; see [the rollout evidence](v40-v42-live-rollout-2026-09-08.md).
**Follow-up, 2026-09-09:** application and both deployed tenant runtimes now
run the merged fixes. See [deployment and remaining acceptance evidence](ga-production-deployment-2026-09-09.md).
The new retained release record deliberately reports `releaseReady: false`;
deployment smoke tests do not replace the outstanding acceptance journeys.
The original review's source-only statements below describe that earlier pass.
**Disposition:** the historical strict attestation for `3e3c518` is not a
current, whole-product GA approval. Confirmed engineering defects existed
at the handoff baseline. Fixes below are source changes, not live deployment
or migration evidence. Professional/legal work remains in `needs-human/`.

The release audit and `needs-human/README.md` were read first. This pass
traced the engagement diff (78 files since audit baseline `8d32fac`) into
credential routes/adapters, SQL functions, payment processing, lifecycle
scripts, governance and release/deployment workflows. This is a bounded
independent engineering review; it does not certify every product surface,
every third-party integration, or a live cloud configuration.

## Confirmed defects and source repairs

| ID | Severity | Baseline evidence / failure | Repair and executable evidence |
| --- | --- | --- | --- |
| GA-01 | P1 | `credential-submissions/route.ts` writes Secret Manager before `record_client_provider_connection` rejects a viewer/member. | Resolve owner/admin membership before rate-limit/GCP operations in submission and revoke. `ga-security-regressions.spec.ts` executes both real handlers with boundary doubles and asserts zero side-effect calls for denial. |
| GA-02 | P1 | `providerKeys.ts` returns process environment keys; text/media/research/speech execution never consulted the revoked connection row. Deleting the secret likewise cannot erase keys already in a running process. | Uncached `clientExecutionCredential` checks a tenant-scoped DB admission RPC before those adapters obtain a key. v40 requires active tenant, authenticated membership or its hashed worker token, BYOK `connected` status and no revocation. Missing rows/RPC/errors deny execution. SQL tests cover cross-tenant tokens, revocation, deletion and suspension; text/speech tests prove no upstream call with a loaded but denied key. |
| GA-03 | P1 | v37 nets this month's refunds against this month's settlements even when the refunded settlement occurred last month. The real v37 function returns **-2,000,000 micros**, then accepts **2,000,000** against a **1,000,000** cap in the local PostgreSQL reproduction. | v41 computes current-month spend from canonical currently settled reservations. The same reproduction returns **0**, refuses **2,000,000**, accepts exactly **1,000,000**, and refuses one additional micro while it is reserved. Same-month refunds and tenant isolation also tested. |
| GA-04 | P1 | `onboarding/provision-result/route.ts` ignored financial-cap write failures and ignored a configured zero cap, then returned `activationReady: true`. | A configured nonnegative safe cap, including zero, must persist before the onboarding account advances. Actual-handler test simulates failed upsert and asserts 502 and no activation-state write. |
| GA-05 | P1 | Legacy Stripe handling inserted `status: processed` before wallet/onboarding/cancellation writes and ignored their failures; retries then skipped the missing effects. Checkout completion also did not verify payment status. | Required effects must succeed before processed is stored; failed effects return 502. Unpaid sessions remain awaiting payment; paid `checkout.session.async_payment_succeeded` is supported. Regression tests exercise failure→retry→success→duplicate, unpaid completion and delayed paid completion without Stripe calls. |
| GA-06 | P1 | Cancellation selected every onboarding account by customer alone and suspended only the onboarding row. `client_member` checked membership alone, so suspended tenants could still pass the runtime membership gate. | Bind cancellation to customer **and subscription**, propagate to the returned tenant slugs before acknowledging the event, and use v42 to require an active tenant in `client_member`. Actual PostgreSQL test reproduces old admission after suspension and verifies denial after replacement. |
| GA-07 | P1 | `client-lifecycle.mjs` made one table GET. PostgREST row limits can truncate an export while the script reports success. | Stable ordered pagination until an empty page, advancing by actual returned rows, rejecting malformed/error/nonadvancing pages. Test exports 1,203 rows with a simulated 300-row server cap and verifies exact contents and offsets. This does not make the export transactionally consistent or broaden its table coverage. |
| GA-08 | P1 | `clientDeliveryAdapter.ts` validated the original URL then used fetch's redirect-following default, allowing an approved host's 307/308 to forward a tenant payload elsewhere. | `redirect: error` refuses redirect following. Actual-adapter test checks the request policy and failure response. DNS re-resolution/rebinding remains a separate boundary to evaluate. |
| GA-09 | P2 | Reconciliation accepted `Number(null) === 0` as provider cost and returned matched/drift even after ignored persistence failures. | Require a numeric, finite authoritative cost and safe micros; require successful persistence for success, and still attempt disable on drift if recording fails. No new live provider evidence is asserted. |
| GA-10 | P1 | Strict **publishing** skipped the evidence validations used by strict **reading**. Missing tests/migrations/approvals could therefore be published without those strict failures. Read mode's Stripe gate used CLI environment rather than the record's environment. | Validate the candidate before strict publication; refuse the cloud write when incomplete, and use the record's environment for strict checks. Storage failures also clear the reported readiness flag. Regression runs the actual script without gcloud on PATH and verifies missing-evidence failures and no attempted publication. The documented local-shell `STRIPE_MODE` convention is preserved. |
| GA-11 | P2 | PR `verify` did not run `verify:policy-gates`; catalog validation allowed null SBOM and missing/pending provenance for enabled high-risk entries. `isIntegrationActive` ignored the stricter broker check. | PR CI runs policy gates and the full focused suite. Static and runtime checks require both nonblank, nonpending references; tests mutate disposable catalog copies. `isIntegrationActive` uses the same decision. |
| GA-12 | P2 | `ci-promote-production.mjs` trusted signatures from any branch's workflow identity. Rollback CLI exited successfully even when its durable result callback failed. | Default signature identity is pinned to `refs/heads/main`; rollback success also requires an accepted result callback. These changes have no live promotion/rollback claim. |
| GA-14 | P2 | Root PostCSS override pinned 8.5.22, affected by GHSA-fxqj-rqcc-2cmp. | Pin 8.5.23 and update the lockfile. Root installation reports zero vulnerabilities; production builds pass. |
| GA-13 | Cost | Merging main triggered GCP image build/push/staging deployment and Vercel Preview deployment automatically, with no free-allowance check. | Automatic cloud jobs require repository variable `VELOCE_AUTOMATIC_CLOUD_DEPLOYS=true`. Manual dispatch remains explicit. Required PR checks remain enabled. No assurance about existing cloud spend or remaining private-repository Actions allowance is inferred. |

## Corrections to earlier evidence claims

- The previous revoke-route allowlist diagnosis is not established by source:
  `clientApiRouteAllowed` accepts descendants, and `/api/client-runtime/credentials`
  was already allowed. Adding `/credentials/revoke` explicitly is harmless,
  but cannot by itself explain the reported rejection. The old image's missing
  route remains a plausible separate cause. Keep the historical observation;
  do not treat the earlier second-root-cause explanation as independently proved.
- Inline Stripe products **can** supply `price_data.product_data.tax_code`.
  The checkout comment claiming otherwise was corrected. The existing
  Managed Payments opt-out was retained, because changing tax collection/
  merchant responsibilities is not an engineering-only decision.
  [Stripe's documented inline-product configuration](https://docs.stripe.com/payments/managed-payments/update-checkout)
  directly supports this correction.
- The integration broker is called by an internal catalog page. It describes
  availability; this review found no general execution call site consuming
  that broker. Disabled workloads remain disabled. The UI check alone is not
  proof of a universal capability execution boundary.
- The old live backup drill remains evidence of the seeded tables it exercised,
  not a full platform disaster-recovery drill. Export lists omit managed-credit
  accounts/budgets/reservations/transactions, provider-connection state, and
  onboarding/payment records. Secrets and Auth identities are intentionally
  outside the portable export. Restoring all of these needs an explicit scope,
  consistent snapshot and reconciliation procedure.
- v39 enforces owner/admin only for BYOK mutation. Many other mutating
  security-definer functions and RLS policies use `client_member`, without a
  writer-role check. A global promise that viewers are read-only is not proved.
  Define and test a product-wide role/action matrix before changing all those
  permissions; this pass does not silently redefine every existing role.

## Local verification

- Baseline `npm run test:focused`: **158 passed**, 26.4s.
- Final expanded `npm run test:focused`: **174 passed**, 26.2s (16 added regressions).
- `npm run verify:policy-gates`: passed (694 dependency entries, seven manifests,
  44 runtime routes, five governed integrations).
- `npm run verify:security`: passed. `npm run verify:secrets`: passed.
- Runtime typecheck, normal lint and changed-runtime-file lint: passed.
- Root `npm run build`: passed. `product-experience` `npm run check`: passed
  (lint, typecheck and production build).
- `public-site` `npm run verify:public`: passed, including production build.
- Dependency checks: root installation reports zero vulnerabilities after the
  PostCSS patch; product-experience and public-site production audits report zero.
- `git diff --check`: passed. These are local results, not GitHub CI results.
- Log hashes and command evidence are retained in
  `docs/evidence/independent-ga-review-local.json`.
- Required PR checks and merge were initially pending (subsequently completed
  in PR #12). The initial review commit uses
  `[skip ci]` and a draft PR to avoid triggering private Actions usage before
  the account allowance/spending constraint is confirmed.

`tests/ga-sql-regressions.spec.ts` runs the checked-in SQL functions in
[PGlite](https://github.com/electric-sql/pglite), a local PostgreSQL WASM runtime
with pgcrypto. The surrounding schema is an explicit reduced fixture, not a
clone of production. It proves SQL logic and declared function grants; it does
not prove the deployed Supabase schema, multi-session concurrency, network
IAM, or the entire RLS policy graph. The dependency is development-only,
pinned to 0.5.8; no hosted database or paid service is required.

## Deployment and acceptance still required

1. **Completed 2026-09-08:** v40, v41 and v42 applied to live Supabase and
   verified through 38 live API checks, including actual anonymous/authenticated
   permissions and RLS visibility. See [the rollout evidence](v40-v42-live-rollout-2026-09-08.md).
2. **Inventoried 2026-09-09:** zero provider connection rows across three active
   tenant records; no suspended onboarding/active tenant mismatch. v40 intentionally denies missing, submitted,
   revoked or deleted rows; do not bulk mark them connected. Only an approved
   promotion may create connected state. Client runtimes need their existing
   worker token, or an authenticated user session for synchronous requests.
3. **Deployed 2026-09-09:** both existing tenant services run the immutable
   `e72140e` image after staged and production authentication smoke checks.
   The old public readiness tag was removed; rollback revisions were retained.
   An old running image does
   not gain the new credential gate from a SQL migration alone. New admission
   checks cannot recall requests already sent to a provider. Rotation still
   needs a new runtime revision to load its new environment secret.
4. **Product fixes deployed 2026-09-09:** production aliases resolve to
   `dpl_ARp5SburJYcEXvt1GuS8nfXyXSbz`. Still confirm live Stripe endpoint delivery
   includes `checkout.session.async_payment_succeeded`; replay previously failed
   effects only after reconciling durable Stripe/session/ledger state. Existing
   incorrectly processed events will not repair themselves. Inspect previously
   suspended onboarding rows whose `client_tenants` row is still active.
5. Resolve the backup/role-matrix scope gaps above. Review rollback retry/state
   transitions, monthly alert concurrency/idempotency, payment event ordering
   and managed-credit refund/reconciliation under concurrent operations.
   Existing single-thread happy-path canaries do not establish those properties.
6. **New incomplete ledger retained 2026-09-09:** exact deployed source,
   migration hashes, smoke evidence and rollback targets are recorded with
   `releaseReady: false`. Fresh journey/rollback evidence and full owner
   sign-offs remain outstanding. The old ledger at `3e3c518` does not attest these changes.
7. Complete the three professional deliverables already in `needs-human/`.

## Cost boundary

All added tests run locally or within the existing CI jobs. No live payment,
paid inference, deployment, cloud build, migration, offboarding or release-ledger
publication was performed by this review. Existing infrastructure was not
shut down. This is not a verified zero-dollar billing statement.

[Cloud Run's free allowance](https://cloud.google.com/run/pricing) is shared
across a billing account and excess usage is billable. [Private GitHub Actions
usage](https://docs.github.com/en/actions/concepts/billing-and-usage) can also
be billed beyond included allowances. The GitHub account API did not expose
billing/plan details with this session's permissions. Before triggering PR
checks, confirm either sufficient included minutes or enforced zero-dollar
Actions overage blocking. No paid plan or plugin is needed for these repairs.

Stripe delayed-payment handling follows its
[official fulfillment guidance](https://docs.stripe.com/checkout/fulfillment).

The PostCSS patch follows the upstream
[security advisory](https://github.com/postcss/postcss/security/advisories/GHSA-fxqj-rqcc-2cmp).
CI skipping follows GitHub
[documented commit instructions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs);
skipped required checks do not satisfy merge acceptance.
