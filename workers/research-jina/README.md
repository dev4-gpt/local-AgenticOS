# Veloce Jina Reader worker

This is an isolated adapter for the Veloce `v96-research-worker-v1` contract.
It is not bundled into the Next.js image and does not expose Jina as a client
provider selector.

The worker accepts one tenant-scoped public HTTPS URL per request, verifies the
Veloce worker token, checks DNS resolution for private addresses, calls only the
official Jina Reader endpoint, bounds the response, and returns normalized
citation-ready data. `JINA_API_KEY` is read only by this worker; it is never
returned to Veloce or persisted as evidence.

Required environment:

```text
VELOCE_WORKER_TOKEN=<random worker token>
JINA_API_KEY=<Jina key; optional for the limited anonymous Reader tier>
```

Build and run locally:

```bash
docker build -t veloce-jina-reader workers/research-jina
docker run --rm -p 8080:8080 \
  -e VELOCE_WORKER_TOKEN='local-only-token' \
  -e JINA_API_KEY='...' \
  veloce-jina-reader
```

For owner-cloud activation, deploy this as a separate public-HTTPS Cloud Run
service protected by `VELOCE_WORKER_TOKEN`, bind `JINA_API_KEY` from Secret
Manager, and configure the resulting HTTPS URL plus a separate
`JINA_WORKER_TOKEN` in the Veloce client manifest. Do not enable the manifest
entry until the authenticated citation, budget, tenant, deletion, idempotency,
and rollback evidence bundle exists.

The manifest entry has this shape; replace the endpoint and evidence reference
with the provisioned values and keep the entry disabled until the gate passes:

```json
{
  "id": "jina-reader",
  "endpoint": "https://<worker-service>.run.app/v1/extract",
  "secretEnv": "JINA_WORKER_TOKEN",
  "enabled": true,
  "allowed": true,
  "capabilities": ["extract"],
  "costMicros": 0,
  "latencyMs": 60000,
  "reliability": 0.9,
  "evidenceRef": "evidence://jina/owner-cloud-smoke-<date>"
}
```

After the worker is provisioned and the client manifest is enabled for the
gate, run the authenticated worker-specific smoke from the source checkout:

```bash
EXPECTED_RESEARCH_PROVIDER=brave \
EXPECTED_RESEARCH_WORKER=jina-reader \
node scripts/verify-client-runtime-authenticated.mjs \
  --url https://<client-runtime-host> \
  --cookie-file /private/tmp/veloce-runtime-cookie.txt \
  --workflow-only --research-worker-smoke
```
