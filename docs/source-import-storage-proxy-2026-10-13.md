# Source Import Storage Proxy

## Decision

The community source-pack import and ordinary artifact upload/download flows use Cloud Run's existing server identity to write and read objects in the tenant bucket. They do not mint signed URLs or request `iam.serviceAccounts.signBlob`; IAM remains unchanged. Browser clients use authenticated same-origin routes, with bounded upload and download bodies.

## Request Path

1. The member selects a JSON source pack and explicitly confirms permission before review.
2. The authenticated upload route applies the tenant capability and rate-limit checks, caps the multipart request and file size, checks the optional manifest hash, and validates the source pack before creating artifact metadata.
3. It stores the object under the configured tenant namespace and member ID, checks the stored size and content type, then confirms the artifact through the existing authenticated RPCs. A failed storage check triggers object and artifact cleanup.
4. Preview reads the object through the bounded server-side GCS proxy. Import remains a separate explicit action that checks the reviewed SHA-256 and server-held worker verifier before graph writes.

Before accepting an upload, the server now also requires a configured
`CLIENT_WORKER_TOKEN` of the minimum supported length. If it is absent, the
route returns `source_import_verifier_unavailable` before requesting a GCP
identity, creating artifact metadata, or writing to Cloud Storage. The client
shows an administrator-facing setup message rather than uploading an artifact
that cannot later be imported.

## Verification

- Production build: passed, with the existing Next.js middleware deprecation warning.
- Focused client regression suite: 355 passed, 1 skipped (356 total).
- Source-import browser suite: 7/7 passed against the local client runtime with mocked API/storage; provider calls disabled.
- Source-pack parser/API/SQL suite: 7/7 passed, including consent, fail-fast verifier configuration, artifact cleanup, and graph idempotency.
- Client runtime configuration fixtures: 12/12 passed.
- No GCP identity retrieval, Cloud Storage operation, IAM change, hosted database write, provider request, or Cloud Run deployment was made for this preflight change.

## Beta Gate

The controlled beta must be deployed and then verified before this path is considered hosted-ready. Read-only verification on 2026-10-13 found `agentos-internal-beta-00034-v69` in `agentos-mvp/europe-west1`, image digest `sha256:70d24863d095aa9753cf02629a30458f7fdd8ef81bfc5ed2ce35e2c0ed16da57`. The revision has `CLIENT_RUNTIME_WORKER_ENABLED=0`, `CLIENT_PROVIDER_CALLS_ENABLED=0`, and `CLIENT_RETENTION_DAYS=1`; the authenticated app has no source-pack controls and its build-identity route returns `client_route_not_enabled`. No source-import setting appeared in the inspected service YAML. Cloud Run showed no build/source metadata, so the image digest is known but its source commit is not independently linked.

This one-day setting conflicts with the selected 45-day per-item retention policy. The bucket's effective lifecycle and recovery policy, including the previously noted seven-day recovery window, was not inspected during this follow-up. Keep public rollout closed and do not accept new source uploads until the deployed revision, effective route/worker configuration, 45-day application and storage deletion behavior, and signed-in source-pack journey are independently verified. Financial/billing-record retention remains a separate policy exception requiring the named reviewer; do not apply the 45-day item policy to those records by assumption.

## Latest Local Verification

Verified on source commit `5c749e01775c103edbd1ef345fb003f0ca690eca`:

- Runtime configuration, storage configuration, cloud-config evidence, and record/artifact retention tests: 26/26 passed.
- Local static security release check: passed.
- Isolated MiroFish buyer-pilot, telemetry, and profile tests: 22/22 passed using the repository virtual environment; no simulation or provider request was started.
- Non-publishing production-readiness verifier: `releaseReady: false`; 37 release checks remain unevaluated because no verified release-ledger record is configured. Hosted customer-journey, migration, runtime-identity, and buyer evidence remain unproven.
- The current local preview endpoint on port 3952 was not listening during this check. No current signed-in local journey was therefore verified.

These are local checks only. No deployment, hosted database write, storage operation, provider request, or release-ledger publication was performed. The prior recorded cloud configuration above is historical evidence and has not been refreshed in this verification.

## Follow-Up on `571b8f4`

- The deterministic AI release suite passed 14/14 on Node 24.18.0 with zero model samples or provider cost. Its local gate passed, but `productionReady` remains false; the complete report is tracked at `docs/evidence/ai-release-local-2026-10-13-571b8f4.json`.
- The mocked Notebook Studio and observability browser suites passed 16/16, and the mocked source-import consent suite passed 7/7. The dedicated Playwright config now starts an isolated local client server with provider calls disabled, so these suites can run from a cold checkout without adopting a stale server.
- These tests prove local contracts and UI behavior only. They do not prove hosted migrations, customer data import, same-tenant cloud parity, buyer validation, or release readiness.
