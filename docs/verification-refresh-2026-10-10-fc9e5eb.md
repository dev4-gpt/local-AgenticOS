# Verification Refresh: `fc9e5eb`

Date: 2026-10-10 America/New_York  
Source tested: `fc9e5eb6bc7a648346c14706984c87a289883620`  
Branch: `wip/backup-2026-10-03`, clean and tracking origin.

## Local Client Image Smoke

- Built `Dockerfile.client` locally from the exact clean commit as
  `agentos-client-smoke:fc9e5eb`; OCI manifest digest:
  `sha256:aeb397ec56eb7b6f531e11ab0d458ab49913af1e29db680e9bf707940583bdf1`.
- Production Next build, client artifact pruning, and build-trace verification
  passed; the artifact retained 118 route entries.
- In a temporary loopback-only container, `/status` returned 200, `/login`
  returned 200, unauthenticated `/api/client-runtime/build-identity` returned
  401, and GET `/api/client-runtime/source-import` returned 405 as expected
  for the POST-only route. The container was stopped after the checks.
- `/healthz` returned 307 to `/client-unavailable?route=%2Fhealthz`; the
  existing Cloud Run service uses a TCP startup probe, so this is not a failed
  service probe. This smoke had no auth credentials and does not prove the
  signed-in customer journey.
- Build output included existing Next Edge-runtime API warnings and a Docker
  heuristic warning for the boolean `CLIENT_RUNTIME_ENFORCE_AUTH` setting; no
  secret value was passed to the image build.

## Release State

- This is a local build and route smoke only. No registry push, deployment,
  hosted migration, tenant write, model/provider request, or paid operation was
  performed.
- `npm run verify:production-readiness` remains the authoritative release gate;
  the previously refreshed result is `releaseReady: false` because the release
  evidence ledger is not configured and hosted customer-journey, migration,
  deployment identity, tenant isolation, source import, parity, buyer-pilot,
  approvals, and rollback evidence remain incomplete or unevaluated.
