# Live Workspace Check - 2026-10-15 (Aryaman Work Profile)

## Scope

Read-only inspection of the already-open Cloud Test app tab in the user's
Aryaman (Work) Chrome window. The active URL was
`veloce-cloud-test-mquo4bf7aq-el.a.run.app/memory`. No tab was created, no
page navigation or reload was performed, and no tenant write, graph refresh,
import, provider request, deployment, or hosted configuration change was made.

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

## Readiness Impact

- Record this as limited positive UI parity evidence for Memory counts only.
- Keep local/cloud parity and graph reliability open.
- Do not infer production readiness, same-user parity, or build identity from
  matching counts.
- Next diagnostic should capture the authenticated session identity and the
  read-only graph GET response in both intended environments, then correlate
  with request timing/loading/error state. Do not call the graph-refresh POST.

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

