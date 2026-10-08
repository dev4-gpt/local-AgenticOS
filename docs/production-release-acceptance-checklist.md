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
| Focused regression | Run `npm run test:focused`. | A current reviewed passing count from a clean runner. |
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
5. Apply `product-experience/supabase-v44-stripe-financial-event-dispositions.sql`
   with the application deployment that reads it. It adds the append-only,
   service-role-only public-launch financial-event review trail. Do not apply
   the route before the migration.
   Apply `product-experience/supabase-v45-onboarding-verify-token.sql` before
   deploying the verification API. Attach that exact migration to the release
   ledger; other migration evidence does not satisfy the verification gate.
   Apply `product-experience/supabase-v47-financial-offboard-guard.sql` after
   the managed-credit tables exist and before permitting tenant offboarding.
   It prevents a tenant delete or truncate from cascading away credit history,
   including a row written after the operator preflight. This is a deletion
   guard, not a financial archive or an approved retention procedure.
6. Enable only `openai/gpt-4o-mini` on the private Cloud Run gateway. Keep
   video generation disabled.
7. Run the non-spending managed-provider health check first. Its only allowed
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

Run the disposable test fixture before any live billing action. It requires
`STRIPE_MODE=test`, a Stripe `sk_test_` key, and
`STRIPE_TEST_FIXTURE_ENABLED=1`; the default fixture is 50¢ setup plus 50¢
monthly ($1 initial total per tenant). It never authorizes a live charge.
A separate billing-owner approval with a real total cap is still required for
the later live-mode Stripe smoke.

Before the live $2 setup/subscription fixture is replayed or refunded, the
operator must confirm that V44 is live. A `charge.refunded` event is classified
as managed credit only by a managed-credit plan reference. A refund with an
exact persisted public-launch setup payment reference is recorded as
`public_launch` plus a `review_required` disposition, returns `422`, and never
changes a wallet. An event without either proof also remains `422` and must
not be broadly acknowledged. The billing owner records one matching,
hash-bound review disposition through the operator-only webhook-review route;
Stripe must then redeliver the original signed event. Only that redelivery is
recorded as processed. Record only IDs, hashes, disposition, reviewer,
timestamp, and reconciliation outcome.

After deployment, the owner can generate a single test checkout link without
placing a secret in the command line by loading the operator secret into the
current shell and running `npm run approve:stripe-test-fixture -- --request-id
<uuid> --email <test-email> --approved-by <operator>`. The command refuses
anything except the explicit $1 test fixture and prints no secret.

After retaining the Test-mode webhook and idempotency evidence, remove the
fixture variables, restore the separately approved live Stripe configuration,
and deploy again. Test-mode evidence must never be recorded as a live-mode
payment result or used for the strict final attestation.

| Gate | Required evidence |
| --- | --- |
| Public journey | Consent-only intake, one-time email verification, human-reviewed final manifest hash matching the prepare run and deploy, queued provisioning, smoke test, activation, and offboarding. Legacy prepare runs without pinned hash evidence require manual review and a fresh authorized prepare. |
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
- **Personal video Content OS:** remain a manual pilot until the owner has
  supplied a portfolio brief, likeness/voice consent scope, an approved script
  and visual plan, provider-specific terms/cost controls, disclosure review,
  retention/deletion evidence, and a native-publishing acceptance record. Do
  not connect Gemini Flow/Veo, HeyGen, ElevenLabs, or a social account as part
  of a general product release.

## 5. Final attestation

After every preceding row has real evidence, publish it to the release
evidence ledger, then validate the current commit against what was published.
Run `npm run verify:ai-evaluation` on the clean, committed release candidate
before publishing. The resulting `tmp/ai-release-local-v1-report.json` must
match that commit and the versioned fixture; the ledger stores this receipt and
refuses an AI approval without it. Rerun after any source change. This local
receipt covers ten deterministic cases only: it does not replace hosted job,
ledger, trace, model-quality, or customer-journey evidence for
`--ai-engineering-result passed`.
The public-journey gate also requires `--customer-journey-report` when publishing.
That redacted JSON receipt must have `schemaVersion: 1`, the exact clean
`sourceCommit`, `environment`, `vercelDeployment`, `cloudRunRevision`,
`imageDigest`, an ISO `checkedAt`, and exactly one passed case for each
`J01` through `J15` in the customer-journey matrix. Each case needs at least
one `evidence` entry with a private `gs://` or redacted `docs/evidence/` `ref`
and its 64-hex `sha256`. Every case must include exactly one entry with
`kind: "case-attestation"`; other entries use `kind: "artifact"`. The attestation
is redacted JSON with `schemaVersion: 1`, the matching `caseId`, `status:
"passed"`, the same source/deployment identity, an ISO `checkedAt` no later
than the report, a named `reviewedBy`, and nonempty `observations` recording
`action`, `observed`, and `result: "passed"`. The verifier checks this structure
and reads each referenced artifact (at most 1 MB) to verify its hash. Private
`gs://` receipts require read access and may incur Cloud Storage request costs;
do not run this against an unreviewed bucket or billing project. Hash validity
does not prove that an observation satisfies its J-row: the named reviewer must
inspect the receipts and avoid putting customer content or secrets in the
report. The attestation is a review record, not an automated proof that the
observation happened. A plain `--public-journey-result passed` is insufficient.
Do not use placeholder values or mark a missing test as passed — the ledger
accepts a partial record, but `--strict` will fail loud on anything still
missing rather than let it through. See
[`docs/release-evidence-ledger-runbook.md`](release-evidence-ledger-runbook.md)
for the one-time bucket/IAM setup this depends on.

```bash
npm run publish:release-ledger -- \
  --ledger-bucket <reviewed-ledger-bucket> \
  --impersonate-service-account <reviewed-ledger-writer-service-account> \
  --environment production \
  --vercel-deployment <reviewed-deployment-id> \
  --cloud-run-revision <reviewed-revision> \
  --image-digest sha256:<reviewed-image-digest> \
  --migration-file product-experience/supabase-v45-onboarding-verify-token.sql \
  --migration-file product-experience/supabase-v46-onboarding-setup-token.sql \
  --migration-file product-experience/supabase-v47-financial-offboard-guard.sql \
  --migration-file product-experience/supabase-client-runtime-source-pack-graph.sql \
  --rollback-cloud-run-revision <known-good-revision> \
  --rollback-vercel-deployment <known-good-deployment-id> \
  --customer-journey-report <reviewed-redacted-journey-report.json> \
  --public-journey-result passed \
  --stripe-smoke-result passed \
  --provider-catalog-result passed \
  --byok-lifecycle-result passed \
  --tenant-isolation-result passed \
  --source-import-result passed \
  --ui-parity-result passed \
  --buyer-simulation-result passed \
  --ai-engineering-result passed \
  --managed-openrouter-result passed \
  --operations-approval approved \
  --legal-approval approved \
  --test-result focused=passed

npm run verify:production-readiness -- --strict --ledger-bucket <reviewed-ledger-bucket> --out tmp/production-release-evidence.json
```

The only acceptable final result is `releaseReady: true` with a clean source
tree and a redacted evidence artifact validated against the published ledger
record (`ledgerRecordUsed` in the output points at the exact `gs://` object
used).
