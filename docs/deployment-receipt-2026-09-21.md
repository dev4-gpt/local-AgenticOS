# Cloud deployment receipt — 21 September 2026

## Live release

- Service: `veloce-cloud-test`, project `veloce-agenticos-2026`, region `asia-south1`.
- URL: https://veloce-cloud-test-mquo4bf7aq-el.a.run.app
- Source commit: `94f793e`.
- Cloud Build: `80e75e8c-32e8-4913-8f3d-a74586e305a4` (successful).
- Image: `asia-south1-docker.pkg.dev/veloce-agenticos-2026/veloce/client-runtime@sha256:b2b1ecdc8e4d0ab30d96d243b485fbee7ce907bdf9fd07d71a77d884da2b82e3`.
- Serving revision: `veloce-cloud-test-parity94-integrations`, confirmed at 100% traffic after promotion.
- Previous image-only revision `veloce-cloud-test-parity-94f793e` retained with zero traffic for rollback. Rolling back traffic does not undo the separately activated Groq database connection.

Pipeline now uses the shared local/cloud workspace component. This does not unify all application pages. GTM planning incorporates a MiroFish-inspired methodology, not the upstream simulation engine.

## Configuration restored and verified

- Validated the already-bound Groq credential against the provider model-list endpoint and confirmed `openai/gpt-oss-120b` availability. No generation was requested.
- Activated the missing tenant-scoped Groq BYOK connection after checking that no existing Groq connection would be overwritten. The staged runtime worker token passed the database execution-admission RPC (`true`).
- Selected `groq` / `openai/gpt-oss-120b` as the shared cloud workspace default. This affects other consumers of the workspace default, not just Pipeline; existing model, approval, and budget gates still apply.
- Restored `ecc-workflows`; the tenant ECC policy was already enabled.
- Restored the previously deployed Jina research worker configuration and existing `JINA_WORKER_TOKEN` binding. Unauthenticated extraction returned 401; authenticated invalid input returned the expected 400 `request_contract_invalid`. This verifies worker reachability and admission, not successful upstream extraction.
- No other client service was deployed. No new subscription was purchased.

## Post-promotion smoke checks

| Endpoint | Observed status | Meaning |
| --- | --- | --- |
| `/status` | 200 | Public service health route responds |
| `/login` | 200 | Login route exists |
| `/api/client-runtime/pipeline` | 401 | Anonymous request rejected |
| `/api/client-runtime/credentials` | 401 | Anonymous request rejected |
| `/api/client-runtime/ecc` | 401 | Anonymous request rejected |

These are not a fresh authenticated-login test or end-to-end workflow certification. `/healthz` is not this application's public health route.

## Deployment drift warning

Do not blindly reapply `.private-client-kits/veloce-cloud-test.gcp.json`. Its image, workspace default, release label, and ECC capability were updated, but it does not yet represent the restored Jina configuration. The provisioner prefixes secret names with the tenant identifier and cannot currently express the existing shared `jina-worker-token` secret binding. Reapplying that manifest can remove the restored worker configuration. Until this is reconciled and tested, preserve the verified live configuration with additive updates; do not copy secret values or grant broader secret access as a workaround.

## Next increment and outstanding acceptance

- Source changes add explicit credential readiness states and return 503 when connection status cannot be verified, instead of presenting a failed lookup as disconnected. They are not in the deployed image above.
- Focused readiness/provider/security tests: 27 passed; TypeScript and focused lint passed before deployment promotion.
- Next-increment production build: `next build --webpack` passed, including TypeScript and static page generation. Existing middleware-convention deprecation and Node localStorage warnings remain. Script syntax and diff whitespace checks passed.
- Remaining acceptance: real Groq generation with budget accounting; authenticated cloud Pipeline capture/review/build/artifact flow; fresh login/session handling; Jina extraction; ECC workflow output; full local/cloud UI parity; installer/bridge certification; current-release readiness ledger and environment evidence.
- Repository expansion decisions and exclusion reasons remain in `repository-adoption-audit-2026-09-21.md` and `native-capability-and-edition-parity-plan-2026-09-21.md`. Catalog inclusion is not production certification.
