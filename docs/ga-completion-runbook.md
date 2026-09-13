# GA completion runbook

This is the execution order for closing the remaining V3.3 commercial-release
gates. It is not permission to spend, deploy, bill, provision, or publish.
Follow the owner's authorized scope and spending limits, and record only
redacted evidence. Policy and legal sign-offs must come from their owners.

V44 was applied and its permissions verified on September 13; see
`docs/evidence/v44-production-migration-2026-09-13.json`. Applying the migration
does not assert that the app is deployed or the historical events reconciled.

## 1. Candidate and migration

1. Start from a clean `main` commit and record its SHA, tree, image digest,
   Vercel deployment, Cloud Run revisions, and rollback revisions.
2. Run `npm run test:focused`, typecheck, production builds,
   `npm run verify:security`, `npm run verify:policy-gates`, and the deployment
   verifiers.
3. Deploy the application plus
   `product-experience/supabase-v44-stripe-financial-event-dispositions.sql`
   together. Do not replay a refund while the route and migration differ.
4. Verify the V44 table has RLS enabled, no browser grants, and no update/delete
   path. A public-launch refund first writes `review_required` and returns 422;
   the owner records the hash-bound disposition and Stripe redelivers the same
   signed event before it is marked processed. A failed or unmatched refund
   must also return 422.

## 2. Disposable current-revision proof

Use two new, exact disposable tenant slugs. Run a primary journey and an
isolation-control journey through consent, email verification, approved
manifest, Stripe Test lifecycle matrix, provisioning, smoke, activation,
suspension, export, deletion/offboarding, rollback, and exact cleanup. Prove
that no credential, artifact, job, queue task, audit record, balance, or
export crosses between the two tenants.

## 3. Provider and live-payment proof

1. BYOK: use one tenant-scoped OpenRouter credential and the approved
   `openai/gpt-4o-mini` model. Verify validation, connection promotion, use,
   rotation, revoke, suspension, deletion, offboarding, browser redaction, and
   cross-tenant denial.
2. Managed provider: the billing owner first retains evidence of the $4
   lifetime provider cap and disabled auto-top-up. Run health, then one
   hard-capped paid canary; disable the route and clean the fixture afterward.
   A cohort tenant must never receive more than 250,000 micros ($0.25) of
   managed execution allowance.
3. Live Stripe: use the existing $2 setup/subscription fixture only after V44
   is deployed. Refund it, verify signed delivery and idempotency, confirm the
   `public_launch` review record, and prove that no managed-credit wallet or
   plan changed. Unknown events remain failed closed.

## 4. Operations and publication

Run quota exhaustion, throttle, provider outage, queue retry, failed-settlement
refund, alert, bounded-load, recovery, and rollback-traffic drills. Reconcile
the product-wide role/action matrix and document the export/restore scope for
billing, provider connections, onboarding/payment records, secrets, and Auth.

After the business/legal owner approves terms, refunds, retention, support,
abuse, tax, and contacts, publish the release ledger with every required result
as `passed` or `approved`. `npm run verify:production-readiness -- --strict`
must report `releaseReady: true`. A CPA SOC 2 engagement/report remains a
parallel assurance milestone and must not be claimed before it exists.

## 5. Post-GA capability policy

Keep all V9.6 rows governed by their present disposition. Promote one
customer-demanded capability per release only after its license/provenance,
tenant, secret/IAM, cost, consent, approval, test, cloud-smoke, deletion, and
rollback packet passes. GPU/media, security execution, autonomous worktrees,
outreach, OpenReply, VoxCPM, and publishing remain disabled until then.
