# Local And Hosted Parity Observation - 2026-10-14

## Scope

Read-only inspection of four already-open, signed-in AgentOS Notebook tabs in
the user's existing Chrome window. No tabs were opened. No tenant writes,
imports, provider calls, configuration changes, or deployments were performed.

The canonical checkout is `/Users/aryamandev/Documents/Codex/Projects/AgentOS/source`,
branch `wip/backup-2026-10-03`, commit
`6f13c646701a8250082c8e44f52a9ea441694478`. The listeners on ports 3943 and
3965 both report this checkout as their process working directory. This does
not prove that either running process serves artifacts built from this commit.

## Observations

| Environment | Existing tab | Visible authenticated Notebook state |
| --- | --- | --- |
| Cloud Test | `https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/notebook` | 9 notebook records, 9 active sources; acceptance and competitor notebooks are visible |
| Internal Beta | `https://agentos-internal-beta-vbimnfseva-ew.a.run.app/notebook` | 0 notebook records, 0 active sources; no tenant records message |
| Local | `http://127.0.0.1:3965/notebook` | 0 notebook records, 0 active sources; no tenant records message |
| Local | `http://127.0.0.1:3943/notebook` | 0 notebook records, 0 active sources; no tenant records message |

The tabs were in the same Chrome profile (`Aryaman (Work)`), but the visible
page does not reveal a comparable user ID, tenant ID, Supabase project ref, or
runtime source commit. Therefore the differing record counts establish a
visible data difference, not a same-user/same-tenant parity failure. Cloud
Test must not be used as the baseline for local or Internal Beta until those
identities are independently matched.

## Release Gate

On this commit, `npm run verify:production-readiness` returns
`releaseReady: false`, with `ledger_bucket_not_configured` and 38 evidence
categories not evaluated. The release ledger remains unconfigured. No bucket
was created and no IAM or hosted state was changed.

## Next Checks

1. Establish each environment's tenant, project, source-commit, and image
   identity through an approved read-only mechanism before treating record
   counts as a same-tenant parity comparison.
2. Use a known synthetic fixture in a non-production tenant to compare the
   local and Internal Beta source-selection, drafting, provenance, review,
   and export journey. Do not seed or modify the existing signed-in tenants.
3. Keep Cloud Test data separate unless its tenant identity is proven to match.
4. Configure a release-ledger bucket only after the exact GCP project and
   associated storage/recovery costs are verified by the owner.

## Same-User Recheck

A later read-only check used the already-open tabs for
`http://127.0.0.1:3955/notebook` and
`https://veloce-cloud-test-mquo4bf7aq-el.a.run.app/notebook`:

- Both authenticated session endpoints returned the same user subject ID. The
  identifier and email are omitted from this repository note.
- Local showed 0 notebook records and 0 active sources; Cloud Test showed 9 of
  each. This proves a same-user visible data difference, but not a same-tenant
  or same-Supabase-project comparison.
- After navigating away from Cloud Test and back to Notebook, its first render
  showed 0 records; a browser reload restored 9. This is a transient display
  observation requiring a fresh-load regression check, not evidence that data
  was deleted.
- The local session was workspace-authorized. Cloud Test's session endpoint
  confirmed authentication, while the visible Notebook showed tenant access.
  No tenant IDs, project refs, or deployed build identities were verified.
- No tenant writes, imports, provider calls, or hosted changes were performed.

## Runtime Identity Recheck

Read-only `GET` requests to the existing build-identity routes returned:

- Local `3955` reports source commit
  `c428639d84c9a6a2fef59312b9c5bd5a9c03d88c`, no Cloud Run revision, and a
  tenant-scope digest. Its provenance explicitly says the identity is reported
  by the runtime, not independently attested.
- Cloud Test returns `client_route_not_enabled` for
  `/api/client-runtime/build-identity`, so its source commit, Cloud Run
  revision, and tenant-scope digest cannot be read through this route.
- The current pushed `HEAD` is `e9f95b51d86bb8947ac89d53249ae255bd1bc898`.
  `git diff --name-status c428639d84c9a6a2fef59312b9c5bd5a9c03d88c..HEAD`
  lists documentation changes only, so the local runtime's product source
  matches the current repository product source. This does not prove the
  hosted image was built from the same source.
- The private local kit named `internal-beta-parity.env` points to Supabase
  project ref `ppmoqjtmjtfxadsnejqc` and tenant slug `internal-beta`; auth is
  enforced, provider calls are disabled, and one email is allowlisted. The
  filename and slug do not establish that this Supabase project is an isolated
  beta project. Verify the project designation before any tenant write or
  migration.

The same-user record-count difference is therefore confirmed, but the tenant
and hosted-build causes remain unresolved. The local Supabase environment
designation is also unverified. Do not import, seed, delete records, or apply
migrations to force parity; first establish the Cloud Test deployment identity
and the tenant/project scope through an approved read-only mechanism.
