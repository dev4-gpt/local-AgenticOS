# Patched production deployment, 2026-09-10

The application and both existing tenant runtimes now run the dependency
security repairs from merged source `9ba8d460da4f1440ba51769df2deb7a4dcfc5a9c`
([PR #14](https://github.com/dev4-gpt/local-AgenticOS/pull/14)).
The [dependency report](ga-dependency-patches-2026-09-10.md) documents the
repairs, zero audit findings in both complete dependency trees, 174 passing
focused tests, and successful local builds and security checks.

All required PR checks passed before merge:
[product-experience](https://github.com/dev4-gpt/local-AgenticOS/actions/runs/34501858154/job/102954323169),
[public-site](https://github.com/dev4-gpt/local-AgenticOS/actions/runs/34501858170/job/102954323023),
[verify](https://github.com/dev4-gpt/local-AgenticOS/actions/runs/34501858157/job/102954324117).
The tested head `ec8fae8` and merged commit `9ba8d46` have identical tree
`be7084a3c7b5bdb674a1ad3f2ee3c4114a75d6f1`. Clean archive builds were prepared
locally; the final runtime image carries the merged SHA and tree labels.

## Deployed artifacts and checks

| Target | New deployment/revision | Retained rollback |
| --- | --- | --- |
| Application | `dpl_Fo4YsaprmXPJqdrJmsg75v4cMLaZ` | `dpl_ARp5SburJYcEXvt1GuS8nfXyXSbz` |
| `veloce-cloud-test` | `veloce-cloud-test-00210-pez` | `veloce-cloud-test-00207-sal` |
| `veloce-dofgfood` | `veloce-dofgfood-00005-vec` | `veloce-dofgfood-00003-tav` |

Runtime digest:
`sha256:bc3b371e0a476843ae567198480fb16d69c358e63028a3491e901d0e658f3e52`.
The running local container reported Next.js **16.3.4**, Sharp **0.35.4** and
Node **24.14.1**. The image was built for `linux/amd64`.

The [machine-readable deployment evidence](evidence/ga-production-deployment-2026-09-10.json)
records the observations at `2026-09-10T16:37:11.534Z`:

- Twelve local-container authentication checks passed.
- Twelve checks per staged tenant revision and per production tenant URL
  passed: 48 live runtime checks. Credential submit/revoke, speech, capabilities
  and other tenant APIs required authentication; operator API access was denied.
- Six authenticated Vercel staging checks and six public production checks
  passed. The production domain independently resolved to the new deployment.
  Vercel metadata identifies the merged source SHA and matching tree.
- Production environment verification passed. Both Cloud Run services serve
  100% traffic on the new revisions; all other container configuration and
  service-account identity were preserved, with max one and min zero instances.
- Old `ga-e72140e` tags were removed from both services. Prior revisions remain
  available for controlled rollback but contain known vulnerable dependencies;
  a rollback would restore those limitations. No rollback drill is claimed.
- Durable deployment record `5ea23a65-9a64-4cfb-9cf6-d5b1f00a6650` was written
  and independently read back as `succeeded`, `production`, source `9ba8d46`.

## Release record and limits

The [new release record](evidence/ga-release-ledger-2026-09-10.json) remains
**`releaseReady: false`**. The strict verifier correctly reports seven missing
acceptance/sign-off fields. Fresh end-to-end public/payment/BYOK/isolation/
managed-provider journeys and full release approvals are not supplied by
dependency audits or unauthenticated HTTP smoke tests. Existing v40–v42
migration evidence is retained with its original verification time.

Immutable ledger object, uploaded and fully read back on 2026-09-11 UTC:

`gs://veloce-agenticos-2026-veloce-release-ledger/releases/9ba8d460da4f1440ba51769df2deb7a4dcfc5a9c/production-20260910T163711Z.json`

Publication used the existing writer identity and a create-only generation
precondition. The first upload attempt was rejected because the automatic
approval service had exhausted its usage allowance; it executed successfully
after that window reset. No passing GA attestation was substituted.

Live Stripe CLI authentication was checked again on September 10 and remained
expired. The [September 9 failed-event inspection](evidence/failed-test-webhook-inspection-2026-09-09.json)
confirms two of the three failed DB webhook rows are test-mode Stripe events;
the third was unavailable in that test account. This does not reconcile its
live financial effects. No event was replayed and no financial state changed.
Live account access is still required to verify delayed-payment delivery and
finish reconciliation. The earlier zero-BYOK-connection inventory is historical;
approved promotion remains required before credentials can execute.

No new paid provider call, payment, account upgrade or paid plan was used.
The deployment reused the existing GCP services under the user's confirmed
trial-credit authorization and the existing Vercel Hobby project. Builds ran
locally. Broader acceptance and professional deliverables remain as listed in
the independent review.
