# Client Runtime Release Evidence

Status: controlled hosted release candidate, not full provider parity.

Continuation ledger: `docs/client-runtime-release-ledger.md`. Resume from its
first unproven gate; do not repeat the green checks listed there.

## Live deployment

- Service: `veloce-cloud-test`
- Region: `asia-south1`
- Revision: `veloce-cloud-test-00061-rgc`
- Traffic: 100% to `veloce-cloud-test-00061-rgc`
- Image: `asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/client-runtime:v54`
- Digest: `sha256:91ca3cf6d1bc15d5b7e7ce673173deb42de1f7f0b64528906321d977c81f99a9`
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
- Gate 9 stored-action checkpoint on 2026-07-29: the approved-user operator
  shell queried action `366e5d05-4918-486d-8227-6e0b30df865f` and returned
  `status: approved`, `error_code: null`, request ID
  `f73940fe-afc8-4ba1-ba0a-dfbbda6d3159`, and no audit events under that request
  ID. This does not prove delivery. The approval helper stores its queue audit
  under the action ID when its selected action lacks `request_id`, so the next
  read-only query must inspect both correlation IDs before a retry is
  considered.
- Gate 4 authorized activation checkpoint on 2026-07-29: the private manifest
  passed provider-policy and manifest validation with `text-agents`, the single
  Anthropic key/model allowlist, model pricing, and the $1 budget cap. The
  pinned v53 digest was deployed with `CLIENT_PROVIDER_CALLS_ENABLED=1`; live
  Cloud Run configuration confirmed only Secret Manager references, not raw
  credentials. The first normal smoke submission returned `401
  not_authenticated`, before it created a job, called Anthropic, or reserved
  budget. The approved-user session must be refreshed before the normal smoke,
  redaction probe, and explicit rollback can be evidenced.
- Gate 4 completion on 2026-07-29: after refreshing the approved-user session,
  Cloud Run traffic moved to the verified `veloce-cloud-test-gate4smoke`
  revision (the same pinned v53 digest). Its authenticated capability response
  exposed `text-agents`. Normal Anthropic job
  `48701a99-f3ec-481d-be00-b3fa44525e41` succeeded with no error; the
  secret-shaped-output job `279e0bdd-52df-4af3-b010-4ea34bc3b976` also
  succeeded and returned only the redaction verdict, not provider output. A
  checked rollback revision, `veloce-cloud-test-gate4rollback`, restores
  `CLIENT_PROVIDER_CALLS_ENABLED=0`, removes the temporary capability and
  pricing value, and serves 100% traffic. Its authenticated capability response
  confirms `textAgentsVisible: false`.
- Gate 1 lead-capture regression on 2026-07-29: the live product experience
  (`product-experience-five.vercel.app`) and `/start` page returned HTTP 200,
  but its public `POST /api/lead` returned HTTP 502. The linked Vercel project
  has production `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` variable names,
  yet Vercel function logs show `401` from both
  `consume_public_request_rate_limit` and the `signups` insert. The deployed
  service-role value is invalid or no longer accepted. Do not market this form
  as lead capture until the credential is replaced, a marked test lead is
  durably stored, and that test row is removed.
- Gate 1 completion on 2026-07-29: the Vercel production
  `SUPABASE_SERVICE_ROLE_KEY` was replaced and production deployment
  `dpl_GF6ZuzaTsCSfMgzL95pbCmm9CaRS` was aliased to
  `product-experience-five.vercel.app`. Synthetic non-personal submissions to
  both `POST /api/lead` and `POST /api/deployment-request` returned HTTP 200.
  A service-role query found one matching row in `signups` and one in
  `deployment_requests`; both were removed with HTTP 204. No key, row content,
  or personal lead data was printed.
- Gate 9 action-ID audit checkpoint on 2026-07-29: the operator's read-only
  query returned action `366e5d05-4918-486d-8227-6e0b30df865f` as `approved`
  with no error. Its action-ID audit correlation contains `delivery.approved`
  and two `delivery.queued` events, latest at 08:35:14Z; the request-ID audit
  correlation remains empty. This proves queue submission, not delivery.
