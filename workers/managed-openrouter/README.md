# Managed OpenRouter gateway

This IAM-protected Cloud Run service is the only process that receives the
actual Veloce-owned OpenRouter API key. It accepts only `/models`, `/credits`,
and `/chat/completions` through its internal `/v1/openrouter` contract.

Required environment bindings:

- `OPENROUTER_API_KEY` — Secret Manager binding to `openrouter-managed-api-key`.
- `CONTROL_PLANE_OPERATOR_SECRET` — existing Secret Manager boundary binding.
- `PUBLIC_SITE_URL` — non-secret HTTP Referer value.

Vercel invokes it using short-lived Workload Identity/OIDC and passes the
operator secret as defence in depth. The gateway never returns or logs the API
key.
