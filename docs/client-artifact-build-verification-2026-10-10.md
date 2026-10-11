# Client Artifact Build Verification

Date: 2026-10-10 America/New_York  
Source: `bf2624f6dc2e8dbd404706975bc0408979663b7a`  
Branch: `wip/backup-2026-10-03`

## Build and Smoke

- Built from a clean `git archive` snapshot with Node `v24.18.0`, the supported
  client-container flags, and shared repository dependencies mounted read-only
  by symlink. No local environment files were included in the snapshot.
- `npm run build` completed. Next emitted the existing middleware deprecation
  and two Edge-runtime `process.cwd()` warnings.
- Client artifact pruning removed 235 disabled route entries and retained 118.
  `scripts/verify-client-runtime-build-trace.mjs` passed on the pruned
  standalone output.
- Started the standalone output on loopback with auth enabled and provider
  calls disabled. `/status` and `/login` returned 200;
  `/api/client-runtime/build-identity` returned 401 without a session; and GET
  `/api/client-runtime/source-import` returned 405, confirming the route is
  present and POST-only.
- Stopped the smoke server after these requests. The build directory is under
  `/private/tmp/agentos-client-node24.*` and is not part of the repository.

## Limits

This verifies a local production build and unauthenticated route behavior. It
does not verify a signed-in customer journey, tenant identity or isolation,
source import, hosted migrations, local/cloud parity, image registry
publication, Cloud Run configuration, or rollback. No Cloud Build, deployment,
tenant write, provider request, LLM/Zep request, or paid spend occurred. The
repository release gate remains authoritative and is still expected to fail
until its external evidence and ledger requirements are met.
