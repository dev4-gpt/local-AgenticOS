# Source Import Storage Proxy

## Decision

The community source-pack import flow uses Cloud Run's existing server identity to write and read objects in the tenant bucket. It does not mint signed URLs or request `iam.serviceAccounts.signBlob`; IAM remains unchanged. The ordinary artifact gallery continues to use its existing signed-URL flow and is outside this change.

## Request Path

1. The member selects a JSON source pack and explicitly confirms permission before review.
2. The authenticated upload route applies the tenant capability and rate-limit checks, caps the multipart request and file size, checks the optional manifest hash, and validates the source pack before creating artifact metadata.
3. It stores the object under the configured tenant namespace and member ID, checks the stored size and content type, then confirms the artifact through the existing authenticated RPCs. A failed storage check triggers object and artifact cleanup.
4. Preview reads the object through the bounded server-side GCS proxy. Import remains a separate explicit action that checks the reviewed SHA-256 and server-held worker verifier before graph writes.

## Verification

- Production build: passed, with existing Next.js Edge-runtime warnings.
- TypeScript, touched-file ESLint, and static client-worker boundary verifier: passed.
- Source-import browser suite: 6/6 passed against an isolated local client runtime; provider calls disabled.
- Source-pack parser/API/SQL suite: 6/6 passed, including upload consent, server-side artifact lifecycle, cleanup, and graph idempotency.
- Client runtime configuration fixtures: 12/12 passed.
- No IAM change, hosted database write, provider request, or Cloud Run deployment was made for this implementation.

## Beta Gate

The controlled beta must be deployed and then verified before this path is considered hosted-ready. The latest recorded beta configuration is `agentos-internal-beta` in `agentos-mvp/europe-west1`; its runtime is one-day retention and lacks the source-import API route, while the selected item-retention policy is 45 days. The bucket lifecycle policy must also be reconciled with that 45-day decision before accepting new source uploads. Keep public rollout closed until the deployed revision, effective route allowlist, retention configuration, storage policy, and signed-in source-pack journey are independently verified.
