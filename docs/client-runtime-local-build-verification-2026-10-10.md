# Client Runtime Local Build Verification

Date: 2026-10-10 America/New_York  
Source: `c85bcaee8924e67b084b524c031f0d055474affb`  
Branch: `wip/backup-2026-10-03`

## Build and Smoke

- Built a clean `git archive` snapshot under `/private/tmp` with Node
  `v24.19.0`, `VELOCE_CLIENT_EDITION=1`, standalone output, local CLI/files
  disabled, and approvals required. The snapshot did not include ignored local
  environment files; the existing `node_modules` tree was symlinked for
  dependency reuse.
- `npm run build` completed, including TypeScript and all 66 static-generation
  tasks. Next emitted the existing middleware deprecation and two Edge-runtime
  `process.cwd()` warnings.
- Client artifact pruning removed 235 disabled route entries and retained 118.
  `verify-client-runtime-build-trace.mjs` passed on the pruned standalone tree.
- With auth enforcement enabled and no credentials/configured providers, the
  loopback standalone smoke returned `/login` 200, `/api/client-runtime/
  build-identity` 401, and GET `/api/client-runtime/source-import` 405. This
  confirms the login page and protected API routes are present; it does not
  verify a signed-in identity or POST import behavior.

## Limits

- The smoke process was stopped after the requests. It used no tenant data,
  database settings, provider key, migration, external request, or deployment.
- This is a standalone filesystem build, not a Docker/OCI image or Cloud Run
  revision. The required base image was not cached locally, and Google Cloud
  Build was not invoked.
- Current signed-in local/cloud parity, hosted revision/image identity,
  migrations, and a real source import remain unverified. This build does not
  satisfy those release gates.
