# Client Runtime Release Evidence

Status: controlled hosted release candidate, not full provider parity.

Continuation ledger: `docs/client-runtime-release-ledger.md`. Resume from its
first unproven gate; do not repeat the green checks listed there.

## Live deployment

- Service: `veloce-cloud-test`
- Region: `asia-south1`
- Revision: `veloce-cloud-test-00058-9sf`
- Traffic: 100%
- Image: `asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/client-runtime:v51`
- Digest: `sha256:87bb112e1d41815f67f40654803458a33e16f2851d9d39c10a12fcb497d13575`
- Provider calls: disabled (`CLIENT_PROVIDER_CALLS_ENABLED=0`)
- Provider allowlist: Supabase runtime secrets only

## Fresh checks

- Live runtime verifier: passed against the canonical Cloud Run URL.
- Worker boundary verifier: passed.
- Provider policy verifier: passed.
- Lifecycle verifier: passed.
- Security release verifier: passed.
- Repository secret scan: passed.
- Client manifest validation: passed.
- Production Next.js build: passed.
- Hosted workflow UI exposes the approval-gated handoff operation; TypeScript and
  boundary verification passed after the v51 build.
- Cloud Tasks queue: `RUNNING`, one concurrent dispatch, ten maximum attempts.
- Cloud Storage: uniform bucket-level access, tenant-prefix deletion after 14 days,
  seven-day soft delete, and configured HTTPS CORS origins.
- Authenticated acceptance: passed with workflow completion and signed artifact
  upload/download byte roundtrip; the queue retry drill then accepted HTTP 202
  and completed all four workflow steps with no error code.
- Redacted live workflow inspection found terminal `task_enqueue_failed`
  executions, while the retry drill recovered one execution to `completed` with
  four completed steps. No workflow content or credential material was logged.
- Rollback checkpoint: traffic shifted from `00058-9sf` to healthy `00057-9p4`
  and back to `00058-9sf`; both protected-route checks returned the expected
  auth redirect and the current revision was restored to 100% traffic.
- Supabase final verification summary passed: required tables and worker
  functions were present, no functions were missing, `worker_hash_select` was
  `false`, authenticated worker execution was `false`, anonymous worker
  execution was `true`, the delivery destination guard was `true`, and the
  tenant was `active`.
- Two-token tenant isolation passed for `veloce-cloud-test` and disposable
  `veloce-cloud-test-b` across `client_runtime_records`,
  `client_runtime_jobs`, and `client_runtime_artifacts`. The project public
  key was sent separately from the user JWTs; no token or row content was
  printed.
- Anthropic credential inbox validation and approved promotion passed for the
  client namespace. The source envelope matched `ANTHROPIC_API_KEY`; target
  Secret Manager version `1` was created without printing the raw value.
  The approved `claude-sonnet-5` configuration is staged in the disabled local
  private manifest with $2/M input, $10/M output, and a $1 test cap. Provider
  calls remain disabled and the target secret is not wired into the current
  Cloud Run revision.

## Remaining evidence and external inputs

- Run the read-only `supabase-client-runtime-final-verification.sql`; its last
  result is now a single-row release summary. The migrations are already
  applied and must not be re-run merely to resume work.
- Isolation evidence is complete and must not be repeated unless memberships,
  RLS policies, or the verifier changes.
- A disposable HTTPS delivery destination was supplied:
  `https://webhook.site/af43bf9a-77f4-4a4b-b7c7-72af1782be86`. Its host is staged
  in the ignored local manifest, but the current Cloud Run revision predates
  that allowlist. Do not send a real delivery or call the approval CLI until a
  separately approved configuration deployment is available. Terminal queue
  failure/recovery, rate-limit/refund, and queue-retry evidence already passed
  and must not be repeated.
- Verify the Monitoring email channel; its current verification status is still
  pending.
- Run the deliberate provider-enabled deployment and live smoke, redaction,
  and rollback checks only under a separate approved activation step.
  Anthropic's credential, model, pricing, budget, and disabled local manifest
  wiring are now recorded; do not redeploy or enable it under this release
  scope.
- Run the lifecycle export/restore and disposable recovery/offboarding drills.

These are deliberately marked pending because source-level checks and
unauthenticated health checks cannot prove authenticated tenant behavior,
provider spending, email delivery, or recovery against real client data.
