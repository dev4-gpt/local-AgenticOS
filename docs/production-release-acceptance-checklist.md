# Production release acceptance checklist

Use this checklist only after the source and infrastructure changes are ready.
It is a record of required evidence, not permission to activate a provider,
bill a customer, or publish a campaign.

## Evidence rules

- Record a result only after running the matching test in the production
  environment.
- Store IDs, revisions, timestamps, redacted output, and rollback targets; do
  not store credentials, payment details, or customer content.
- A failed test is evidence. Keep it, restore the known-good revision, and do
  not substitute a passing local test for a production result.

## 1. Source and infrastructure baseline

| Gate | Operator action | Passing evidence |
| --- | --- | --- |
| Clean release source | Commit or safely stash user-owned changes, then run `git status --short`. | No output; a recorded commit SHA. |
| Focused regression | Run `npm run test:focused`. | 148 passing tests or a newer reviewed count. |
| Public provisioner | Run `npm run verify:control-plane-cloud -- --probe`. | `ok: true`, apply disabled, current public/adapter revisions and immutable adapter digest. |
| Managed gateway boundary | Run `npm run verify:managed-openrouter-cloud -- --expected-digest sha256:<digest> --expected-models openai/gpt-4o-mini`. | Private IAM, exact secret bindings, one invoker, immutable image, approved allowlist, and `/readyz` passing. |
| Vercel metadata | Run `npm run verify:vercel-production-env`. | Required production names present; sensitive values remain typed sensitive; pricing snapshot fields present after activation configuration. |

## 2. Managed OpenRouter: owner-controlled activation

1. In the OpenRouter workspace that owns the **managed** key, configure a $4
   lifetime cap and disable auto-top-up. Preserve a redacted screenshot or
   management-API response showing the workspace/key identity, `$4`,
   `lifetime`, and timestamp. Do not paste a key into this repository or chat.
2. If the account cannot enforce a lifetime cap, stop. A daily or monthly cap
   is not equivalent to a hard total cap.
3. Generate a fresh review-only pricing artifact:

   ```bash
   npm run prepare:openrouter-pricing -- \
     --models openai/gpt-4o-mini \
     --out tmp/openrouter-managed-pricing-review.json
   ```

   Review the model ID and normalized pricing. Add exactly the resulting
   snapshot ID and JSON to Vercel Production, never a secret value.
4. Apply and record the exact pending Supabase migrations, including
   `product-experience/supabase-v34-managed-credit-execution-claims.sql` and
   `product-experience/supabase-v34-managed-provider-reconciliation-gate.sql`.
   Before any funded configuration, run
   `product-experience/supabase-v34-managed-openrouter-health-canary.sql`.
   It creates a zero-credit, execution-disabled disposable tenant and reports
   the migration and connection preflight in one result. The connection refers
   only to the existing Secret Manager resource; it must not contain an API key
   value.
5. Enable only `openai/gpt-4o-mini` on the private Cloud Run gateway. Keep
   video generation disabled.
6. Run the non-spending managed-provider health check first. Its only allowed
   fixture is `managed-openrouter-hc-20260831`, and it must remain disabled
   with zero credit. Run
   `product-experience/supabase-v34-managed-openrouter-health-canary-cleanup.sql`
   after recording its evidence. Then, only with
   the $4 cap evidence and explicit owner approval, use
   `product-experience/supabase-v34-managed-openrouter-paid-canary.sql`. It
   creates exactly one distinct $0.01 tenant wallet and starts health-gated;
   it is not reusable. Run one idempotent reserve/execute/settle/refund
   acceptance, disable the route, then run the paired exact cleanup SQL.
   Record the request ID, reservation ID, pricing snapshot ID, exact ledger
   outcome, remaining account balance metadata, and cleanup result.
   Revoke/disable the managed route immediately if anything differs from the
   recorded quote or cap policy.

## 3. Public product acceptance

Run these with two disposable test users/tenants and Stripe live-mode test
scope approved by the billing owner.

| Gate | Required evidence |
| --- | --- |
| Public journey | Consent-only intake, one-time email verification, manifest review, queued provisioning, smoke test, activation, and offboarding. |
| Stripe | Signed webhook, duplicate-event idempotency, success path, failure path, and no customer amount or card data in evidence. |
| Provider catalog | Only reviewed/selectable providers appear; unreviewed and reference-only entries cannot execute. |
| BYOK lifecycle | Server-side validation, rotation, revocation, deletion, and proof that the browser/evidence contains no credential value. |
| Tenant isolation | Tenant A cannot read, execute, export, or delete Tenant B data; run the deletion/export/rollback drill. |
| Operations | Named owner, cost caps, alerts, dashboards, bounded-load and recovery test, and a known-good rollback revision. |
| Legal | Terms, privacy, consent, retention, support, and marketing/voice policies reviewed by the responsible owner. |

## 4. External integration release rules

- **OpenReply:** remain disabled until the selected upstream commit has no
  critical/high production advisories, its own test/typecheck/audit evidence is
  retained, and the Meta/Instagram pilot has explicit consent and human reply
  approval. No customer data is sent to it before that point.
- **VoxCPM:** remain private and disabled until license, GPU cost/performance,
  voice consent, retention/deletion, disclosure, and rollback tests pass.
- **Ponytail/Headroom:** remain engineering controls only. Do not introduce a
  runtime plugin or a context proxy that can receive tenant secrets.

## 5. Final attestation

After every preceding row has real evidence, run the release verifier with
actual IDs and outcomes. Do not use placeholder values or mark a missing test
as passed.

```bash
npm run verify:production-readiness -- --strict \
  --environment production \
  --vercel-deployment <reviewed-deployment-id> \
  --cloud-run-revision <reviewed-revision> \
  --image-digest sha256:<reviewed-image-digest> \
  --migration-result passed \
  --rollback-target <known-good-revision> \
  --public-journey-result passed \
  --stripe-smoke-result passed \
  --provider-catalog-result passed \
  --byok-lifecycle-result passed \
  --tenant-isolation-result passed \
  --managed-openrouter-result passed \
  --operations-approval approved \
  --legal-approval approved \
  --test-result focused=passed \
  --out tmp/production-release-evidence.json
```

The only acceptable final result is `releaseReady: true` with a clean source
tree and a redacted evidence artifact.