- Gate 9 failure classification on 2026-07-29: read-only Cloud Tasks and
  Cloud Run checks found no remaining task, but found ten callbacks to
  `/api/internal/client-runtime/delivery` on revision
  `veloce-cloud-test-00061-rgc`, each returning HTTP 503 between 06:01:50Z and
  06:02:52Z. The OIDC audience matches the live
  `CLIENT_RUNTIME_BASE_URL`, so authentication-audience mismatch is ruled out.
  The action remains `approved`, which means the Supabase worker claim did not
  complete. The next provider-disabled image adds a redacted claim-status event
  and changes the operator helper to select `request_id` and create a fresh
  Cloud Tasks name; it must be deployed before one retry is attempted.
- Gate 9 correction deployment on 2026-07-29: Cloud Build
  `7494a396-6f67-4819-bf87-c4a30c43a811` produced immutable v54 digest
  `sha256:91ca3cf6d1bc15d5b7e7ce673173deb42de1f7f0b64528906321d977c81f99a9`.
  The existing private provider-disabled manifest validated and deployed this
  digest at 100% traffic. Live configuration confirms
  `CLIENT_PROVIDER_CALLS_ENABLED=0`; no provider smoke was repeated. The
  existing action remains `approved` and has not yet received its one corrected
  task.
- Gate 9 completion on 2026-07-29: the updated operator helper queued exactly
  one fresh task without reapproving action
  `366e5d05-4918-486d-8227-6e0b30df865f`. The queue became empty and its
  internal delivery callback returned HTTP 200 at 09:44:08Z. A payload-free
  Webhook.site metadata check reported a POST receipt. The operator's
  read-only Supabase query then returned `status: executed`, `error_code: null`,
  and `updated_at: 2026-07-29T09:44:12.362105+00:00`. No secret or delivery
  payload was printed.
- Gate 10 reserve-and-settle checkpoint on 2026-07-29: read-only service-role
  output confirmed the two authorized Anthropic jobs
  `48701a99-f3ec-481d-be00-b3fa44525e41` and
  `279e0bdd-52df-4af3-b010-4ea34bc3b976` both reached `succeeded` with no error.
  Their durable budget-ledger rows use `claude-sonnet-5` and contain settled
  usage metadata with final amounts of 204 and 1,392 micros respectively. This
  proves live reservation followed by usage-based settlement, not budget denial
  or either refund path.
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
  `CLIENT_PROVIDER_CALLS_ENABLED=1` for the authorized Gate 4 smoke. The prior
  refreshed cookie is structurally valid but now returns `401
  not_authenticated`; the redacted pending-approval action
  then returned `400 delivery_destination_invalid`. After routing 100% traffic
  to v53 revision `veloce-cloud-test-00061-rgc` and granting the runtime service
  account Secret Accessor on the single referenced secret, the same redacted
  request returned HTTP 202 with `pending_approval`. The operator CLI has now
  confirmed approval and queue submission. The stored action is still
  `approved` with no error and no audits under its request ID; inspect the
  action-ID audit correlation before any retry. Destination receipt remains
  unproven. Terminal queue failure/recovery, rate-limit/refund, and queue-retry
  evidence already passed and must not be repeated.
- Read-only Monitoring verification confirmed the existing email channel is
  enabled but still reports `verificationStatus: null`. Verify Google's email
  destination before running the one controlled alert check.
- Gate 4 is proven and rolled back to the disabled provider state. Do not
  re-enable or repeat its smoke calls unless the adapter, approved model,
  budget, or runtime environment changes.
- Run the lifecycle export/restore and disposable recovery/offboarding drills.

These are deliberately marked pending because source-level checks and
unauthenticated health checks cannot prove authenticated tenant behavior,
provider spending, email delivery, or recovery against real client data.
