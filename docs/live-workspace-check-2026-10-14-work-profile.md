# Live Workspace Check - 2026-10-14 (Aryaman Work Profile)

## Scope

Read-only inspection of already-open AgentOS tabs in the user's Aryaman
(Work) Chrome window. No tabs were created. Only page navigation and GET
requests were used; no tenant writes, imports, model/provider calls, deployment,
or hosted configuration changes were made.

The checkout is `/Users/aryamandev/Documents/Codex/Projects/AgentOS/source`,
branch `wip/backup-2026-10-03`, `HEAD`
`3d0fbfe9bdb451872d5e4f22351a2f8122f5934c`.

## Current Browser Evidence

| Environment | Observed state |
| --- | --- |
| Cloud Test `veloce-cloud-test-mquo4bf7aq-el.a.run.app` | Memory loaded 23 tenant records, 32 graph nodes, and 54 edges. Notebook settled at 9 records and 9 active sources, with the `Acceptance notebook 2026-09-23` and `Competitor notes 1786309980617` notebooks. The displayed `Scoped acceptance source · Cedar Lantern` content was visible. |
| Local mirror `127.0.0.1:3945` | Memory loaded the same counts: 23 records, 32 graph nodes, and 54 edges. Notebook settled at 9 records and 9 active sources with the same two notebooks and matching visible Cedar Lantern acceptance-source text. |
| Local session endpoint `127.0.0.1:3945/api/client-auth/session` | Returned `authenticated: true` and `workspaceAuthorized: true`. The user identifier and email are deliberately not recorded in this document. The Cloud Test session endpoint was not checked, so same-user identity across environments remains unproven. |
| Local build identity `127.0.0.1:3945/api/client-runtime/build-identity` | Reported source SHA `18e70cf02d1a7b590f987ebcc6b8e530b61cd9fc`, no Cloud Run revision, and provenance `reported_by_runtime_not_independent_attestation`. This is a runtime self-report, not artifact attestation. A Git comparison from that SHA to current `HEAD` finds no `src/` differences; `package.json` and `package-lock.json` differ. |

The first Notebook snapshots briefly showed zero/loading records. After the
tenant requests settled, both pages showed 9 records and 9 active sources. A
direct Cloud Test Notebook navigation briefly rendered its login redirect
before returning to the authenticated Notebook state; no credentials were
entered. Treat this as a fresh-load/auth-state reliability observation that
needs a dedicated regression check, not as proof of data loss.

After returning to Cloud Test Memory, a fresh visit initially showed 0 records
and 0 graph nodes/edges. A read-only reload restored all 23 memory records but
left the graph at 0 nodes/0 edges, while revisiting the local mirror's Memory
route showed 23 records and 32 nodes/54 edges. Therefore the earlier
Cloud Test 32/54 graph observation is not stable and must not be accepted as
parity proof. The local mirror tab was restored to Memory after checking its
session endpoint; Cloud Test was left on Memory for inspection.

The open Internal Beta tab is a different host and showed zero Notebook records
in the captured snapshot. It is not used as the parity baseline here.

## Local Verification

After restoring dependencies with `npm ci`, the supported bundled Node runtime
`v24.19.0` was used for current-HEAD checks:

- `npm run typecheck`: passed.
- `npm run test:focused`: 367 passed, 1 skipped, 0 failed (368 total).
- `tests/client-observability-accuracy.spec.ts` and
  `tests/client-job-trace.spec.ts`: 13 passed.
- `npm run verify:ai-evaluation`: 16/16 deterministic cases passed;
  `localGatePassed: true`, `productionReady: false`, `modelSamples: 0`; no LLM
  or Zep request was made.
- `npm run verify:production-readiness -- --ledger-bucket
  veloce-agenticos-2026-veloce-release-ledger`: `releaseReady: false` on
  `3d0fbfe9bdb451872d5e4f22351a2f8122f5934c`; no matching ledger record and
  37 categories not evaluated. This verifier performed no publication.

A clean production build was not rerun: `.next` occupies 3.6 GB and only 2.6
GB was free. The local development page recovered after the dependency install,
but that is not a production-build receipt.

## Remaining Parity Evidence

- Same-user identity must be compared through the Cloud Test session endpoint;
  the local session alone is insufficient.
- Cloud Test graph loading is inconsistent: 32/54 nodes/edges were visible
  before a fresh visit; after reload, 23 records loaded but the graph stayed
  empty. Reproduce and trace this regression before considering graph parity.
- The self-reported local source SHA is older than `HEAD`; source files match,
  but package manifests differ and the built artifact is not independently
  attested.
- Cloud Test's build-identity route and deployed image/revision evidence remain
  unavailable through the client route.
- Provider-spend controls, tenant/project identity, route allowlist, storage
  proxy behavior, 45-day retention, and full customer journey through draft,
  provenance, review, and export remain unverified.
- No release ledger record exists for the current commit.
