# Canonical Production Topology

**Status:** active working record; this is not a GA release acceptance.
**Verified:** 2026-09-25

This record supersedes historical "current deployment" claims in older
runbooks. It describes what was directly verified in the connected Vercel and
Google Cloud accounts. It does not authorize a deployment to a new cloud
target.

## Verified current state

| Surface | Verified target | Current state | Role |
| --- | --- | --- | --- |
| Product application | `https://app.veloceos.cloud` | Vercel deployment `dpl_2mNnVCqQEizFjAdo2siZ4mYedrZy`, built from local `main` commit `bd076afc83d643b9526940c84b23e89a7b68b242` | Canonical public product application |
| Apex domain | `https://veloceos.cloud` | Older Git-connected Vercel deployment from `d658ad6` | Existing public route; not the current application revision |
| `www` domain | `https://www.veloceos.cloud` | Separate `veloce-agenticos-public` Vercel deployment | Existing public marketing route |
| Legacy Cloud Run | `agentos-mvp`, service `agentos`, `europe-west1` | Revision `agentos-00013-q7f`, image `agentos:4a347ad3fc308086fdb1b38b7ac56fb3e55251ae`, deployed 2026-05-27 | Legacy service; not associated with this repository's current commit |

The legacy Cloud Run service is publicly reachable but its `/`, `/healthz`, and
documented `/status` routes returned `404` during this verification. Its source
image commit is not present in this repository. It must not be used as a
client runtime, provider worker, or release-evidence target without a new
design and acceptance run.

## Cost and safety controls

- `agentos-mvp` has a project-scoped monthly budget alert named `AgentOS monthly
  $5 guardrail`, with alerts at 50%, 90%, 100%, and forecasted 100% spend.
- The legacy `agentos` service has a minimum instance count of zero and a
  service-level maximum of one instance. It still receives 100% of traffic to
  its own legacy URL; no new image, traffic migration, or deletion was made.
- A budget sends alerts. It is not a hard billing cutoff.

## Architecture decisions

1. Vercel is the canonical host for the current public application. New public
   application acceptance must use `app.veloceos.cloud` and a named Vercel
   deployment.
2. The desired domain topology is `veloceos.cloud` and `www.veloceos.cloud`
   for public marketing, with `app.veloceos.cloud` for the product application.
   The apex reassignment is deliberately pending: it changes live traffic and
   needs a separate domain-change acceptance check.
3. `agentos-mvp/agentos` is a legacy workload. Keep it constrained and do not
   duplicate the Vercel application into it. Its eventual disposition is an
   explicit retirement or a minimal redirect/migration service.
   A separate client-safe service in the same project may be evaluated only
   under the prerequisites recorded in
   [the beta runtime assessment](./agentos-mvp-beta-runtime-assessment-2026-09-25.md).
4. References to `veloce-agenticos-2026` are historical configuration, not a
   verified active cloud target. No command may use it by default until its
   ownership, billing, and deployed services are freshly verified.

## Consequences for releases

- A Vercel deployment alone proves only the public application surface.
- The existing release-ledger workflow cannot be used as proof for the current
  Vercel revision until a separately verified client-runtime target, migration
  evidence, tenant evidence, provider evidence, and owner approvals exist.
- Future release commands must receive their cloud project, region, service,
  image digest, and ledger bucket explicitly. Do not infer them from older
  documentation.

## Next controlled changes

1. Review the apex and `www` marketing deployments, then approve or reject the
   proposed domain topology.
2. Audit beta-critical auth, tenant isolation, secret lifecycle, and external
   action controls before enabling more execution paths.
3. Define a dedicated, current client-runtime target only when the Vercel
   backend contracts and secret references have an approved migration plan.
