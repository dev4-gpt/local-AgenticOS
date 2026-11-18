# Live Workspace Check - 2026-10-15 (Aryaman Work Profile)

## Scope

Read-only inspection of already-open Cloud Test and local mirror tabs in the
Aryaman (Work) Chrome window. No tab was created. Follow-up navigation was
limited to the two apps' read-only identity endpoints and returning to their
Memory pages. No reload, tenant write, graph refresh, import, provider request,
deployment, or hosted configuration change was made.

## Observed State

| Environment | Observation |
| --- | --- |
| Cloud Test | The Memory page rendered 23 tenant memories, 32 graph nodes, and 54 edges. The page showed its recent-record list and the `Refresh map` control. The control was not used. |
| Local mirror | The previous Aryaman (Work) inspection at `127.0.0.1:3945/memory` showed the same visible counts: 23 memories, 32 nodes, and 54 edges. |

This is a point-in-time UI comparison only. It does not establish that the two
tabs use the same authenticated subject, tenant, source build, package lock,
deployed artifact, or configuration. It also does not resolve the earlier
Cloud Test observation where a fresh visit/reload loaded 23 memories but left
the graph at 0 nodes / 0 edges. The graph's apparent recovery in this existing
tab, without an explicit refresh, makes the previous failure intermittent;
repeatability and its cause remain unknown.

## Same-Window Runtime Recheck

The existing `127.0.0.1:3945/memory` tab was selected in the same Aryaman
(Work) Chrome window and freshly observed beside Cloud Test. Both showed 23
tenant memories, 32 graph nodes, and 54 edges, including the same visible
recent records. The local page exposed `Community sources` and `Review JSON
source packs`; Cloud Test did not. The latter is a real customer-visible
capability difference, but this observation alone cannot distinguish a route
allowlist difference from deployed-code drift.

Read-only `GET /api/client-runtime/build-identity` on Cloud Test returned
`client_route_not_enabled`. On local `3945` it returned source SHA
`18e70cf02d1a7b590f987ebcc6b8e530b61cd9fc`, with provenance
`reported_by_runtime_not_independent_attestation`. A Git comparison against
current `HEAD` found one changed source file, `src/components/ClientDataWorkspace.tsx`,
including the current graph empty-response retry and post-save graph refresh;
`package.json` and `package-lock.json` also differ. Therefore even the local
mirror's self-reported build is not the current checkout, and Cloud Test's
deployed artifact remains unknown.

The existing local `127.0.0.1:3985` tab is a separate test surface, not the
`3945` mirror: Memory showed 2 records with 114 nodes / 113 edges, including
two source-pack records, while Notebook showed no notebook records or active
sources. Do not use `3985` for same-tenant Cloud Test comparison.

The read-only local and Cloud Test session endpoints returned the same
authenticated subject. Only the local endpoint reported
`workspaceAuthorized: true`; Cloud Test returned `authenticated: true` without
that separate field. The identifiers were compared transiently and are not
retained here. This closes same-subject identity only, not same-tenant identity
or hosted workspace authorization.

All checks were read-only. No account identifiers, emails, cookies, or tenant
IDs were retained in this note. Matching `3945`/Cloud Test counts are limited
snapshot evidence, not same-tenant or source-artifact parity.

After navigating back from Cloud Test's identity response, its first rendered
Memory snapshot briefly showed 0 records and 0 graph nodes/edges. On the next
observation, the same page populated to 23 records and 32 nodes / 54 edges
without a reload or graph-refresh action. This is evidence of transient
initial-load inconsistency, not data deletion. The Cloud Test and local tabs
were not both restored: Cloud Test remained on Memory, while the local tab was
left on its read-only session-status response when Chrome switched to the
College profile. No further browser interaction occurred.

## Readiness Impact

- Record this as limited positive UI parity evidence for Memory counts only.
- Keep local/cloud parity and graph reliability open.
- Same authenticated subject is confirmed, but same tenant and hosted workspace
  authorization are not.
- Do not infer production readiness, build identity, or full feature parity
  from matching counts.
- Next diagnostic should capture the read-only graph GET response in both
  intended environments, then correlate response data with loading/error
  state. Do not call the graph-refresh POST.

## Read-Only Cloud Run Deployment Check

The GCP project `veloce-agenticos-2026` lists Cloud Test in `asia-south1` at
revision `veloce-cloud-test-acceptance-9417c3c`. That revision serves image
digest `sha256:91d3185c4dbe4285a1aa6c347c884baca4f7dc30e3a8ef2994eb3e89d9950d38`;
read-only Cloud Build metadata links the same digest to successful build
`bcfef9aa-c870-490a-b614-ab755a9d12dd` and image tag
`acceptance-9417c3c` (2026-09-23). The tag suffix resolves in the local Git
history to commit `9417c3cceb172347927fb10a83b450af963340ad`, an ancestor of
the inspected local source. However, Cloud Build metadata contains no resolved
source commit or `_SOURCE_COMMIT` substitution, so the tag is not treated as an
independent source attestation. The current local branch is 612 commits beyond
that named commit; this indicates substantial drift, not a verified diff of
the deployed image contents.

The revision is configured for tenant slug `veloce-cloud-test` and
`CLIENT_PROVIDER_CALLS_ENABLED=1`. No provider request was made. Its revision
configuration has no `VELOCE_BUILD_SOURCE_COMMIT` override; the authenticated
build-identity endpoint was not queried, so runtime-baked identity remains
unverified. Do not use Cloud Test for provider calls until its spend policy is
reviewed and the runtime identity is attested. No Cloud Run configuration,
traffic, IAM, database, or storage was changed during this inspection.

