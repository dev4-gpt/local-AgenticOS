# Client Runtime Release Evidence

Status: controlled hosted release candidate, not full provider parity.

Continuation ledger: `docs/client-runtime-release-ledger.md`. Resume from its
first unproven gate; do not repeat the green checks listed there.

## Live deployment

- Service: `veloce-cloud-test`
- Region: `asia-south1`
- Revision: `veloce-cloud-test-00061-rgc`
- Traffic: 100% to `veloce-cloud-test-00061-rgc`
- Image: `asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/client-runtime:v53`
- Digest: `sha256:028ddee1f3857d5d3672283de005dc3f4edb24c3df1b57c409c8be57952201fe`
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
  boundary verification passed after the v53 build.
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
- Gate 9 runtime correction: Cloud Run traffic is routed to v53 revision
  `veloce-cloud-test-00061-rgc`; the runtime service account has Secret
  Accessor on the single referenced Anthropic secret while provider calls stay
  disabled. The redacted delivery request returned HTTP 202 with
  `pending_approval`; the operator helper subsequently approved and queued the
  action. Webhook.site has no POST yet, so the stored action status/error and
  final destination receipt remain open.
- Gate 9 queue checkpoint on 2026-07-29: the local operator CLI output showed
  action `366e5d05-4918-486d-8227-6e0b30df865f` was already `approved`, ran in
  apply mode, and ended with `Delivery approved and queued.` Webhook.site token
  inspection returned two GET requests and no POST receipt. Read-only Cloud Run
  delivery-route and `runtime.delivery_failed` log queries returned no entries
  for the recent window, and `gcloud tasks describe` for the named task returned
  `NOT_FOUND`. The next check is the stored Supabase action status/error before
  any retry.
- Anthropic credential inbox validation and approved promotion passed for the
  client namespace. The source envelope matched `ANTHROPIC_API_KEY`; target
  Secret Manager version `1` was created without printing the raw value.
  The approved `claude-sonnet-5` configuration is staged in the disabled local
  private manifest with $2/M input, $10/M output, and a $1 test cap. Provider
  calls remain disabled and the target secret is not wired into the current
  Cloud Run revision.
- Gate 4 continuation classification on 2026-07-29: pending external input.
  Provider credential handling and disabled configuration are evidenced, but
  live adapter proof requires a separate approved provider-enabled deployment,
  smoke, redaction, and rollback check. This continuation did not enable
  providers.

## Remaining evidence and external inputs

- Run the read-only `supabase-client-runtime-final-verification.sql`; its last
  result is now a single-row release summary. The migrations are already
  applied and must not be re-run merely to resume work.
- Isolation evidence is complete and must not be repeated unless memberships,
  RLS policies, or the verifier changes.
- A disposable HTTPS delivery destination was supplied:
  `https://webhook.site/af43bf9a-77f4-4a4b-b7c7-72af1782be86`. Its host is staged
  in the ignored local manifest and the deployed revision reports
  `CLIENT_DELIVERY_ALLOWED_HOSTS=webhook.site` with
  `CLIENT_PROVIDER_CALLS_ENABLED=0`. The refreshed cookie file was structurally
  valid and accepted by the live route; the redacted pending-approval action
  then returned `400 delivery_destination_invalid`. After routing 100% traffic
  to v53 revision `veloce-cloud-test-00061-rgc` and granting the runtime service
  account Secret Accessor on the single referenced secret, the same redacted
  request returned HTTP 202 with `pending_approval`. The operator CLI has now
  confirmed approval and queue submission. Destination receipt and stored
  action status/error remain to be verified. Terminal queue failure/recovery,
  rate-limit/refund, and queue-retry evidence already passed and must not be
  repeated.
- Read-only Monitoring verification confirmed the existing email channel is
  enabled but still reports `verificationStatus: null`. Verify Google's email
  destination before running the one controlled alert check.
- Run the deliberate provider-enabled deployment and live smoke, redaction,
  and rollback checks only under a separate approved activation step.
  Anthropic's credential, model, pricing, budget, and disabled local manifest
  wiring are now recorded; do not redeploy or enable it under this release
  scope.
- Run the lifecycle export/restore and disposable recovery/offboarding drills.

These are deliberately marked pending because source-level checks and
unauthenticated health checks cannot prove authenticated tenant behavior,
provider spending, email delivery, or recovery against real client data.
