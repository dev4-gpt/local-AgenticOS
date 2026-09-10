# GA fixes: production deployment, 2026-09-09

Application/runtime deployment is complete for source
`e72140ef6c89807cda1c93e4f8e5d11aa03a62fa` (PR #13, following PR #12).
This is not a new whole-product GA attestation.

## Source, builds and production state

- Fresh `git fetch origin` confirmed clean local `main` and `origin/main`
  both at `e72140e`. Source was extracted with `git archive`; local ignored
  files and operator credentials were excluded from the runtime build context.
- Runtime: local Docker `linux/amd64` build, revision label matching the full
  SHA, immutable registry digest
  `sha256:0cecf46509d3825abbd2c61d45c9e0274f1a033b70867087014bb5c94d104ba8`.
- Application: local Vercel **production-target** prebuilt output, then
  authenticated staged checks and promotion. Deployment
  `dpl_ARp5SburJYcEXvt1GuS8nfXyXSbz` is `READY`; both `app.veloceos.cloud` and
  `product-experience-five.vercel.app` independently resolved to that ID.
- Required source CI checks all passed: [verify](https://github.com/dev4-gpt/local-AgenticOS/actions/runs/34186571144/job/101936007261),
  [product-experience](https://github.com/dev4-gpt/local-AgenticOS/actions/runs/34186571117/job/101936007125),
  [public-site](https://github.com/dev4-gpt/local-AgenticOS/actions/runs/34186571106/job/101936006924).
- No GitHub deployment workflow, keyless image signature, or paid inference
  is claimed for this manual deployment. The user explicitly authorized it.

| Service | Production revision, 100% traffic | Retained rollback revision |
| --- | --- | --- |
| `veloce-cloud-test` | `veloce-cloud-test-00207-sal` | `veloce-cloud-test-00204-bil` |
| `veloce-dofgfood` | `veloce-dofgfood-00003-tav` | `veloce-dofgfood-00002-tcl` |

Both services use the new digest. Container configuration other than image,
service-account identity, one-instance maximum and zero-instance minimum
were preserved. Old `readiness-9a540fc` traffic tag was removed so its stale
runtime is no longer exposed through that alternate public URL. The old
revision remains available for an operator-controlled rollback, which would
also restore its known security limitations.

The previous application rollback target is
`dpl_DzU8B8djXTq2WDZiRin828UoDbb8`. No production rollback traffic drill was
performed. Unchanged control-plane workers and the static site were not rebuilt.
Workspace jobs delegate to runtime HTTP endpoints; they were not executed.
Future approved manifests must use the new runtime digest; historical fixture
and disposable-canary image pins were not silently rewritten or reapproved.

## Verification and durable evidence

The [sanitized deployment evidence](evidence/ga-production-deployment-2026-09-09.json)
contains exact URLs, source SHA, image, revisions, traffic, configuration
preservation checks, environment metadata, HTTP results and database inventory.

- Local runtime authentication verifier passed.
- Twelve live authentication/route checks passed for each staged runtime and
  each production runtime: 48 checks total. Login pages were reachable;
  protected pages redirected; operator API access was denied; credential
  submit/revoke, speech and other tenant APIs required authentication.
- Vercel authenticated staging probes: home 200, unsigned Stripe webhook 400
  `invalid_signature`, unauthenticated provision callback 401 `not_authorized`.
- Production application: home, onboarding, provider catalog and credits pages
  returned 200; webhook/callback denials matched the exact expected bodies.
  Onboarding and its provider-catalog link were additionally inspected in the
  browser. No signup, email, charge or provider request was submitted.
- The smoke harness initially assumed an application `/login` route; source
  inspection showed that login belongs to tenant runtimes. The harness was
  corrected to the application's actual `/start` route. No product change was
  made to satisfy an incorrect test assumption.
- Production environment verification found all required variables, correct
  sensitive types and no warnings. Integration catalog contract check passed
  (five integrations, schema version 2).
- Durable `platform_deploy_runs` record
  `b5c81004-25d9-4b2b-9c4e-3c38c731ac3b` was written after deployment and read
  back as `succeeded`, `production`, source `e72140e`, with the exact deployment
  ID. Its evidence explicitly identifies the manual build/deployment method.

## Inventory findings and remaining acceptance

Read-only inventory at `2026-09-09T02:09:09.031Z`:

- Three active DB tenants; **zero provider connection rows**. BYOK must remain
  denied until an actual approved promotion creates a connected row. No bulk
  backfill was performed.
- Eight onboarding accounts; **zero** suspended onboarding/active tenant
  mismatches. Active `veloce-cloud-test-b` has no matching deployed service
  in the service inventory. Its intended lifecycle needs confirmation; no
  orphan deletion was inferred.
- Webhook records: 23 processed, three failed. Exact failed event IDs/types
  and error codes are in the evidence. They were not blindly replayed.
- Live Stripe endpoint subscription and failed-effect reconciliation remain
  blocked on live-account authentication. Existing GCP `STRIPE_SECRET_KEY`
  accesses **test** mode, the CLI live login has expired, and Vercel exports
  sensitive values as `[SENSITIVE]` placeholders. The user was asked to sign
  in to the live dashboard. Test-mode endpoint findings do not establish live
  delivery of `checkout.session.async_payment_succeeded`.

The new [release record](evidence/ga-release-ledger-2026-09-09.json) is retained at:

`gs://veloce-agenticos-2026-veloce-release-ledger/releases/e72140ef6c89807cda1c93e4f8e5d11aa03a62fa/production-20260909T021016Z.json`

Upload used the existing release-ledger writer identity and create-only
generation precondition; full JSON readback matched. This is explicitly an
**incomplete** release record, not a strict passing publication. The existing
strict verifier rejected it with seven missing acceptance/sign-off fields:
full public journey, paid Stripe smoke, runtime BYOK lifecycle, runtime tenant
isolation, managed OpenRouter, full operations approval and renewed legal
sign-off. Retained rollback targets do not prove an exercised rollback.
`STRIPE_MODE=live` was supplied only for the documented local-shell verifier
convention; it does not independently verify the live Stripe configuration.
The 38 earlier DB checks remain valid evidence of the migration boundary,
not a replacement for complete journeys through this new runtime image.

The v40–v42 migration hashes and real API verification timestamp are attached.
Exact DDL completion time was not captured, so `migration.appliedAt` is null
rather than the later ledger-creation time. Broader backup coverage,
product-wide role policy, concurrency/ordering checks and the professional
deliverables listed in the independent review remain open.

## Cost boundary

The user reported $297.30 of GCP trial credit and 43 days remaining. Builds
ran locally; deployment reused existing services and the existing registry.
No account upgrade, paid plan, paid provider call or new payment was made.
Vercel remains on Hobby. GCP storage/runtime consumption uses the trial;
this is not a claim that metered usage is zero. Automatic deployment workflows
remain opt-in as established in PR #12.
