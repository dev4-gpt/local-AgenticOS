# Managed OpenRouter gateway

This IAM-protected Cloud Run service is the only process that receives the
actual Veloce-owned OpenRouter API key. It accepts only `/models`, `/credits`,
`/chat/completions`, and tightly controlled video metadata/job-polling calls
through its internal `/v1/openrouter` contract.

Required environment bindings:

- `OPENROUTER_API_KEY` — Secret Manager binding to `openrouter-managed-api-key`.
- `CONTROL_PLANE_OPERATOR_SECRET` — existing Secret Manager boundary binding.
- `PUBLIC_SITE_URL` — non-secret HTTP Referer value.
- `OPENROUTER_MODEL_ALLOWLIST` — comma-separated, human-reviewed text model
  identifiers with matching pricing entries in the production snapshot. An
  empty allowlist disables chat execution while metadata health checks remain
  available.

## Video generation safety gate

The gateway permits `GET /videos/models` and `GET /videos/:jobId` so the
control plane can discover current model capabilities and poll an existing
job. It never proxies video bytes.

`POST /videos` is disabled unless both of these are intentionally set on the
Cloud Run revision:

- `OPENROUTER_VIDEO_GENERATION_ENABLED=1`
- `OPENROUTER_VIDEO_MODEL_ALLOWLIST=bytedance/seedance-2.0-mini`

The request contract accepts a 4–15 second clip, `480p` or `720p`, a supported
aspect ratio, and up to four public HTTPS image references (or first/last
frame images). Audio and arbitrary provider passthrough parameters are
deliberately excluded. A control-plane quote and wallet reservation must occur
before this gate is ever enabled.

Vercel invokes it using short-lived Workload Identity/OIDC and passes the
operator secret as defence in depth. The gateway never returns or logs the API
key.
