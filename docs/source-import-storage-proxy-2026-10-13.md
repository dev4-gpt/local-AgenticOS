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

The controlled beta must be deployed and then verified before this path is considered hosted-ready. The latest recorded beta configuration is `agentos-internal-beta` in `agentos-mvp/europe-west1`; its runtime is one-day retention and lacks the source-import API route, while the selected item-retention policy is 45 days. The bucket lifecycle policy must also be reconciled with that 45-day decision before accepting new source uploads. Keep public rollout closed until the deployed revision, effective route allowlist, retention configuration, storage policy, and signed-in source-pack journey are independently verified.
